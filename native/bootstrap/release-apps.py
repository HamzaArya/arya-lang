#!/usr/bin/env python3
"""Build twelve AppKit apps using an independently qualified, immutable native SDK.

This optional release controller requires Python and GitHub CLI. It never builds
the compiler and never publishes a release or changes platform qualification.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = 'HamzaArya/arya-lang'
ARTIFACT_NAME = 'native-sdk-macos-15'
JOB_NAME = 'unix (macos-15)'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def safe_name(name):
    parts = PurePosixPath(name).parts
    assert name and '\\' not in name and not name.startswith('/')
    assert parts and '..' not in parts and ':' not in parts[0]
    return Path(*parts)


def unpack_zip(archive, destination):
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        assert len(entries) <= 32 and sum(item.file_size for item in entries) <= 512 * 1024 * 1024
        seen = set()
        for item in entries:
            name = safe_name(item.filename)
            assert name not in seen and not stat.S_ISLNK(item.external_attr >> 16)
            seen.add(name)
        for item in entries:
            target = destination / safe_name(item.filename)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(item) as incoming, target.open('xb') as outgoing:
                    shutil.copyfileobj(incoming, outgoing)


def unpack_tar(archive, destination):
    with tarfile.open(archive, 'r:gz') as source:
        entries = source.getmembers()
        assert len(entries) <= 50000 and sum(item.size for item in entries) <= 1024 * 1024 * 1024
        seen = set()
        for item in entries:
            name = safe_name(item.name)
            assert name not in seen and (item.isfile() or item.isdir()), 'SDK links and special files are rejected'
            seen.add(name)
        for item in entries:
            target = destination / safe_name(item.name)
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(item) as incoming, target.open('xb') as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
                target.chmod(item.mode & 0o777)


def checksums(path):
    values = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        assert match, 'Invalid checksum row'
        name = safe_name(match[2]).as_posix()
        assert name not in values, 'Duplicate checksum path'
        values[name] = match[1]
    assert values, 'Empty checksum inventory'
    return values


def verify_sdk(sdk, executable='arya'):
    assert executable in ('arya', 'arya.exe'), 'Unsupported SDK executable name'
    expected = checksums(sdk / 'SHA256SUMS')
    actual = {p.relative_to(sdk).as_posix() for p in sdk.rglob('*') if p.is_file() and p != sdk / 'SHA256SUMS'}
    assert not any(p.is_symlink() for p in sdk.rglob('*'))
    assert set(expected) == actual, 'SDK checksum coverage differs from actual files'
    for name, digest in expected.items():
        assert sha(sdk / name) == digest, 'SDK checksum mismatch: ' + name
    build = dict(line.split(': ', 1) for line in (sdk / 'BUILD-INFO.txt').read_text().splitlines() if ': ' in line)
    for key in ('compilerSha256', 'generatedCSha256', 'stageTwoCSha256'):
        assert re.fullmatch(r'[0-9a-f]{64}', build[key]), 'Invalid SDK build identity: ' + key
    assert executable in expected, 'SDK executable is missing from checksum inventory: ' + executable
    assert build['compilerSha256'] == sha(sdk / executable)
    assert build['stageTwoThreeCIdentical'] == 'true'
    assert build['generatedCSha256'] == build['stageTwoCSha256']
    return {'fileCount': len(actual), 'checksumInventorySHA256': sha(sdk / 'SHA256SUMS'),
            'executable': executable, 'build': build}


def compiler_input(name):
    # These are source inputs to native/bootstrap/Makefile build rules, rather
    # than tests, packaging controllers, documentation or application sources.
    if name in ('Makefile', 'native/VERSION', 'native/THIRD-PARTY-NOTICES.txt'):
        return True
    if name.startswith(('native/compiler/', 'native/runtime/', 'native/libraries/', 'native/vendor/', 'native/python/')):
        return not name.endswith('.pyc') and '/__pycache__/' not in name
    if name.startswith('native/desktop/') and name.endswith('.m'):
        return True
    if name in {'native/gui/' + file for file in ('build.sh', 'appkit.m', 'gtk.c', 'win32.c', 'common.h')}:
        return True
    return name in {'native/bootstrap/' + file for file in
                    ('seed.c', 'embed.c', 'bytes.c', 'rebase.c', 'unicode.c', 'cc.sh', 'crypto-sdk.sh', 'regex-sdk.sh')}


def verify_sources(root, sdk):
    recorded = checksums(sdk / 'SOURCE-SHA256SUMS')
    directories = ('native/compiler', 'native/runtime', 'native/libraries', 'native/bootstrap',
                   'native/tests', 'native/vendor', 'native/python', 'native/desktop', 'native/gui', 'bin')
    current = {file.relative_to(root).as_posix(): file for directory in directories
               for file in (root / directory).rglob('*')
               if file.is_file() and file.suffix != '.pyc' and '__pycache__' not in file.parts}
    for name in ('Makefile', 'LICENSE', 'NOTICE', 'native/VERSION', 'native/manifest.json',
                 'native/PROVENANCE.json', 'native/THIRD-PARTY-NOTICES.txt', 'native/DOCUMENTATION'):
        if (root / name).is_file():
            current[name] = root / name
    expected_inputs = {name for name in recorded if compiler_input(name)}
    actual_inputs = {name for name in current if compiler_input(name)}
    assert expected_inputs == actual_inputs, 'Native build-input inventory differs from qualified SDK'
    assert expected_inputs, 'No native build inputs recorded'
    for name in sorted(expected_inputs):
        assert sha(current[name]) == recorded[name], 'Qualified native build input changed: ' + name
    differences = []
    for name, digest in recorded.items():
        file = root / name
        actual = sha(file) if file.is_file() else None
        if actual != digest:
            assert not compiler_input(name)
            differences.append({'path': name, 'qualifiedSHA256': digest, 'checkoutSHA256': actual})
    for name in sorted(set(current) - set(recorded)):
        assert not compiler_input(name)
        differences.append({'path': name, 'qualifiedSHA256': None, 'checkoutSHA256': sha(current[name])})
    return {'matchedBuildInputs': len(expected_inputs), 'sourceInventorySHA256': sha(sdk / 'SOURCE-SHA256SUMS'),
            'nonBuildInputDifferences': differences,
            'note': 'Tests, documentation and packaging metadata may differ; every selected compiler, runtime, library, vendor and native backend build input matches.'}


def api(endpoint):
    result = subprocess.run(['gh', 'api', 'repos/' + REPOSITORY + endpoint], capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def qualified_artifact(run_id, expected_sha, wait_seconds):
    deadline = time.monotonic() + wait_seconds
    while True:
        run = api('/actions/runs/' + str(run_id))
        assert run['head_sha'] == expected_sha and run['repository']['full_name'] == REPOSITORY
        assert run['path'] == '.github/workflows/native-desktop-release.yml'
        jobs = api('/actions/runs/' + str(run_id) + '/jobs?per_page=100')['jobs']
        matches = [job for job in jobs if job['name'] == JOB_NAME]
        assert len(matches) <= 1, 'Ambiguous macOS qualification job'
        job = matches[0] if matches else None
        if job and job['status'] == 'completed':
            assert job['conclusion'] == 'success', 'macOS qualification failed: ' + str(job['conclusion'])
            artifacts = api('/actions/runs/' + str(run_id) + '/artifacts?per_page=100')['artifacts']
            found = [item for item in artifacts if item['name'] == ARTIFACT_NAME and not item['expired']]
            if found:
                assert len(found) == 1, 'Ambiguous SDK artifact'
                artifact = found[0]
                assert artifact['workflow_run']['head_sha'] == expected_sha
                assert artifact['workflow_run']['id'] == run_id
                assert re.fullmatch(r'sha256:[0-9a-f]{64}', artifact['digest'])
                return {'run': run_id, 'headSHA': expected_sha, 'job': job['id'], 'jobName': job['name'],
                        'jobConclusion': job['conclusion'], 'runURL': run['html_url'], 'artifact': artifact}
        assert time.monotonic() < deadline, 'Timed out waiting for the qualified macOS SDK'
        if run['status'] == 'completed' and not (job and job['conclusion'] == 'success'):
            raise AssertionError('Qualification run completed without a successful macOS job')
        print('Waiting for successful macOS qualification and SDK artifact...', flush=True)
        time.sleep(min(30, max(0, deadline - time.monotonic())))


def command(arguments, log, environment=None, timeout=1200):
    print('RUN ' + ' '.join(str(value) for value in arguments), flush=True)
    with log.open('w') as output:
        result = subprocess.run([str(value) for value in arguments], cwd=ROOT, env=environment,
                                stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    assert result.returncode == 0, f'Command failed ({result.returncode}); {log}\n' + log.read_text()[-5000:]


def inventory(directory):
    return {str(file.relative_to(directory)): sha(file) for file in sorted(directory.rglob('*')) if file.is_file()}


def build_family(family, compiler, final, evidence, environment):
    directory = ROOT / family
    version = (compiler.parent / 'VERSION').read_text().strip()
    desktop = family == 'native-desktop-projects'
    stem = ('arya-native-desktop-apps-' if desktop else 'arya-native-calculators-') + version + '-darwin-arm64'
    preserved = list(directory.glob('*.zip')) + list(directory.glob('*.zip.sha256'))
    preserved += [file for file in (directory / 'reports').glob('release-*-bundles.json')]
    if (directory / 'reports/acceptance.json').is_file():
        preserved.append(directory / 'reports/acceptance.json')
    baseline = {'dist': inventory(directory / 'dist')}
    if desktop:
        baseline['preserved_files'] = {str(file): sha(file) for file in preserved}
    else:
        baseline['archives'] = {str(file.relative_to(directory)): sha(file) for file in preserved}
    baseline_path = evidence / (family + '-historical-inventory.json')
    save(baseline_path, baseline)
    before = set((directory / 'reports').glob('*/results.json'))
    previous_logs = {folder for folder in (directory / 'reports').iterdir() if folder.is_dir()}
    try:
        command([sys.executable, directory / 'build.py', '--compiler', compiler, '--output', final / stem,
                 '--app-version', version], evidence / (family + '-build.log'), environment)
    finally:
        # Retain detailed compiler/smoke/protocol failure logs as well as passes.
        for folder in {item for item in (directory / 'reports').iterdir() if item.is_dir()} - previous_logs:
            shutil.copytree(folder, evidence / (family + '-build-evidence') / folder.name)
    reports = set((directory / 'reports').glob('*/results.json')) - before
    assert len(reports) == 1, 'Expected exactly one new application build report'
    report_path = reports.pop()
    report = json.loads(report_path.read_text())
    assert report['passed'] == 6 and report['failed'] == 0
    assert report['compiler_command'] == str(compiler) and report['compiler_command_sha256'] == sha(compiler)
    for row in report['projects']:
        assert row['status'] == 'passed'
        app = (directory / row['app']).resolve()
        with (app / 'Contents/Info.plist').open('rb') as source:
            metadata = plistlib.load(source)
        assert metadata['LSMinimumSystemVersion'] == '26.0'
        assert metadata['CFBundleShortVersionString'] == version
        for name in ('NativeHost', 'arya-worker'):
            assert 'arm64' in subprocess.check_output(['file', '-b', app / 'Contents/MacOS' / name], text=True)
    package_evidence = evidence / (family + '-bundles.json')
    command([sys.executable, directory / 'package-release.py', '--build-report', report_path,
             '--historical-inventory', baseline_path,
             '--evidence' if desktop else '--evidence-output', package_evidence],
            evidence / (family + '-package.log'), environment)
    package = json.loads(package_evidence.read_text())
    assert package['passed'] == 6 and package['failed'] == 0 and package['archive_roundtrip_verified']
    return {'family': family, 'buildReport': str(report_path.relative_to(ROOT)),
            'archive': package['archive'], 'archiveSHA256': package['archive_sha256'],
            'archiveBytes': package['archive_bytes'], 'passed': 6,
            'compilerCommandSHA256': report['compiler_command_sha256']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qualification-run', type=int, required=True)
    parser.add_argument('--qualification-sha', required=True)
    parser.add_argument('--wait-seconds', type=int, default=3600)
    options = parser.parse_args()
    assert options.qualification_run > 0 and re.fullmatch(r'[0-9a-f]{40}', options.qualification_sha)
    assert 0 <= options.wait_seconds <= 3600
    assert sys.platform == 'darwin' and platform.machine() == 'arm64', 'Release applications require a native ARM64 Mac'
    work = ROOT / '.build/native-app-release'
    work.mkdir(parents=True, exist_ok=False)
    evidence = work / 'evidence'; evidence.mkdir()
    result = {'status': 'in-progress', 'publication': False, 'families': [],
              'checkoutSHA': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'startedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        qualification = qualified_artifact(options.qualification_run, options.qualification_sha, options.wait_seconds)
        result['qualification'] = qualification
        save(evidence / 'qualification.json', qualification)
        artifact = qualification['artifact']
        download = work / 'sdk-artifact.zip'
        with download.open('xb') as output:
            fetched = subprocess.run(['gh', 'api', f'repos/{REPOSITORY}/actions/artifacts/{artifact["id"]}/zip'],
                                     stdout=output, stderr=subprocess.PIPE, text=False, timeout=180)
        assert fetched.returncode == 0, fetched.stderr.decode(errors='replace')
        assert download.stat().st_size == artifact['size_in_bytes']
        assert 'sha256:' + sha(download) == artifact['digest'], 'GitHub artifact digest mismatch'
        unpack_zip(download, work / 'download')
        archives = list((work / 'download').rglob('arya-native-*-darwin-arm64.tar.gz'))
        assert len(archives) == 1
        archive = archives[0]
        assert checksums(Path(str(archive) + '.sha256')) == {archive.name: sha(archive)}
        unpack_tar(archive, work / 'extracted')
        sdk = work / 'extracted' / archive.name.removesuffix('.tar.gz')
        result['sdk'] = verify_sdk(sdk)
        result['sourceIdentity'] = verify_sources(ROOT, sdk)
        version = (sdk / 'VERSION').read_text().strip()
        assert version == (ROOT / 'native/VERSION').read_text().strip() == '2.0.0'
        compiler = (sdk / 'arya').resolve()
        result['sdk']['archiveSHA256'] = sha(archive)
        result['sdk']['compilerSHA256'] = sha(compiler)
        result['sdk']['architecture'] = subprocess.check_output(['file', '-b', compiler], text=True).strip()
        assert 'arm64' in result['sdk']['architecture']
        result['sdk']['loadCommands'] = subprocess.check_output(['xcrun', 'vtool', '-show-build', compiler], text=True)
        result['sdk']['version'] = subprocess.check_output([compiler, '--version'], text=True).strip()
        assert result['sdk']['version'] == 'Arya native 2.0.0 (self-hosted)'
        result['host'] = subprocess.check_output(['sw_vers'], text=True)
        save(evidence / 'sdk-identity.json', {'sdk': result['sdk'], 'sourceIdentity': result['sourceIdentity']})
        final = ROOT / '.build/release-2.0.0/final'
        final.mkdir(parents=True, exist_ok=False)
        environment = {key: value for key, value in os.environ.items() if key not in ('GH_TOKEN', 'GITHUB_TOKEN')}
        environment.update(ARYA_NATIVE_LIBDIR=str(sdk / 'lib'), ARYA_C_COMPILER='cc')
        for family in ('native-desktop-projects', 'native-calculators'):
            result['families'].append(build_family(family, compiler, final, evidence, environment))
            save(evidence / 'release-apps.json', result)
        result.update(status='passed', applications=12, platform='macOS 26+ ARM64 application bundles',
                      signing='ad-hoc; not Developer ID signed or notarized',
                      note='Automated engine, host/worker protocol and extracted-signature checks. This job does not claim manual GUI interaction or publish a release.')
    except Exception as error:
        result.update(status='failed', error=str(error))
        raise
    finally:
        save(evidence / 'release-apps.json', result)
    print(json.dumps({'status': result['status'], 'applications': result['applications'], 'families': result['families']}, indent=2))


if __name__ == '__main__':
    main()
