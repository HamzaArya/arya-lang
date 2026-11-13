#!/usr/bin/env python3
"""Optional independent journal oracle. Amounts use Python integers, never float.

No generated/translated implementation or production application is imported.
Core journal acceptance remains POSIX/native in accounting-journal.sh.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import tempfile


def amount(units, scale):
    sign = "-" if units < 0 else ""
    digits = str(abs(units)).zfill(scale + 1)
    return sign + (digits[:-scale] + "." + digits[-scale:] if scale else digits)


def units(text, scale):
    whole, _, fraction = text.partition(".")
    assert not any(digit != "0" for digit in fraction[scale:])
    return int(whole) * 10 ** scale + int((fraction[:scale] + "0" * scale)[:scale] or "0")


def oracle(case):
    scale = case["options"]["scale"]
    balances, summaries = {}, []
    debit = credit = count = 0
    for transaction in case["transactions"]:
        d = c = 0
        for entry in transaction["entries"]:
            pair = balances.setdefault(entry["account"], [0, 0])
            left, right = units(entry["debit"], scale), units(entry["credit"], scale)
            assert (left > 0) != (right > 0)
            pair[0] += left
            pair[1] += right
            d += left
            c += right
            count += 1
        assert d == c
        summaries.append(dict(id=transaction["id"], currency="AFN", scale=scale,
                              entryCount=len(transaction["entries"]), debit=amount(d, scale),
                              credit=amount(c, scale), balanced=True))
        debit += d
        credit += c
    return dict(currency="AFN", scale=scale, backend="native", entryCount=count,
                accounts=[dict(account=name, debit=amount(d, scale), credit=amount(c, scale),
                               balance=amount(d - c, scale)) for name, (d, c) in balances.items()],
                debit=amount(debit, scale), credit=amount(credit, scale),
                difference=amount(debit - credit, scale), balanced=True,
                transactionCount=len(summaries), transactions=summaries, policy="journal-v1")


def cases():
    rng = random.Random(0x4A4F5552)
    keys = ["cash", "sales", "__proto__", "constructor", "حساب", "a\0b", "2", "10", "é", "😀"]
    result = []
    for scale in range(7):
        result.append(dict(transactions=[], options=dict(currency="AFN", scale=scale)))
        for _ in range(24):
            transactions = []
            for index in range(rng.randrange(1, 16)):
                rows = []
                for _ in range(rng.randrange(1, 9)):
                    value = rng.choice([1, 2**63 - 1, rng.randrange(1, 2**63)])
                    # Extra fractional zeroes are legal, without rounding.
                    text = amount(value, scale) + ("00" if scale and rng.randrange(2) else "")
                    rows.extend([dict(account=rng.choice(keys), debit=text, credit="0"),
                                 dict(account=rng.choice(keys), debit="0", credit=text)])
                rng.shuffle(rows)
                transactions.append(dict(id=f"transaction:{index}", entries=rows))
            result.append(dict(transactions=transactions, options=dict(currency="AFN", scale=scale)))
    return result


def invalid_cases():
    policy = dict(currency="AFN", scale=2)
    sale = dict(id="sale", entries=[dict(account="cash", debit="1", credit="0"),
                                    dict(account="sales", debit="0", credit="1")])
    result = []
    for field, value, code in (("debit", "-1", "INPUT"), ("debit", "01", "INPUT"),
                               ("debit", "0.001", "SCALE"), ("debit", "92233720368547758.08", "RANGE"),
                               ("credit", "1", "POSTING"), ("debit", "0", "POSTING"),
                               ("account", " ", "INPUT"), ("extra", True, "INPUT")):
        for index in range(3):
            bad = copy.deepcopy(sale)
            bad["id"] = "bad"
            bad["entries"][0][field] = value
            good = [dict(id=f"good:{i}", entries=copy.deepcopy(sale["entries"])) for i in range(index)]
            result.append((dict(transactions=[*good, bad], options=policy), "ARYA_ACCOUNTING_" + code))
    for transaction, code in ((None, "INPUT"), (dict(id=" ", entries=[]), "INPUT"),
                              (dict(id=1, entries=[]), "INPUT"), (dict(id="empty", entries=[]), "TRANSACTION"),
                              (dict(id="null", entries=None), "TRANSACTION"), (dict(id="extra", entries=[], extra=1), "INPUT")):
        result.append((dict(transactions=[transaction], options=policy), "ARYA_ACCOUNTING_" + code))
    for options, code in ((dict(currency="afn", scale=2), "CURRENCY"), (dict(currency="AFN", scale=7), "SCALE"),
                          (dict(currency="AFN", scale=2, rounding="down"), "INPUT"), (None, "INPUT")):
        result.append((dict(transactions=[], options=options), "ARYA_ACCOUNTING_" + code))
    duplicate = dict(id="sale", entries=None)
    result.append((dict(transactions=[sale, duplicate], options=policy), "ARYA_ACCOUNTING_DUPLICATE"))
    # A later malformed native row takes precedence over an earlier zero posting.
    malformed = dict(id="ordered", entries=[dict(account="cash", debit="0", credit="0"),
                                            dict(account="sales", debit="0", credit="01")])
    result.append((dict(transactions=[malformed], options=policy), "ARYA_ACCOUNTING_INPUT"))
    unbalanced = copy.deepcopy(sale)
    unbalanced["entries"][1]["credit"] = "2"
    result.append((dict(transactions=[unbalanced], options=policy), "ARYA_ACCOUNTING_UNBALANCED"))
    return result


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", type=Path, default=root / ".build/independent/arya")
    parser.add_argument("--baseline-compiler", type=Path, help="Also compare complete invalid-input errors with this frozen compiler/stdlib")
    parser.add_argument("--mode", choices=["release", "reference", "sanitized"], default="sanitized")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error("choose a new output path to preserve evidence")
    compiler = args.compiler.resolve()
    data = cases()
    invalid = invalid_cases()
    expected = [oracle(case) for case in data]
    source = Path(__file__).with_name("fixtures") / "accounting-journal-driver.arya"
    flags = {"release": ["--release"], "reference": ["--release", "--no-call-opt", "--no-data-opt"],
             "sanitized": ["--debug", "--sanitize"]}[args.mode]
    compilers = {"candidate": compiler}
    if args.baseline_compiler:
        compilers = {"baseline": args.baseline_compiler.resolve(), **compilers}
    established = None
    artifacts = {}
    with tempfile.TemporaryDirectory(prefix="journal-oracle-", dir=root / ".build") as work:
        for label, selected in compilers.items():
            build_environment = dict(os.environ)
            build_environment["ARYA_NATIVE_LIBDIR"] = str(selected.parent / "lib")
            binary = Path(work) / label
            built = subprocess.run([str(selected), "build", str(source), "-o", str(binary), *flags],
                                   env=build_environment, capture_output=True, text=True, timeout=180)
            assert built.returncode == 0, built.stderr + built.stdout
            run = subprocess.run([str(binary)], input="".join(json.dumps(case) + "\n" for case in [*data, *(c for c, _ in invalid)]),
                                 capture_output=True, text=True, timeout=180,
                                 env={"PATH": "/nonexistent", "ASAN_OPTIONS": "detect_leaks=0",
                                      "UBSAN_OPTIONS": "halt_on_error=1"})
            assert run.returncode == 0, run.stderr
            actual = [json.loads(line) for line in run.stdout.splitlines()]
            assert len(actual) == len(expected) + len(invalid), (len(actual), len(expected), len(invalid))
            for index, (row, wanted) in enumerate(zip(actual, expected)):
                assert row == {"ok": True, "result": wanted}, (label, index, row, wanted)
            errors = actual[len(expected):]
            for index, (row, (_, code)) in enumerate(zip(errors, invalid)):
                assert row["ok"] is False and row["error"]["code"] == code, (label, index, row, code)
            if established is not None:
                assert errors == established, (label, errors, established)
            established = errors
            artifacts[label] = dict(compilerSha256=hashlib.sha256(selected.read_bytes()).hexdigest(),
                                   binarySha256=hashlib.sha256(binary.read_bytes()).hexdigest(), stderr=run.stderr)
    report = dict(passed=True, mode=args.mode, cases=len(data), invalidCases=len(invalid),
                  invalidErrorParity=bool(args.baseline_compiler),
                  postingRows=sum(len(t["entries"]) for c in data for t in c["transactions"]),
                  seed="0x4A4F5552", scales=list(range(7)),
                  oracle="Independent Python integer minor units; full ordered report equality; error codes plus optional established error parity",
                  sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), artifacts=artifacts,
                  casesSha256=hashlib.sha256(json.dumps([*data, *(c for c, _ in invalid)], sort_keys=True).encode()).hexdigest())
    if args.output:
        with args.output.open("x") as output:
            json.dump(report, output, indent=2)
            output.write("\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
