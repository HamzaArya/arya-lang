"""Optional reproducible source/SDK identity capture for a dirty checkout."""
import argparse,hashlib,json,os,platform,subprocess,tarfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--label',required=True);parser.add_argument('--root',default=str(Path(__file__).resolve().parents[2]));parser.add_argument('--compiler');args=parser.parse_args()
root=Path(args.root).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
destination=out/(args.label+'-source.json');archive=out/(args.label+'-source.tar.gz')
assert not destination.exists() and not archive.exists(),'Snapshot identities are immutable; choose a new label'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def command(argv):
    result=subprocess.run(argv,cwd=root,text=True,capture_output=True)
    return {'argv':argv,'status':result.returncode,'stdout':result.stdout.strip(),'stderr':result.stderr.strip()}
files=[root/'Makefile',*sorted((root/'native').rglob('*')),*sorted((root/'bin').rglob('*'))]
files=[p for p in files if p.is_file()]
record={'revision':command(['git','rev-parse','HEAD']),'status':command(['git','status','--porcelain=v1','-uall']),
        'sources':{str(p.relative_to(root)):sha(p) for p in files},'provenance':json.loads((root/'native/PROVENANCE.json').read_text()),
        'environment':{'uname':command(['uname','-a']),'clang':command([os.environ.get('CC','cc'),'--version']),
          'selectedFlags':{key:os.environ.get(key) for key in ['CC','CXX','CFLAGS','ARYA_CC','ARYA_NATIVE_LIBDIR','SDKROOT','MACOSX_DEPLOYMENT_TARGET','CPATH','C_INCLUDE_PATH','LIBRARY_PATH']}}}
if platform.system()=='Darwin':record['environment']['sdk']=command(['xcrun','--show-sdk-path']);record['environment']['sdkVersion']=command(['xcrun','--show-sdk-version'])
library=root/'.build/independent/lib'
if library.exists():record['sdkFiles']={str(p.relative_to(root)):sha(p) for p in sorted(library.rglob('*')) if p.is_file()}
if args.compiler:
    compiler=Path(args.compiler).resolve();record['compiler']={'path':str(compiler),'sha256':sha(compiler),'bytes':compiler.stat().st_size,'version':command([str(compiler),'--version'])}
with tarfile.open(archive,'w:gz') as bundle:
    for p in files:bundle.add(p,arcname=str(p.relative_to(root)))
record['sourceArchiveSha256']=sha(archive)
destination.write_text(json.dumps(record,indent=2)+'\n');print(destination)
