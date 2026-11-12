"""Optional timing orchestration; measured programs and builds remain native."""
import argparse
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import tempfile
import time


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(command, native=False):
    env = dict(os.environ)
    if native:
        env["PATH"] = "/nonexistent"
        env.pop("ARYA_GC_STRESS", None)
    start = time.perf_counter()
    result = subprocess.run([str(value) for value in command], capture_output=True,
                            text=True, timeout=180, env=env)
    if result.returncode:
        raise RuntimeError(f"{command[0]} failed ({result.returncode}): {result.stderr}")
    return result.stdout.strip(), result.stderr, (time.perf_counter() - start) * 1000


def summary(values):
    return {"medianMs": statistics.median(values), "minMs": min(values),
            "maxMs": max(values), "samplesMs": values}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--compiler", default=".build/independent/arya")
parser.add_argument("--baseline", help="Retained pre-change native compiler; otherwise use --no-advanced-call-opt")
parser.add_argument("--samples", type=int, default=9)
parser.add_argument("--output", help="New report path; existing reports are preserved")
options = parser.parse_args()
if not 3 <= options.samples <= 21 or options.samples % 2 == 0:
    parser.error("--samples must be odd and between 3 and 21")
root = Path(__file__).resolve().parents[2]
base = root / ".build/native-advanced-call-benchmark"
base.mkdir(parents=True, exist_ok=True)
directory = Path(tempfile.mkdtemp(prefix="run-", dir=base))
compilers = {}
for variant in ["advanced", "previous"]:
    source = Path(options.baseline if variant == "previous" and options.baseline
                  else options.compiler).resolve()
    sdk = directory / (variant + "-sdk")
    sdk.mkdir()
    compiler = sdk / "arya"
    shutil.copy2(source, compiler)
    shutil.copytree(source.parent / "lib", sdk / "lib")
    if (source.parent / "stdlib").exists():
        shutil.copytree(source.parent / "stdlib", sdk / "stdlib")
    metadata = {"binarySha256": digest(compiler), "version": run([compiler, "--version"])[0],
                "sourceHashes": {path.name: digest(path) for path in source.parent.glob("*.arya")}}
    if Path(str(source) + ".c").exists():
        shutil.copy2(str(source) + ".c", sdk / "arya.c")
        metadata["generatedCSha256"] = digest(sdk / "arya.c")
    compilers[variant] = {"binary": compiler, "metadata": metadata}

