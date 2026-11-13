#!/usr/bin/env python3
"""Archive six rebuilt desktop bundles, preserving earlier bundles and archives."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(directory):
    return {str(p.relative_to(directory)): sha(p)
            for p in sorted(directory.rglob('*')) if p.is_file()}


def run(command):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, (command, result.stdout, result.stderr)
    return {'command': [str(x) for x in command], 'exit_code': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-report', type=Path, required=True)
    parser.add_argument('--historical-inventory', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True, help='New evidence path; existing reports are preserved')
    options = parser.parse_args()
    build_report = options.build_report.resolve()
    verified = json.loads(build_report.read_text())
    assert verified['passed'] == 6 and verified['failed'] == 0
    assert verified['mode'] == 'check-build-test-package'
    version = verified['app_version']
    stem = 'arya-native-desktop-apps-' + version + '-darwin-arm64'
    package = Path(verified['output']).resolve()
    assert package.name == stem, 'Use the versioned output directory for release bundles'
    archive = package.parent / (stem + '.zip')
    evidence_path = options.evidence.resolve()
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    checksum = package.parent / (stem + '.zip.sha256')
    for output in (archive, evidence_path, checksum):
        assert not output.exists() and not output.is_symlink(), 'Preserve previous release evidence and archives'
    assert len(verified['projects']) == 6
    assert {row['path'] for row in verified['projects']} == {path.name for path in ROOT.glob('0*-*') if path.is_dir()}
    assert sha(ROOT / 'shared/NativeHost.m') == verified['host_source_sha256']
    baseline = json.loads(options.historical_inventory.read_text())
    assert inventory(ROOT / 'dist') == baseline['dist']
    for name, digest in baseline['preserved_files'].items():
        assert sha(Path(name)) == digest
    result = {'version': version, 'platform': 'macOS 26 ARM64',
              'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'signing': 'ad-hoc; not Developer ID signed or notarized',
              'build_report': os.path.relpath(build_report, ROOT),
              'build_report_sha256': sha(build_report),
              'compiler_version': verified['compiler_version'],
              'compiler_sha256': verified['compiler_sha256'], 'projects': []}
    for row in verified['projects']:
        assert row['status'] == 'passed'
        app = (ROOT / row['app']).resolve()
        assert app.parent == package
        with (app / 'Contents/Info.plist').open('rb') as handle:
            info = plistlib.load(handle)
        assert info['CFBundleShortVersionString'] == version
        assert sha(app / 'Contents/MacOS/arya-worker') == row['worker_sha256'] == row['tested_worker_sha256']
        for name, digest in row['inputs_sha256'].items():
            assert sha(ROOT / row['path'] / name) == digest, 'Project input changed since verification'
        assert sha(app / 'Contents/MacOS/NativeHost') == row['host_sha256']
        run(['codesign', '--verify', '--deep', '--strict', app])
        result['projects'].append({'project': row['path'], 'app': app.name,
                                   'status': 'passed', 'worker_sha256': row['worker_sha256'],
                                   'host_sha256': row['host_sha256'],
                                   'bundle_files_sha256': inventory(app)})
    (package / 'README.txt').write_text(
        'Arya native desktop applications ' + version + '\n\n'
        'Six standalone AppKit applications for macOS 26 on Apple Silicon.\n'
        'Study Desk, Stockroom, Harbor Support Desk, Project Studio, Incident Center\n'
        'and Ledger Studio contain compiled Arya workers. No Arya, Node.js or Python\n'
        'installation is needed to run them. Each app includes its usage guide and\n'
        'work report in Contents/Resources. Move an app to Applications or another\n'
        'writable location, then open it.\n\n'
        'All six workers were rebuilt and smoke-tested with Arya ' + version + '.\n'
        'Packaged workers exactly match the tested bytes and use native atomic saves.\n'
        'The apps use separate local stores and a single-instance host lock.\n'
        'These applications are ad-hoc signed, not Developer ID signed or notarized.\n'
        'macOS Gatekeeper may require an explicit Open action for downloaded apps.\n'
        'These macOS bundles do not run on Windows or Linux.\n')
    (package / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', package, archive])
    with tempfile.TemporaryDirectory(prefix='desktop-release-extract-', dir=package.parent) as temp:
        run(['ditto', '-x', '-k', archive, temp])
        restored = Path(temp) / stem
        for row in result['projects']:
            app = restored / row['app']
            assert inventory(app) == row['bundle_files_sha256']
            assert os.access(app / 'Contents/MacOS/arya-worker', os.X_OK)
            run(['codesign', '--verify', '--deep', '--strict', app])
    assert inventory(ROOT / 'dist') == baseline['dist'], 'Historical desktop bundles changed'
    for name, digest in baseline['preserved_files'].items():
        assert sha(Path(name)) == digest, 'Historical archive or report changed'
    result.update(passed=6, failed=0, archive=os.path.relpath(archive, REPO),
                  archive_bytes=archive.stat().st_size, archive_sha256=sha(archive),
                  archive_roundtrip_verified=True, historical_bundles_and_archives_preserved=True)
    evidence_path.write_text(json.dumps(result, indent=2) + '\n')
    checksum.write_text(result['archive_sha256'] + '  ' + archive.name + '\n')
    print(json.dumps({key: result[key] for key in ('archive', 'archive_bytes', 'archive_sha256', 'passed', 'failed')}, indent=2))


if __name__ == '__main__':
    main()
