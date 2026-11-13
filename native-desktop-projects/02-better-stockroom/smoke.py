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
    products = {"view":"products"}; movements = {"view":"movements"}
    assert call("list", products)["rows"] == [] and not file.exists()
    source = {**products,"sku":"pen","name":"Blue pen","location":"Shelf A","unitPrice":"19.95","reorder":"3","description":"Refillable"}
    row = call("product-add", source)["rows"][0]
    assert row["id"] == 1 and row["sku"] == "PEN" and row["quantity"] == 0 and row["stockStatus"] == "Low stock"
    call("product-add", source, False)
    for changes in [{"sku":"bad sku"},{"name":" "},{"unitPrice":"NaN"},{"unitPrice":"1.001"},{"reorder":"-1"}]:
        call("product-add", {**source,"sku":"OTHER",**changes}, False)
    row = call("product-edit", {**source,"id":1,"version":1,"unitPrice":"0.10","name":"Fine blue pen"})["rows"][0]
    assert row["version"] == 2 and row["unitPrice"] == "0.10"
    call("product-edit", {**source,"id":1,"version":1}, False)
    receive = {**products,"id":1,"version":2,"units":"10","date":"2026-11-13","reason":"PO-001 received"}
    result = call("receive", receive); row = result["rows"][0]
    assert row["quantity"] == 10 and row["value"] == "1.00" and row["version"] == 3 and "Inventory value 1.00" in result["summary"]
    call("receive", receive, False)
    issue = {**products,"id":1,"version":3,"units":"3","date":"2026-11-13","reason":"Customer order #42"}
    row = call("issue", issue)["rows"][0]
    assert row["quantity"] == 7 and row["value"] == "0.70" and row["version"] == 4
    for command, changes in [("issue",{"units":"8"}),("issue",{"units":"0"}),("receive",{"units":"1000000"}),("receive",{"date":"2026-02-30"}),("receive",{"reason":" "})]:
        call(command, {**issue,"version":4,**changes}, False)
    call("product-delete", {**products,"id":1,"version":4}, False)
    history = call("list", movements)["rows"]
    assert len(history) == 2 and history[0]["kind"] == "Issue" and history[0]["balance"] == 7 and history[1]["kind"] == "Receive"
    # Deny creation of the private sibling without changing the existing store.
    storage_parent = pathlib.Path(directory)
    storage_parent.chmod(0o500)
    try:
        assert "Could not save" in call("issue", {**issue,"version":4,"units":"1"}, False)["message"]
    finally:
        storage_parent.chmod(0o700)
    assert call("list", products)["rows"][0]["quantity"] == 7
    call("issue", {**issue,"version":4,"units":"7","view":"invalid"}, False)
    row = call("issue", {**issue,"version":4,"units":"7"})["rows"][0]
    assert row["quantity"] == 0 and row["stockStatus"] == "Low stock"
    assert call("product-delete", {**products,"id":1,"version":5})["rows"] == []
    assert len(call("list", movements)["rows"]) == 3
    row = call("product-add", source)["rows"][0]; assert row["id"] == 2
    call("receive", {**receive,"id":2,"version":1,"units":"1","date":""})
    assert call("list", products)["rows"][0]["value"] == "19.95"
    # Corrupt a persisted running balance. The full movement audit rejects startup.
    state = json.loads(file.read_text()); state["movements"][0]["balance"] = 999
    file.write_text(json.dumps(state)); assert "inconsistent balance" in call("list", products, False)["message"]
    file.write_text("{broken"); call("list", products, False)
print(f"PASS: {cases} Stockroom worker scenarios: product CRUD, SKU/price validation, receive/issue, valuation, negative stock, audit, versions, restart, failed writes and corrupt-store preservation")
