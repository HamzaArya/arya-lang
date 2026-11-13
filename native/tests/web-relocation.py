"""Exercise a relocated native HTTP binary after its source directory disappears."""
import http.client
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(os.environ.get("ARYA_NATIVE_BIN", root / ".build/independent/arya")).resolve()
sanitized = os.environ.get("ARYA_TEST_SANITIZERS") != "unavailable"
if not sanitized and sys.platform != "cygwin":
    raise SystemExit("Sanitizer fallback requires the recorded Cygwin capability gate.")

def check_stderr(error, binary, scenario):
    # GCC's ASan reports this documented instrumentation limitation on Linux
    # when the native scheduler switches contexts. Preserve the warning in the
    # gate log and reject every other diagnostic, including sanitizer findings.
    context_warning = r"==[0-9]+==WARNING: ASan doesn't fully support makecontext/swapcontext functions and may produce false positives in some cases!\n"
    if error and binary.stem == "server-sanitized" and re.fullmatch(context_warning, error):
        print(f"{binary.name}/{scenario}: {error.rstrip()}", flush=True)
    else:
        assert not error, error

with tempfile.TemporaryDirectory(prefix="web-relocation-", dir=root / ".build") as directory:
    work = Path(directory)
    source = work / "source"
    source.mkdir()
    program = source / "main.arya"
    program.write_bytes((root / "native/tests/fixtures/web-relocation.arya").read_bytes())
    installed = work / "installed service's directory"
    installed.mkdir()
    content = work / "static files"
    content.mkdir()
    (content / "index.html").write_text("<h1>Relocated native service</h1>")
    binaries = []
    for mode in ("release", "sanitized" if sanitized else "debug"):
        binary = work / ("server-" + mode + (".exe" if sys.platform == "cygwin" else ""))
        flags = ["--release"] if mode == "release" else ["--debug", *(["--sanitize"] if sanitized else [])]
        result = subprocess.run([str(compiler), "build", str(program), "-o", str(binary), *flags], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
        # Rename both the executable and the complete original source directory.
        destination = installed / binary.name
        binary.rename(destination)
        binaries.append(destination)
    source.rename(work / "preserved source")
    assert not source.exists()
    # Empty POSIX PATH keeps interpreter lookup disabled, while Cygwin supplies
    # the original installation's DLL directory to the Windows loader.
    runtime_path = "" if sys.platform == "cygwin" else "/nonexistent"
    environment = {"PATH": runtime_path, "ARYA_GC_STRESS": "1", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"}
    for binary in binaries:
        for scenario in ("api", "explicit", "external"):
            print(f"HTTP relocation: {binary.name}/{scenario}", flush=True)
            server = subprocess.Popen([str(binary), scenario, str(content)], cwd=installed,
                                      env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            selector = selectors.DefaultSelector()
            selector.register(server.stdout, selectors.EVENT_READ)
            try:
                assert selector.select(15), "Relocated HTTP server did not start"
                first = server.stdout.readline().strip()
                assert first.isdigit(), first
                port = int(first)

                def request(method, path):
                    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                    try:
                        connection.request(method, path)
                        response = connection.getresponse()
                        return response.status, response.read()
                    finally:
                        connection.close()

                status, body = request("GET", "/health")
                assert status == 200 and json.loads(body) == {"ok": True}, (status, body)
                status, body = request("GET", "/")
                if scenario == "external":
                    assert status == 200 and body == b"<h1>Relocated native service</h1>", (status, body)
                else:
                    assert status == 404, (status, body)
                assert request("POST", "/stop")[0] == 200
                output, error = server.communicate(timeout=10)
                assert server.returncode == 0, (output, error, server.returncode)
                check_stderr(error, binary, scenario)
            except Exception as failure:
                if server.poll() is None:
                    server.kill()
                output, error = server.communicate(timeout=10)
                raise AssertionError(
                    f"{binary.name}/{scenario}: {failure}; exit={server.returncode}; "
                    f"stdout={output!r}; stderr={error!r}"
                ) from failure
            finally:
                selector.close()
                if server.poll() is None:
                    server.kill()
                    server.communicate(timeout=10)
        for scenario in ("html", "assets", "invalid"):
            print(f"HTTP relocation: {binary.name}/{scenario}", flush=True)
            result = subprocess.run([str(binary), scenario], cwd=installed, env=environment,
                                    capture_output=True, text=True, timeout=10)
            assert result.returncode == 3 and result.stdout.startswith("startup-error "), result
            if scenario == "invalid":
                assert result.stdout.strip() == "startup-error TypeError", result
            check_stderr(result.stderr, binary, scenario)
    print("HTTP relocation: API-only source removal, explicit static root, disabled assets and invalid options passed in both modes")
