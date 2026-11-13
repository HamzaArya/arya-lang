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
    assert "Expense Ledger" in run("help")
    assert json.loads(run("add", "19.95", "food", "Lunch"))["id"] == 1
    assert json.loads(run("add", "0.10", "food", "Tea"))["id"] == 2
    result = json.loads(run("summary"))
    assert result["total"] == "20.05" and result["count"] == 2, result
    before = store.read_bytes()
    for amount in ["-1", "0", "NaN", "1e2", "2.111", ""]:
        run("add", amount, "food", "Bad", ok=False)
    run("add", "1", "   ", "Bad", ok=False)
    run("delete", "500", ok=False)
    assert store.read_bytes() == before
    run("delete", "1")
    assert len(json.loads(run("list"))) == 1
    assert json.loads(run("summary"))["total"] == "0.10"
    before = store.read_bytes()
    run("unknown", ok=False)
    assert store.read_bytes() == before
    store.write_text("{broken")
    run("list", ok=False)
    assert store.read_text() == "{broken"
print("PASS: commands, persistence, invalid inputs, deletion and corrupt-store protection")
