#!/usr/bin/env python3
"""Optional two-SDK benchmark: check, forced application build and direct startup.

This controller uses Python only to collect evidence. Measured compilers and
applications are native. Check timing includes process startup, source loading,
lexing, parsing and validation; it does not isolate parser time.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
import time


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command(argv, environment, timeout=120):
    load_before = list(os.getloadavg())
    start = time.perf_counter_ns()
    result = subprocess.run(list(map(str, argv)), env=environment, timeout=timeout,
                            capture_output=True, text=True)
    elapsed = (time.perf_counter_ns() - start) / 1_000_000
    record = {"argv": list(map(str, argv)), "wallMs": elapsed,
              "returncode": result.returncode, "stdout": result.stdout,
              "stderr": result.stderr, "loadAverageBefore": load_before,
              "loadAverageAfter": list(os.getloadavg())}
    if result.returncode:
        raise RuntimeError(json.dumps(record, indent=2))
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before-compiler", type=Path, required=True)
    parser.add_argument("--after-compiler", type=Path, required=True)
    parser.add_argument("--before-label", required=True)
    parser.add_argument("--after-label", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.before_label or not args.after_label or args.before_label == args.after_label:
        parser.error("choose two distinct, nonempty labels")
    if args.output.exists():
        parser.error("choose a new output path to preserve evidence")
    compilers = {args.before_label: args.before_compiler.resolve(),
                 args.after_label: args.after_compiler.resolve()}
    for compiler in compilers.values():
        if not compiler.is_file():
            parser.error(f"compiler does not exist: {compiler}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    work_root = Path(__file__).resolve().parents[2] / ".build"
    work_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="toolchain-", dir=work_root)).resolve()
    environment = dict(os.environ)
    environment.pop("ARYA_GC_STRESS", None)
    runtime_environment = {"PATH": "/nonexistent"}
    sources = {"hello": 'print("ready")\n',
               "quoted65536": 'const value = "' + "x" * 65536 + '"\nprint(len(value))\n',
               "raw65536": 'const value = """' + "x" * 65536 + '"""\nprint(len(value))\n'}
    paths = {}
    for name, source in sources.items():
        paths[name] = work / (name + ".arya")
        paths[name].write_text(source)
    binaries = {label: work / ("hello-" + str(index))
                for index, label in enumerate(compilers)}
    cc = environment.get("ARYA_CC") or environment.get("CC") or "cc"
    report = {
        "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
        "host": platform.platform(), "architecture": platform.machine(),
        "logicalCpus": os.cpu_count(), "python": platform.python_version(),
        "controllerSha256": digest(Path(__file__)), "evidenceDirectory": str(work),
        "method": "Fresh process wall time. One discarded warmup per operation/SDK; nine check/startup samples and three forced build samples, alternating SDK order. Warm filesystem caches. Check includes startup, loading, lexing, parsing and validation, not isolated parsing. Build includes frontend, C generation, C11 -O2 compilation and static linking, using existing SDK libraries. Direct hello includes process launch, runtime initialization, printing and exit. No Node executable is used. Single-host measurements; no claimed production throughput.",
        "toolchain": command([cc, "--version"], environment),
        "selectedEnvironment": {key: environment.get(key) for key in (
            "PATH", "ARYA_CC", "CC", "ARYA_NATIVE_LIBDIR", "SDKROOT",
            "MACOSX_DEPLOYMENT_TARGET", "CPATH", "C_INCLUDE_PATH", "LIBRARY_PATH")},
        "runtimeEnvironment": runtime_environment,
        "sourceSha256": {name: digest(path) for name, path in paths.items()},
        "compilers": {}, "warmups": [], "raw": [], "summary": []}
    if platform.system() == "Darwin":
        report["sdk"] = command(["xcrun", "--show-sdk-path"], environment)
        report["sdkVersion"] = command(["xcrun", "--show-sdk-version"], environment)
    for label, compiler in compilers.items():
        library = Path(environment.get("ARYA_NATIVE_LIBDIR") or compiler.parent / "lib")
        mpdec = library / "libmpdec.a"
        report["compilers"][label] = {
            "path": str(compiler), "sha256": digest(compiler),
            "bytes": compiler.stat().st_size,
            "version": command([compiler, "--version"], environment),
            "libraryDirectory": str(library.resolve()),
            "libmpdecSha256": digest(mpdec)}

    operations = [("check-" + name, 9, path) for name, path in paths.items()]
    operations.extend([("forced-build-hello", 3, paths["hello"]),
                       ("direct-startup-hello", 9, paths["hello"])])
    for operation, samples, source in operations:
        for sample in range(-1, samples):
            order = list(compilers)
            if sample % 2 == 0:
                order.reverse()
            for label in order:
                compiler, binary = compilers[label], binaries[label]
                if operation.startswith("check-"):
                    result = command([compiler, "check", source, "--json"], environment)
                    checked = json.loads(result["stdout"])
                    if checked.get("ok") is not True or checked.get("diagnostics") != []:
                        raise RuntimeError(f"Unexpected check result: {checked}")
                elif operation == "forced-build-hello":
                    result = command([compiler, "build", source, "-o", binary,
                                      "--release", "--force"], environment)
                    validation = command([binary], runtime_environment)
                    if validation["stdout"] != "ready\n" or validation["stderr"]:
                        raise RuntimeError(f"Unexpected hello output: {validation}")
                    result.update({"executableBytes": binary.stat().st_size,
                                   "executableSha256": digest(binary),
                                   "generatedCSha256": digest(binary.with_suffix(".c"))})
                else:
                    result = command([binary], runtime_environment)
                    if result["stdout"] != "ready\n" or result["stderr"]:
                        raise RuntimeError(f"Unexpected hello output: {result}")
                result.update({"operation": operation, "label": label, "sample": sample})
                report["warmups" if sample < 0 else "raw"].append(result)
        summary = {"operation": operation, "samplesPerSdk": samples, "results": {}}
        for label in compilers:
            values = [row["wallMs"] for row in report["raw"]
                      if row["operation"] == operation and row["label"] == label]
            summary["results"][label] = {"medianMs": statistics.median(values),
                                         "minMs": min(values), "maxMs": max(values)}
        report["summary"].append(summary)
        print(json.dumps(summary), flush=True)
    for label, compiler in compilers.items():
        if digest(compiler) != report["compilers"][label]["sha256"]:
            raise RuntimeError(f"Compiler changed during measurement: {compiler}")
    report["finishedAtUtc"] = datetime.now(timezone.utc).isoformat()
    with args.output.open("x") as output:
        json.dump(report, output, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
