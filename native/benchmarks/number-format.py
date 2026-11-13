"""Optional standalone controller; native compilation and execution need no Python.

Example: python3 native/benchmarks/number-format.py --compiler before:/sdk/arya
  --compiler after:.build/independent/arya --output .build/format-results.json
Every output is checked using an independent exact-rational binary64 oracle.
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


def fixed(value, places):
    numerator, denominator = abs(value).as_integer_ratio()
    quotient, remainder = divmod(numerator * 10**places, denominator)
    if remainder * 2 >= denominator:
        quotient += 1
    text = str(quotient).zfill(places + 1)
    if places:
        text = text[:-places] + "." + text[-places:]
    return ("-" if value < 0 else "") + text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", action="append", required=True, help="label:path")
    parser.add_argument("--samples", type=int, default=9)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error("choose an odd sample count of at least three")
    output = Path(args.output).resolve()
    if output.exists():
        parser.error("output already exists; preserve previous evidence")
    root = Path(__file__).resolve().parents[2]
    source = root / "native/benchmarks/number-format.arya"
    work = Path(tempfile.mkdtemp(prefix="number-format-", dir=root / ".build"))
    env = dict(os.environ)
    env.pop("ARYA_GC_STRESS", None)
    env.pop("ARYA_NATIVE_LIBDIR", None)
    sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
    report = {
        "recordedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "boundary": "CPU ms inside warmed number formatting loop; build/startup/output excluded. Fresh processes, alternating compiler order; independent exact-rational checksums.",
        "platform": platform.platform(),
        "machine": platform.machine(),
        "cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "flags": "--release (-O2 -ffp-contract=off)",
        "sourceSha256": sha(source),
        "controllerSha256": sha(__file__),
        "loadStart": os.getloadavg(),
        "artifacts": {}, "raw": [], "summary": [],
    }
    for item in args.compiler:
        label, compiler = item.split(":", 1)
        if not label.isalnum() or label in report["artifacts"]:
            parser.error("compiler labels must be unique alphanumeric names")
        compiler = Path(compiler).resolve()
        binary = work / label
        start = time.perf_counter()
        subprocess.run([str(compiler), "build", str(source), "-o", str(binary), "--release"], env=env, check=True, capture_output=True, text=True)
        report["artifacts"][label] = {
            "compiler": str(compiler), "compilerSha256": sha(compiler),
            "binary": str(binary), "binarySha256": sha(binary),
            "generatedCSha256": sha(str(binary) + ".c"),
            "binaryBytes": binary.stat().st_size,
            "buildWallMs": (time.perf_counter() - start) * 1000,
        }
    values = [1.005, 2.55, -0.004, 0., 123456.789, -98765.4321, 1e20, 5e-324]
    for places, count in [(2, 40000), (18, 40000), (100, 4000)]:
        texts = [fixed(x, places) for x in values]
        expected = sum(len(x) + ord(x[0]) for x in texts) * (count // len(values))
        for sample in range(args.samples):
            labels = list(report["artifacts"])
            if sample % 2:
                labels.reverse()
            for label in labels:
                binary = report["artifacts"][label]["binary"]
                completed = subprocess.run([binary, str(places), str(count)], env=env, check=True, capture_output=True, text=True, timeout=60)
                checksum, cpu = completed.stdout.split()
                assert int(checksum) == expected, (label, places, checksum, expected)
                report["raw"].append({"label": label, "places": places, "iterations": count, "sample": sample, "cpuMs": float(cpu), "checksum": int(checksum)})
        for label in report["artifacts"]:
            samples = [x["cpuMs"] for x in report["raw"] if x["label"] == label and x["places"] == places]
            row = {"label": label, "places": places, "iterations": count, "medianCpuMs": statistics.median(samples), "minCpuMs": min(samples), "maxCpuMs": max(samples)}
            report["summary"].append(row)
            print(row, flush=True)
    report["loadEnd"] = os.getloadavg()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as file:
        json.dump(report, file, indent=2)
        file.write("\n")


if __name__ == "__main__":
    main()
