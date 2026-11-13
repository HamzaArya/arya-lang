import json, pathlib, subprocess, sys, tempfile
EXE = str(pathlib.Path(sys.argv[1]).resolve())
def run(folder,data,code=0):
    p=pathlib.Path(folder)/'input.json';p.write_text(json.dumps(data))
    r=subprocess.run([EXE,str(p)],capture_output=True,text=True,timeout=5)
    assert r.returncode==code,(r.returncode,r.stdout,r.stderr)
    return json.loads(r.stdout) if r.stdout else r.stderr
with tempfile.TemporaryDirectory() as tmp:
    good={'revision':'abc123','coverage':88.2,'openCritical':0,'rollback':'restore previous immutable artifact','checks':[{'name':n,'status':'passed','revision':'abc123','tests':1} for n in ['build','unit','integration','security']]}
    assert run(tmp,good)['allowed']
    for field,value in [('coverage',79.9),('openCritical',1),('rollback','')]:
        bad={**good,field:value};assert not run(tmp,bad,1)['allowed']
    bad=json.loads(json.dumps(good));bad['checks'][0]['revision']='old';assert 'different revision' in run(tmp,bad,1)['reasons'][0]
    bad={**good,'checks':good['checks'][:-1]};assert any('Missing' in x for x in run(tmp,bad,1)['reasons'])
    bad={**good,'checks':good['checks']+[good['checks'][0]]};assert any('Duplicate' in x for x in run(tmp,bad,1)['reasons'])
    run(tmp,{**good,'coverage':'100'},2)
    bad=json.loads(json.dumps(good));bad['checks'][0]['status']='skipped';assert not run(tmp,bad,1)['allowed']
    r=subprocess.run([EXE],capture_output=True,timeout=5);assert r.returncode==2
print('PASS: 10 release gate scenarios (pass, coverage, critical, rollback, revision, missing, duplicate, malformed, skipped, usage)')
