"""Paired native Number(toFixed) CPU samples; Python only controls the experiment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--compiler", action="append", required=True, help="LABEL=COMPILER")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--prepare-only", action="store_true")
    p.add_argument("--no-build", action="store_true")
    p.add_argument("--samples", type=int, default=9)
    p.add_argument("--count", type=int, default=100000)
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).with_suffix(".arya").resolve()
    variants = {}
    for spec in args.compiler:
        label, path = spec.split("=", 1)
        compiler = Path(path).resolve()
        binary = (args.output / label).resolve()
        if not args.no_build:
            result = subprocess.run([str(compiler), "build", str(source), "-o", str(binary), "--release", "--force"], capture_output=True, text=True)
            (args.output / (label + ".build.log")).write_text(result.stdout + result.stderr)
            result.check_returncode()
        variants[label] = {"compiler": str(compiler), "compilerSha256": sha(compiler), "binary": str(binary), "binarySha256": sha(binary), "samplesMs": []}
    if args.prepare_only:
        return
    labels = list(variants)
    checksum = None
    env = dict(os.environ, PATH="/nonexistent")
    for sample in range(args.samples + 3):
        # Alternate process order; each process also warms its kernel and collects.
        for label in labels if sample % 2 == 0 else reversed(labels):
            result = subprocess.run([variants[label]["binary"], str(args.count), "2"], capture_output=True, text=True, check=True, env=env)
            actual, ms = result.stdout.strip().split()
            if checksum is None:
                checksum = actual
            assert actual == checksum, (label, actual, checksum)
            if sample >= 3:
                variants[label]["samplesMs"].append(float(ms))
    for row in variants.values():
        samples = row["samplesMs"]
        median = statistics.median(samples)
        row.update(medianMs=median, madMs=statistics.median(abs(x - median) for x in samples), minMs=min(samples), maxMs=max(samples))
    report = {"environment": {"platform": platform.platform(), "machine": platform.machine(), "python": platform.python_version()}, "sourceSha256": sha(source), "boundary": "CPU time inside the numeric loop; 2000 in-process warmup calls, explicit collection before timing; 3 discarded process samples and alternating retained process order; 100000 Number(toFixed(2)) calls by default. Startup and IPC excluded. Native runtime PATH=/nonexistent.", "count": args.count, "checksum": checksum, "variants": variants}
    (args.output / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
