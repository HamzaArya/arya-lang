"""Independent exact financial oracle; Python is only the test controller."""
import _pydecimal as d
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(sys.argv[1] if len(sys.argv) > 1 else root / ".build/independent/arya").resolve()
rng = random.Random(0x41525941)
modes = {"up": d.ROUND_UP, "down": d.ROUND_DOWN, "ceil": d.ROUND_CEILING,
         "floor": d.ROUND_FLOOR, "half-up": d.ROUND_HALF_UP,
         "half-down": d.ROUND_HALF_DOWN, "half-even": d.ROUND_HALF_EVEN}
cases, expected = [], []

def invoice(case):
    scale, mode = case["options"]["scale"], case["options"]["rounding"]
    quantum = d.Decimal(1).scaleb(-scale)
    def rounded(value):
        rounding = modes.get(mode)
        if mode == "half-ceil": rounding = d.ROUND_HALF_UP if value >= 0 else d.ROUND_HALF_DOWN
        if mode == "half-floor": rounding = d.ROUND_HALF_DOWN if value >= 0 else d.ROUND_HALF_UP
        return value.quantize(quantum, rounding=rounding)
    totals = {key: d.Decimal(0) for key in ["gross", "discount", "net", "tax", "total"]}
    for row in case["lines"]:
        gross = rounded(d.Decimal(row["price"]) * d.Decimal(row["quantity"]))
        discount = rounded(gross * (d.Decimal(row["discountRate"]) if "discountRate" in row else d.Decimal(row["discountBps"]) / 10000))
        net = gross - discount
        tax = rounded(net * (d.Decimal(row["taxRate"]) if "taxRate" in row else d.Decimal(row["taxBps"]) / 10000))
        for key, value in zip(totals, [gross, discount, net, tax, net + tax]): totals[key] += value
    return {key: format(abs(value) if value == 0 else value, f".{scale}f") for key, value in totals.items()}

with d.localcontext() as context:
    context.prec = 100
    for scale in [0, 2, 3, 6]:
        for mode in [*modes, "half-ceil", "half-floor"]:
            lines = []
            for _ in range(80):
                price = ("-" if rng.randrange(3) == 0 else "") + str(rng.randrange(1000000))
                if scale: price += "." + str(rng.randrange(10 ** scale)).zfill(scale)
                lines.append({"price": price, "quantity": str(rng.randrange(10)) + "." + str(rng.randrange(1000000)).zfill(6),
                              "discountBps": rng.randrange(10001), "taxBps": rng.randrange(25001)})
            case = {"lines": lines, "options": {"currency": "AFN", "scale": scale, "rounding": mode}}
            cases.append(case); expected.append(invoice(case))
    for mode in [*modes, "half-ceil", "half-floor"]:
        lines = [{"price": str(rng.randrange(10000)) + "." + str(rng.randrange(1000000)).zfill(6),
                  "quantity": str(rng.randrange(10)) + "." + str(rng.randrange(1000000)).zfill(6),
                  "discountRate": "0." + str(rng.randrange(1000000)).zfill(6),
                  "taxRate": "0." + str(rng.randrange(500000)).zfill(6)} for _ in range(80)]
        case = {"lines": lines, "options": {"currency": "AFN", "scale": 2, "priceScale": 6, "rounding": mode}}
        cases.append(case); expected.append(invoice(case))
for scale in [0, 2, 3, 6]:
    for _ in range(10):
        entries, balances = [], {}
        for _ in range(100):
            name = rng.choice(["cash", "sales", "__proto__", "constructor", "حساب", "0"])
            debit, credit = rng.randrange(9223372036854775808), rng.randrange(9223372036854775808)
            def text(units):
                value = str(units).zfill(scale + 1)
                return value[:-scale] + "." + value[-scale:] if scale else value
            entries.append({"account": name, "debit": text(debit), "credit": text(credit)})
            pair = balances.setdefault(name, [0, 0]); pair[0] += debit; pair[1] += credit
        def amount(units):
            sign = "-" if units < 0 else ""
            digits = str(abs(units)).zfill(scale + 1)
            return sign + (digits[:-scale] + "." + digits[-scale:] if scale else digits)
        debit, credit = sum(pair[0] for pair in balances.values()), sum(pair[1] for pair in balances.values())
        expected.append({"debit": amount(debit), "credit": amount(credit), "difference": amount(debit - credit),
                         "balanced": debit == credit, "accounts": [{"account": name, "debit": amount(pair[0]),
                             "credit": amount(pair[1]), "balance": amount(pair[0] - pair[1])} for name, pair in balances.items()]})
        cases.append({"kind": "ledger", "entries": entries, "options": {"currency": "AFN", "scale": scale}})
with tempfile.TemporaryDirectory(prefix="native-accounting-reference-", dir=root / ".build") as temporary:
    binary = Path(temporary) / "driver"
    built = subprocess.run([str(compiler), "build", str(root / "native/tests/fixtures/accounting-driver.arya"),
                            "--debug", "--sanitize", "-o", str(binary)], capture_output=True, text=True, timeout=120)
    assert built.returncode == 0, built.stderr
    result = subprocess.run([str(binary)], input="".join(json.dumps(case) + "\n" for case in cases),
        capture_output=True, text=True, timeout=120,
        env={"PATH": "/nonexistent", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"})
    assert result.returncode == 0, result.stderr
    rows = result.stdout.splitlines()
    assert len(rows) == len(expected), (len(rows), len(expected), result.stderr)
    for i, (row, desired) in enumerate(zip(rows, expected)):
        actual = json.loads(row)
        assert actual["ok"], (i, actual)
        actual = actual["result"]
        assert {key: actual[key] for key in desired} == desired, (i, actual, desired)
print(f"native accounting: {len(cases)} independent Decimal/integer batches, 7600 rows, all scales and nine rounding modes passed")
