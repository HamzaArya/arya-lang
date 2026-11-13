"""Freeze dirty Arya/Ledger inputs without changing either original checkout.
Two complete content scans must agree. Git revision/status describe provenance;
per-file and tree hashes, including local edits, identify the actual inputs.
Ignored dependencies needed by the qualification controllers are copied too.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--language',required=True,type=Path)
parser.add_argument('--ledger',required=True,type=Path)
parser.add_argument('--out',required=True,type=Path)
options=parser.parse_args()
out=options.out.resolve()
out.mkdir(parents=True)  # Refuse to overwrite an earlier evidence directory.

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git(root,*args):
    return subprocess.check_output(['git',*args],cwd=root)

def freeze(source,destination,extras):
    source=source.resolve()
    destination.mkdir()
    def names():
        files=git(source,'ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0')
        files=[name for name in files if name and (source/name).is_file() and not (source/name).resolve().is_relative_to(out)]
        for extra in extras:
            path=source/extra
            if path.is_dir():files.extend(str(f.relative_to(source))for f in path.rglob('*')if f.is_file() and not f.resolve().is_relative_to(out))
            elif path.is_file():files.append(extra)
        return sorted(set(files))
    for attempt in range(8):
        try:
            files=names()
            hashes={}
            for name in files:
                path=source/name
                target=destination/name
                target.parent.mkdir(parents=True,exist_ok=True)
                data=path.read_bytes()
                target.write_bytes(data)
                target.chmod(path.stat().st_mode)
                hashes[name]=digest(data)
            if files==names() and all(digest((source/name).read_bytes())==value for name,value in hashes.items()):break
        except FileNotFoundError:
            continue
    else:
        raise RuntimeError(f'Concurrent edits prevented a consistent snapshot: {source}')
    for path in destination.rglob('*'):
        if path.is_file() and str(path.relative_to(destination))not in hashes:path.unlink()
    manifest={'source':str(source),'revision':git(source,'rev-parse','HEAD').decode().strip(),
              'status':git(source,'status','--porcelain').decode(),'sha256':hashes,
              'treeSha256':digest(json.dumps(hashes,sort_keys=True).encode()),'verifiedPass':attempt+1}
    (out/(destination.name+'-source.json')).write_text(json.dumps(manifest,indent=2)+'\n')
    print(destination.name,len(files),manifest['treeSha256'],flush=True)

freeze(options.language,out/'baseline',['.build/independent/lib'])
freeze(options.ledger,out/'ledger',['backend/src/arya/generated','node_modules/arya-language','node_modules/esbuild',
                                  'node_modules/@esbuild','src/generated/prisma/runtime','src/generated/prisma/package.json'])
shutil.copytree(out/'baseline',out/'candidate')
print(out)
