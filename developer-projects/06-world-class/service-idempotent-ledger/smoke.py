import json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
EXE = str(pathlib.Path(sys.argv[1]).resolve())
def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); return s.getsockname()[1]
class Server:
    def __init__(self, folder):
        self.folder=pathlib.Path(folder); self.port=port(); self.base=f'http://127.0.0.1:{self.port}'
    def __enter__(self):
        self.log=(self.folder/'server.log').open('w+')
        self.p=subprocess.Popen([EXE],cwd=self.folder,env={**os.environ,'PORT':str(self.port),'DATA_FILE':str(self.folder/'data.json')},stdout=self.log,stderr=self.log)
        for _ in range(300):
            if self.p.poll() is not None:
                self.log.seek(0); raise AssertionError('Server exited: '+self.log.read())
            try:
                self.request('GET','/health'); return self
            except (OSError,urllib.error.URLError): time.sleep(.05)
        self.p.terminate(); self.p.wait(timeout=5); self.log.seek(0); raise AssertionError('Server failed readiness: '+self.log.read())
    def __exit__(self,*exc):
        self.p.terminate()
        try: self.p.wait(timeout=5)
        except subprocess.TimeoutExpired: self.p.kill(); self.p.wait(); raise AssertionError('Graceful shutdown timed out')
        self.log.close()
    def request(self,method,path,body=None,status=200):
        data=None if body is None else json.dumps(body).encode()
        req=urllib.request.Request(self.base+path,data=data,method=method,headers={'Content-Type':'application/json'})
        try: response=urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as e: response=e
        with response:
            raw=response.read().decode(); assert response.status==status,(method,path,response.status,raw)
            if 'application/json' in response.headers.get('Content-Type',''): return json.loads(raw)
            return raw
    def malformed(self,path):
        req=urllib.request.Request(self.base+path,data=b'{bad',method='POST',headers={'Content-Type':'application/json'})
        try: urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as e: assert e.code==400; return
        raise AssertionError('Malformed JSON accepted')
def corrupt_rejected(folder):
    path=pathlib.Path(folder)/'data.json'; path.write_text('{broken')
    r=subprocess.run([EXE],cwd=folder,env={**os.environ,'PORT':str(port()),'DATA_FILE':str(path)},capture_output=True,text=True,timeout=5)
    assert r.returncode != 0 and path.read_text()=='{broken'
    path.write_text(json.dumps({'entries':[{}]}))
    r=subprocess.run([EXE],cwd=folder,env={**os.environ,'PORT':str(port()),'DATA_FILE':str(path)},capture_output=True,text=True,timeout=5)
    assert r.returncode != 0, 'Structurally corrupt state accepted'
with tempfile.TemporaryDirectory() as tmp:
    with Server(tmp) as s:
        posting={'key':'credit-1','account':'cash','amount':'9007199254740993.01'}
        # Deny creation of the private sibling without changing the existing store.
        storage_parent = pathlib.Path(tmp)
        storage_parent.chmod(0o500)
        try:
            s.request('POST','/entries',posting,status=503);assert s.request('GET','/entries')=={'entries':[]}
        finally:
            storage_parent.chmod(0o700)
        original=s.request('POST','/entries',posting,status=201)
        replay=s.request('POST','/entries',posting);assert replay['replayed'] and replay['entry']==original['entry']
        s.request('POST','/entries',{**posting,'amount':'1.00'},status=409)
        s.request('POST','/entries',{'key':'debit-1','account':'cash','amount':'-0.01'},status=201)
        assert s.request('GET','/balance/cash')['balance']=='9007199254740993.00'
        s.request('POST','/entries',{'key':'overdraft','account':'empty','amount':'-1.00'},status=409)
        s.request('POST','/entries',{'key':'bad','account':'cash','amount':'1.001'},status=400)
        s.request('POST','/entries',{'key':'zero','account':'cash','amount':'0'},status=400)
        s.request('POST','/entries',{'key':'bad-account','account':'cash/bank','amount':'1.00'},status=400)
        s.malformed('/entries');assert len(s.request('GET','/entries')['entries'])==2
        s.request('POST','/entries',{'key':'normalized','account':'change','amount':'1'},status=201)
        assert s.request('POST','/entries',{'key':'normalized','account':'change','amount':'1.00'})['replayed']
        for key in ['large-1','large-2']:
            s.request('POST','/entries',{'key':key,'account':'vault','amount':'999999999999999999.99'},status=201)
    with Server(tmp) as s:
        assert s.request('GET','/balance/vault')['balance']=='1999999999999999999.98'
        assert s.request('POST','/entries',posting)['entry']==original['entry']
        assert s.request('GET','/balance/cash')['balance']=='9007199254740993.00'
    corrupt_rejected(tmp)
print('PASS: ledger exactness, idempotent retry/conflict, debit, overdraft, precision/zero/malformed rejection, persistence, corrupt-state rejection')
