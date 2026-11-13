"""Installer requalification trust-boundary fixtures; no native compiler/network."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('linux_installer', ROOT / 'native/bootstrap/requalify-linux-installer.py')
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)
shared = controller.shared


def write(root, name, text):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def checksums(root, names, destination):
    destination.write_text(''.join(f'{shared.sha(root / name)} *{name}\n' for name in sorted(names)))


class LinuxInstallerBoundaries(unittest.TestCase):
    def test_immutable_successful_linux_origin_required(self):
        profile = {'sourceCommit': 'a' * 40, 'run': 1, 'job': 2, 'artifact': 3}
        run = {'id': 1, 'repository': {'full_name': shared.REPOSITORY}, 'head_sha': 'a' * 40,
               'path': '.github/workflows/native-desktop-release.yml'}
        names = ['Build self-hosted native SDK', 'Core regressions', 'API contracts and byte safety',
                 'Linux native widget state and events', 'Package tested SDK']
        job = {'id': 2, 'name': controller.JOB_NAME, 'status': 'completed', 'conclusion': 'success',
               'steps': [{'name': name, 'conclusion': 'success'} for name in names]}
        artifact = {'id': 3, 'name': controller.ARTIFACT_NAME, 'expired': False,
                    'workflow_run': {'id': 1, 'head_sha': 'a' * 40}, 'digest': 'sha256:' + 'b' * 64,
                    'size_in_bytes': 123}
        self.assertEqual(controller.verify_origin(profile, run, [job], artifact)['job']['id'], 2)
        cases = [
            ({**run, 'id': 4}, job, artifact),
            ({**run, 'head_sha': 'c' * 40}, job, artifact),
            ({**run, 'repository': {'full_name': 'other/repository'}}, job, artifact),
            ({**run, 'path': '.github/workflows/unrelated.yml'}, job, artifact),
            (run, {**job, 'id': 4}, artifact),
            (run, {**job, 'conclusion': 'failure'}, artifact),
            (run, {**job, 'status': 'in_progress'}, artifact),
            (run, {**job, 'steps': job['steps'][:-1]}, artifact),
            (run, job, {**artifact, 'id': 4}),
            (run, job, {**artifact, 'expired': True}),
            (run, job, {**artifact, 'name': 'unqualified-bootstrap'}),
            (run, job, {**artifact, 'workflow_run': {'id': 4, 'head_sha': 'a' * 40}}),
            (run, job, {**artifact, 'digest': 'sha256:not-a-digest'}),
        ]
        failed_step = copy.deepcopy(job); failed_step['steps'][1]['conclusion'] = 'skipped'
        cases.append((run, failed_step, artifact))
        for index, values in enumerate(cases):
            with self.subTest(case=index), self.assertRaises(AssertionError):
                controller.verify_origin(profile, values[0], [values[1]], values[2])

    def test_all_260_native_inputs_and_separate_sdk_pins_are_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); root = base / 'checkout'; sdk = base / 'sdk'
            sources = {'Makefile': 'fixture rules', 'native/VERSION': '2.0.0',
                       'native/THIRD-PARTY-NOTICES.txt': 'notices', 'native/runtime/core.c': 'runtime'}
            sources.update({f'native/compiler/input-{i:03}.arya': f'input {i}' for i in range(256)})
            for name, value in sources.items(): write(root, name, value)
            compiler = write(sdk, 'arya', 'fixture compiler; never executed')
            installer = write(sdk, 'install.sh', 'fixture installer; never executed')
            write(sdk, 'VERSION', '2.0.0')
            write(sdk, 'lib/runtime.a', 'fixture library')
            write(sdk, 'stdlib/web.arya', 'fixture library source')
            write(sdk, 'BUILD-INFO.txt', 'compilerSha256: ' + shared.sha(compiler) +
                  '\nstageTwoThreeCIdentical: true\ngeneratedCSha256: ' + 'c' * 64 +
                  '\nstageTwoCSha256: ' + 'c' * 64 + '\n')
            checksums(root, sources, sdk / 'SOURCE-SHA256SUMS')
            checksums(sdk, [p.relative_to(sdk).as_posix() for p in sdk.rglob('*') if p.is_file()], sdk / 'SHA256SUMS')
            archive = write(base, 'sdk.tar.gz', 'fixture archive; never extracted')
            checksums(base, [archive.name], Path(str(archive) + '.sha256'))
            profile = {'archiveSHA256': shared.sha(archive), 'inventorySHA256': shared.sha(sdk / 'SHA256SUMS'),
                       'compilerSHA256': shared.sha(compiler), 'installerSHA256': shared.sha(installer)}
            self.assertEqual(controller.verify_payload(root, sdk, archive, profile)['sourceIdentity']['matchedBuildInputs'], 260)
            for key in profile:
                with self.subTest(pin=key), self.assertRaises(AssertionError):
                    controller.verify_payload(root, sdk, archive, {**profile, key: 'd' * 64})
            write(root, 'native/runtime/core.c', 'different runtime')
            with self.assertRaisesRegex(AssertionError, 'Qualified native build input changed'):
                controller.verify_payload(root, sdk, archive, profile)
            write(root, 'native/runtime/core.c', 'runtime')
            write(root, 'native/compiler/unqualified.arya', 'extra source')
            with self.assertRaisesRegex(AssertionError, 'Native build-input inventory differs'):
                controller.verify_payload(root, sdk, archive, profile)
            (root / 'native/compiler/unqualified.arya').unlink()
            write(sdk, 'lib/runtime.a', 'corrupted runtime bytes')
            with self.assertRaisesRegex(AssertionError, 'SDK checksum mismatch'):
                controller.verify_payload(root, sdk, archive, profile)

    def test_command_evidence_preserves_stdout_stderr_and_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary); result = {'commands': []}
            with contextlib.redirect_stdout(io.StringIO()):
                output = controller.command([sys.executable, '-c', 'print("fixture output")'], 'pass',
                                            result, evidence, cwd=evidence)
                self.assertEqual(output, 'fixture output\n')
                with self.assertRaisesRegex(AssertionError, 'failure failed'):
                    controller.command([sys.executable, '-c', 'import sys; print("failed", file=sys.stderr); sys.exit(3)'],
                                       'failure', result, evidence, cwd=evidence)
            retained = json.loads((evidence / 'result.json').read_text())
            self.assertEqual([row['exitCode'] for row in retained['commands']], [0, 3])
            self.assertEqual((evidence / 'failure.stderr.log').read_text(), 'failed\n')


if __name__ == '__main__':
    unittest.main()
