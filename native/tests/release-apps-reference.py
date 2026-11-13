"""Release-controller rejection cases; no compiler, network, or GUI is launched."""
import importlib.util
import io
import contextlib
import json
from pathlib import Path
import shutil
import sys
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
    def test_standard_text_and_binary_checksum_markers(self):
        with tempfile.TemporaryDirectory() as temporary:
            inventory = Path(temporary) / 'SHA256SUMS'
            digest = 'a' * 64
            inventory.write_text(digest + '  ./text\n' + digest + ' *./binary\n')
            self.assertEqual(release.checksums(inventory), {'text': digest, 'binary': digest})
            for row in (digest + ' U./binary\n', digest + '*./binary\n',
                        digest + ' *../outside\n', digest + ' *C:/outside\n',
                        digest + '  ./same\n' + digest + ' *./same\n'):
                inventory.write_text(row)
                with self.assertRaises(AssertionError): release.checksums(inventory)

    def test_windows_sdk_requires_explicit_executable_and_matching_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            sdk = Path(temporary)
            compiler = write(sdk, 'arya.exe', 'MZ compiler fixture; never executed')
            write(sdk, 'BUILD-INFO.txt', 'compilerSha256: ' + release.sha(compiler) +
                  '\nstageTwoThreeCIdentical: true\ngeneratedCSha256: ' + 'c' * 64 + '\nstageTwoCSha256: ' + 'c' * 64 + '\n')
            names = ['arya.exe', 'BUILD-INFO.txt']
            manifest(sdk, names, sdk / 'SHA256SUMS')
            self.assertEqual(release.verify_sdk(sdk, executable='arya.exe')['executable'], 'arya.exe')
            with self.assertRaisesRegex(AssertionError, 'SDK executable is missing'):
                release.verify_sdk(sdk)
            for name in ('../arya.exe', '/arya.exe', 'subdir/arya.exe', 'other.exe', 'ARYA.EXE'):
                with self.subTest(name=name), self.assertRaisesRegex(AssertionError, 'Unsupported SDK executable'):
                    release.verify_sdk(sdk, executable=name)
            compiler.write_text('different PE compiler fixture')
            manifest(sdk, names, sdk / 'SHA256SUMS')
            with self.assertRaises(AssertionError):
                release.verify_sdk(sdk, executable='arya.exe')

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


