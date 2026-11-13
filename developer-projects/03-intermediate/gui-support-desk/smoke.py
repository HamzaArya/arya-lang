#!/usr/bin/env python3
"""Integration checks; Python is only the test driver, never the application."""
import json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
exe=str(pathlib.Path(sys.argv[1]).resolve())
class Server:
 def __init__(self, root, filename="data.json"):
  self.root=pathlib.Path(root); self.data=self.root/filename
 def start(self):
  with socket.socket() as s:s.bind(("127.0.0.1",0));self.port=s.getsockname()[1]
  self.log=open(self.root/"server.log","a+")
  self.proc=subprocess.Popen([exe],cwd=self.root,env={**os.environ,"PORT":str(self.port),"DATA_FILE":str(self.data)},stdout=self.log,stderr=self.log)
  for _ in range(200):
   if self.proc.poll() is not None:
    self.log.seek(0);raise AssertionError(self.log.read())
   try:
    self.request("GET","/health");return self
   except (OSError,urllib.error.URLError):time.sleep(.025)
  raise AssertionError("Server did not become ready")
 def stop(self):
  self.proc.terminate()
  try:self.proc.wait(timeout=5)
  except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait();raise
  assert self.proc.returncode == 0, self.proc.returncode
  self.log.close()
 def request(self, method, path, body=None, expected=200, raw=False):
  data=None if body is None else json.dumps(body).encode()
  request=urllib.request.Request(f"http://127.0.0.1:{self.port}"+path,data=data,method=method,headers={"Content-Type":"application/json"})
  try:response=urllib.request.urlopen(request,timeout=4)
  except urllib.error.HTTPError as error:response=error
  with response:
   payload=response.read().decode(); assert response.status==expected,(method,path,response.status,payload)
   return payload if raw or not payload else json.loads(payload)
 def __enter__(self):return self.start()
 def __exit__(self,*args):self.stop()
def corrupt_fails(root):
 p=pathlib.Path(root)/"corrupt.json";p.write_text("{broken")
 r=subprocess.run([exe],cwd=root,env={**os.environ,"PORT":"0","DATA_FILE":str(p)},capture_output=True,text=True,timeout=5)
 assert r.returncode!=0 and p.read_text()=="{broken"

with tempfile.TemporaryDirectory() as root:
 with Server(root) as s:
  html=s.request("GET","/",raw=True);assert "<!doctype html>" in html and "Refresh board" in html and "Create ticket" in html
  s.request("POST","/api/items",{"title":" ","owner":"Team","detail":"","priority":"Normal"},400)
  item=s.request("POST","/api/items",{"title":"<script>alert(1)</script>","owner":"Sam","detail":"A real issue","priority":"Urgent"},201)["item"]
  identity=item["id"];assert item["status"]=='Open'
  s.request("PATCH",f"/api/items/{identity}",{"status":'Resolved',"version":1})
  s.request("PATCH",f"/api/items/{identity}",{"status":'Open',"version":1},409)
  html=s.request("GET","/",raw=True);assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
 with Server(root) as s:
  rows=s.request("GET","/api/items");assert len(rows)==1 and rows[0]["status"]=='Resolved' and rows[0]["version"]==2
  # Failed writes never modify live state or return success.
  # Deny creation of the private sibling without changing the existing store.
  storage_parent = pathlib.Path(root)
  storage_parent.chmod(0o500)
  try:
      s.request("POST","/api/items",{"title":"No disk","owner":"Sam","detail":"","priority":"Normal"},500)
      assert len(s.request("GET","/api/items"))==1
  finally:
      storage_parent.chmod(0o700)
  s.request("POST",f"/api/items/{identity}/delete",{"version":1},409)
  s.request("POST",f"/api/items/{identity}/delete",{"version":2})
  assert s.request("GET","/api/items")==[]
  s.request("PATCH","/api/items/missing",{"status":'Resolved',"version":1},404)
 corrupt_fails(root)
print("PASS: GUI HTML, create, validation, escaping, move, stale write, restart, failed write, delete, missing record, corrupt storage")
