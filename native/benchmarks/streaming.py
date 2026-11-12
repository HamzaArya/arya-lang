"""Optional host for bounded CSV -> exact grouping, with an integer oracle."""
import hashlib,json,os,platform,subprocess,sys,time
from decimal import Decimal,ROUND_HALF_EVEN
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1] if len(sys.argv)>1 else root/'.build/performance-2026-11-12').resolve()
compiler=Path(os.environ.get('ARYA_NATIVE_BIN',out/'sdk-final/arya')).resolve()
directory=out/'streaming';directory.mkdir(exist_ok=True)
binary=directory/'report'
start=time.perf_counter()
build=subprocess.run([str(compiler),'build',str(root/'native/examples/stream-ledger.arya'),'-o',str(binary),'--release','--force'],capture_output=True,text=True,timeout=120)
assert build.returncode==0,build.stderr or build.stdout
build_ms=(time.perf_counter()-start)*1000
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
sizes=[1000,10000,100000,1000000];inputs={};expected={}
policy={'currency':'USD','scale':2,'rounding':'half-even'}
for count in sizes:
    path=directory/f'{count}.csv';totals={}
    with path.open('w',newline='') as file:
        file.write('account,amount\r\n')
        for index in range(count):
            slot=index%100;account='=print(99)' if slot==0 else '__proto__' if slot==1 else f'account-{slot}'
            units=100005 if index%5 else -20035
            file.write(account+(','+'100.005' if units>0 else ',-20.035')+'\r\n')
            totals[account]=totals.get(account,0)+units
    expected[count]={'rows':count,'accounts':[{'account':account,'total':{'amount':str((Decimal(units)/1000).quantize(Decimal('.01'),rounding=ROUND_HALF_EVEN)),**policy}} for account,units in totals.items()]}
    inputs[count]={'sha256':sha(path),'bytes':path.stat().st_size}
raw=[]
for sample in range(-1,3):
    for count in (sizes if sample%2 else list(reversed(sizes))):
        with (directory/f'{count}.csv').open('rb') as source:
            start=time.perf_counter()
            result=subprocess.run(['/usr/bin/time','-l' if platform.system()=='Darwin' else '-v',str(binary),'USD','2','half-even'],stdin=source,capture_output=True,timeout=120,env={'PATH':'/nonexistent'})
            elapsed=(time.perf_counter()-start)*1000
        assert result.returncode==0,result.stderr.decode()
        actual=json.loads(result.stdout);assert actual==expected[count],count
        if sample>=0:raw.append({'sample':sample,'rows':count,'wallMs':elapsed,'outputSha256':hashlib.sha256(result.stdout).hexdigest(),'resources':result.stderr.decode()})
report={'boundary':'Fresh native process reading an already generated CSV file, exact sum by account, boundary rounding, JSON output, cleanup. Warm filesystem cache; one warmup, three alternating-size samples. Inputs/expected totals use signed integer thousandths; Python Decimal only formats the boundary.',
        'compilerSha256':sha(compiler),'sourceSha256':sha(root/'native/examples/stream-ledger.arya'),'binarySha256':sha(binary),'bytes':binary.stat().st_size,'buildMs':build_ms,'inputs':inputs,'raw':raw}
(out/'streaming.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps([{'rows':n,'medianWallMs':sorted(x['wallMs'] for x in raw if x['rows']==n)[1]} for n in sizes],indent=2))
