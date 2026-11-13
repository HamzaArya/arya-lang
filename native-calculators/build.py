#!/usr/bin/env python3
"""Build and verify native macOS .app bundles. Python is build/test tooling only."""
import argparse, datetime, hashlib, json, os, pathlib, plistlib, shutil, subprocess, sys, tempfile, time
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
    assert config['id'].startswith('calc-') and '/' not in config['name']
    calculator=config['calculator']
    assert isinstance(calculator.get('memory',False),bool)
    keys=calculator['keys']; assert 1<=len(keys)<=6
    assert all(isinstance(row,list) and 1<=len(row)<=6 and all(isinstance(k,str) and 0<len(k)<=20 for k in row) for row in keys)
    options=calculator.get('options',[])
    assert len(options)<=3 and len({o['key'] for o in options})==len(options)
    for option in options:
        assert option['key'] and option['label'] and option['choices']
        values=[c['value'] for c in option['choices']]
        assert option['default'] in values and len(set(values))==len(values)
        assert all(isinstance(c['value'],str) and c['label'] for c in option['choices'])
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
    opt=p.parse_args(); projects=sorted(f for f in ROOT.glob('0*-*') if f.is_dir() and any(token in f.name for token in opt.filter.split(',')))
    if not projects:p.error('No matching projects')
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'); logs=ROOT/'reports'/stamp;logs.mkdir(parents=True)
    build=ROOT/'.build';build.mkdir(exist_ok=True);dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    host=build/'NativeHost';host_source=ROOT/'shared/NativeHost.m'
    result={'date_utc':stamp,'mode':'package-only' if opt.package_only else 'check-build-test-package','host_source_sha256':sha(host_source),'compiler_version':subprocess.check_output([opt.compiler,'--version'],text=True).strip(),'projects':[]}
    result['host_build']=call(['clang','-fobjc-arc','-fmodules','-Wall','-Wextra',str(host_source),'-framework','Cocoa','-framework','UniformTypeIdentifiers','-o',str(host)],logs/'appkit-host.log')
    result['host_binary_sha256']=sha(host)
    icon_tool=build/'Icon'
    result['icon_build']=call(['clang','-fobjc-arc','-Wall','-Wextra',str(ROOT/'shared/Icon.m'),'-framework','Cocoa','-o',str(icon_tool)],logs/'icon-build.log')
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
            with tempfile.TemporaryDirectory(prefix='arya-app-stage-',dir=build) as staging:
                app=pathlib.Path(staging)/(config['name']+'.app'); mac=app/'Contents/MacOS';resources=app/'Contents/Resources';mac.mkdir(parents=True);resources.mkdir(parents=True)
                shutil.copy2(host,mac/'NativeHost');shutil.copy2(worker,mac/'arya-worker');shutil.copy2(project/'ui.json',resources/'ui.json');shutil.copy2(project/'README.md',resources/'README.md')
                iconset=pathlib.Path(staging)/'Calculator.iconset'
                row['steps'].append(call([str(icon_tool),str(iconset),str(int(project.name[:2])-1)],logs/(project.name+'-icon.log')))
                row['steps'].append(call(['iconutil','-c','icns',str(iconset),'-o',str(resources/'Calculator.icns')],logs/(project.name+'-icon-package.log')))
                for source in (REPO/'LICENSE',REPO/'NOTICE',REPO/'THIRD-PARTY-NOTICES.txt',pathlib.Path(str(worker)+'.NOTICE')):
                    if source.exists():shutil.copy2(source,resources/source.name)
                info={'CFBundleName':config['name'],'CFBundleDisplayName':config['name'],'CFBundleIdentifier':'org.arya.native.'+config['id'],'CFBundleExecutable':'NativeHost','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0','CFBundleVersion':'1','NSPrincipalClass':'NSApplication','NSHighResolutionCapable':True,'LSMinimumSystemVersion':'26.0','NSHumanReadableCopyright':'Arya native application collection. See bundled notices.'}
                info['CFBundleIconFile']='Calculator.icns'
                (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
                row['steps'].append(call(['codesign','--force','--sign','-',str(mac/'arya-worker')],logs/(project.name+'-sign-worker.log')))
                row['steps'].append(call(['codesign','--force','--deep','--sign','-',str(app)],logs/(project.name+'-sign-app.log')))
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
                destination=dist/app.name
                backup=pathlib.Path(staging)/'previous.app'
                if destination.exists():destination.rename(backup)
                try:app.rename(destination)
                except BaseException:
                    if backup.exists():backup.rename(destination)
                    raise
            row.update(status='passed',app=str(destination.relative_to(ROOT)),worker_sha256=sha(destination/'Contents/MacOS/arya-worker'),host_sha256=sha(destination/'Contents/MacOS/NativeHost'))
            print('  PASS '+str(destination),flush=True)
        except Exception as error:
            row.update(status='failed',error=str(error));print('  FAIL '+str(error),flush=True)
        (logs/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    result['passed']=sum(x['status']=='passed' for x in result['projects']);result['failed']=len(projects)-result['passed'];(logs/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f"{result['passed']}/{len(projects)} passed. Evidence: {logs/'results.json'}",flush=True)
    return int(bool(result['failed']))
if __name__=='__main__':sys.exit(main())
