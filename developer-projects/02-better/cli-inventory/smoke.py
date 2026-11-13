#!/usr/bin/env python3
"""Black-box acceptance checks; Python is only the test driver."""
import json, os, pathlib, subprocess, sys, tempfile
EXE = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix="arya-cli-smoke-") as directory:
    store = pathlib.Path(directory) / "data.json"
    env = dict(os.environ, DATA_FILE=str(store))
    def run(*args, ok=True):
        result = subprocess.run([EXE, *args], cwd=directory, env=env, text=True, capture_output=True, timeout=10)
        assert (result.returncode == 0) == ok, (args, result.returncode, result.stdout, result.stderr)
        return result.stdout.strip()
    assert "Stockroom" in run("help")
    assert json.loads(run("add", "PEN", "Blue pen", "5", "2"))["quantity"] == 5
    assert json.loads(run("adjust", "PEN", "-3"))["quantity"] == 2
    assert json.loads(run("low"))[0]["sku"] == "PEN"
    before = store.read_bytes()
    for arguments in [("add", "PEN", "Duplicate", "1", "0"), ("adjust", "PEN", "-3"), ("adjust", "PEN", "NaN"), ("adjust", "MISSING", "1"), ("delete", "PEN"), ("add", "NEW", "Thing", "1.5", "0")]:
        run(*arguments, ok=False)
    assert store.read_bytes() == before
    run("adjust", "PEN", "-2")
    run("delete", "PEN")
    assert json.loads(run("list")) == []
    before = store.read_bytes()
    run("unknown", ok=False)
    assert store.read_bytes() == before
    store.write_text("{broken")
    run("list", ok=False)
    assert store.read_text() == "{broken"
print("PASS: commands, persistence, invalid inputs, deletion and corrupt-store protection")