class AssemblyBoundaries(unittest.TestCase):
    """Exercise real metadata copying around tiny, non-executable SDK fixtures."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / 'checkout'
        for name in ('native/bootstrap/release-apps.py', 'native/bootstrap/copy-documentation.sh',
                     'native/bootstrap/sdk-doc-links.awk', 'docs/verification/2.0.0/reassemble-qualified-sdk.py'):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        values = {
            'Makefile': 'fixture build rules', 'native/VERSION': '2.0.0\n',
            'native/runtime/core.c': 'fixture runtime; never compiled',
            'native/THIRD-PARTY-NOTICES.txt': 'fixture notices',
            'LICENSE': 'fixture license', 'NOTICE': 'fixture notice',
            'native/manifest.json': '{"version":"2.0.0"}', 'native/PROVENANCE.json': '{}',
            'native/bootstrap/install-sdk.sh': '#!/bin/sh\n# qualified installer fixture; never executed\n',
            'native/qualification/2.0.0.json': '{"status":"fixture"}',
            'CONTRIBUTING.md': 'Fixture contribution guide.\n', 'docs/current.md': 'Updated fixture documentation.\n',
            'native/DOCUMENTATION': 'file|CONTRIBUTING.md|CONTRIBUTING.md\nfile|docs/current.md|docs/current.md\n',
        }
        for name, value in values.items(): write(self.root, name, value)
        script = self.root / 'docs/verification/2.0.0/reassemble-qualified-sdk.py'
        spec = importlib.util.spec_from_file_location('assembly_fixture', script)
        self.assembly = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.assembly)
        self.sdk = self.base / 'qualified-sdk'
        self.destination = self.base / 'arya-native-2.0.0-windows-cygwin-x64'
        self.platform = 'windows-cygwin-x64'
        self.executable = 'arya.exe'
        self.make_sdk()

    def make_sdk(self):
        payload = {
            self.executable: 'compiler fixture; never executed', 'VERSION': '2.0.0\n',
            'README.txt': 'Use Cygwin and retain its runtime DLL dependency.\n',
            'WINDOWS-DEPENDENCIES.txt': 'C:\\cygwin\\bin\\cygwin1.dll\n',
            'lib/libarya-gui.a': 'native widget library fixture', 'stdlib/web.arya': 'standard library fixture',
            'examples/hello.arya': 'print("fixture")\n', 'docs/current.md': 'Original fixture documentation.\n',
            'qualification/README.txt': 'Original qualification identities.\n',
            'install.sh': (self.root / 'native/bootstrap/install-sdk.sh').read_text(),
        }
        for name, value in payload.items(): write(self.sdk, name, value)
        write(self.sdk, 'BUILD-INFO.txt', 'compilerSha256: ' + release.sha(self.sdk / self.executable) +
              '\nstageTwoThreeCIdentical: true\ngeneratedCSha256: ' + 'c' * 64 + '\nstageTwoCSha256: ' + 'c' * 64 + '\n')
        sources = [p.relative_to(self.root).as_posix() for p in self.root.rglob('*') if p.is_file()]
        manifest(self.root, sorted(sources), self.sdk / 'SOURCE-SHA256SUMS')
        self.reseal()

    def reseal(self):
        names = sorted(p.relative_to(self.sdk).as_posix() for p in self.sdk.rglob('*')
                       if p.is_file() and p.name != 'SHA256SUMS')
        manifest(self.sdk, names, self.sdk / 'SHA256SUMS')
        self.profile = {
            'sourceCommit': 'a' * 40, 'run': 1, 'job': 2, 'artifact': 3,
            'compilerSHA256': release.sha(self.sdk / self.executable),
            'inventorySHA256': release.sha(self.sdk / 'SHA256SUMS'), 'archiveSHA256': 'b' * 64,
            'installerSHA256': release.sha(self.sdk / 'install.sh'),
        }
        self.write_profile()

    def write_profile(self):
        self.assembly.PROFILES.write_text(json.dumps({self.platform: self.profile}))

    def run_assembly(self):
        # Git identities label only this synthetic fixture; the actual controller
        # and POSIX documentation-copy script run without a compiler or network.
        def git_output(command, **_options):
            if command[-2:] == ['rev-parse', 'HEAD']:
                return 'd' * 40 + '\n'
            self.assertEqual(command[-2:], ['status', '--porcelain'])
            return ' M docs/current.md\n'
        argv = ['reassemble-qualified-sdk.py', '--platform', self.platform,
                '--sdk', str(self.sdk), '--destination', str(self.destination)]
        with patch.object(sys, 'argv', argv), patch.object(self.assembly.subprocess, 'check_output', side_effect=git_output):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assembly.main()

    def test_windows_metadata_refresh_preserves_payload_and_qualified_installer(self):
        original = self.assembly.files(self.sdk)
        self.run_assembly()
        record = json.loads((self.destination / 'ASSEMBLY-INFO.json').read_text())
        protected = (self.executable, 'lib/libarya-gui.a', 'stdlib/web.arya', 'examples/hello.arya',
                     'README.txt', 'WINDOWS-DEPENDENCIES.txt', 'BUILD-INFO.txt', 'SOURCE-SHA256SUMS')
        for name in protected:
            self.assertEqual(release.sha(self.destination / name), original[name], name)
            self.assertEqual(record['protectedFiles'][name], original[name], name)
        self.assertEqual((self.destination / 'docs/current.md').read_text(), 'Updated fixture documentation.\n')
        self.assertEqual(record['executable'], 'arya.exe')
        for name in ('SHA256SUMS', 'ASSEMBLY-SOURCE-SHA256SUMS'):
            for line in (self.destination / name).read_text().splitlines():
                self.assertEqual(line[64:66], ' *', (name, line))
        self.assertEqual(record['installerIdentity'], {
            'qualifiedSHA256': original['install.sh'], 'assembledSHA256': original['install.sh'],
            'matchesQualified': True, 'qualifiedMatchRequired': True})
        release.verify_sdk(self.destination, executable='arya.exe')

    def test_unix_metadata_refresh_records_installer_difference_without_windows_policy(self):
        (self.sdk / 'arya.exe').rename(self.sdk / 'arya')
        self.executable = 'arya'; self.platform = 'linux-x64'
        self.destination = self.base / 'arya-native-2.0.0-linux-x64'
        self.reseal()
        self.profile.pop('installerSHA256'); self.write_profile()
        write(self.root, 'native/bootstrap/install-sdk.sh', '#!/bin/sh\n# newer Unix installer fixture\n')
        self.run_assembly()
        record = json.loads((self.destination / 'ASSEMBLY-INFO.json').read_text())
        self.assertFalse(record['installerIdentity']['matchesQualified'])
        self.assertFalse(record['installerIdentity']['qualifiedMatchRequired'])
        self.assertEqual(record['executable'], 'arya')
        release.verify_sdk(self.destination)

    def test_missing_platform_pins_reject_before_copying(self):
        self.assembly.PROFILES.write_text('{}')
        with self.assertRaisesRegex(AssertionError, 'No qualified input pins'):
            self.run_assembly()
        self.assertFalse(self.destination.exists())

    def test_wrong_qualified_inventory_rejected_even_with_valid_internal_checksums(self):
        write(self.sdk, 'lib/libarya-gui.a', 'unqualified replacement library')
        names = sorted(p.relative_to(self.sdk).as_posix() for p in self.sdk.rglob('*')
                       if p.is_file() and p.name != 'SHA256SUMS')
        manifest(self.sdk, names, self.sdk / 'SHA256SUMS')
        with self.assertRaisesRegex(AssertionError, 'Wrong qualified SDK inventory'):
            self.run_assembly()
        self.assertFalse(self.destination.exists())

    def test_windows_requires_dependency_documentation(self):
        (self.sdk / 'WINDOWS-DEPENDENCIES.txt').unlink(); self.reseal()
        with self.assertRaisesRegex(AssertionError, 'Missing Windows dependency documentation'):
            self.run_assembly()
        self.assertFalse(self.destination.exists())

    def test_windows_requires_installer_pin_and_rejects_changed_installer(self):
        original = self.profile['installerSHA256']
        for value in (None, 'not-a-digest', 'e' * 64):
            with self.subTest(pin=value):
                if value is None: self.profile.pop('installerSHA256', None)
                else: self.profile['installerSHA256'] = value
                self.write_profile()
                with self.assertRaisesRegex(AssertionError, 'Windows installer identity'):
                    self.run_assembly()
                self.assertFalse(self.destination.exists())
        self.profile['installerSHA256'] = original; self.write_profile()
        write(self.root, 'native/bootstrap/install-sdk.sh', '#!/bin/sh\n# unqualified changed installer\n')
        with self.assertRaisesRegex(AssertionError, 'Windows installer differs from qualified input'):
            self.run_assembly()
        self.assertFalse(self.destination.exists())

    def test_protected_payload_change_during_copy_is_rejected(self):
        original_copy = shutil.copytree
        def corrupt_copy(source, destination, *arguments, **options):
            result = original_copy(source, destination, *arguments, **options)
            if Path(source) == self.sdk:
                write(Path(destination), 'WINDOWS-DEPENDENCIES.txt', 'wrong DLL requirements')
            return result
        with patch.object(shutil, 'copytree', side_effect=corrupt_copy):
            with self.assertRaisesRegex(AssertionError, 'Non-metadata payload changed'):
                self.run_assembly()
        self.assertFalse((self.destination / 'ASSEMBLY-INFO.json').exists())

    def test_copied_windows_installer_must_still_match_qualified_bytes(self):
        original_copy = shutil.copy2
        def corrupt_installer(source, destination, *arguments, **options):
            result = original_copy(source, destination, *arguments, **options)
            if Path(source) == self.root / 'native/bootstrap/install-sdk.sh':
                Path(destination).write_text('#!/bin/sh\n# corrupt copied installer\n')
            return result
        with patch.object(shutil, 'copy2', side_effect=corrupt_installer):
            with self.assertRaisesRegex(AssertionError, 'Copied Windows installer differs from qualified input'):
                self.run_assembly()
        self.assertFalse((self.destination / 'ASSEMBLY-INFO.json').exists())

    def test_packaging_source_change_during_copy_is_rejected(self):
        original_copy = shutil.copytree
        def changed_source(source, destination, *arguments, **options):
            result = original_copy(source, destination, *arguments, **options)
            if Path(source) == self.sdk:
                write(self.root, 'docs/current.md', 'Modified while assembly was running.\n')
            return result
        with patch.object(shutil, 'copytree', side_effect=changed_source):
            with self.assertRaisesRegex(AssertionError, 'Packaging inputs changed during assembly'):
                self.run_assembly()
        self.assertFalse((self.destination / 'ASSEMBLY-INFO.json').exists())


if __name__ == '__main__':
    unittest.main()
