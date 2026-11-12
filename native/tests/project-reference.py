"""Native project/CLI integration. Python controls the tests, never the apps."""
import concurrent.futures
import hashlib
import http.client
import json
import os
from pathlib import Path
import selectors
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(sys.argv[1] if len(sys.argv) > 1 else root / ".build/independent/arya").resolve()
work = Path(tempfile.mkdtemp(prefix="native-project-reference-", dir=root / ".build"))
environment = dict(os.environ)

def run(arguments, cwd=work, env=environment, success=True):
    result = subprocess.run([str(compiler), *map(str, arguments)], cwd=cwd, env=env,
                            text=True, capture_output=True, timeout=150)
    if success: assert result.returncode == 0, (arguments, result.stdout, result.stderr)
    else: assert result.returncode != 0, (arguments, result.stdout, result.stderr)
    return result

def snapshot(directory):
    return {str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.rglob("*") if path.is_file()}

try:
    for kind in ["web", "api", "cli", "ui", "desktop"]:
        folder = work / (kind + " app's project")
        created = run(["create", folder, "--template", kind])
        cd_line = next(line for line in created.stdout.splitlines() if line.startswith("cd "))
        checked = subprocess.run(["/bin/sh", "-c", cd_line + "\npwd"], capture_output=True, text=True)
        assert checked.returncode == 0 and checked.stdout.strip() == str(folder), created.stdout
        assert not list(folder.rglob("package*.json")), kind
        run(["check", folder / "main.arya"])
        run(["check", folder / "main.test.arya"])
        original = snapshot(folder)
        run(["create", folder, "--template", "cli"], success=False)
        assert snapshot(folder) == original, "Existing project was modified"
        if kind == "desktop": continue  # The native window has its own integration gate.
        program = folder / "app"
        run(["build", folder / "main.arya", "--debug", "-o", program])
        if kind == "cli":
            result = subprocess.run([str(program), "19.95", "3"], env={"PATH": "/nonexistent"},
                                    capture_output=True, text=True, timeout=10)
            assert result.returncode == 0 and result.stdout.strip() == "Total: 59.85", result
            continue
        log = (folder / "app-errors.log").open("w+")
        child = subprocess.Popen([str(program)], cwd=folder, env={"PATH": "/nonexistent", "PORT": "0"},
                                 stdout=subprocess.PIPE, stderr=log, text=True)
        try:
            selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
            assert selector.select(15), f"{kind} template did not start"
            address = child.stdout.readline().strip()
            port = int(address.rsplit(":", 1)[1])
            def request(method, target, payload=None):
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                connection.request(method, target, payload, {"Content-Type": "application/json"})
                response = connection.getresponse()
                result = response.status, response.read()
                connection.close()
                return result
            if kind == "web":
                assert b"Make something useful" in request("GET", "/")[1]
                assert json.loads(request("GET", "/api/hello")[1]) == {"message": "Hello from native Arya"}
                assert request("GET", "/app.js")[0] == 200
                assert request("GET", "/style.css")[0] == 200
            else:
                status, payload = request("POST", "/api/total", '{"price":"19.95","quantity":"3"}')
                assert status == 200 and json.loads(payload)["total"] == "59.85", (status, payload)
                assert request("POST", "/api/total", '{"price":19.95,"quantity":"3"}')[0] == 400
                if kind == "ui": assert b"Order total" in request("GET", "/")[1]
                else: assert request("GET", "/health")[0] == 200
            child.send_signal(signal.SIGTERM)
            assert child.wait(timeout=15) == 0, f"{kind} template did not drain gracefully"
            selector.close()
        finally:
            if child.poll() is None: child.kill(); child.wait()
            log.seek(0); errors = log.read(); log.close()
            assert not errors, errors
    empty = work / "empty"; empty.mkdir()
    run(["init", "--template", "cli"], cwd=empty)
    assert (empty / "main.arya").is_file()
    marker = work / "occupied"; marker.mkdir(); (marker / "original").write_bytes(b"preserve\0contents")
    original = snapshot(marker)
    run(["init", marker], success=False)
    assert snapshot(marker) == original
    linked = work / "linked"; linked.symlink_to(marker, target_is_directory=True)
    run(["create", linked], success=False)
    assert snapshot(marker) == original
    racing = work / "concurrent"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(subprocess.run, [str(compiler), "create", str(racing), "--template", "cli"],
                                  cwd=work, text=True, capture_output=True, timeout=30) for _ in range(2)]
    assert sorted(f.result().returncode for f in futures) == [0, 1]
    assert (racing / "main.arya").is_file()
    assert not list(work.glob(".arya-create-*")), "Creator left staging directories"

    cache = work / "cache"; cache.mkdir(); source = cache / "main.arya"; source.write_text("print(1)\n")
    counter = cache / "cc-count"; wrapper = cache / "cc"
    wrapper.write_text("#!/bin/sh\nprintf 'compile\\n' >> " + shlex.quote(str(counter)) +
                       "\nexec " + shlex.quote(shutil.which("cc")) + ' "$@"\n')
    wrapper.chmod(0o755)
    build_env = dict(environment, ARYA_CC=str(wrapper))
    assert run(["run", source, "--debug"], env=build_env).stdout.strip() == "1"
    assert run(["run", source, "--debug"], env=build_env).stdout.strip() == "1"
    assert len(counter.read_text().splitlines()) == 1, "Unchanged run missed cache"
    source.write_text("print(2)\n")
    assert run(["run", source, "--debug"], env=build_env).stdout.strip() == "2"
    assert len(counter.read_text().splitlines()) == 2
    output = cache / ".arya/native/main"
    with output.open("ab") as file: file.write(b"\0tampered")
    assert run(["run", source, "--debug"], env=build_env).stdout.strip() == "2"
    assert len(counter.read_text().splitlines()) == 3, "Changed executable reused"
    cache_original = snapshot(cache)
    failing = cache / "failing-cc"; failing.write_text("#!/bin/sh\nexit 19\n"); failing.chmod(0o755)
    run(["build", source, "--cc", failing, "-o", cache / "failed"], success=False)
    assert not list(cache.glob("failed*")) and not list(cache.glob("*.arya-*"))
    assert source.read_text() == "print(2)\n"

    tools = work / "fake-editors"; tools.mkdir(); installs = work / "editor-installs.jsonl"
    for name in ["code", "aryacode", "cursor", "codium", "windsurf"]:
        launcher = tools / name
        launcher.write_text("#!/bin/sh\nprintf '%s\\n' \"$0 $*\" >> " + shlex.quote(str(installs)) + "\n")
        launcher.chmod(0o755)
    editor_env = {"PATH": str(tools)}
    status = json.loads(run(["editor", "status", "--json"], env=editor_env).stdout)
    assert len(status["editors"]) == 5 and all(item["executable"] for item in status["editors"]), status
    assert status["packageAvailable"], "Complete SDK must contain the editor package"
    run(["editor", "install", "--editor", "all"], env=editor_env)
    assert len(installs.read_text().splitlines()) == 5
    print("native projects: all templates, live routes, exact totals, SIGTERM drain, safe creation, atomic races, run cache and five isolated editor launchers passed")
except Exception:
    print(f"Project evidence retained at {work}", file=sys.stderr)
    raise
else:
    shutil.rmtree(work)
