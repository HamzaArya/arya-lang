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
    path.write_text(json.dumps({'runs':[{}]}))
    r=subprocess.run([EXE],cwd=folder,env={**os.environ,'PORT':str(port()),'DATA_FILE':str(path)},capture_output=True,text=True,timeout=5)
    assert r.returncode != 0, 'Structurally corrupt state accepted'
with tempfile.TemporaryDirectory() as tmp:
    with Server(tmp) as s:
        html=s.request('GET','/');assert 'Find every difference.' in html and 'Reconcile records' in html
        # Deny creation of the private sibling without changing the existing store.
        storage_parent = pathlib.Path(tmp)
        storage_parent.chmod(0o500)
        try:
            s.request('POST','/reconcile',{'label':'Failure','bank':'A,1','book':'A,1'},status=503)
            assert s.request('GET','/runs')=={'runs':[]}
        finally:
            storage_parent.chmod(0o700)
        r=s.request('POST','/reconcile',{'label':'Exact','bank':'A,9007199254740993.01','book':'A,9007199254740993.01'})
        assert r['run']['balanced'] and r['run']['difference']=='0.00' and r['run']['matched']==1
        r=s.request('POST','/reconcile',{'label':'Mismatch','bank':'A,10.00\nB,5.00','book':'A,9.00\nC,2.00'})
        assert len(r['run']['differences'])==3 and r['run']['difference']=='4.00'
        s.request('POST','/reconcile',{'label':'Duplicate','bank':'A,1\nA,2','book':'A,1'},status=400)
        s.request('POST','/reconcile',{'label':'Bad','bank':'A,NaN','book':'A,1'},status=400)
        s.request('POST','/reconcile',{'label':'Missing','bank':'','book':'A,1'},status=400)
        large='A,999999999999999999.99\nB,999999999999999999.99'
        r=s.request('POST','/reconcile',{'label':'Large totals','bank':large,'book':large});assert r['run']['bankTotal']=='1999999999999999999.98'
        s.malformed('/reconcile')
        assert len(s.request('GET','/runs')['runs'])==3
    with Server(tmp) as s:
        assert len(s.request('GET','/runs')['runs'])==3
        assert 'Mismatch' in s.request('GET','/')
    corrupt_rejected(tmp)
print('PASS: reconciliation GUI HTML, exact match, amount/missing-reference differences, duplicate/malformed inputs, persistence, corrupt-state rejection')
