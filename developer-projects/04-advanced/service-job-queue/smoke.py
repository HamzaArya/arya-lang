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
  s.request("POST","/jobs",{"key":" ","task":"work"},400)
  job=s.request("POST","/jobs",{"key":"report:1","task":"Render report"},201)
  assert s.request("POST","/jobs",{"key":"report:1","task":"Render report"})["duplicate"]
  s.request("POST","/jobs",{"key":"report:1","task":"Other work"},409)
  s.request("POST","/jobs/claim",{"seconds":0},400)
  claim=s.request("POST","/jobs/claim",{"seconds":1});assert claim["attempts"]==1
  s.request("POST","/jobs/claim",{"seconds":1},204)
  s.request("POST",f"/jobs/{job['id']}/finish",{"lease":"wrong","state":"done","result":""},409)
  time.sleep(1.1)
  claim2=s.request("POST","/jobs/claim",{"seconds":60});assert claim2["attempts"]==2 and claim2["lease"]!=claim["lease"]
  s.request("POST",f"/jobs/{job['id']}/finish",{"lease":claim["lease"],"state":"done","result":""},409)
 with Server(root) as s:
  assert s.request("GET","/jobs")[0]["state"]=="running"
  # Deny creation of the private sibling without changing the existing store.
  storage_parent = pathlib.Path(root)
  storage_parent.chmod(0o500)
  try:
      body={"lease":claim2["lease"],"state":"failed","result":"worker disconnected"}
      s.request("POST",f"/jobs/{job['id']}/finish",body,500)
      assert s.request("GET","/jobs")[0]["state"]=="running"
  finally:
      storage_parent.chmod(0o700)
  s.request("POST",f"/jobs/{job['id']}/finish",body)
  s.request("POST",f"/jobs/{job['id']}/retry")
  claim3=s.request("POST","/jobs/claim",{"seconds":60});assert claim3["attempts"]==3
  s.request("POST",f"/jobs/{job['id']}/finish",{"lease":claim3["lease"],"state":"done","result":"report.pdf"})
  s.request("POST",f"/jobs/{job['id']}/retry",expected=409)
  assert "lease" not in s.request("GET","/jobs")[0]
 corrupt_fails(root)
print("PASS: enqueue, idempotency, conflicts, claim, expiry, stale lease, restart, failed write, fail/retry/complete, hidden lease, corrupt storage")