cases = [
    ("recursive-fibonacci", 24, [46368, 75025],
     "fn fib(n) { if n < 2 { return n }; return fib(n - 1) + fib(n - 2) }\nfn work(n) => fib(n)\n"),
    ("boolean-calls", 100000, [100000, -100001],
     "fn flip(value) => not value\nfn work(n) { let value = false; let i = 0; while i < n { value = flip(value); i += 1 }; if value { return -i }; return i }\n"),
    ("captured-dynamic-calls", 20000, [20000, 20001],
     "fn factory() { let total = 0; return fn(step) { total += step; return total } }\nfn work(n) { const next = factory(); let i = 0; let value = 0; while i < n { value = next(1); i += 1 }; return value }\n"),
    ("mixed-scalar-control", 50000,
     [sum(i if i % 3 == 0 else -i for i in range(n)) for n in [50000, 50001]],
     "fn select(n, flag) { if flag { return n }; return -n }\nfn classify(n) => n % 3 == 0\nfn work(n) { let total = 0; let i = 0; while i < n { total += select(i, classify(i)); i += 1 }; return total }\n"),
    ("general-fallback-calls", 100000, [100000, -100001],
     "fn flip(value) { try { return not value } finally { } }\nfn work(n) { let value = false; let i = 0; while i < n { value = flip(value); i += 1 }; if value { return -i }; return i }\n"),
]
harness = """
const n = number(args[0])
const repetitions = number(args[1])
if repetitions == 0 { print(work(n), work(n + 1)) }
else {
  const warmStart = runtime.clock()
  let i = 0
  let checksum = 0
  while i < 8 or runtime.clock() - warmStart < 0.15 { checksum += work(n + i % 2); i += 1 }
  i = 0
  checksum = 0
  const wallStart = performance.now()
  const start = runtime.clock()
  while i < repetitions { checksum += work(n + i % 2); i += 1 }
  const elapsed = (runtime.clock() - start) * 1000
  const wallElapsed = performance.now() - wallStart
  print(checksum, elapsed, wallElapsed)
}
"""
host_start = {"loadAverage": os.getloadavg()}
results = []
for name, size, expected, source in cases:
    timed_source = 'use std "runtime" as runtime\n' + source + harness
    kernel_source = source + '\nconst n = number(args[0])\nprint(work(n), work(n + 1))\n'
    source_path = directory / (name + ".arya")
    kernel_path = directory / (name + "-kernel.arya")
    source_path.write_text(timed_source)
    kernel_path.write_text(kernel_source)
    variants = {}
    for variant in ["advanced", "previous"]:
        compiler = compilers[variant]["binary"]
        flags = ["--no-advanced-call-opt"] if variant == "previous" and not options.baseline else []
        binary = directory / (name + "-" + variant)
        stdout, stderr, build_ms = run([compiler, "build", source_path, "-o", binary, "--release", *flags])
        Path(str(binary) + ".build.log").write_text(stdout + "\n" + stderr)
        counter_binary = Path(str(binary) + "-counters")
        run([compiler, "build", kernel_path, "-o", counter_binary, "--release", "--runtime-counters", *flags])
        counter_out, counter_err, _ = run([counter_binary, size], native=True)
        if [float(value) for value in counter_out.split()] != expected:
            raise RuntimeError(name + ": instrumented output mismatch")
        counters = json.loads(next(line.removeprefix("ARYA_RUNTIME_COUNTERS ")
                                   for line in counter_err.splitlines()
                                   if line.startswith("ARYA_RUNTIME_COUNTERS ")))
        check = run([binary, size, 0], native=True)[0]
        if [float(value) for value in check.split()] != expected:
            raise RuntimeError(name + ": output mismatch")
        variants[variant] = {"binary": str(binary), "binaryBytes": binary.stat().st_size,
                             "binarySha256": digest(binary), "generatedCSha256": digest(str(binary) + ".c"),
                             "buildWallMs": build_ms, "counters": counters, "cpu": [], "wall": []}

    def measure(variant, repetitions):
        output = [float(value) for value in run([variants[variant]["binary"], size, repetitions], native=True)[0].split()]
        checksum = repetitions // 2 * sum(expected)
        if len(output) != 3 or any(not math.isfinite(value) for value in output) or output[0] != checksum:
            raise RuntimeError(name + ": measured checksum/timing mismatch")
        return output[1] / repetitions, output[2] / repetitions

    repetitions = {}
    for variant in variants:
        pilot, _ = measure(variant, 2)
        repetitions[variant] = 2 * max(1, min(5000, math.ceil(25 / max(pilot, 0.001))))
    for sample in range(options.samples):
        order = ["advanced", "previous"] if sample % 2 == 0 else ["previous", "advanced"]
        for variant in order:
            cpu, wall = measure(variant, repetitions[variant])
            variants[variant]["cpu"].append(cpu)
            variants[variant]["wall"].append(wall)
    for variant in variants.values():
        variant["cpu"] = summary(variant["cpu"])
        variant["wall"] = summary(variant["wall"])
    speedup = variants["previous"]["cpu"]["medianMs"] / variants["advanced"]["cpu"]["medianMs"]
    print(f"{name}: {variants['previous']['cpu']['medianMs']:.4f} -> {variants['advanced']['cpu']['medianMs']:.4f} ms CPU; {speedup:.2f}x", flush=True)
    results.append({"name": name, "input": size, "expected": expected, "source": timed_source,
                    "kernelSource": kernel_source, "repetitions": repetitions,
                    "variants": variants, "additionalCpuSpeedup": speedup})
report = {
    "recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "host": {"platform": platform.system(), "architecture": platform.machine(), "logicalCpus": os.cpu_count()},
    "hostStart": host_start, "hostEnd": {"loadAverage": os.getloadavg()},
    "compilers": {name: entry["metadata"] for name, entry in compilers.items()},
    "orchestratorSha256": digest(__file__),
    "cc": run([os.environ.get("ARYA_CC") or os.environ.get("CC") or "cc", "--version"])[0],
    "method": {
        "previous": "Retained pre-change native compiler" if options.baseline else "Same compiler with --no-advanced-call-opt; earlier frame/direct/numeric optimizations retained",
        "timing": "C11 -O2 -ffp-contract=off. CPU from runtime.clock(), monotonic wall from performance.now(), per complete work call. No startup/build/warmup/output in measured region.",
        "samples": f"{options.samples} alternating fresh-process samples; >=150 ms CPU and eight warmup calls. Separately calibrated even batches target >=50 ms CPU; equal n/n+1 proportions.",
        "correctness": "Independent expected n/n+1 outputs, checked instrumented outputs and every timing checksum.",
        "counters": "Separate instrumented processes evaluate work(n) and work(n+1) once. calloc wrapper and managed-memory counters are not all system allocations or peak RSS.",
        "scope": "Single development host under recorded load; microbenchmarks do not qualify arbitrary applications or other platforms.",
    },
    "workloads": results,
}
output = Path(options.output).resolve() if options.output else directory / "results.json"
output.parent.mkdir(parents=True, exist_ok=True)
with output.open("x") as stream:
    json.dump(report, stream, indent=2)
    stream.write("\n")
print("Results:", output)
