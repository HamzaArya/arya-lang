"""Alternating forced application builds using identical source/SDK libraries."""
import hashlib,json,platform,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1] if len(sys.argv)>1 else root/'.build/performance-2026-11-12').resolve()
directory=out/'build-cost';directory.mkdir(exist_ok=True)
compilers={'baseline':out/'baseline-sdk/arya','candidate':out/'sdk-final/arya'}
raw=[]
for sample in range(-1,3):
    for name in (list(compilers) if sample%2 else list(reversed(compilers))):
        binary=directory/name;start=time.perf_counter()
        result=subprocess.run(['/usr/bin/time','-l' if platform.system()=='Darwin' else '-v',str(compilers[name]),'build',str(out/'ledger/native-worker.arya'),'-o',str(binary),'--release','--force'],capture_output=True,text=True,timeout=120)
        elapsed=(time.perf_counter()-start)*1000
        assert result.returncode==0,result.stderr or result.stdout
        if sample>=0:raw.append({'sample':sample,'name':name,'wallMs':elapsed,'bytes':binary.stat().st_size,'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'cSha256':hashlib.sha256(binary.with_suffix('.c').read_bytes()).hexdigest(),'resources':result.stderr})
report={'boundary':'Forced native build, frontend + C emission + Clang -std=c11 -O2 -ffp-contract=off + static linking. Same copied Ledger sources; same static SDK libraries; one warmup and three alternating samples. Existing vendor libraries/seed are cached.',
        'compilerSha256':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in compilers.items()},'raw':raw}
(out/'build-cost.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps([{'name':name,'medianBuildMs':sorted(x['wallMs'] for x in raw if x['name']==name)[1]} for name in compilers],indent=2))
