"""Optional benchmark controller. The measured executable needs no interpreter.

Compare native session verification with an Arya Map implementation, using the
same binary, SHA-256, expiry checks and immutable result fields. This is a new
implementation comparison, not a historical before/after application claim.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", type=Path, default=Path(".build/independent/arya"))
    parser.add_argument("--samples", type=int, default=9)
    parser.add_argument("--iterations", type=int, default=20000)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 != 1 or not 1 <= args.iterations <= 1000000:
        parser.error("choose an odd sample count >=3 and 1..1000000 iterations")
    if args.output.exists():
        parser.error("output exists; preserve recorded measurements")
    root = Path(__file__).resolve().parents[2]
    compiler = args.compiler.resolve()
    work = Path(tempfile.mkdtemp(prefix="auth-benchmark-", dir=root / ".build"))
    binary = work / "auth"
    source = root / "native/benchmarks/auth.arya"
    env = dict(os.environ)
    for key in ("ARYA_NATIVE_LIBDIR", "ARYA_GC_STRESS", "ASAN_OPTIONS", "UBSAN_OPTIONS"):
        env.pop(key, None)
    sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
    built = subprocess.run([str(compiler), "build", str(source), "-o", str(binary), "--release"], env=env, capture_output=True, text=True)
    (work / "build.log").write_text(built.stdout + built.stderr)
    if built.returncode:
        raise RuntimeError((work / "build.log").read_text())
    report = {
        "recordedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope": "Successful digest lookup + monotonic expiry + immutable session snapshot. Setup, startup, build and output excluded. Native vs Arya Map in one binary; fresh alternating processes. No password or biometric speed claim.",
        "platform": platform.platform(), "machine": platform.machine(),
        "cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "flags": "--release (-O2 -ffp-contract=off)",
        "compilerSha256": sha(compiler), "binarySha256": sha(binary),
        "generatedCSha256": sha(str(binary) + ".c"),
        "sources": {name: sha(root / name) for name in (
            "native/benchmarks/auth.arya", "native/benchmarks/auth.py",
            "native/libraries/auth.arya", "native/runtime/auth.c", "native/runtime/security.c",
            "native/runtime/auth-platform.h", "native/desktop/auth.m")},
        "binary": str(binary), "binaryBytes": binary.stat().st_size,
        "loadStart": os.getloadavg(), "raw": [], "summary": [],
    }
    for count in (32, 4096):
        expected = sum(len("account:" + str(i % count)) + 1 for i in range(args.iterations))
        for sample in range(args.samples):
            modes = ("native", "reference") if sample % 2 == 0 else ("reference", "native")
            for mode in modes:
                result = subprocess.run([str(binary), mode, str(count), str(args.iterations)], env={"PATH": "/nonexistent"}, capture_output=True, text=True, check=True, timeout=60)
                row = json.loads(result.stdout)
                assert row["checksum"] == expected, (row, expected)
                assert (row["mode"], row["count"], row["iterations"]) == (mode, count, args.iterations)
                assert row["cpuMs"] > 0, row
                report["raw"].append(dict(row, sample=sample))
        medians = {}
        for mode in ("native", "reference"):
            values = [r["cpuMs"] for r in report["raw"] if r["count"] == count and r["mode"] == mode]
            medians[mode] = statistics.median(values)
            report["summary"].append({"mode": mode, "count": count, "medianCpuMs": medians[mode], "minCpuMs": min(values), "maxCpuMs": max(values)})
        print(json.dumps({"sessions": count, "nativeMedianMs": medians["native"], "referenceMedianMs": medians["reference"], "referenceOverNative": medians["reference"] / medians["native"]}), flush=True)
    report["loadEnd"] = os.getloadavg()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as file:
        json.dump(report, file, indent=2)
        file.write("\n")


if __name__ == "__main__":
    main()
