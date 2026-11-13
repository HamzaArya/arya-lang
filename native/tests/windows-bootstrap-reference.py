"""Reject mismatched bootstrap identities without running a compiler or network."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('windows_bootstrap', ROOT / 'native/bootstrap/windows-bootstrap-artifact.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapBoundaries(unittest.TestCase):
    def records(self):
        head = 'a' * 40
        run = {'repository': {'full_name': bootstrap.shared.REPOSITORY}, 'head_sha': head,
               'path': '.github/workflows/native-desktop-release.yml', 'run_attempt': 1}
        jobs = [{'name': 'windows-cygwin', 'id': 2, 'conclusion': 'failure', 'steps': [
            {'name': bootstrap.BUILD_STEP, 'conclusion': 'success'},
            {'name': bootstrap.CAPTURE_STEP, 'conclusion': 'success'},
            {'name': 'Core and Win32 widget checks', 'conclusion': 'failure'}]}]
        artifact = {'id': 3, 'name': bootstrap.NAME, 'expired': False,
                    'workflow_run': {'id': 1, 'head_sha': head}, 'digest': 'sha256:' + 'b' * 64}
        return run, jobs, artifact, head

    def test_bootstrap_success_is_reusable_but_not_qualification(self):
        run, jobs, artifact, head = self.records()
        result = bootstrap.identity(run, jobs, artifact, 1, head, 3)
        self.assertEqual(result['jobConclusion'], 'failure')
        self.assertIn('All current gates must run again', result['note'])

    def test_wrong_run_head_artifact_or_failed_bootstrap_rejected(self):
        run, jobs, artifact, head = self.records()
        corruptions = [
            lambda r, j, a: r.update(head_sha='c' * 40),
            lambda r, j, a: r.update(path='.github/workflows/other.yml'),
            lambda r, j, a: a.update(id=4),
            lambda r, j, a: a.update(name='native-sdk-windows-cygwin'),
            lambda r, j, a: a.update(expired=True),
            lambda r, j, a: a['workflow_run'].update(id=5),
            lambda r, j, a: a['workflow_run'].update(head_sha='d' * 40),
            lambda r, j, a: a.update(digest='missing'),
            lambda r, j, a: j[0]['steps'][0].update(conclusion='failure'),
            lambda r, j, a: j[0]['steps'][1].update(conclusion='skipped'),
            lambda r, j, a: j.append(copy.deepcopy(j[0])),
        ]
        for change in corruptions:
            with self.subTest(change=change):
                r, j, a = copy.deepcopy((run, jobs, artifact)); change(r, j, a)
                with self.assertRaises(AssertionError): bootstrap.identity(r, j, a, 1, head, 3)

    def test_compiler_and_both_generated_stages_must_match_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory); sdk = payload / 'sdk'; sdk.mkdir()
            generated = payload / 'generated'; generated.mkdir()
            compiler = sdk / 'arya.exe'; compiler.write_bytes(b'never executed fixture')
            for name in ('arya.c', 'stage2.c'): (generated / name).write_text('identical C fixture')
            digest = bootstrap.shared.sha(generated / 'arya.c')
            (sdk / 'BUILD-INFO.txt').write_text(
                'compilerSha256: ' + bootstrap.shared.sha(compiler) + '\n'
                'generatedCSha256: ' + digest + '\nstageTwoCSha256: ' + digest + '\n'
                'stageTwoThreeCIdentical: true\n')
            (sdk / 'SHA256SUMS').write_text(''.join(bootstrap.shared.sha(file) + '  ' + file.name + '\n'
                for file in (compiler, sdk / 'BUILD-INFO.txt')))
            metadata = {'kind': bootstrap.NAME, 'qualified': False}
            (payload / 'bootstrap.json').write_text(json.dumps(metadata))
            self.assertEqual(bootstrap.verify_payload(payload)['files'], 2)
            (generated / 'stage2.c').write_text('different C')
            with self.assertRaises(AssertionError): bootstrap.verify_payload(payload)
            (generated / 'stage2.c').write_text('identical C fixture')
            compiler.write_text('tampered executable')
            with self.assertRaises(AssertionError): bootstrap.verify_payload(payload)


if __name__ == '__main__':
    unittest.main()
