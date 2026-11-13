#!/usr/bin/env python3
"""Package verified workers and an already-tested host without compiling code."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
VERSION = '2.0.0'
STEM = 'arya-native-desktop-apps-' + VERSION + '-darwin-arm64'
OUTPUT = REPO / '.build' / ('release-' + VERSION)
PACKAGE = OUTPUT / STEM
ARCHIVE = OUTPUT / (STEM + '.zip')
EVIDENCE = ROOT / 'reports' / ('release-' + VERSION + '-bundles.json')
HOST_EVIDENCE = ROOT / 'reports/20261113T140548.407270Z/results.json'
MIGRATION_EVIDENCE = ROOT / 'reports/language-api-storage-20261113.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, **kwargs):
    result = subprocess.run([str(x) for x in command], text=True, capture_output=True,
                            timeout=90, **kwargs)
    assert result.returncode == 0, (command, result.stdout, result.stderr)
    return {'command': [str(x) for x in command], 'exit_code': result.returncode,
            'stdout': result.stdout, 'stderr': result.stderr}


def inventory(directory):
    return {str(p.relative_to(directory)): sha(p)
            for p in sorted(directory.rglob('*')) if p.is_file()}


assert not PACKAGE.exists() and not ARCHIVE.exists(), 'Preserve existing release outputs; choose a new release directory.'
OUTPUT.mkdir(parents=True, exist_ok=True)
host = ROOT / '.build/NativeHost'
previous = json.loads(HOST_EVIDENCE.read_text())
assert previous['passed'] == 6 and previous['failed'] == 0
assert sha(host) == previous['host_binary_sha256'], 'Untested host binary'
assert sha(ROOT / 'shared/NativeHost.m') == previous['host_source_sha256'], 'Host source changed since verified build'
migration = json.loads(MIGRATION_EVIDENCE.read_text())
assert len(migration['projects']) == 6
old_bundles = inventory(ROOT / 'dist')
old_acceptance = sha(ROOT / 'reports/acceptance.json')
result = {'version': VERSION, 'platform': 'macOS 26 ARM64', 'mode': 'package-only, no compiler',
          'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'signing': 'ad-hoc; not Developer ID signed or notarized',
          'host_evidence': str(HOST_EVIDENCE.relative_to(ROOT)),
          'host_source_sha256': previous['host_source_sha256'],
          'host_input_sha256': sha(host),
          'worker_evidence': str(MIGRATION_EVIDENCE.relative_to(ROOT)), 'projects': []}
with tempfile.TemporaryDirectory(prefix='desktop-release-stage-', dir=OUTPUT) as temporary:
    staging = Path(temporary) / STEM
    staging.mkdir()
    for verified in migration['projects']:
        assert verified['status'] == 'passed'
        project = REPO / verified['path']
        worker = project / '.build/worker'
        assert sha(project / 'main.arya') == verified['source_sha256']
        assert sha(project / 'smoke.py') == verified['smoke_sha256']
        assert sha(worker) == verified['binary_sha256']
        config = json.loads((project / 'ui.json').read_text())
        app = staging / (config['name'] + '.app')
        mac = app / 'Contents/MacOS'
        resources = app / 'Contents/Resources'
        mac.mkdir(parents=True)
        resources.mkdir()
        shutil.copy2(host, mac / 'NativeHost')
        shutil.copy2(worker, mac / 'arya-worker')
        for source in [project / 'ui.json', project / 'README.md', project / 'REPORT.md',
                       REPO / 'LICENSE', REPO / 'NOTICE', REPO / 'THIRD-PARTY-NOTICES.txt',
                       Path(str(worker) + '.NOTICE')]:
            if source.is_file():
                shutil.copy2(source, resources / source.name)
        info = {'CFBundleName': config['name'], 'CFBundleDisplayName': config['name'],
                'CFBundleIdentifier': 'org.arya.native.' + config['id'],
                'CFBundleExecutable': 'NativeHost', 'CFBundlePackageType': 'APPL',
                'CFBundleShortVersionString': VERSION, 'CFBundleVersion': '20000',
                'NSPrincipalClass': 'NSApplication', 'NSHighResolutionCapable': True,
                'LSMinimumSystemVersion': '26.0',
                'NSHumanReadableCopyright': 'Arya native application collection. See bundled notices.'}
        (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        checks = [run(['codesign', '--verify', '--strict', mac / 'arya-worker'])]
        # Sign the outer application only: --deep signing would rewrite the
        # worker signature and invalidate its independently tested byte hash.
        checks.append(run(['codesign', '--force', '--sign', '-', app]))
        checks.append(run(['codesign', '--verify', '--deep', '--strict', app]))
        assert sha(mac / 'arya-worker') == verified['binary_sha256']
        with tempfile.TemporaryDirectory(prefix='arya-release-protocol-') as data:
            checks.append(run([mac / 'NativeHost', '--protocol-check'],
                              env={**os.environ, 'DATA_FILE': str(Path(data) / 'data.json')}))
        result['projects'].append({'project': project.name, 'name': config['name'],
                                   'app': app.name, 'status': 'passed',
                                   'tested_worker_sha256': verified['binary_sha256'],
                                   'packaged_worker_sha256': sha(mac / 'arya-worker'),
                                   'checks': checks, 'bundle_files_sha256': inventory(app)})
        print('PASS ' + config['name'], flush=True)
    (staging / 'README.txt').write_text(
        'Arya native desktop applications ' + VERSION + '\n\n'
        'Six standalone applications for macOS 26 on Apple Silicon.\n'
        'Move an app to Applications or another writable location, then open it.\n'
        'They use per-application local data folders and a single-instance host lock.\n'
        'The rebuilt Arya workers use native atomic filesystem replacement.\n'
        'All bundled workers exactly match the independently tested migration hashes.\n\n'
        'These applications are ad-hoc signed, not Developer ID signed or notarized.\n'
        'macOS Gatekeeper may require an explicit Open action for downloaded apps.\n'
        'Windows and Linux are not supported by these macOS application bundles.\n'
        'Each app contains its usage guide and notices in Contents/Resources.\n')
    (staging / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    staging.rename(PACKAGE)
run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', PACKAGE, ARCHIVE])
# Check the actual distributed ZIP, including executable permissions and seals.
with tempfile.TemporaryDirectory(prefix='desktop-release-extract-', dir=OUTPUT) as extracted:
    run(['ditto', '-x', '-k', ARCHIVE, extracted])
    restored = Path(extracted) / STEM
    for row in result['projects']:
        app = restored / row['app']
        assert inventory(app) == row['bundle_files_sha256']
        assert os.access(app / 'Contents/MacOS/arya-worker', os.X_OK)
        run(['codesign', '--verify', '--deep', '--strict', app])
assert inventory(ROOT / 'dist') == old_bundles, 'Historical bundles were changed'
assert sha(ROOT / 'reports/acceptance.json') == old_acceptance, 'Historical acceptance was changed'
result.update(passed=6, failed=0, archive=str(ARCHIVE.relative_to(REPO)),
              archive_bytes=ARCHIVE.stat().st_size, archive_sha256=sha(ARCHIVE),
              archive_roundtrip_verified=True, historical_dist_and_acceptance_preserved=True)
EVIDENCE.write_text(json.dumps(result, indent=2) + '\n')
(OUTPUT / (STEM + '.sha256')).write_text(result['archive_sha256'] + '  ' + ARCHIVE.name + '\n')
print(json.dumps({k: result[k] for k in ['archive', 'archive_bytes', 'archive_sha256', 'passed', 'failed']}, indent=2))
