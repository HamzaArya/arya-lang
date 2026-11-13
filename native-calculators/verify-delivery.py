#!/usr/bin/env python3
"""Reconcile delivered bundles with the latest complete build/test evidence."""
import argparse, datetime, hashlib, json, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=pathlib.Path,default=root/'reports/DELIVERY-VERIFICATION.json',help='Evidence file; choose a versioned path to preserve older delivery records')
options=parser.parse_args()
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
runs=[]
for path in sorted((root/'reports').glob('*/results.json')):
    try: run=json.loads(path.read_text())
    except (ValueError,OSError): continue
    runs.append((path,run))
result={'date_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_source_sha256':sha(root/'shared/NativeHost.m'),'projects':[]}
for project in sorted(root.glob('0*-*')):
    matches=[(path,run,row) for path,run in runs for row in run['projects'] if row['path']==project.name and row.get('status')=='passed']
    complete=[entry for entry in matches if entry[1].get('mode')=='check-build-test-package']
    assert complete, f'No complete passing run for {project.name}'
    engine_path,engine_run,engine_row=complete[-1]
    path,run,row=matches[-1]
    assert run['host_source_sha256']==result['host_source_sha256'], 'Unverified host change'
    for inputs in (row['inputs_sha256'],engine_row['inputs_sha256']):
        for filename,expected in inputs.items(): assert sha(project/filename)==expected, f'Changed input {project.name}/{filename}'
    assert row['worker_sha256']==engine_row['worker_sha256'], 'Packaged engine differs from tested engine'
    app=root/row['app']; worker=app/'Contents/MacOS/arya-worker'; host=app/'Contents/MacOS/NativeHost'
    assert sha(worker)==row['worker_sha256'] and sha(host)==row['host_sha256'], f'Changed binary {app.name}'
    assert (app/'Contents/Resources/ui.json').read_bytes()==(project/'ui.json').read_bytes()
    assert (app/'Contents/Resources/README.md').read_bytes()==(project/'README.md').read_bytes()
    architecture={p.name:subprocess.check_output(['file','-b',str(p)],text=True).strip() for p in (host,worker)}
    assert all('arm64' in x for x in architecture.values())
    libraries=subprocess.check_output(['otool','-L',str(worker)],text=True).splitlines()[1:]
    assert all(x.strip().startswith(('/usr/lib/','/System/Library/')) for x in libraries), 'Unexpected external worker dependency'
    result['projects'].append({'project':project.name,'app':row['app'],'status':'passed','engine_build_test_evidence':str(engine_path.relative_to(root)),'package_evidence':str(path.relative_to(root)),'worker_sha256':sha(worker),'host_sha256':sha(host),'architecture':architecture,'worker_libraries':libraries})
assert len(result['projects'])==6
result['status']='passed'
output=options.output.resolve(); output.parent.mkdir(parents=True,exist_ok=True); output.write_text(json.dumps(result,indent=2)+'\n')
print(f'6/6 delivered apps match current sources and complete build/test evidence: {output}')
