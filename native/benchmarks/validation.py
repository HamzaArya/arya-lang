#!/usr/bin/env python3
"""Optional controller for two prebuilt native validation benchmark executables."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--before-binary", type=Path, required=True)
parser.add_argument("--after-binary", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--samples", type=int, default=9)
parser.add_argument("--environment-note", default="", help="Record concurrent work or other measurement qualifications")
args = parser.parse_args()
if args.samples < 3 or args.samples > 31 or args.samples % 2 == 0:
    parser.error("samples must be odd, from 3 to 31")
if args.output.exists():
    parser.error("choose a new output path to preserve evidence")
binaries = {"before": args.before_binary.resolve(), "after": args.after_binary.resolve()}
source = Path(__file__).with_suffix(".arya")
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
environment = dict(os.environ)
environment.pop("ARYA_GC_STRESS", None)
environment["PATH"] = "/nonexistent"
report = {
    "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
    "host": platform.platform(), "architecture": platform.machine(),
    "loadAverageStart": list(os.getloadavg()), "environmentNote": args.environment_note,
    "sourceSha256": sha(source),
    "method": "Median operation CPU ms, excluding startup/setup/output. One discarded process per width/backend; alternating backend order, fresh process per sample, three schema warmups inside each process. No counters. Single development host.",
    "binarySha256": {k: sha(v) for k, v in binaries.items()},
    "generatedCSha256": {k: sha(v.with_suffix('.c')) for k, v in binaries.items() if v.with_suffix('.c').exists()},
    "raw": [], "summary": [],
}
for width in (128, 512):
    for sample in range(-1, args.samples):
        order = list(binaries) if sample % 2 else list(reversed(binaries))
        for name in order:
            completed = subprocess.run([str(binaries[name]), str(width), "50"],
                                       check=True, capture_output=True, text=True,
                                       timeout=60, env=environment)
            result = json.loads(completed.stdout)
            assert result["checksum"] == (width - 1) * 50, (name, result)
            if sample >= 0:
                report["raw"].append({"backend": name, "sample": sample, **result})
    medians = {}
    for name in binaries:
        values = [r["cpuMs"] for r in report["raw"] if r["width"] == width and r["backend"] == name]
        medians[name] = statistics.median(values)
    report["summary"].append({"width": width, "iterations": 50, "medianCpuMs": medians,
                              "speedup": medians["before"] / medians["after"]})
args.output.parent.mkdir(parents=True, exist_ok=True)
report["loadAverageEnd"] = list(os.getloadavg())
with args.output.open("x") as output:
    json.dump(report, output, indent=2)
    output.write("\n")
print(json.dumps(report["summary"], indent=2))
