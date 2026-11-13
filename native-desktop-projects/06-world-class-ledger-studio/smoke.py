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
    assert w.call('list',{'view':'accounts'})['rows']==[]
    cashBody={'view':'accounts','code':'1000','name':'Cash','type':'asset','description':'Operating cash'}
    cash=w.call('account-add',cashBody)['rows'][0]
    revenueBody={'view':'accounts','code':'4000','name':'Sales','type':'income','description':'Sales income'}
    revenue=w.call('account-add',revenueBody)['rows'][1]
    w.unchanged('account-add',cashBody)
    cash=w.call('account-edit',{**cashBody,'id':cash['id'],'version':cash['version'],'name':'Main cash'})['rows'][0]
    w.unchanged('account-edit',{**cashBody,'id':cash['id'],'version':1})
    p={'view':'journals','reference':'SALE-1','date':'2026-11-13','debitId':cash['id'],'creditId':revenue['id'],'amount':'999999999999999999.99','description':'Large exact invoice'}
    j1=w.call('journal-post',p)['rows'][0];assert j1['amount']=='999999999999999999.99'
    before=w.file.read_bytes();assert len(w.call('journal-post',p)['rows'])==1 and w.file.read_bytes()==before
    w.unchanged('journal-post',{**p,'amount':'1.00'})
    w.unchanged('journal-post',{**p,'reference':'SAME-ACCOUNT','creditId':cash['id']})
    w.unchanged('journal-post',{**p,'reference':'BAD-DATE','date':'2026-02-30'})
    w.unchanged('journal-post',{**p,'reference':'BAD-PRECISION','amount':'1.001'})
    w.unchanged('journal-post',{**p,'reference':'ZERO','amount':'0'})
    w.unchanged('journal-post',{**p,'reference':'COMMA,REFERENCE'})
    j2=w.call('journal-post',{**p,'reference':'SALE-2'})['rows'][0]
    accounts=w.call('list',{'view':'accounts'})['rows'];assert accounts[0]['balance']=='1999999999999999999.98' and accounts[1]['balance']=='1999999999999999999.98'
    assert accounts[1]['debitMinusCredit']=='-1999999999999999999.98'
    w.unchanged('account-delete',{'view':'accounts','id':cash['id'],'version':cash['version']})
    w.unchanged('account-status',{'view':'accounts','id':cash['id'],'version':cash['version'],'status':'closed'})
    w.unchanged('account-edit',{**cashBody,'id':cash['id'],'version':cash['version'],'type':'expense'})
    # Deny creation of the private sibling without changing the existing store.
    storage_parent = w.folder
    storage_parent.chmod(0o500)
    try:
        w.unchanged('journal-post',{**p,'reference':'FAILED-WRITE'})
    finally:
        storage_parent.chmod(0o700)
    run={'view':'reconciliations','accountId':cash['id'],'label':'Cash review','statement':'SALE-1,999999999999999999.99\nSALE-2,999999999999999999.99'}
    r=w.call('reconcile',run)['rows'][0];assert r['matched']==2 and r['exceptionCount']==0 and r['difference']=='0.00' and r['bookTotal']=='1999999999999999999.98'
    r2=w.call('reconcile',{**run,'label':'Find exceptions','statement':'SALE-1,1.00\nUNKNOWN,5.00'})['rows'][0];assert r2['exceptionCount']==3
    w.unchanged('reconcile',{**run,'statement':'SALE-1,1\nSALE-1,2'})
    w.unchanged('reconcile',{'view':'accounts','id':cash['id'],'version':1,'label':'Stale account','statement':'SALE-1,1'})
    reversal={'view':'journals','id':j1['id'],'version':j1['version'],'reference':'REV-SALE-1','date':'2026-11-13','description':'Void erroneous invoice'}
    rev=w.call('journal-reverse',reversal)['rows'][0];assert rev['status']=='Reversal' and rev['reverses']==j1['id']
    before=w.file.read_bytes();w.call('journal-reverse',reversal);assert w.file.read_bytes()==before
    w.unchanged('journal-reverse',{**reversal,'reference':'SECOND-REVERSAL'})
    w.unchanged('journal-reverse',{**reversal,'id':rev['id'],'version':rev['version'],'reference':'REVERSE-REVERSAL'})
    w.call('journal-reverse',{**reversal,'id':j2['id'],'version':j2['version'],'reference':'REV-SALE-2'})
    assert w.call('list',{'view':'accounts'})['rows'][0]['balance']=='0.00'
    assert len(w.call('list',{'view':'journals'})['rows'])==4
    cash=w.call('account-status',{'view':'accounts','id':cash['id'],'version':cash['version'],'status':'closed'})['rows'][0]
    w.unchanged('journal-post',{**p,'reference':'CLOSED-ACCOUNT'})
    cash=w.call('account-status',{'view':'accounts','id':cash['id'],'version':cash['version'],'status':'open'})['rows'][0]
    small={**p,'reference':'NORMALIZED','amount':'1','description':'Normalization'}
    w.call('journal-post',small);before=w.file.read_bytes();w.call('journal-post',{**small,'amount':'1.00'});assert w.file.read_bytes()==before
    reportRows=w.call('reconciliation-delete',{'view':'reconciliations','id':r2['id'],'version':r2['version']})['rows'];assert len(reportRows)==1
    unused=w.call('account-add',{'view':'accounts','code':'9999','name':'Unused','type':'asset'})['rows'][-1]
    assert len(w.call('account-delete',{'view':'accounts','id':unused['id'],'version':unused['version']})['rows'])==2
    w.unchanged('unknown',{'view':'accounts'})
    saved=json.loads(w.file.read_text());saved['journals'][0]['debitId']='A999';w.corrupt(json.dumps(saved),'accounts')
    w.corrupt('{broken','accounts')
    w.corrupt(json.dumps({'schema':1,'serial':2,'accounts':[{}],'journals':[],'reconciliations':[]}),'accounts')
    print(f'PASS: {w.calls} native ledger worker commands; account CRUD/status, exact balanced journals, large totals, idempotent replay/conflict, reversals, reconciliation, stale versions, corrupt store and failed-save rollback')
