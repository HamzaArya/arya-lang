#!/usr/bin/env python3
"""Build and verify native macOS .app bundles. Python is build/test tooling only."""
import argparse, datetime, hashlib, json, os, pathlib, plistlib, re, shutil, subprocess, sys, tempfile, time
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parent

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def call(command, log, cwd=ROOT, timeout=240):
    start=time.monotonic()
    with log.open('w') as output:
        output.write(json.dumps([str(x) for x in command])+'\n');output.flush()
        result=subprocess.run(command,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Command failed ({result.returncode}); see {log}\n'+log.read_text()[-3000:])
    return {'command':[str(x) for x in command],'exit_code':0,'seconds':round(time.monotonic()-start,3),'log':str(log.relative_to(ROOT))}

def validate(config):
    assert config['id'] and config['name'] and config['views']
    views={v['id'] for v in config['views']}
    assert len(views)==len(config['views'])
    for view in config['views']:
        assert view['columns'] and all(c.get('key') and c.get('label') for c in view['columns'])
    for action in config['actions']:
        assert action.get('label') and action.get('command')
        assert action.get('view') is None or action['view'] in views
        fields=action.get('fields',[])
        assert len({f['key'] for f in fields})==len(fields)
        for f in fields:
            assert f.get('label') and f.get('type','text') in ('text','multiline','choice')
            if f.get('optionsView'): assert f['optionsView'] in views

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--filter',default='');p.add_argument('--compiler',default=str(REPO/'bin/arya'));p.add_argument('--package-only',action='store_true',help='Use existing .build/worker for iterative UI development; not full verification')
    p.add_argument('--output',type=pathlib.Path,help='Bundle directory; defaults to dist/')
    p.add_argument('--app-version',default='1.0',help='Numeric application version, for example 2.0.0')
    opt=p.parse_args(); projects=sorted(f for f in ROOT.glob('0*-*') if f.is_dir() and opt.filter in f.name)
    if not projects:p.error('No matching projects')
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,2}',opt.app_version):p.error('--app-version must have one to three numeric components')
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'); logs=ROOT/'reports'/stamp;logs.mkdir(parents=True)
    build=ROOT/'.build';build.mkdir(exist_ok=True);dist=opt.output.expanduser().resolve() if opt.output else ROOT/'dist';dist.mkdir(parents=True,exist_ok=True)
    host=build/'NativeHost';host_source=ROOT/'shared/NativeHost.m'
    compiler_command=pathlib.Path(shutil.which(opt.compiler) or opt.compiler).resolve()
    result={'date_utc':stamp,'mode':'package-only' if opt.package_only else 'check-build-test-package','app_version':opt.app_version,'output':str(dist),'host_source_sha256':sha(host_source),'compiler_version':subprocess.check_output([opt.compiler,'--version'],text=True).strip(),'compiler_command':str(compiler_command),'compiler_command_sha256':sha(compiler_command),'projects':[]}
    result['host_build']=call(['clang','-fobjc-arc','-fmodules','-Wall','-Wextra',str(host_source),'-framework','Cocoa','-framework','UniformTypeIdentifiers','-o',str(host)],logs/'appkit-host.log')
    result['host_binary_sha256']=sha(host)
    for project in projects:
        print('BUILD '+project.name,flush=True); row={'path':project.name,'steps':[]};result['projects'].append(row)
        try:
            config=json.loads((project/'ui.json').read_text());validate(config)
            inputs={f.name:sha(f) for f in project.iterdir() if f.is_file() and f.suffix in ('.arya','.json','.py','.md')}
            row['inputs_sha256']=inputs
            (project/'.build').mkdir(exist_ok=True);worker=project/'.build/worker'
            if not opt.package_only:
                row['steps'].append(call([opt.compiler,'check','main.arya'],logs/(project.name+'-check.log'),project))
                row['steps'].append(call([opt.compiler,'build','main.arya','-o',str(worker),'--release','--force'],logs/(project.name+'-build.log'),project))
                row['steps'].append(call([sys.executable,'smoke.py',str(worker)],logs/(project.name+'-smoke.log'),project))
            assert worker.is_file(), 'Build the worker before --package-only'
            tested_worker_sha=sha(worker)
            with tempfile.TemporaryDirectory(prefix='arya-app-stage-',dir=build) as staging:
                app=pathlib.Path(staging)/(config['name']+'.app'); mac=app/'Contents/MacOS';resources=app/'Contents/Resources';mac.mkdir(parents=True);resources.mkdir(parents=True)
                shutil.copy2(host,mac/'NativeHost');shutil.copy2(worker,mac/'arya-worker')
                for name in ('ui.json','README.md','REPORT.md'):shutil.copy2(project/name,resources/name)
                for source in (REPO/'LICENSE',REPO/'NOTICE',REPO/'THIRD-PARTY-NOTICES.txt',pathlib.Path(str(worker)+'.NOTICE')):
                    if source.exists():shutil.copy2(source,resources/source.name)
                info={'CFBundleName':config['name'],'CFBundleDisplayName':config['name'],'CFBundleIdentifier':'org.arya.native.'+config['id'],'CFBundleExecutable':'NativeHost','CFBundlePackageType':'APPL','CFBundleShortVersionString':opt.app_version,'CFBundleVersion':opt.app_version,'NSPrincipalClass':'NSApplication','NSHighResolutionCapable':True,'LSMinimumSystemVersion':'26.0','NSHumanReadableCopyright':'Arya native application collection. See bundled notices.'}
                (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
                row['steps'].append(call(['codesign','--verify','--strict',str(mac/'arya-worker')],logs/(project.name+'-verify-worker.log')))
                # Preserve the exact worker bytes which passed the smoke suite.
                row['steps'].append(call(['codesign','--force','--sign','-',str(app)],logs/(project.name+'-sign-app.log')))
                row['steps'].append(call(['codesign','--verify','--deep','--strict',str(app)],logs/(project.name+'-verify-signature.log')))
                with tempfile.TemporaryDirectory(prefix='arya-app-protocol-') as temp:
                    env={**os.environ,'DATA_FILE':str(pathlib.Path(temp)/'data.json')}
                    cmd=[str(app/'Contents/MacOS/NativeHost'),'--protocol-check']
                    r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=90)
                    log=logs/(project.name+'-protocol.log');log.write_text(r.stdout+r.stderr)
                    assert r.returncode==0, f'Bundle protocol check failed: {log}'
                    row['steps'].append({'command':cmd,'exit_code':r.returncode,'log':str(log.relative_to(ROOT))})
                assert all(sha(project/name)==value for name,value in inputs.items()), 'Source changed during verification'
                assert sha(host_source)==result['host_source_sha256'], 'Host source changed during verification'
                assert sha(compiler_command)==result['compiler_command_sha256'], 'Compiler command changed during verification'
                assert sha(mac/'arya-worker')==tested_worker_sha, 'Signing changed the tested worker'
                destination=dist/app.name
                backup=pathlib.Path(staging)/'previous.app'
                if destination.exists():destination.rename(backup)
                try:app.rename(destination)
                except BaseException:
                    if backup.exists():backup.rename(destination)
                    raise
            row.update(status='passed',app=os.path.relpath(destination,ROOT),tested_worker_sha256=tested_worker_sha,worker_sha256=sha(destination/'Contents/MacOS/arya-worker'),host_sha256=sha(destination/'Contents/MacOS/NativeHost'))
            print('  PASS '+str(destination),flush=True)
        except Exception as error:
            row.update(status='failed',error=str(error));print('  FAIL '+str(error),flush=True)
        (logs/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    result['passed']=sum(x['status']=='passed' for x in result['projects']);result['failed']=len(projects)-result['passed'];(logs/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f"{result['passed']}/{len(projects)} passed. Evidence: {logs/'results.json'}",flush=True)
    return int(bool(result['failed']))
if __name__=='__main__':sys.exit(main())
