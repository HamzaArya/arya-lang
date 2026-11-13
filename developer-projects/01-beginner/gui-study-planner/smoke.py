#!/usr/bin/env python3
"""Black-box native HTTP acceptance checks; no Python application backend."""
import contextlib, json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
EXE = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix="arya-http-smoke-") as directory:
    store = pathlib.Path(directory) / "data.json"
    @contextlib.contextmanager
    def server():
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0)); port = reservation.getsockname()[1]
        env = dict(os.environ, PORT=str(port), DATA_FILE=str(store))
        with tempfile.TemporaryFile(mode="w+") as log:
            process = subprocess.Popen([EXE], cwd=directory, env=env, stdout=log, stderr=log)
            def request(path, method="GET", body=None, status=200):
                payload = None if body is None else json.dumps(body).encode()
                req = urllib.request.Request(f"http://127.0.0.1:{port}"+path, data=payload, method=method, headers={"Content-Type":"application/json"})
                try:
                    response = urllib.request.urlopen(req, timeout=3)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    content = response.read().decode()
                    assert response.status == status, (method, path, response.status, content)
                    if "application/json" in response.headers.get("Content-Type", ""):
                        return json.loads(content)
                    return content
            try:
                for attempt in range(400):
                    if process.poll() is not None:
                        log.seek(0); raise AssertionError(log.read())
                    try:
                        request("/health"); break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.05)
                else:
                    log.seek(0); raise AssertionError("server readiness timeout: "+log.read())
                yield request
            finally:
                if process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=5)
                    except subprocess.TimeoutExpired: process.kill(); process.wait(); raise AssertionError("graceful shutdown timed out")
                assert process.returncode == 0, process.returncode
    with server() as request:
        page = request("/")
        assert "Study Planner" in page and "Add session" in page and "arya" in page
        result = request("/api/sessions", "POST", {"title":"Algebra <script>", "minutes":"25"})
        assert result["sessions"][0]["id"] == 1 and "25 minutes" in result["overview"]
        page = request("/")
        assert "Algebra <script>" not in page
        request("/api/sessions", "POST", {"title":"Bad", "minutes":"0"}, 400)
        request("/api/sessions", "POST", {"title":" ", "minutes":"30"}, 400)
        request("/api/toggle", "POST", {"id":"999"}, 400)
        result = request("/api/toggle", "POST", {"id":"1"})
        assert result["sessions"][0]["done"] is True and "Remaining study time: 0" in result["overview"]
    with server() as request:
        assert request("/api/sessions")["sessions"][0]["done"] is True
        request("/api/remove", "POST", {"id":"1"})
        assert request("/api/sessions")["sessions"] == []
    store.write_text("{broken")
    result = subprocess.run([EXE], cwd=directory, env=dict(os.environ, PORT="0", DATA_FILE=str(store)), capture_output=True, text=True, timeout=5)
    assert result.returncode != 0 and store.read_text() == "{broken"
print("PASS: HTTP success/error paths, persistence across restart, graceful shutdown, corrupt-store protection")
