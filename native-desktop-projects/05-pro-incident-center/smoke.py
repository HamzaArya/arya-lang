import json, os, pathlib, subprocess, sys, tempfile
EXE=str(pathlib.Path(sys.argv[1]).resolve())
class Worker:
    def __init__(self,folder):
        self.folder=pathlib.Path(folder);self.file=self.folder/'data.json';self.calls=0
    def call(self,command,body=None,ok=True):
        self.calls+=1
        r=subprocess.run([EXE,command,json.dumps(body or {})],cwd=self.folder,env={**os.environ,'DATA_FILE':str(self.file)},capture_output=True,text=True,timeout=10)
        assert r.returncode==0,(command,r.returncode,r.stderr,r.stdout)
        result=json.loads(r.stdout);assert result['ok'] is ok,(command,result)
        assert isinstance(result.get('message'),str) and result['message']
        if ok: assert isinstance(result['rows'],list) and isinstance(result['summary'],str)
        return result
    def unchanged(self,command,body):
        before=self.file.read_bytes();self.call(command,body,False);assert self.file.read_bytes()==before
    def corrupt(self,document,view):
        self.file.write_text(document);before=self.file.read_bytes();self.call('list',{'view':view},False);assert self.file.read_bytes()==before
with tempfile.TemporaryDirectory() as tmp:
    w=Worker(tmp)
    assert w.call('list',{'view':'incidents'})['rows']==[]
    service={'view':'services','name':'Payments','owner':'Nadia','status':'operational','description':'Customer payment pipeline'}
    s=w.call('service-add',service)['rows'][0];assert s['id'].startswith('S') and s['version']==1
    w.unchanged('service-add',service)
    boundary=w.call('service-add',{**service,'name':'Long description boundary','description':'x'*2000})['rows'][-1]
    w.call('service-delete',{'view':'services','id':boundary['id'],'version':boundary['version']})
    incident={'view':'incidents','title':'Checkout failures','owner':'Hamza','priority':'P1','serviceId':s['id'],'description':'Customers see payment timeouts.'}
    i=w.call('incident-add',incident)['rows'][0];assert i['status']=='open' and i['service']=='Payments'
    assert w.call('list',{'view':'services'})['rows'][0]['activeIncidents']==1
    w.unchanged('incident-edit',{**incident,'id':i['id'],'version':99})
    i=w.call('incident-edit',{**incident,'id':i['id'],'version':i['version'],'owner':'Nadia','title':'Payment gateway timeouts'})['rows'][0]
    assert i['owner']=='Nadia' and i['version']==2
    w.unchanged('incident-transition',{'id':i['id'],'version':i['version'],'view':'incidents','status':'resolved','note':'Skipping investigation'})
    w.unchanged('incident-delete',{'id':i['id'],'version':i['version'],'view':'incidents'})
    w.unchanged('service-delete',{'id':s['id'],'version':s['version'],'view':'services'})
    i=w.call('incident-note',{'id':i['id'],'version':i['version'],'view':'incidents','note':'Gateway latency rose after deploy.'})['rows'][0]
    i=w.call('incident-transition',{'id':i['id'],'version':i['version'],'view':'incidents','status':'investigating','note':'Owner checking gateway metrics.'})['rows'][0]
    i=w.call('incident-transition',{'id':i['id'],'version':i['version'],'view':'incidents','status':'resolved','note':'Rolled back the gateway.'})['rows'][0]
    assert i['status']=='resolved' and 'Rolled back the gateway.' in i['activity']
    i=w.call('incident-reopen',{'id':i['id'],'version':i['version'],'view':'incidents','note':'Errors returned for another region.'})['rows'][0]
    assert i['status']=='open'
    w.unchanged('incident-reopen',{'id':i['id'],'version':i['version'],'view':'incidents','note':'Wrong state'})
    # Deny creation of the private sibling without changing the existing store.
    storage_parent = w.folder
    storage_parent.chmod(0o500)
    try:
        w.unchanged('incident-note',{'id':i['id'],'version':i['version'],'view':'incidents','note':'Cannot persist this note.'})
    finally:
        storage_parent.chmod(0o700)
    assert 'Cannot persist' not in w.call('list',{'view':'incidents'})['rows'][0]['activity']
    s=w.call('service-edit',{**service,'id':s['id'],'version':s['version'],'status':'degraded','owner':'Nadia On-call'})['rows'][0]
    assert s['status']=='degraded'
    for status in ['investigating','resolved']:
        i=w.call('incident-transition',{'id':i['id'],'version':i['version'],'view':'incidents','status':status,'note':'Follow-up work completed.'})['rows'][0]
    assert w.call('incident-delete',{'id':i['id'],'version':i['version'],'view':'incidents'})['rows']==[]
    assert w.call('service-delete',{'id':s['id'],'version':s['version'],'view':'services'})['rows']==[]
    timeline=w.call('list',{'view':'timeline'})['rows'];assert any(x['action']=='Reopened' for x in timeline) and any(x['action']=='Deleted' for x in timeline)
    w.unchanged('incident-add',{**incident,'serviceId':'S999'})
    w.unchanged('incident-add',{**incident,'serviceId':'','priority':'P9'})
    w.unchanged('incident-add',{**incident,'serviceId':'','title':''})
    w.unchanged('unknown',{'view':'incidents'})
    w.corrupt('{broken','incidents')
    w.corrupt(json.dumps({'schema':1,'serial':2,'incidents':[{}],'services':[],'events':[]}),'incidents')
    print(f'PASS: {w.calls} native incident worker commands; CRUD, service dependencies, lifecycle, notes, reopen, timeline, stale versions, corrupt store and failed-save rollback')
