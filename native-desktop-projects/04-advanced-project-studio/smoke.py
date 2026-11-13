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
 assert invoke(store)["rows"]==[]
 project_fields={"name":"Release 3","owner":"Sam","wipLimit":"1","description":"Ship the next version"}
 p=invoke(store,"project-add",{"view":"projects",**project_fields})["rows"][0];pid=p["id"]
 second=invoke(store,"project-add",{"view":"projects",**project_fields,"name":"Maintenance","wipLimit":"2"})["rows"][1];other=second["id"]
 expect_unchanged(store,"project-edit",{"id":pid,"version":0,**project_fields})
 expect_unchanged(store,"project-edit",{"id":pid,"version":1,**project_fields,"wipLimit":"0"})
 task={"title":"Ship exporter","projectId":pid,"assignee":"Mina","dueDate":"2000-02-29","priority":"High","description":"Add native CSV export"}
 expect_unchanged(store,"task-add",{**task,"dueDate":"2026-02-30"})
 expect_unchanged(store,"task-add",{**task,"projectId":"missing"})
 first=invoke(store,"task-add",{"view":"tasks",**task})["rows"][0];tid=first["id"]
 next_task=invoke(store,"task-add",{"view":"tasks",**task,"title":"Document exporter"})["rows"][1];next_id=next_task["id"]
 assert len(invoke(store,"list",{"view":"overdue"})["rows"])==2
 expect_unchanged(store,"project-delete",{"id":pid,"version":1})
 expect_unchanged(store,"task-transition",{"id":tid,"version":1,"status":"Done"})
 invoke(store,"task-transition",{"id":tid,"version":1,"status":"Doing"})
 expect_unchanged(store,"task-transition",{"id":next_id,"version":1,"status":"Doing"})
 invoke(store,"task-transition",{"id":tid,"version":2,"status":"Blocked"})
 expect_unchanged(store,"task-transition",{"id":next_id,"version":1,"status":"Doing"})
 # Moving active work to another project releases the original project's limit.
 moved=invoke(store,"task-edit",{"view":"tasks","id":tid,"version":3,**task,"projectId":other,"title":"Exporter moved","dueDate":""})["rows"][0]
 assert moved["project"]=="Maintenance" and moved["version"]==4
 invoke(store,"task-transition",{"id":next_id,"version":1,"status":"Doing"})
 expect_unchanged(store,"task-edit",{"id":tid,"version":4,**task})
 invoke(store,"task-transition",{"id":tid,"version":4,"status":"Doing"})
 invoke(store,"task-transition",{"id":tid,"version":5,"status":"Done"})
 projects=invoke(store,"list",{"view":"projects"})["rows"]
 assert projects[1]["progress"]=="100%" and projects[0]["active"]==1
 edited=invoke(store,"project-edit",{"view":"projects","id":pid,"version":1,**project_fields,"name":"Release renamed","wipLimit":"2"})["rows"][0]
 assert edited["version"]==2
 # Now two active tasks prevent lowering this project's WIP to one.
 third=invoke(store,"task-add",{"view":"tasks",**task,"title":"Review docs"})["rows"][2]
 invoke(store,"task-transition",{"id":third["id"],"version":1,"status":"Doing"})
 expect_unchanged(store,"project-edit",{"id":pid,"version":2,**project_fields,"wipLimit":"1"})
 storage_cases(root,store,"project-edit",{"id":pid,"version":2,**project_fields,"wipLimit":"3"})
 invoke(store,"task-delete",{"id":tid,"version":6})
 invoke(store,"task-delete",{"id":next_id,"version":2})
 invoke(store,"task-delete",{"id":third["id"],"version":2})
 invoke(store,"project-delete",{"id":pid,"version":2})
 final=invoke(store,"project-delete",{"view":"projects","id":other,"version":1});assert final["rows"]==[]
 assert len(invoke(store,"list",{"view":"history"})["rows"])>=15
 state=json.loads(store.read_text());state["tasks"]=[first];store.write_text(json.dumps(state));invoke(store,"list",ok=False)
print("PASS: project/task CRUD, project assignment, dates/overdue, progress, per-project active WIP including blocked work, protected project deletion, stale versions, history, persistence, write rollback, corrupt references")
