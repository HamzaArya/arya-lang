import json, pathlib, subprocess, sys, tempfile
EXE = str(pathlib.Path(sys.argv[1]).resolve())
def run(folder,data,code=0):
    p=pathlib.Path(folder)/'input.json';p.write_text(json.dumps(data))
    r=subprocess.run([EXE,str(p)],capture_output=True,text=True,timeout=5)
    assert r.returncode==code,(r.returncode,r.stdout,r.stderr)
    return json.loads(r.stdout) if r.stdout else r.stderr
with tempfile.TemporaryDirectory() as tmp:
    good={'entries':[{'id':'sale-1','lines':[{'account':'cash','debit':'9007199254740993.01','credit':'0.00'},{'account':'sales','debit':'0.00','credit':'9007199254740993.01'}]}]}
    r=run(tmp,good); assert r['ok'] and r['debit']=='9007199254740993.01'
    assert r['accountBalances']['cash']=='9007199254740993.01'
    bad=json.loads(json.dumps(good));bad['entries'][0]['lines'][1]['credit']='1.00'
    assert not run(tmp,bad,1)['ok']
    duplicate={'entries':good['entries']*2}; assert any('Duplicate' in x for x in run(tmp,duplicate,1)['issues'])
    bad=json.loads(json.dumps(good));bad['entries'][0]['lines'][0]['debit']='NaN';run(tmp,bad,2)
    bad=json.loads(json.dumps(good));bad['entries'][0]['lines'][0]['debit']='1.001';run(tmp,bad,2)
    assert not run(tmp,{'entries':[]},1)['ok']
    run(tmp,{'entries':'wrong'},2)
    r=subprocess.run([EXE],capture_output=True,timeout=5);assert r.returncode==2
print('PASS: 8 ledger audit scenarios (exactness, imbalance, duplicates, invalid data, empty journal, usage)')
