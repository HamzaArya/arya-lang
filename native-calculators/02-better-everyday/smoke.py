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
    examples = [("2+3*4",14),("(2+3)*4",20),("20/5/2",2),("-2*-3",6),("--2",2),("-(2+3)",-5),("sqrt(81)+square(3)",18),("square(-4)",16),("50%",.5),("200*15%",30),("200*(1+15%)",230),("200+10%",200.1),("(10+5)%",.15),("sqrt(square(-5))",5),("1e-3+.002",.003),("0.1+0.2",.1+.2)]
    for expression, expected in examples: calculate(expression,expected)
    # Generate expressions and results together as an AST; no eval or production parser reuse.
    randomizer = random.Random(314159)
    def tree(depth):
        if depth == 0:
            number = randomizer.randint(-20,20)
            return str(number), float(number)
        left, a = tree(depth-1); right, b = tree(depth-1)
        symbol = randomizer.choice(["+","-","*"])
        operation = {"+":operator.add,"-":operator.sub,"*":operator.mul}[symbol]
        return f"({left}{symbol}{right})", operation(a,b)
    for _ in range(35):
        expression, expected = tree(3); calculate(expression,expected)
    for expression in ["", "1/0", "sqrt(-1)", "square(1e200)", "1e309", "NaN", "Infinity", "1e", "2**3", "2(3+4)", "sqrt 9", "sin(0)", "sqrt(9", "(1+2", "1+2)", "50%%", "1;print(2)", "1,,2", "("*40+"1"+")"*40, "+".join(["1"]*150), "1"*1025]:
        command("calculate", {"expression":expression}, False)
    calculate("12.5*2",25)
    assert command("memory-store", {"value":"25"})["memory"] == "25"
    assert command("memory-add", {"value":"0.5"})["memory"] == "25.5"
    assert command("memory-subtract", {"value":"5.5"})["memory"] == "20"
    recalled = command("memory-recall"); assert recalled["result"] == "20" and recalled["memory"] == "20"
    assert command("list")["result"] == "20"
    for value in ["NaN","Infinity","1e309","1+2","", " "]:
        command("memory-add", {"value":value}, False)
    command("memory-store", {"value":"1e308"})
    command("memory-add", {"value":"1e308"}, False)
    pathlib.Path(directory).chmod(0o500)
    try:
        command("memory-clear", ok=False)
    finally:
        pathlib.Path(directory).chmod(0o700)
    assert not list(pathlib.Path(directory).glob("data.json.stage-*"))
    assert command("list")["memory"] == "1e308" or float(command("list")["memory"]) == 1e308
    assert command("memory-clear")["memory"] == "0"
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
