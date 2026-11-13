#!/usr/bin/env python3
"""Acceptance tests for the native Arya worker; Python is not an app runtime."""
import json, os, pathlib, subprocess, sys, tempfile
EXE = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix="arya-native-worker-") as directory:
    file = pathlib.Path(directory)/"data.json"
    env = dict(os.environ, DATA_FILE=str(file))
    cases = 0
    def call(command, body, ok=True):
        global cases
        before = file.read_bytes() if file.exists() else None
        process = subprocess.run([EXE, command, json.dumps(body)], cwd=directory, env=env, text=True, capture_output=True, timeout=10)
        assert process.returncode == 0, (command, process.returncode, process.stderr)
        result = json.loads(process.stdout)
        assert result["ok"] is ok and isinstance(result["message"], str), (command, result)
        if ok:
            assert isinstance(result["rows"], list) and isinstance(result["summary"], str), result
        else:
            assert (file.read_bytes() if file.exists() else None) == before, "Rejected command changed storage"
        cases += 1
        return result
    sessions = {"view":"sessions"}; notes = {"view":"notes"}
    assert call("list", sessions)["rows"] == [] and not file.exists()
    source = {**sessions, "title":"Algebra", "minutes":"25", "due":"2026-12-01", "description":"Practice quadratic equations"}
    result = call("session-add", source)
    row = result["rows"][0]; assert row["id"] == 1 and row["version"] == 1 and row["status"] == "Planned"
    assert "25 minutes remaining" in result["summary"]
    for changes in [{"title":" "},{"minutes":"0"},{"minutes":"1.5"},{"due":"2026-02-30"},{"due":"tomorrow"}]:
        call("session-add", {**source, **changes}, False)
    result = call("session-edit", {**source,"id":1,"version":1,"title":"Calculus","minutes":"45","due":""})
    row = result["rows"][0]; assert row["title"] == "Calculus" and row["version"] == 2 and row["due"] == ""
    call("session-edit", {**source,"id":1,"version":1}, False)
    result = call("session-complete", {**sessions,"id":1,"version":2})
    assert result["rows"][0]["status"] == "Completed" and "0 minutes remaining" in result["summary"]
    call("session-complete", {**sessions,"id":1,"version":3}, False)
    assert call("session-reopen", {**sessions,"id":1,"version":3})["rows"][0]["status"] == "Planned"
    result = call("note-add", {**notes,"title":"Formula sheet","content":"سلام\nDerivative rules"})
    assert len(result["rows"]) == 1 and result["rows"][0]["id"] == 2
    result = call("note-edit", {**notes,"id":2,"version":1,"title":"Revision notes","content":"Updated formula: x² → 2x"})
    assert result["rows"][0]["version"] == 2 and "2x" in result["rows"][0]["content"]
    call("note-edit", {**notes,"id":2,"version":1,"title":"Stale","content":"Wrong"}, False)
    call("note-add", {**notes,"title":"Blank","content":" "}, False)
    # Separate process reloads persisted edits before testing mutation failure.
    assert call("list", notes)["rows"][0]["title"] == "Revision notes"
    # Deny creation of the private sibling without changing the existing store.
    storage_parent = pathlib.Path(directory)
    storage_parent.chmod(0o500)
    try:
        failed = call("session-add", source, False); assert "Could not save" in failed["message"]
    finally:
        storage_parent.chmod(0o700)
    call("session-add", {**source,"view":"invalid"}, False)
    assert len(call("list", sessions)["rows"]) == 1
    call("note-delete", {**notes,"id":2,"version":1}, False)
    assert call("note-delete", {**notes,"id":2,"version":2})["rows"] == []
    assert call("session-delete", {**sessions,"id":1,"version":4})["rows"] == []
    call("session-delete", {**sessions,"id":1,"version":4}, False)
    # Structural and syntactic corrupt stores must be preserved, never silently reset.
    file.write_text(json.dumps({"schema":1,"nextId":1,"sessions":[{"id":1}],"notes":[]}))
    call("list", sessions, False)
    file.write_text("{broken")
    call("list", sessions, False)
print(f"PASS: {cases} Study Desk worker scenarios: full session/note lifecycle, dates, versions, persistence, failed-write rollback and corrupt-store preservation")
