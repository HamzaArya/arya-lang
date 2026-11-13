#!/usr/bin/env python3
"""Native worker integration checks. Python is not used by the delivered app."""
import json, os, pathlib, subprocess, sys, tempfile
exe=str(pathlib.Path(sys.argv[1]).resolve())
def invoke(store, command="list", payload=None, ok=True):
 result=subprocess.run([exe,command,json.dumps(payload or {})],env={**os.environ,"DATA_FILE":str(store)},capture_output=True,text=True,timeout=10)
 assert result.returncode==0,(result.returncode,result.stdout,result.stderr)
 response=json.loads(result.stdout)
 assert response["ok"] is ok,(command,payload,response)
 if ok:assert isinstance(response["rows"],list) and isinstance(response["summary"],str)
 return response
def expect_unchanged(store, command, body):
 before=store.read_bytes();result=invoke(store,command,body,ok=False);assert store.read_bytes()==before;return result
def storage_cases(root, store, command, payload):
 # Parent permissions prohibit private staging, so no valid persisted record can be replaced.
 original=store.read_bytes();root.chmod(0o500)
 try:
  outcome=invoke(store,command,payload,ok=False)
  assert store.read_bytes()==original
 finally:root.chmod(0o700)
 assert not list(root.glob("*.stage-*"))
 broken=root/"broken.json";broken.write_text("{bad-json")
 invoke(broken,ok=False);assert broken.read_text()=="{bad-json"
 before=store.read_bytes();invoke(store,"missing-command",{},ok=False);assert store.read_bytes()==before
 invoke(store,"list",{"view":"missing-view"},ok=False)

with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory);store=root/"data.json"
 assert invoke(store,"list",{"view":"active"})["rows"]==[]
 fields={"title":"Cannot export invoice","customer":"Nadia","owner":"Sam","priority":"Urgent","description":"Export ends with an error."}
 created=invoke(store,"add",{"view":"tickets",**fields});ticket=created["rows"][0]
 assert ticket["status"]=="Open" and ticket["version"]==1 and "1 urgent" in created["summary"]
 identity=ticket["id"]
 expect_unchanged(store,"edit",{"id":identity,"version":0,**fields})
 expect_unchanged(store,"edit",{"id":identity,"version":1,**fields,"owner":" "})
 expect_unchanged(store,"transition",{"id":identity,"version":1,"status":"Resolved"})
 edited=invoke(store,"edit",{"view":"tickets","id":identity,"version":1,**fields,"owner":"Mina","title":"Invoice export blocked"})["rows"][0]
 assert edited["owner"]=="Mina" and edited["version"]==2
 expect_unchanged(store,"delete",{"id":identity,"version":1})
 invoke(store,"transition",{"id":identity,"version":2,"status":"Investigating","note":"Reproduced locally"})
 invoke(store,"transition",{"id":identity,"version":3,"status":"Waiting","note":"Need sample"})
 closed=invoke(store,"transition",{"view":"active","id":identity,"version":4,"status":"Resolved"});assert closed["rows"]==[]
 all_tickets=invoke(store,"list",{"view":"tickets"})["rows"];assert all_tickets[0]["version"]==5
 events=invoke(store,"list",{"view":"history"})["rows"];assert len(events)==5 and events[0]["action"]=="Status changed"
 reopened=invoke(store,"transition",{"id":identity,"version":5,"status":"Open"})["rows"][0];assert reopened["version"]==6
 storage_cases(root,store,"edit",{"id":identity,"version":6,**fields})
 deleted=invoke(store,"delete",{"view":"tickets","id":identity,"version":6});assert deleted["rows"]==[]
 assert invoke(store,"list",{"view":"history"})["rows"][0]["action"]=="Deleted"
 expect_unchanged(store,"edit",{"id":"missing","version":1,**fields})
 # Structurally valid-looking corruption is rejected as well.
 state=json.loads(store.read_text());state["tickets"]=[ticket,ticket];store.write_text(json.dumps(state));invoke(store,"list",ok=False)
print("PASS: ticket CRUD, customer/owner/priority edits, valid/invalid lifecycle, stale revisions, active/all/history views, separate-process persistence, failed-write preservation, corrupt/duplicate storage")
