"""Opt-in performance-audit kernels; programs and compiler remain native."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import queue
import statistics
import subprocess
import tempfile
import threading
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--compiler", default=".build/independent/arya")
parser.add_argument("--samples", type=int, default=5)
parser.add_argument("--output")
options = parser.parse_args()
if options.samples < 3 or options.samples > 21 or options.samples % 2 == 0:
    parser.error("--samples must be odd, from 3 to 21")
root = Path(__file__).resolve().parents[2]
compiler = Path(options.compiler).resolve()
work = Path(tempfile.mkdtemp(prefix="native-performance-benchmark-", dir=root / ".build"))
environment = dict(os.environ)
environment.pop("ARYA_GC_STRESS", None)


def run(command, timeout=120):
    start = time.perf_counter()
    result = subprocess.run(list(map(str, command)), capture_output=True, text=True,
                            env=environment, timeout=timeout)
    elapsed = (time.perf_counter() - start) * 1000
    if result.returncode:
        raise RuntimeError(f"{command}: {result.stdout[-1000:]} {result.stderr[-3000:]}")
    return result.stdout.strip(), elapsed


def summary(values):
    return {"medianMs": statistics.median(values), "samplesMs": values}


binary = work / "kernels"
source = root / "native/benchmarks/performance.arya"
run([compiler, "build", source, "-o", binary, "--release"])
report = {
    "recordedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "host": platform.platform(), "architecture": platform.machine(),
    "compilerSha256": hashlib.sha256(compiler.read_bytes()).hexdigest(),
    "workloadSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "flags": "C11 -O2 -ffp-contract=off",
    "method": "Fresh process per runtime sample; CPU timing excludes setup/build/startup. Tooling measures wall time. Random outputs range-checked; all other results checked. Single-host microbenchmarks.",
    "runtime": [], "tooling": {}, "evidenceDirectory": str(work),
}
cases = [("concat", 40000), ("join", 40000), ("record", 20000),
         ("unique", 40000), ("promise", 16000), ("map-delete", 16000),
         ("map-read", 16000), ("json-parse", 20000), ("json-stringify", 20000),
         ("global-floor", 10000), ("cached-floor", 10000),
         ("random", 10000), ("sparse", 1000000)]
for mode, size in cases:
    text = json.dumps({f"key{i}": i for i in range(size if mode.startswith("json-") else 0)}, separators=(",", ":"))
    data = work / "input.json"
    data.write_text(text)
    samples = []
    answers = []
    for _ in range(options.samples):
        output, _ = run([binary, mode, size, data], timeout=60)
        answer, cpu = map(float, output.split())
        if mode == "random":
            assert 0 <= answer < size
        elif mode == "sparse":
            assert 0 < answer < 100000, answer
        else:
            expected = (size - 1 if mode in ("record", "json-parse") else
                        size * (size - 1) // 2 if mode == "map-read" else
                        len(text.encode()) if mode == "json-stringify" else
                        sum(i // 2 for i in range(size)) if mode.endswith("floor") else size)
            assert answer == expected, (mode, answer, expected)
        samples.append(cpu)
        answers.append(answer)
    row = {"operation": mode, "n": size, "cpu": summary(samples)}
    if mode == "sparse":
        row["managedBytesAdded"] = statistics.median(answers)
    report["runtime"].append(row)
    print(f"{mode}: {row['cpu']['medianMs']:.3f} ms CPU", flush=True)

for kind, delimiter in [("quoted", '"'), ("raw", '"""')]:
    file = work / (kind + ".arya")
    file.write_text("const value = " + delimiter + "x" * 65536 + delimiter + "\nprint(len(value))\n")
    samples = [run([compiler, "check", file])[1] for _ in range(options.samples)]
    report["tooling"][kind + "65536Check"] = summary(samples)

hello = work / "hello.arya"
hello.write_text('print("ready")\n')
run([compiler, "run", hello])
direct = work / ".arya/native/hello"
for name, command in [("cachedRun", [compiler, "run", hello]), ("directHello", [direct])]:
    samples = []
    for _ in range(options.samples):
        answer, elapsed = run(command)
        assert answer == "ready"
        samples.append(elapsed)
    report["tooling"][name] = summary(samples)

# Sequential LSP edits avoid measuring queued notifications or stale versions.
workspace = work / "lsp"
workspace.mkdir()
messages = queue.Queue()
with (work / "lsp.stderr").open("w") as errors:
    server = subprocess.Popen([str(compiler), "lsp", "--stdio"], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=errors, cwd=workspace,
                              env=environment)

    def reader():
        try:
            while True:
                headers = {}
                while True:
                    line = server.stdout.readline()
                    if not line:
                        return
                    if line == b"\r\n":
                        break
                    key, value = line.split(b":", 1)
                    headers[key.lower()] = value.strip()
                messages.put(json.loads(server.stdout.read(int(headers[b"content-length"]))))
        except BaseException as error:
            messages.put({"readerError": str(error)})

    threading.Thread(target=reader, daemon=True).start()

    def send(method, params, identifier=None):
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        if identifier is not None:
            message["id"] = identifier
        body = json.dumps(message).encode()
        server.stdin.write(f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
        server.stdin.flush()

    def until(check):
        while True:
            message = messages.get(timeout=45)
            if "readerError" in message or "error" in message:
                raise RuntimeError(message)
            if check(message):
                return message

    try:
        send("initialize", {"workspaceFolders": [{"uri": workspace.as_uri(), "name": "audit"}]}, 1)
        until(lambda value: value.get("id") == 1)
        uri = (workspace / "main.arya").as_uri()
        text = "\n".join(f"const value{i} = {i}" for i in range(400)) + "\n"
        send("textDocument/didOpen", {"textDocument": {"uri": uri, "languageId": "arya", "version": 1, "text": text}})
        until(lambda value: value.get("method") == "textDocument/publishDiagnostics")
        samples = []
        for version in range(2, options.samples + 2):
            start = time.perf_counter()
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": version}, "contentChanges": [{"text": text + f"# {version}\n"}]})
            value = until(lambda value: value.get("method") == "textDocument/publishDiagnostics" and value["params"].get("version") == version)
            assert len(value["params"]["diagnostics"]) == 400
            samples.append((time.perf_counter() - start) * 1000)
        report["tooling"]["lsp400UnusedEdit"] = summary(samples)
        send("shutdown", {}, 2)
        until(lambda value: value.get("id") == 2)
        send("exit", {})
        server.wait(timeout=5)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=5)

output = Path(options.output).resolve() if options.output else work / "results.json"
output.parent.mkdir(parents=True, exist_ok=True)
with output.open("x") as stream:
    json.dump(report, stream, indent=2)
    stream.write("\n")
print(json.dumps({"output": str(output), "tooling": report["tooling"]}, indent=2))
