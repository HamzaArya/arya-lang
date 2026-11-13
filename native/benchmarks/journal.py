#!/usr/bin/env python3
"""Optional native before/after journal evidence, with separate build/measure steps.

Python is a development controller/oracle, never a runtime dependency. This does
not compare languages or qualify a release. Existing evidence is never replaced.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import runpy
import select
import shutil
import statistics
import subprocess
import tempfile
import time

MODES = ("validate", "flat-prepare", "prepare", "calculate", "journal")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    with path.open("x") as output:
        json.dump(value, output, indent=2)
        output.write("\n")


def sdk_files(compiler):
    # The compiler reads standard libraries from adjacent files. A compiler hash
    # alone cannot identify the program being measured in a dirty checkout.
    files = [compiler]
    for name in ("stdlib", "lib"):
        files.extend(p for p in (compiler.parent / name).rglob("*") if p.is_file())
    return {str(p): sha(p) for p in sorted(files)}


def verify(identities):
    for name, expected in identities.items():
        path = Path(name)
        if not path.is_file() or sha(path) != expected:
            raise RuntimeError(f"Benchmark input changed: {name}")


@contextmanager
def timing_lock():
    # Shared across output directories and SDKs; crashes release the OS lock.
    with (Path(tempfile.gettempdir()) / "arya-performance.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another cooperating Arya benchmark holds the timing lock") from error
        yield


def idle_host():
    processes = subprocess.run(["ps", "-axo", "pid=,comm=,args="], capture_output=True, text=True, check=True)
    busy = []
    for line in processes.stdout.splitlines():
        fields = line.strip().split(None, 2)
        if len(fields) != 3 or int(fields[0]) == os.getpid():
            continue
        name = Path(fields[1]).name
        if name in {"make", "clang", "clang++", "cc", "gcc", "g++"} or (
                name in {"arya", "stage1", "stage2"} and " build " in fields[2]) or (
                "native/benchmarks/" in fields[2] and name in {"node", "python", "python3", "Python"}):
            busy.append(line.strip())
    if busy:
        raise RuntimeError("Competing build/benchmark processes; defer timing:\n" + "\n".join(busy))


def build(args):
    out = args.out.resolve()
    out.mkdir(parents=True)  # Refuse an existing evidence directory.
    source = Path(__file__).with_suffix(".arya")
    oracle = Path(__file__).parents[1] / "tests/accounting-journal-reference.py"
    shutil.copyfile(source, out / "workload.arya")
    shutil.copyfile(oracle, out / "oracle.py")
    workloads = []
    for name, count, pairs in (("small", 10, 1), ("many", 1000, 1), ("wide", 20, 50)):
        transactions = []
        for i in range(count):
            entries = []
            for j in range(pairs):
                units = (i + 1) * 97 + j + 1
                amount = f"{units // 100}.{units % 100:02}"
                entries.extend([dict(account=f"account:{(i + j) % 37}", debit=amount, credit="0"),
                                dict(account=f"account:{(i + j + 1) % 37}", debit="0", credit=amount)])
            transactions.append(dict(id=f"transaction:{i}", entries=entries))
        workloads.append(dict(name=name, transactions=transactions, options=dict(currency="AFN", scale=2)))
    save(out / "workloads.json", workloads)
    cc = os.environ.get("ARYA_CC") or os.environ.get("CC") or "cc"
    cc_version = subprocess.run([cc, "--version"], capture_output=True, text=True, check=True)
    toolchain = dict(cc=cc, ccVersion=cc_version.stdout + cc_version.stderr,
                     flags="--release: C11 -O2 -ffp-contract=off; counters add --runtime-counters",
                     platform=platform.platform(), architecture=platform.machine(),
                     controllerPython=platform.python_version())
    identities = {str(p): sha(p) for p in (Path(__file__).resolve(), out / "workload.arya", out / "oracle.py", out / "workloads.json")}
    artifacts = {}
    for label, compiler in (("before", args.before_compiler.resolve()), ("after", args.after_compiler.resolve())):
        identities.update(sdk_files(compiler))
        environment = dict(os.environ)
        environment.pop("ARYA_GC_STRESS", None)
        environment["ARYA_NATIVE_LIBDIR"] = str(compiler.parent / "lib")
        artifacts[label] = {"compiler": str(compiler), "builds": []}
        for variant in ("timing", "counters"):
            binary = out / f"{label}-{variant}"
            argv = [str(compiler), "build", str(out / "workload.arya"), "-o", str(binary), "--release"]
            if variant == "counters":
                argv.append("--runtime-counters")
            started = time.perf_counter_ns()
            result = subprocess.run(argv, env=environment, capture_output=True, text=True, timeout=180)
            record = dict(argv=argv, applicationBuildWallMs=(time.perf_counter_ns() - started) / 1e6,
                          returncode=result.returncode, stdout=result.stdout, stderr=result.stderr)
            save(out / f"{label}-{variant}-build.json", record)
            if result.returncode:
                raise RuntimeError(result.stderr + result.stdout)
            artifacts[label][variant] = str(binary)
            artifacts[label]["builds"].append(record)
            for path in (binary, binary.with_suffix(".c")):
                identities[str(path)] = sha(path)
    verify(identities)
    save(out / "artifacts.json", dict(identities=identities, artifacts=artifacts, toolchain=toolchain))
    print(f"Built and hashed inputs in {out}; timing has not run.")


class Peer:
    def __init__(self, binary, stderr):
        self.stderr = stderr.open("x")
        started = time.perf_counter_ns()
        self.child = subprocess.Popen([binary], env={"PATH": "/nonexistent"}, stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=self.stderr, text=True)
        try:
            if self.line().strip() != "ready":
                raise RuntimeError("Unexpected worker readiness response")
        except Exception:
            self.child.kill()
            self.child.wait()
            self.child.stdin.close()
            self.child.stdout.close()
            self.stderr.close()
            raise
        self.cold_ready_ms = (time.perf_counter_ns() - started) / 1e6

    def line(self):
        if not select.select([self.child.stdout], [], [], 120)[0]:
            raise RuntimeError("Worker response timed out")
        line = self.child.stdout.readline()
        if not line:
            raise RuntimeError("Worker exited before responding")
        return line

    def request(self, request):
        started = time.perf_counter_ns()
        text = json.dumps(request, ensure_ascii=True, separators=(",", ":")) + "\n"
        encoded = time.perf_counter_ns()
        self.child.stdin.write(text)
        self.child.stdin.flush()
        line = self.line()
        received = time.perf_counter_ns()
        result = json.loads(line)
        result.update(hostEncodeMs=(encoded - started) / 1e6, pipeAndWorkerWallMs=(received - encoded) / 1e6,
                      hostDecodeMs=(time.perf_counter_ns() - received) / 1e6)
        return result

    def close(self):
        self.child.stdin.close()
        try:
            status = self.child.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.child.kill()
            self.child.wait()
            raise
        finally:
            self.stderr.close()
            self.child.stdout.close()
        if status:
            raise RuntimeError(f"Worker exited with status {status}")


def measure(args):
    out = args.out.resolve()
    if (out / "results.json").exists() or (out / "started.json").exists():
        raise RuntimeError("Timing already started here; build a new evidence directory")
    artifacts = json.loads((out / "artifacts.json").read_text())
    verify(artifacts["identities"])
    oracle = runpy.run_path(str(out / "oracle.py"))["oracle"]
    workloads = json.loads((out / "workloads.json").read_text())
    expected = {w["name"]: oracle(w) for w in workloads}
    with timing_lock():
        idle_host()  # No override: existing uncoordinated builds invalidate timing.
        report = dict(recordedAtUtc=datetime.now(timezone.utc).isoformat(), platform=platform.platform(),
                      architecture=platform.machine(), cpus=os.cpu_count(), loadAverageStart=os.getloadavg(),
                      environmentNote=args.environment_note, artifacts=artifacts, warmups=[], raw=[], starts=[], diagnostics=[],
                      boundaries={"build": "Application frontend + C11 compilation + linking wall time; excludes compiler bootstrap",
                                  "coldReady": "Process launch through native runtime/module initialization and ready line; excludes calculations",
                                  "operation": "Warmed native operation CPU, natural GC; excludes input parse/setup, output/report calculation for prepare modes, pipes and JSON output",
                                  "roundTrip": "Persistent-worker pipe/worker wall time; includes request write, input JSON, setup, operation and output JSON/read; host encode/decode separate",
                                  "memory": "Separate counters executable: peak managed bytes and allocation counts; includes parsing/setup/reporting, not RSS",
                                  "limits": "Native before/after only; no Node/PHP, full-service, concurrent throughput or platform release claim"})
        save(out / "started.json", report)
        for session in range(args.sessions):
            idle_host()
            peers = {}
            try:
                for label, artifact in artifacts["artifacts"].items():
                    peers[label] = Peer(artifact["timing"], out / f"{label}-{session}.stderr")
                    report["starts"].append(dict(session=session, label=label, coldReadyMs=peers[label].cold_ready_ms))
                for workload in workloads:
                    for mode in MODES:
                        wanted = expected[workload["name"]]
                        if mode == "validate":
                            wanted = wanted["transactions"]
                        elif mode == "flat-prepare":
                            wanted = {k: v for k, v in wanted.items() if k not in ("transactions", "transactionCount", "policy")}
                        for sample in range(-args.warmups, args.samples):
                            idle_host()
                            labels = list(peers)
                            if (sample + session) % 2:
                                labels.reverse()
                            for label in labels:
                                request = {k: v for k, v in workload.items() if k != "name"}
                                request.update(mode=mode, iterations=1)
                                row = peers[label].request(request)
                                actual = row.pop("result")
                                if actual != wanted:
                                    raise RuntimeError(f"Independent integer oracle mismatch: {label}, {workload['name']}, {mode}")
                                row.update(session=session, sample=sample, label=label, workload=workload["name"], mode=mode,
                                           resultSha256=hashlib.sha256(json.dumps(actual, sort_keys=True).encode()).hexdigest())
                                report["warmups" if sample < 0 else "raw"].append(row)
                                # Retain completed samples if a later check fails.
                                with (out / "samples.jsonl").open("a") as partial:
                                    partial.write(json.dumps(row) + "\n")
            finally:
                for peer in peers.values():
                    peer.close()
        idle_host()
        # Allocation diagnostics are separate from timing and verified too.
        for label, artifact in artifacts["artifacts"].items():
            peer = Peer(artifact["counters"], out / f"{label}-counters.stderr")
            try:
                w = workloads[1]
                row = peer.request(dict(transactions=w["transactions"], options=w["options"], mode="journal", iterations=1))
                if row["result"] != expected[w["name"]]:
                    raise RuntimeError("Counter build oracle mismatch")
            finally:
                peer.close()
            report["diagnostics"].append(dict(label=label, workload=w["name"], stderr=(out / f"{label}-counters.stderr").read_text()))
        verify(artifacts["identities"])
        report["summary"] = []
        for workload in workloads:
            for mode in MODES:
                for label in artifacts["artifacts"]:
                    rows = [r for r in report["raw"] if r["workload"] == workload["name"] and r["mode"] == mode and r["label"] == label]
                    fields = ("operationCpuMs", "parseCpuMs", "setupCpuMs", "pipeAndWorkerWallMs", "hostEncodeMs", "hostDecodeMs")
                    report["summary"].append(dict(workload=workload["name"], mode=mode, label=label, samples=len(rows),
                                                  median={k: statistics.median(r[k] for r in rows) for k in fields},
                                                  minOperationCpuMs=min(r["operationCpuMs"] for r in rows),
                                                  maxOperationCpuMs=max(r["operationCpuMs"] for r in rows)))
        report.update(passed=True, finishedAtUtc=datetime.now(timezone.utc).isoformat(), loadAverageEnd=os.getloadavg())
        save(out / "results.json", report)
        print(json.dumps(report["summary"], indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    builder = commands.add_parser("build")
    builder.add_argument("--before-compiler", type=Path, required=True)
    builder.add_argument("--after-compiler", type=Path, required=True)
    builder.add_argument("--out", type=Path, required=True)
    measurer = commands.add_parser("measure")
    measurer.add_argument("--out", type=Path, required=True)
    measurer.add_argument("--samples", type=int, choices=range(3, 32), default=9)
    measurer.add_argument("--sessions", type=int, choices=range(2, 5), default=2)
    measurer.add_argument("--warmups", type=int, choices=range(1, 6), default=3)
    measurer.add_argument("--environment-note", default="Shared development host; no competing build/benchmark processes detected")
    args = parser.parse_args()
    (build if args.action == "build" else measure)(args)


if __name__ == "__main__":
    main()
