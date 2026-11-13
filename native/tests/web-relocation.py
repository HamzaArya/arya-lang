"""Exercise a relocated native HTTP binary after its source directory disappears."""
import http.client
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(os.environ.get("ARYA_NATIVE_BIN", root / ".build/independent/arya")).resolve()
sanitized = os.environ.get("ARYA_TEST_SANITIZERS") != "unavailable"
if not sanitized and sys.platform != "cygwin":
    raise SystemExit("Sanitizer fallback requires the recorded Cygwin capability gate.")
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
        binary = work / ("server-" + mode)
        flags = ["--release"] if mode == "release" else ["--debug", *(["--sanitize"] if sanitized else [])]
        result = subprocess.run([str(compiler), "build", str(program), "-o", str(binary), *flags], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
        # Rename both the executable and the complete original source directory.
        destination = installed / binary.name
        binary.rename(destination)
        binaries.append(destination)
    source.rename(work / "preserved source")
    assert not source.exists()
    environment = {"PATH": "/nonexistent", "ARYA_GC_STRESS": "1", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"}
    for binary in binaries:
        for scenario in ("api", "explicit", "external"):
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
                assert server.returncode == 0 and not error, (output, error, server.returncode)
            finally:
                selector.close()
                if server.poll() is None:
                    server.kill()
                    server.communicate(timeout=10)
        for scenario in ("html", "assets", "invalid"):
            result = subprocess.run([str(binary), scenario], cwd=installed, env=environment,
                                    capture_output=True, text=True, timeout=10)
            assert result.returncode == 3 and result.stdout.startswith("startup-error "), result
            if scenario == "invalid":
                assert result.stdout.strip() == "startup-error TypeError", result
            assert not result.stderr, result.stderr
    print("HTTP relocation: API-only source removal, explicit static root, disabled assets and invalid options passed in both modes")
