"""Optional benchmark controller; building and running Arya needs no Python.

Compare SDKs with --compiler before:/sdk/arya --compiler after:/sdk/arya,
or prebuilt release programs with --binary before:/program --binary after:/program.
Add --counter-binary label:/program for separately instrumented allocation counts.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def artifact(binary):
    binary = Path(binary).resolve()
    return {"binary": str(binary), "binarySha256": sha(binary),
            "generatedCSha256": sha(str(binary) + ".c"),
            "binaryBytes": binary.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", action="append", default=[], help="label:path")
    parser.add_argument("--binary", action="append", default=[], help="label:path")
    parser.add_argument("--counter-binary", action="append", default=[], help="label:path")
    parser.add_argument("--provenance", help="JSON metadata describing prebuilt programs")
    parser.add_argument("--samples", type=int, default=9)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if not args.compiler and not args.binary:
        parser.error("provide at least one compiler or binary")
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error("choose an odd sample count of at least three")
    output = Path(args.output).resolve()
    if output.exists():
        parser.error("output already exists; preserve previous evidence")
    root = Path(__file__).resolve().parents[2]
    source = root / "native/benchmarks/string-storage.arya"
    work = Path(tempfile.mkdtemp(prefix="string-storage-", dir=root / ".build")) if args.compiler else None
    build_env = dict(os.environ)
    build_env.pop("ARYA_GC_STRESS", None)
    build_env.pop("ARYA_NATIVE_LIBDIR", None)
    runtime_env = {"PATH": "/nonexistent"}
    report = {
        "recordedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "boundary": "CPU ms inside warmed workload; build/startup/output excluded. Fresh processes, alternating binary order. Allocation counters from separate processes.",
        "platform": platform.platform(), "machine": platform.machine(),
        "cpu": subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip() if platform.system() == "Darwin" else platform.processor(),
        "cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "flags": "--release (-O2 -ffp-contract=off); counters add --runtime-counters",
        "runtimeEnvironment": runtime_env,
        "sourceSha256": sha(source), "controllerSha256": sha(__file__),
        "loadStart": os.getloadavg(), "artifacts": {}, "raw": [], "summary": [], "counters": [],
    }
    if args.provenance:
        report["provenance"] = json.loads(Path(args.provenance).read_text())
        report["provenanceSha256"] = sha(args.provenance)
    counters = {}
    for kind, items in [("compiler", args.compiler), ("binary", args.binary)]:
        for item in items:
            label, path = item.split(":", 1)
            if not label.isalnum() or label in report["artifacts"]:
                parser.error("labels must be unique alphanumeric names")
            path = Path(path).resolve()
            if kind == "compiler":
                binary, counter = work / label, work / (label + "-counters")
                start = time.perf_counter()
                commands = []
                for destination, flags in [(binary, []), (counter, ["--runtime-counters"])]:
                    command = [str(path), "build", str(source), "-o", str(destination), "--release", *flags]
                    commands.append(command)
                    result = subprocess.run(command, env=build_env, capture_output=True, text=True)
                    Path(str(destination) + ".build.log").write_text(result.stdout + result.stderr)
                    result.check_returncode()
                row = artifact(binary)
                row.update(compiler=str(path), compilerSha256=sha(path), buildCommands=commands, buildWallMs=(time.perf_counter()-start)*1000)
                counters[label] = artifact(counter)
            else:
                row = artifact(path)
            report["artifacts"][label] = row
    for item in args.counter_binary:
        label, path = item.split(":", 1)
        if label not in report["artifacts"] or label in counters:
            parser.error("counter labels must match one release binary and be unique")
        counters[label] = artifact(path)
    report["counterArtifacts"] = counters
    cases = [("short", 100000), ("slice", 100000), ("json", 10000), ("append", 100000)]
    for mode, count in cases:
        expected = {"short": sum(len(str(i)) for i in range(count)), "slice": count*24, "json": count*54, "append": count}[mode]
        def execute(binary):
            command = [binary, mode, str(count)]
            load_before = os.getloadavg()
            result = subprocess.run(command, env=runtime_env, capture_output=True, text=True, check=True, timeout=60)
            load_after = os.getloadavg()
            checksum, cpu = result.stdout.split()
            assert int(checksum) == expected, (mode, checksum, expected)
            cpu = float(cpu)
            assert math.isfinite(cpu) and cpu >= 0, result.stdout
            return cpu, result.stderr, {"command": command, "loadBefore": load_before, "loadAfter": load_after}
        for sample in range(args.samples):
            labels = list(report["artifacts"])
            if sample % 2:
                labels.reverse()
            for label in labels:
                cpu, stderr, metadata = execute(report["artifacts"][label]["binary"])
                assert not stderr, ("release timing must have no instrumentation", stderr)
                report["raw"].append({"label": label, "mode": mode, "iterations": count, "sample": sample, "cpuMs": cpu, "checksum": expected, **metadata})
        for label in report["artifacts"]:
            times = [x["cpuMs"] for x in report["raw"] if x["label"] == label and x["mode"] == mode]
            row = {"label": label, "mode": mode, "iterations": count, "medianCpuMs": statistics.median(times), "minCpuMs": min(times), "maxCpuMs": max(times)}
            report["summary"].append(row)
            print(row, flush=True)
        for label, counter in counters.items():
            _, stderr, metadata = execute(counter["binary"])
            lines = dict(line.split(" ", 1) for line in stderr.splitlines())
            required = {"ARYA_RUNTIME_COUNTERS", "ARYA_ALLOCATION_DETAIL"}
            assert required <= set(lines) <= required | {"ARYA_NUMBER_DETAIL"}, stderr
            report["counters"].append({"label": label, "mode": mode, "iterations": count, "checksum": expected, **metadata, **{key: json.loads(value) for key, value in lines.items()}})
    for row in [*report["artifacts"].values(), *counters.values()]:
        assert sha(row["binary"]) == row["binarySha256"], "binary changed during measurement"
        assert sha(row["binary"] + ".c") == row["generatedCSha256"], "generated C changed during measurement"
        if "compiler" in row:
            assert sha(row["compiler"]) == row["compilerSha256"], "compiler changed during measurement"
    assert sha(source) == report["sourceSha256"] and sha(__file__) == report["controllerSha256"], "benchmark/controller changed during measurement"
    if args.provenance:
        assert sha(args.provenance) == report["provenanceSha256"], "provenance changed during measurement"
    report["hashesVerifiedUnchanged"] = True
    report["loadEnd"] = os.getloadavg()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as file:
        json.dump(report, file, indent=2)
        file.write("\n")


if __name__ == "__main__":
    main()
