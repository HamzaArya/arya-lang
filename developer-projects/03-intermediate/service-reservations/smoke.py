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
 booking={"room":"Atlas","owner":"Sam","start":"2026-12-01T10:00:00Z","end":"2026-12-01T11:00:00Z"}
 with Server(root) as s:
  item=s.request("POST","/reservations",booking,201)
  s.request("POST","/reservations",booking,409)
  s.request("POST","/reservations",{**booking,"start":"invalid"},400)
  s.request("POST","/reservations",{**booking,"end":booking["start"]},400)
  s.request("POST","/reservations",{**booking,"start":"2026-12-01T11:00:00Z","end":"2026-12-01T12:00:00Z"},201)
  s.request("POST","/reservations",{**booking,"room":"Orion"},201)
  assert len(s.request("GET","/reservations?room=Atlas"))==2
 with Server(root) as s:
  assert len(s.request("GET","/reservations"))==3
  # Deny creation of the private sibling without changing the existing store.
  storage_parent = pathlib.Path(root)
  storage_parent.chmod(0o500)
  try:
      s.request("DELETE","/reservations/"+item["id"],expected=500)
      assert len(s.request("GET","/reservations"))==3
  finally:
      storage_parent.chmod(0o700)
  s.request("DELETE","/reservations/"+item["id"])
  s.request("DELETE","/reservations/"+item["id"],expected=404)
 corrupt_fails(root)
print("PASS: booking, overlap, adjacency, room isolation, date/range validation, persistence, failed write, cancellation, corrupt storage")
