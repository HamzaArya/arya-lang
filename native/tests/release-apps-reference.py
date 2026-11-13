"""Release-controller rejection cases; no compiler, network, or GUI is launched."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_apps', ROOT / 'native/bootstrap/release-apps.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def write(root, name, value):
    file = root / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(value)
    return file


def manifest(root, names, destination):
    destination.write_text(''.join(release.sha(root / name) + '  ' + name + '\n' for name in names))


class ReleaseBoundaries(unittest.TestCase):
    def test_corrupt_unlisted_and_wrong_binary_sdk_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            sdk = Path(temporary)
            compiler = write(sdk, 'arya', 'compiler fixture; never executed')
            write(sdk, 'BUILD-INFO.txt', 'compilerSha256: ' + release.sha(compiler) +
                  '\nstageTwoThreeCIdentical: true\ngeneratedCSha256: ' + 'c' * 64 + '\nstageTwoCSha256: ' + 'c' * 64 + '\n')
            manifest(sdk, ['arya', 'BUILD-INFO.txt'], sdk / 'SHA256SUMS')
            self.assertEqual(release.verify_sdk(sdk)['fileCount'], 2)
            extra = write(sdk, 'lib/unlisted.c', 'unlisted runtime')
            with self.assertRaises(AssertionError): release.verify_sdk(sdk)
            extra.unlink()
            compiler.write_text('tampered binary')
            with self.assertRaises(AssertionError): release.verify_sdk(sdk)
            # Even a regenerated inventory cannot hide disagreement with the
            # separately recorded compiler identity/convergence evidence.
            manifest(sdk, ['arya', 'BUILD-INFO.txt'], sdk / 'SHA256SUMS')
            with self.assertRaises(AssertionError): release.verify_sdk(sdk)

    def test_native_source_drift_rejected_but_test_changes_recorded(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'checkout'; sdk = Path(temporary) / 'sdk'; sdk.mkdir()
            values = {'Makefile': 'build rules', 'native/VERSION': '2.0.0',
                      'native/compiler/compiler.arya': 'compiler', 'native/runtime/core.c': 'runtime',
                      'native/libraries/decimal.arya': 'decimal', 'native/gui/appkit.m': 'AppKit',
                      'native/tests/test.arya': 'test v1', 'native/gui/platform-test.c': 'toolkit test'}
            for name, value in values.items(): write(root, name, value)
            manifest(root, values, sdk / 'SOURCE-SHA256SUMS')
            write(root, 'native/tests/test.arya', 'test v2')
            write(root, 'native/gui/platform-test.c', 'toolkit test v2')
            result = release.verify_sources(root, sdk)
            self.assertEqual(result['matchedBuildInputs'], 6)
            self.assertEqual(len(result['nonBuildInputDifferences']), 2)
            write(root, 'native/runtime/core.c', 'different runtime')
            with self.assertRaises(AssertionError): release.verify_sources(root, sdk)
            write(root, 'native/runtime/core.c', 'runtime')
            write(root, 'native/runtime/new.c', 'unqualified new runtime input')
            with self.assertRaises(AssertionError): release.verify_sources(root, sdk)

    def test_archive_traversal_links_and_duplicate_paths_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for index, name in enumerate(('../escape', '/absolute', 'C:/drive', 'sdk\\escape')):
                file = root / f'bad{index}.zip'
                with zipfile.ZipFile(file, 'w') as archive: archive.writestr(name, b'bad')
                with self.assertRaises(AssertionError): release.unpack_zip(file, root / 'out')
            file = root / 'link.tar.gz'
            with tarfile.open(file, 'w:gz') as archive:
                member = tarfile.TarInfo('sdk/link'); member.type = tarfile.SYMTYPE; member.linkname = '../outside'
                archive.addfile(member)
            with self.assertRaises(AssertionError): release.unpack_tar(file, root / 'out')
            file = root / 'duplicate.tar.gz'
            with tarfile.open(file, 'w:gz') as archive:
                for name in ('sdk/item', './sdk/item'):
                    member = tarfile.TarInfo(name); member.size = 1; archive.addfile(member, io.BytesIO(b'x'))
            with self.assertRaises(AssertionError): release.unpack_tar(file, root / 'out')
            self.assertFalse((root / 'out').exists(), 'Reject invalid archives before extracting any bytes')

    def test_only_successful_job_and_matching_immutable_artifact_accepted(self):
        head = 'a' * 40
        run = {'head_sha': head, 'repository': {'full_name': release.REPOSITORY},
               'path': '.github/workflows/native-desktop-release.yml', 'html_url': 'https://example.invalid/run'}
        job = {'name': release.JOB_NAME, 'id': 2, 'status': 'completed', 'conclusion': 'success'}
        artifact = {'name': release.ARTIFACT_NAME, 'id': 3, 'expired': False,
                    'workflow_run': {'head_sha': head, 'id': 1}, 'digest': 'sha256:' + 'b' * 64}
        with patch.object(release, 'api', side_effect=[run, {'jobs': [job]}, {'artifacts': [artifact]}]):
            self.assertEqual(release.qualified_artifact(1, head, 0)['jobConclusion'], 'success')
        with patch.object(release, 'api', side_effect=[run, {'jobs': [{**job, 'conclusion': 'failure'}]}]):
            with self.assertRaises(AssertionError): release.qualified_artifact(1, head, 0)
        wrong = {**artifact, 'workflow_run': {'head_sha': 'c' * 40, 'id': 1}}
        with patch.object(release, 'api', side_effect=[run, {'jobs': [job]}, {'artifacts': [wrong]}]):
            with self.assertRaises(AssertionError): release.qualified_artifact(1, head, 0)


if __name__ == '__main__':
    unittest.main()
