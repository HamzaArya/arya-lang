#!/usr/bin/env python3
"""Test the current installer around the immutable qualified Linux SDK.

This does not bootstrap a compiler, repeat native qualification, or publish.
GitHub identity and every pinned SDK/build input are verified before execution.
"""
import datetime
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = ROOT / 'docs/verification/2.0.0/sdk-assembly-inputs.json'
EXPECTED_NATIVE_INPUTS = 260
ARTIFACT_NAME = 'native-sdk-ubuntu-24.04'
JOB_NAME = 'unix (ubuntu-24.04)'
spec = importlib.util.spec_from_file_location('release_helpers', ROOT / 'native/bootstrap/release-apps.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


def verify_origin(profile, run, jobs, artifact):
    assert run['id'] == profile['run']
    assert run['repository']['full_name'] == shared.REPOSITORY
    assert run['head_sha'] == profile['sourceCommit']
    assert run['path'] == '.github/workflows/native-desktop-release.yml'
    selected = [job for job in jobs if job['id'] == profile['job'] and job['name'] == JOB_NAME]
    assert len(selected) == 1, 'Qualified Linux job is missing or ambiguous'
    job = selected[0]
    assert job['status'] == 'completed' and job['conclusion'] == 'success', 'Linux qualification did not pass'
    for name in ('Build self-hosted native SDK', 'Core regressions', 'API contracts and byte safety',
                 'Linux native widget state and events', 'Package tested SDK'):
        steps = [step for step in job['steps'] if step['name'] == name]
        assert len(steps) == 1 and steps[0]['conclusion'] == 'success', 'Missing successful qualification step: ' + name
    assert artifact['id'] == profile['artifact'] and artifact['name'] == ARTIFACT_NAME and not artifact['expired']
    assert artifact['workflow_run']['id'] == profile['run']
    assert artifact['workflow_run']['head_sha'] == profile['sourceCommit']
    assert re.fullmatch(r'sha256:[0-9a-f]{64}', artifact['digest'])
    assert isinstance(artifact['size_in_bytes'], int) and 0 < artifact['size_in_bytes'] <= 512 * 1024 * 1024
    return {'run': run, 'job': job, 'artifact': artifact}


def verify_payload(root, sdk, archive, profile):
    assert shared.sha(archive) == profile['archiveSHA256'], 'Wrong qualified Linux archive'
    assert shared.checksums(Path(str(archive) + '.sha256')) == {archive.name: profile['archiveSHA256']}
    assert shared.sha(sdk / 'SHA256SUMS') == profile['inventorySHA256'], 'Wrong qualified SDK inventory'
    identity = shared.verify_sdk(sdk)
    assert shared.sha(sdk / 'arya') == profile['compilerSHA256'], 'Wrong qualified compiler'
    assert shared.sha(sdk / 'install.sh') == profile['installerSHA256'], 'Wrong original installer'
    assert (sdk / 'VERSION').read_text().strip() == (root / 'native/VERSION').read_text().strip() == '2.0.0'
    source = shared.verify_sources(root, sdk)
    assert source['matchedBuildInputs'] == EXPECTED_NATIVE_INPUTS, 'Unexpected qualified native input count'
    return {'sdk': identity, 'sourceIdentity': source}


def command(arguments, name, result, evidence, *, cwd=ROOT, environment=None, binary_output=None, timeout=180):
    arguments = [str(value) for value in arguments]
    output_path = binary_output or evidence / (name + '.stdout.log')
    error_path = evidence / (name + '.stderr.log')
    record = {'command': arguments, 'cwd': str(cwd), 'stdout': str(output_path), 'stderr': str(error_path)}
    result['commands'].append(record)
    print('RUN ' + ' '.join(arguments), flush=True)
    try:
        with output_path.open('wb') as output, error_path.open('wb') as error:
            completed = subprocess.run(arguments, cwd=cwd, env=environment, stdout=output, stderr=error, timeout=timeout)
        record['exitCode'] = completed.returncode
        assert completed.returncode == 0, f'{name} failed; see {output_path} and {error_path}'
    except subprocess.TimeoutExpired:
        record['timedOut'] = True
        raise
    finally:
        shared.save(evidence / 'result.json', result)
    return output_path.read_text() if binary_output is None else None


def main():
    assert sys.platform == 'linux' and platform.machine() == 'x86_64', 'Requires native Linux x64'
    work = ROOT / '.build/linux-installer-requalification'
    work.mkdir(parents=True, exist_ok=False)
    evidence = work / 'evidence'; evidence.mkdir()
    profile = json.loads(PROFILE_PATH.read_text())['linux-x64']
    result = {'status': 'in-progress', 'publication': False, 'compilerBootstrap': False,
              'profile': profile, 'commands': [], 'startedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        result['checkoutSHA'] = command(['git', 'rev-parse', 'HEAD'], 'checkout', result, evidence).strip()
        result['host'] = command(['uname', '-srm'], 'host', result, evidence).strip()
        def api(endpoint, name):
            return json.loads(command(['gh', 'api', f'repos/{shared.REPOSITORY}{endpoint}'], name, result, evidence))
        run = api(f'/actions/runs/{profile["run"]}', 'origin-run')
        jobs = api(f'/actions/runs/{profile["run"]}/jobs?per_page=100', 'origin-jobs')['jobs']
        artifact = api(f'/actions/artifacts/{profile["artifact"]}', 'origin-artifact')
        result['origin'] = verify_origin(profile, run, jobs, artifact)
        download = work / 'qualified-sdk.zip'
        command(['gh', 'api', f'repos/{shared.REPOSITORY}/actions/artifacts/{profile["artifact"]}/zip'],
                'download', result, evidence, binary_output=download)
        assert download.stat().st_size == artifact['size_in_bytes'], 'GitHub artifact size mismatch'
        assert 'sha256:' + shared.sha(download) == artifact['digest'], 'GitHub artifact digest mismatch'
        shared.unpack_zip(download, work / 'download')
        archives = list((work / 'download').rglob('arya-native-2.0.0-linux-x64.tar.gz'))
        assert len(archives) == 1, 'Expected exactly one qualified Linux SDK archive'
        archive = archives[0]
        assert shared.sha(archive) == profile['archiveSHA256'], 'Wrong qualified Linux archive'
        shared.unpack_tar(archive, work / 'extracted')
        sdk = work / 'extracted/arya-native-2.0.0-linux-x64'
        result.update(verify_payload(ROOT, sdk, archive, profile))
        result['installerSHA256'] = shared.sha(ROOT / 'native/bootstrap/install-sdk.sh')
        result['compilerSHA256'] = profile['compilerSHA256']
        shared.save(evidence / 'verified-inputs.json', result)

        # No downloaded executable has run before all the checks above.
        staged = work / 'staged/arya-native-2.0.0-linux-x64'
        command([sys.executable, ROOT / 'docs/verification/2.0.0/reassemble-qualified-sdk.py',
                 '--platform', 'linux-x64', '--sdk', sdk, '--destination', staged],
                'assemble', result, evidence)
        shared.verify_sdk(staged)
        assert shared.sha(staged / 'arya') == profile['compilerSHA256']
        assert shared.sha(staged / 'install.sh') == result['installerSHA256']
        result['assembly'] = json.loads((staged / 'ASSEMBLY-INFO.json').read_text())
        for name in ('ASSEMBLY-INFO.json', 'ASSEMBLY-SOURCE-SHA256SUMS', 'SHA256SUMS',
                     'BUILD-INFO.txt', 'SOURCE-SHA256SUMS'):
            shutil.copy2(staged / name, evidence / name)
        environment = {key: value for key, value in os.environ.items()
                       if key not in ('GH_TOKEN', 'GITHUB_TOKEN', 'ARYA_NATIVE_LIBDIR', 'ARYA_C_COMPILER', 'ARYA_NATIVE_BIN')}
        prefix = work / "installed SDK's directory"
        install_environment = {key: value for key, value in environment.items() if key != 'HOME'}
        command(['sh', staged / 'install.sh', staged, '--prefix', prefix], 'install', result, evidence,
                environment=install_environment)
        installed = prefix / 'lib/arya/2.0.0-linux-x64'
        shared.verify_sdk(installed)
        assert shared.sha(installed / 'arya') == profile['compilerSHA256']
        assert shared.sha(installed / 'install.sh') == result['installerSHA256']
        launcher = prefix / 'bin/arya'
        assert launcher.resolve() == installed / 'arya'
        version = command([launcher, '--version'], 'installed-version', result, evidence, environment=environment).strip()
        assert version == 'Arya native 2.0.0 (self-hosted)', version
        project = work / "new CLI project's directory"
        command([launcher, 'create', project, '--template', 'cli'], 'create', result, evidence, environment=environment)
        command([launcher, 'check', project / 'main.arya'], 'check', result, evidence, environment=environment)
        executable = work / 'installed CLI application'
        cc = shutil.which('cc'); assert cc, 'A C compiler is required for the application build'
        command([launcher, 'build', project / 'main.arya', '--cc', cc, '-o', executable, '--release'],
                'build', result, evidence, environment=environment)
        for name, arguments, expected in (
                ('run', ['19.95', '3'], 'Total: 59.85\n'),
                ('run-large-decimal', ['9007199254740993.01', '3'], 'Total: 27021597764222979.03\n')):
            actual = command([executable, *arguments], name, result, evidence, environment=environment)
            assert actual == expected, (actual, expected)
        assert shared.sha(ROOT / 'native/bootstrap/install-sdk.sh') == result['installerSHA256']
        assert shared.verify_sources(ROOT, sdk) == result['sourceIdentity']
        result.update(status='passed', applicationSHA256=shared.sha(executable),
                      applicationSourceSHA256=shared.sha(project / 'main.arya'),
                      note='Only the current installer and an installed CLI workflow were requalified. '
                           'Native compiler/runtime/GUI qualification remains the separately identified original Linux job.')
    except Exception as error:
        result.update(status='failed', error=str(error))
        raise
    finally:
        shared.save(evidence / 'result.json', result)
    print(json.dumps({'status': result['status'], 'compilerSHA256': result['compilerSHA256'],
                      'installerSHA256': result['installerSHA256'], 'matchedBuildInputs': EXPECTED_NATIVE_INPUTS}, indent=2))


if __name__ == '__main__':
    main()
