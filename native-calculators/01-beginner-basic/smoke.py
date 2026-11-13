#!/usr/bin/env python3
"""Independent Python numerical oracle and black-box native worker checks."""
import json, math, operator, os, pathlib, random, subprocess, sys, tempfile
EXE = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix="arya-calculator-") as directory:
    store = pathlib.Path(directory)/"data.json"
    env = dict(os.environ, DATA_FILE=str(store))
    calls = 0
    def command(name, body=None, ok=True):
        global calls
        payload = {"view":"history", **(body or {})}
        before = store.read_bytes() if store.exists() else None
        result = subprocess.run([EXE, name, json.dumps(payload)], cwd=directory, env=env, capture_output=True, text=True, timeout=10)
        assert result.returncode == 0, (name, result.returncode, result.stderr)
        assert len(result.stdout.strip().splitlines()) == 1, result.stdout
        value = json.loads(result.stdout)
        assert value["ok"] is ok and isinstance(value["message"], str), (name, body, value)
        if ok:
            for key in ["result","memory","summary"]: assert isinstance(value[key], str), value
            assert isinstance(value["rows"], list) and math.isfinite(float(value["result"])) and math.isfinite(float(value["memory"]))
        else:
            assert (store.read_bytes() if store.exists() else None) == before, "Rejected command changed saved bytes"
        calls += 1
        return value
    def calculate(expression, expected):
        value = command("calculate", {"expression":expression})
        actual = float(value["result"])
        assert math.isclose(actual, expected, rel_tol=1e-13, abs_tol=1e-14), (expression, actual, expected)
        assert value["rows"][0]["expression"] == expression and value["rows"][0]["result"] == value["result"]
        return value
    initial = command("list")
    assert initial["result"] == initial["memory"] == "0" and initial["rows"] == [] and not store.exists()
    # Independent reference uses Python's operator module, not calculator parsing.
    reference = {"+":operator.add,"-":operator.sub,"*":operator.mul,"/":operator.truediv}
    for left, symbol, right in [(12,"+",7),(-12.5,"*",4),(1,"/",3),(0.1,"+",0.2),(10,"-",15),(4,"/",-2),(-5,"-",-7),(1e100,"*",1e100),(1e-100,"/",1e100)]:
        calculate(f"{left} {symbol} {right}", reference[symbol](left,right))
    calculate(".5 + .25", .75); calculate("12.",12); calculate("-0",0); calculate("1--2",3)
    randomizer = random.Random(2718)
    for _ in range(35):
        left = randomizer.randint(-10000,10000)/100; right = randomizer.randint(1,10000)/100; symbol = randomizer.choice(list(reference))
        calculate(f"{left} {symbol} {right}", reference[symbol](left,right))
    for expression in ["", " ", ".", "1/0", "1/-0", "1e309", "1e308*1e308", "NaN", "Infinity", "1e", "2+3*4", "1+2+3", "(1+2)", "sqrt(4)", "50%", "2**3", "2 3", "1;print(2)", "--2", "1," , "1"*257]:
        command("calculate", {"expression":expression}, False)
    command("memory-store", {"value":"5"}, False)
    # A stale predictable .tmp path must never be opened or renamed.
    sentinel = pathlib.Path(directory)/"sentinel.txt"; sentinel.write_text("untouched")
    old_tmp = pathlib.Path(str(store)+".tmp"); old_tmp.symlink_to(sentinel)
    calculate("7*6", 42)
    assert sentinel.read_text() == "untouched" and old_tmp.is_symlink() and not store.is_symlink()
    old_tmp.unlink(); old_tmp.symlink_to(store)
    calculate("2+3", 5)
    assert old_tmp.is_symlink() and not store.is_symlink() and json.loads(store.read_text())["lastResult"] == "5"
    old_tmp.unlink()
    assert not list(pathlib.Path(directory).glob("data.json.stage-*"))
    # Every command above ran in a fresh process. Reopen must preserve last result/history.
    previous = command("list")
    assert command("list")["result"] == previous["result"]
    # Readable data in an unwritable parent forces staging creation to fail.
    # Run these desktop tests as the ordinary user, not an unrestricted root user.
    assert os.geteuid() != 0, "Run persistence permission checks as an ordinary user"
    pathlib.Path(directory).chmod(0o500)
    try:
        error = command("calculate", {"expression":"1+1"}, False)
        assert "Could not save" in error["message"]
    finally:
        pathlib.Path(directory).chmod(0o700)
    assert not list(pathlib.Path(directory).glob("data.json.stage-*"))
    assert command("list")["rows"] == previous["rows"]
    command("calculate", {"view":"wrong", "expression":"2+2"}, False)
    command("unsupported-command", ok=False)
    # Seed a valid, full history independently to exercise the next-write bound.
    state = json.loads(store.read_text())
    state["history"] = [{"id":i,"expression":str(i),"result":str(i),"kind":"Fixture", "time":"2026-11-13T00:00:00.000Z", "details":"Recorded fixture"} for i in range(1,101)]
    state["nextId"] = 101
    store.write_text(json.dumps(state))
    value = calculate("3+4", 7)
    assert len(value["rows"]) == 100 and value["rows"][0]["id"] == 101 and value["rows"][-1]["id"] == 2
    cleared = command("clear-history")
    assert cleared["rows"] == [] and cleared["result"] == "7"
    assert command("list")["rows"] == []
    # Both existing and dangling DATA_FILE links are refused and preserved.
    saved = store.read_bytes(); target = pathlib.Path(directory)/"saved-copy.json"; target.write_bytes(saved)
    store.unlink(); store.symlink_to(target)
    command("list", ok=False)
    assert store.is_symlink() and target.read_bytes() == saved
    store.unlink(); missing = pathlib.Path(directory)/"missing-target.json"; store.symlink_to(missing)
    command("list", ok=False)
    assert store.is_symlink() and not missing.exists()
    store.unlink(); store.write_bytes(saved)
    state = json.loads(store.read_text()); state["lastResult"] = "NaN"
    store.write_text(json.dumps(state)); command("list", ok=False)
    store.write_text(json.dumps({"schema":1,"nextId":1,"history":"wrong","lastResult":"0","memory":"0"})); command("list", ok=False)
    store.write_text("{broken"); command("list", ok=False)
print(f"PASS: {calls} native calculator calls, independent numerical oracle, rejection/no-mutation, history bounds, persistence, failed-write rollback and corruption")
