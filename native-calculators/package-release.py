#!/usr/bin/env python3
"""Archive six verified calculator bundles and verify their extracted signatures."""
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
    parser.add_argument('--evidence-output', type=Path,
                        help='Distinct evidence path when preserving an earlier preparation archive')
    options = parser.parse_args()
    build_report = options.build_report.resolve()
    verified = json.loads(build_report.read_text())
    assert verified['passed'] == 6 and verified['failed'] == 0
    assert verified['mode'] == 'check-build-test-package'
    version = verified['app_version']
    stem = 'arya-native-calculators-' + version + '-darwin-arm64'
    package = Path(verified['output']).resolve()
    assert package.name == stem, 'Use the versioned output directory for release bundles'
    archive = package.parent / (stem + '.zip')
    evidence_path = (options.evidence_output.resolve() if options.evidence_output else
                     ROOT / 'reports' / ('release-' + version + '-bundles.json'))
    assert not archive.exists() and not evidence_path.exists(), 'Preserve previous release evidence and archives'
    baseline = json.loads(options.historical_inventory.read_text())
    assert inventory(ROOT / 'dist') == baseline['dist']
    for name, digest in baseline['archives'].items():
        assert sha(ROOT / name) == digest
    result = {'version': version, 'platform': 'macOS 26 ARM64',
              'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'signing': 'ad-hoc; not Developer ID signed or notarized',
              'build_report': os.path.relpath(build_report, ROOT),
              'build_report_sha256': sha(build_report),
              'compiler_version': verified['compiler_version'],
              'compiler_command': verified.get('compiler_command'),
              'compiler_command_sha256': verified.get('compiler_command_sha256', verified.get('compiler_sha256')),
              'projects': []}
    for row in verified['projects']:
        assert row['status'] == 'passed'
        for filename, digest in row['inputs_sha256'].items():
            assert sha(ROOT / row['path'] / filename) == digest, 'Source changed after calculator verification'
        app = (ROOT / row['app']).resolve()
        assert app.parent == package
        with (app / 'Contents/Info.plist').open('rb') as handle:
            info = plistlib.load(handle)
        assert info['CFBundleShortVersionString'] == version
        assert sha(app / 'Contents/MacOS/arya-worker') == row['worker_sha256']
        assert sha(app / 'Contents/MacOS/NativeHost') == row['host_sha256']
        run(['codesign', '--verify', '--deep', '--strict', app])
        result['projects'].append({'project': row['path'], 'app': app.name,
                                   'status': 'passed', 'worker_sha256': row['worker_sha256'],
                                   'host_sha256': row['host_sha256'],
                                   'bundle_files_sha256': inventory(app)})
    (package / 'README.txt').write_text(
        'Arya native calculators ' + version + '\n\n'
        'Six standalone AppKit applications for macOS 26 on Apple Silicon.\n'
        'Pocket, Everyday, Scientific, Programmer, Finance, and Precision calculators\n'
        'contain compiled Arya workers; no Arya, Node.js, or Python installation is needed.\n'
        'Each app includes its usage guide in Contents/Resources/README.md.\n'
        'Move an app to Applications or another writable location, then open it.\n\n'
        'All six workers were rebuilt and smoke-tested with Arya ' + version + '.\n'
        'Programmer uses native validated UInt32 bitwise functions.\n'
        'Finance and Precision use exact native decimal remainder for fraction reduction.\n'
        'These applications are ad-hoc signed, not Developer ID signed or notarized.\n'
        'macOS Gatekeeper may require an explicit Open action for downloaded apps.\n'
        'These macOS bundles do not run on Windows or Linux.\n')
    (package / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', package, archive])
    with tempfile.TemporaryDirectory(prefix='calculator-release-extract-', dir=package.parent) as temp:
        run(['ditto', '-x', '-k', archive, temp])
        restored = Path(temp) / stem
        for row in result['projects']:
            app = restored / row['app']
            assert inventory(app) == row['bundle_files_sha256']
            assert os.access(app / 'Contents/MacOS/arya-worker', os.X_OK)
            run(['codesign', '--verify', '--deep', '--strict', app])
    assert inventory(ROOT / 'dist') == baseline['dist'], 'Historical calculator bundles changed'
    for name, digest in baseline['archives'].items():
        assert sha(ROOT / name) == digest, 'Historical calculator archive changed'
    result.update(passed=6, failed=0, archive=os.path.relpath(archive, REPO),
                  archive_bytes=archive.stat().st_size, archive_sha256=sha(archive),
                  archive_roundtrip_verified=True, historical_bundles_and_archives_preserved=True)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(result, indent=2) + '\n')
    (package.parent / (stem + '.sha256')).write_text(result['archive_sha256'] + '  ' + archive.name + '\n')
    print(json.dumps({key: result[key] for key in ('archive', 'archive_bytes', 'archive_sha256', 'passed', 'failed')}, indent=2))


if __name__ == '__main__':
    main()
