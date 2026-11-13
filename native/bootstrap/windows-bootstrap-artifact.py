#!/usr/bin/env python3
"""Preserve/reuse bootstrap bytes; this is never a platform qualification result."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_helpers', ROOT / 'native/bootstrap/release-apps.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
NAME = 'windows-bootstrap-sdk-unqualified'
BUILD_STEP = 'Build native Windows PE toolchain with explicit Cygwin dependency'
CAPTURE_STEP = 'Preserve unqualified Windows bootstrap SDK'


def host():
    return {name: subprocess.check_output(command, text=True).strip() for name, command in
            [('cygwin', ['uname', '-srm']), ('gcc', ['gcc', '--version']), ('g++', ['g++', '--version'])]}


def identity(run, jobs, artifact, run_id, head, artifact_id):
    assert run['repository']['full_name'] == shared.REPOSITORY and run['head_sha'] == head
    assert run['path'] == '.github/workflows/native-desktop-release.yml'
    assert artifact['id'] == artifact_id and artifact['name'] == NAME and not artifact['expired']
    assert artifact['workflow_run']['id'] == run_id and artifact['workflow_run']['head_sha'] == head
    assert re.fullmatch(r'sha256:[0-9a-f]{64}', artifact['digest'])
    selected = [job for job in jobs if job['name'] == 'windows-cygwin']
    assert len(selected) == 1, 'Ambiguous Windows bootstrap job'
    job = selected[0]
    for name in (BUILD_STEP, CAPTURE_STEP):
        steps = [step for step in job['steps'] if step['name'] == name]
        assert len(steps) == 1 and steps[0]['conclusion'] == 'success', 'Original bootstrap/capture did not pass'
    return {'run': run_id, 'headSHA': head, 'runAttempt': run['run_attempt'], 'job': job['id'],
            'jobConclusion': job['conclusion'], 'artifact': artifact,
            'note': 'Bootstrap succeeded; later qualification gates may have failed. All current gates must run again.'}


def verify_payload(payload):
    sdk = payload / 'sdk'
    expected = shared.checksums(sdk / 'SHA256SUMS')
    actual = {p.relative_to(sdk).as_posix() for p in sdk.rglob('*') if p.is_file() and p != sdk / 'SHA256SUMS'}
    assert set(expected) == actual and not any(p.is_symlink() for p in sdk.rglob('*'))
    for name, digest in expected.items():
        assert shared.sha(sdk / name) == digest, 'SDK checksum mismatch: ' + name
    build = dict(line.split(': ', 1) for line in (sdk / 'BUILD-INFO.txt').read_text().splitlines() if ': ' in line)
    assert build['compilerSha256'] == shared.sha(sdk / 'arya.exe')
    assert build['stageTwoThreeCIdentical'] == 'true'
    assert build['generatedCSha256'] == build['stageTwoCSha256'] == shared.sha(payload / 'generated/arya.c')
    assert build['stageTwoCSha256'] == shared.sha(payload / 'generated/stage2.c')
    metadata = json.loads((payload / 'bootstrap.json').read_text())
    assert metadata['qualified'] is False and metadata['kind'] == NAME
    return {'files': len(expected), 'build': build, 'metadata': metadata}


def capture():
    work = ROOT / '.build/windows-bootstrap-capture'
    payload = work / 'payload'; payload.mkdir(parents=True, exist_ok=False)
    subprocess.run(['sh', str(ROOT / 'native/bootstrap/stage-sdk.sh'), str(payload / 'sdk')], check=True)
    generated = payload / 'generated'; generated.mkdir()
    for name in ('arya.c', 'stage2.c'):
        shutil.copy2(ROOT / '.build/independent' / name, generated / name)
    metadata = {'kind': NAME, 'qualified': False, 'repository': os.environ['GITHUB_REPOSITORY'],
                'run': int(os.environ['GITHUB_RUN_ID']), 'headSHA': os.environ['GITHUB_SHA'],
                'runAttempt': int(os.environ['GITHUB_RUN_ATTEMPT']), 'host': host()}
    assert metadata['repository'] == shared.REPOSITORY
    shared.save(payload / 'bootstrap.json', metadata)
    verified = verify_payload(payload)
    archive = work / 'windows-bootstrap-sdk.tar.gz'
    with tarfile.open(archive, 'w:gz') as output:
        output.add(payload, arcname='windows-bootstrap')
    Path(str(archive) + '.sha256').write_text(shared.sha(archive) + '  ' + archive.name + '\n')
    shared.save(ROOT / '.build/release-evidence/windows-bootstrap-capture.json', verified)
    print('Preserved bootstrap bytes for test-only reuse; Windows qualification is still pending.')


def restore(options):
    assert options.run > 0 and options.artifact > 0 and re.fullmatch(r'[0-9a-f]{40}', options.sha)
    work = ROOT / '.build/windows-bootstrap-restore'; work.mkdir(parents=True, exist_ok=False)
    record = identity(shared.api('/actions/runs/' + str(options.run)),
                      shared.api('/actions/runs/' + str(options.run) + '/jobs?per_page=100')['jobs'],
                      shared.api('/actions/artifacts/' + str(options.artifact)),
                      options.run, options.sha, options.artifact)
    archive = work / 'artifact.zip'
    with archive.open('xb') as output:
        subprocess.run(['gh', 'api', f'repos/{shared.REPOSITORY}/actions/artifacts/{options.artifact}/zip'],
                       stdout=output, check=True, timeout=180)
    assert archive.stat().st_size == record['artifact']['size_in_bytes']
    assert 'sha256:' + shared.sha(archive) == record['artifact']['digest'], 'GitHub artifact digest mismatch'
    shared.unpack_zip(archive, work / 'download')
    packed = work / 'download/windows-bootstrap-sdk.tar.gz'
    assert shared.checksums(Path(str(packed) + '.sha256')) == {packed.name: shared.sha(packed)}
    shared.unpack_tar(packed, work / 'extracted')
    payload = work / 'extracted/windows-bootstrap'; sdk = payload / 'sdk'
    verified = verify_payload(payload)
    metadata = verified['metadata']
    assert metadata['repository'] == shared.REPOSITORY and metadata['run'] == options.run
    assert metadata['headSHA'] == options.sha and metadata['runAttempt'] == record['runAttempt']
    assert metadata['host'] == host(), 'Cygwin/compiler versions differ from captured bootstrap'
    source_identity = shared.verify_sources(ROOT, sdk)
    target = ROOT / '.build/independent'
    assert not (target / 'arya.exe').exists(), 'Refuse to replace an existing compiler'
    # Only the early current-source Win32 action probe may have populated lib/.
    existing = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
    assert existing <= {'lib/libarya-gui.a', 'lib/gui-link-flags'}, existing
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sdk / 'arya.exe', target / 'arya.exe')
    for directory in ('lib', 'stdlib'):
        shutil.copytree(sdk / directory, target / directory, dirs_exist_ok=True)
    for name in ('arya.c', 'stage2.c'):
        shutil.copy2(payload / 'generated' / name, target / name)
    shared.save(ROOT / '.build/release-evidence/windows-bootstrap-reuse.json',
                {'origin': record, 'sdk': verified, 'sourceIdentity': source_identity,
                 'checkoutSHA': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                 'qualified': False})
    print('Restored matching immutable bootstrap bytes. Running all current Windows gates is mandatory.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('capture', 'restore'))
    parser.add_argument('--run', type=int)
    parser.add_argument('--sha')
    parser.add_argument('--artifact', type=int)
    options = parser.parse_args()
    assert sys.platform == 'cygwin', 'This controller requires Windows Cygwin'
    (ROOT / '.build/release-evidence').mkdir(parents=True, exist_ok=True)
    if options.mode == 'capture': capture()
    else: restore(options)


if __name__ == '__main__':
    main()
