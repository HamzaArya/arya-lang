#!/usr/bin/env python3
"""Execute only after explicit M1 freeze; retain this exact driver with delivery evidence."""
import argparse, datetime, hashlib, importlib.util, json, os, re, stat, subprocess, sys, tarfile, time
from pathlib import Path
sys.dont_write_bytecode = True
ROOT = Path.cwd()
GEN = ROOT / '.build/release-2.0.0/generation-2'
FINAL, EVIDENCE, ASSEMBLED = GEN/'final', GEN/'evidence', GEN/'assembled'
PLAN = ROOT / '.build/release-distribution/generation-2-asset-plan.json'
spec = importlib.util.spec_from_file_location('release_apps', ROOT/'native/bootstrap/release-apps.py')
shared = importlib.util.module_from_spec(spec); spec.loader.exec_module(shared)


def sha_bytes(value): return hashlib.sha256(value).hexdigest()
def write(path, value):
    with path.open('x') as stream: json.dump(value, stream, indent=2); stream.write('\n')
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
def clean(commit):
    result = {'commit':git('rev-parse','HEAD'), 'tree':git('rev-parse','HEAD^{tree}'),
              'workingTree':git('status','--porcelain'),
              'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    assert result['commit'] == commit and result['workingTree'] == '', result
    return result

def run(args, name, env=None, cwd=None, timeout=300):
    start = time.monotonic()
    try:
        p = subprocess.run([str(x) for x in args], capture_output=True, text=True,
                           env=env, cwd=cwd or ROOT, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        decode = lambda value: value.decode(errors='replace') if isinstance(value,bytes) else value or ''
        write(EVIDENCE/(name+'.json'), {'command':[str(x) for x in args], 'cwd':str(cwd or ROOT),
            'exitCode':None,'timedOutAfterSeconds':timeout,'stdout':decode(error.stdout),
            'stderr':decode(error.stderr),'seconds':round(time.monotonic()-start,3)})
        raise
    record = {'command':[str(x) for x in args], 'cwd':str(cwd or ROOT), 'exitCode':p.returncode,
              'stdout':p.stdout, 'stderr':p.stderr, 'seconds':round(time.monotonic()-start,3)}
    write(EVIDENCE/(name+'.json'), record)
    assert p.returncode == 0, record
    return record

def inventory(path):
    assert not any(p.is_symlink() for p in path.rglob('*'))
    return {p.relative_to(path).as_posix():{'sha256':shared.sha(p), 'mode':stat.S_IMODE(p.stat().st_mode),
             'bytes':p.stat().st_size} for p in path.rglob('*') if p.is_file()}

def verify_tar(archive, directory_name, expected):
    seen, actual = set(), {}
    with tarfile.open(archive, 'r:gz') as source:
        for item in source:
            name = shared.safe_name(item.name)
            assert name.parts[0] == directory_name and name not in seen
            seen.add(name)
            assert item.isdir() or item.isfile(), 'Archive link or special file'
            if item.isfile():
                relative = Path(*name.parts[1:]).as_posix(); assert relative in expected, relative
                digest = hashlib.sha256()
                with source.extractfile(item) as stream:
                    for chunk in iter(lambda:stream.read(1024*1024), b''): digest.update(chunk)
                row = {'sha256':digest.hexdigest(),'mode':item.mode&0o777,'bytes':item.size}
                assert row == expected[relative], relative
                actual[relative] = row
    assert actual == expected, 'Incomplete archive coverage'
    return {'filename':archive.name,'bytes':archive.stat().st_size,'sha256':shared.sha(archive),
            'verifiedFiles':len(actual),'fileInventorySHA256':sha_bytes(json.dumps(actual,sort_keys=True).encode())}

def source_expected():
    tracked = set(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0'))
    paths = {Path(n) for n in ('Makefile','LICENSE','NOTICE','THIRD-PARTY-NOTICES.txt')}
    ignored_dirs = {'.build','.arya','__pycache__','.git'}
    for directory in ('native','bin'):
        for p in (ROOT/directory).rglob('*'):
            relative = p.relative_to(ROOT)
            if ignored_dirs & set(relative.parts) or p.name.endswith('.pyc') or p.name=='.DS_Store' or p.name.startswith('._'): continue
            assert not p.is_symlink(), relative
            if p.is_file(): paths.add(relative)
    for line in (ROOT/'native/DOCUMENTATION').read_text().splitlines():
        if not line or line.startswith('#'): continue
        kind, source, _ = line.split('|')
        if kind == 'file': paths.add(Path(source))
        else:
            assert kind=='tree'
            paths.update(p.relative_to(ROOT) for p in (ROOT/source).rglob('*')
                         if p.is_file() and p.name!='.DS_Store' and not p.name.startswith('._'))
    expected, input_hashes, rewrites = {}, {}, []
    for path in sorted(paths):
        assert path.as_posix() in tracked, 'Untracked archive input: '+str(path)
        source = ROOT/path; assert not source.is_symlink()
        data = source.read_bytes(); input_hashes[path.as_posix()] = sha_bytes(data)
        if (path.parts[0]=='docs' and path.suffix=='.md') or path.as_posix()=='CONTRIBUTING.md':
            data = subprocess.check_output(['awk','-v','catalog='+str(ROOT/'native/DOCUMENTATION'),
                '-v','document='+path.as_posix(),'-v','layout=source-package','-f',
                str(ROOT/'native/bootstrap/sdk-doc-links.awk'),str(source)])
            rewrites.append(path.as_posix())
        expected[path.as_posix()] = {'sha256':sha_bytes(data),'mode':stat.S_IMODE(source.stat().st_mode),'bytes':len(data)}
    script = (ROOT/'native/bootstrap/source-package.sh').read_text()
    readme = re.search(r"cat > \"\$source/README.txt\" <<'TEXT'\n(.*?)\nTEXT",script,re.S)
    assert readme
    data=(readme[1]+'\n').encode()
    expected['README.txt']={'sha256':sha_bytes(data),'mode':0o644,'bytes':len(data)}
    return expected,input_hashes,rewrites

def source_archive(commit):
    before = clean(commit)
    expected, inputs, rewrites = source_expected()
    run(['sh',ROOT/'native/bootstrap/source-package.sh'],'source-package',env=dict(os.environ,ARYA_PACKAGE_DIRECTORY=str(FINAL)))
    archive = FINAL/'arya-native-2.0.0-source.tar.gz'
    root_name='arya-native-2.0.0-source'
    with tarfile.open(archive,'r:gz') as source:
        manifest = source.extractfile(root_name+'/SHA256SUMS').read()
    rows = {}
    for line in manifest.decode().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64}) \*(\./.+)',line); assert match
        name=shared.safe_name(match[2]).as_posix(); assert name not in rows
        rows[name]=match[1]
    assert rows == {name:row['sha256'] for name,row in expected.items()}, 'Source checksum coverage mismatch'
    expected['SHA256SUMS']={'sha256':sha_bytes(manifest),'mode':0o644,'bytes':len(manifest)}
    verified = verify_tar(archive,root_name,expected)
    after = clean(commit)
    after_expected, after_inputs, after_rewrites = source_expected()
    assert after_inputs==inputs and after_rewrites==rewrites
    assert {k:v for k,v in expected.items() if k!='SHA256SUMS'} == after_expected
    result = {'status':'passed','archive':verified,'internalInventorySHA256':sha_bytes(manifest),
              'internalInventoryFiles':len(rows),'checkoutCommit':before['commit'],'checkoutTree':before['tree'],
              'before':before,'after':after,'inputSHA256':inputs,'rewrittenDocumentation':rewrites,
              'generatedFiles':['README.txt','SHA256SUMS'],
              'note':'External binding to M1. Source archive has no embedded Git commit field; original helper unchanged.'}
    write(EVIDENCE/'source-archive-binding.json',result)
    return result

def install_smoke(sdk, compiler_hash):
    smoke=GEN/'final-mac-install'; assert not smoke.exists(); smoke.mkdir()
    prefix=smoke/"Mac's SDK prefix"; project=smoke/'CLI project with spaces'; executable=smoke/'native CLI program'
    env=dict(os.environ); env.pop('HOME',None)
    run(['sh',sdk/'install.sh',sdk,'--prefix',prefix],'final-mac-install',env=env)
    launcher=prefix/'bin/arya'; target=prefix/'lib/arya/2.0.0-darwin-arm64'
    assert launcher.is_symlink() and launcher.resolve()==(target/'arya').resolve()
    assert inventory(sdk)==inventory(target), 'Installed payload differs'
    assert shared.sha(launcher)==compiler_hash
    run([launcher,'--version'],'final-mac-version',env={'PATH':'/nonexistent'})
    env=dict(os.environ); env.pop('ARYA_NATIVE_LIBDIR',None); env.pop('ARYA_C_COMPILER',None)
    run([launcher,'create',project,'--template','cli'],'final-mac-create',env=env)
    run([launcher,'check',project/'main.arya','--json'],'final-mac-check',env={'PATH':'/nonexistent'})
    run([launcher,'build',project/'main.arya','-o',executable,'--release'],'final-mac-build',env=env,timeout=300)
    ordinary=run([executable,'19.95','3'],'final-mac-run',env={'PATH':'/nonexistent'})
    huge=run([executable,'9007199254740993.01','3'],'final-mac-run-huge',env={'PATH':'/nonexistent'})
    assert ordinary['stdout']=='Total: 59.85\n' and huge['stdout']=='Total: 27021597764222979.03\n'
    result={'status':'passed','compilerSHA256':compiler_hash,'installerSHA256':shared.sha(sdk/'install.sh'),
            'prefix':str(prefix.relative_to(ROOT)),'managedLauncherTarget':str(target.relative_to(ROOT)),
            'installedFiles':len(inventory(target)),'sourceSHA256':shared.sha(project/'main.arya'),
            'executableSHA256':shared.sha(executable),'outputs':[ordinary['stdout'],huge['stdout']],
            'homeUnsetDuringInstall':True,'compilerLibraryOverride':False,'runtimePATH':'/nonexistent'}
    write(EVIDENCE/'final-mac-install-verification.json',result)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--freeze-commit',required=True); args=parser.parse_args()
    assert re.fullmatch(r'[0-9a-f]{40}',args.freeze_commit)
    freeze=clean(args.freeze_commit)
    profiles=json.loads((ROOT/'docs/verification/2.0.0/sdk-assembly-inputs.json').read_text())
    assert set(profiles)=={'darwin-arm64','linux-x64','windows-cygwin-x64'}
    before_preserved=inventory(FINAL)
    write(EVIDENCE/'assembly-freeze.json',freeze)
    records=[]
    for target,folder in [('darwin-arm64','macos'),('linux-x64','linux'),('windows-cygwin-x64','windows')]:
        sdk=GEN/'evidence'/('ci-ce80487-'+folder)/'extracted'/('arya-native-2.0.0-'+target)
        destination=ASSEMBLED/sdk.name; assert sdk.is_dir() and not destination.exists()
        run(['python3',ROOT/'docs/verification/2.0.0/reassemble-qualified-sdk.py','--platform',target,
             '--sdk',sdk,'--destination',destination],'assemble-'+target)
        assembly=json.loads((destination/'ASSEMBLY-INFO.json').read_text())
        assert assembly['assemblyCommit']==args.freeze_commit and assembly['assemblyWorkingTreeStatus']==[]
        assert assembly['installerIdentity']['assembledSHA256']==profiles[target]['installerSHA256']
        assert assembly['installerIdentity']['matchesQualified']
        expected=inventory(destination)
        temporary=EVIDENCE/(sdk.name+'.tar.gz'); assert not temporary.exists()
        run(['tar','-czf',temporary,'-C',ASSEMBLED,sdk.name],'archive-'+target,
            env=dict(os.environ,COPYFILE_DISABLE='1'))
        row=verify_tar(temporary,sdk.name,expected)
        os.link(temporary,FINAL/temporary.name)
        row.update(platform=target,compilerSHA256=profiles[target]['compilerSHA256'],
                   originalSourceCommit=profiles[target]['sourceCommit'],assemblyCommit=args.freeze_commit,
                   originalInventorySHA256=profiles[target]['inventorySHA256'],
                   assembledInventorySHA256=shared.sha(destination/'SHA256SUMS'))
        records.append(row)
    smoke=install_smoke(ASSEMBLED/'arya-native-2.0.0-darwin-arm64',profiles['darwin-arm64']['compilerSHA256'])
    source=source_archive(args.freeze_commit)
    run(['python3',ROOT/'docs/verification/2.0.0/write-release-checksums.py','--directory',FINAL,'--plan',PLAN],'release-checksums')
    for name,pin in before_preserved.items(): assert inventory(FINAL)[name]==pin, 'Earlier staged file changed: '+name
    plan=json.loads(PLAN.read_text()); assert len(set(plan['uploadFiles']))==17
    uploads={name:inventory(FINAL)[name] for name in plan['uploadFiles']}
    run(['shasum','-a','256','-c','SHA256SUMS'],'release-checksums-verify',cwd=FINAL)
    for asset in plan['artifacts']:
        if asset['kind']!='checksums':
            expected=f"{uploads[asset['filename']]['sha256']} *{asset['filename']}\n"
            assert (FINAL/asset['checksumFilename']).read_text()==expected
    result={'status':'passed; publication not yet performed','generation':2,'freeze':freeze,'after':clean(args.freeze_commit),
            'sdkArchives':records,'sourceArchiveBinding':'source-archive-binding.json','sourceArchive':source['archive'],
            'finalMacInstallerSmoke':smoke,'uploadCount':17,'uploads':uploads,
            'controllerSHA256':shared.sha(Path(__file__)),'controller':str(Path(__file__).relative_to(ROOT)),
            'note':'Tag v2.0.0 binds M1. Original CI compiler source identities are retained. Later M2 delivery evidence does not relabel payloads.'}
    write(EVIDENCE/'final-delivery-inventory.json',result)
    print(json.dumps({'status':'passed','uploadCount':17,'sourceArchive':source['archive'],'sdkArchives':records},indent=2))

if __name__=='__main__': main()
