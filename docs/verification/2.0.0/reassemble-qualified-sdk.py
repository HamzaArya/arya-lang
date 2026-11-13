#!/usr/bin/env python3
"""Refresh release metadata around a verified, byte-preserved SDK.

Run from a full checkout after the release metadata is frozen. This does not
compile, publish, install or archive anything. The destination must not exist.
The original BUILD-INFO.txt and SOURCE-SHA256SUMS remain unchanged; the new
ASSEMBLY-* records describe packaging inputs separately from compiler origin.

Example:
  python3 docs/verification/2.0.0/reassemble-qualified-sdk.py --platform darwin-arm64 \
    --sdk /path/to/qualified/arya-native-2.0.0-darwin-arm64 \
    --destination /new/stage/arya-native-2.0.0-darwin-arm64
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
PROFILES = Path(__file__).resolve().with_name('sdk-assembly-inputs.json')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def files(directory):
    entries = list(directory.rglob('*'))
    assert not any(path.is_symlink() for path in entries), 'Symlinks are not accepted'
    return {path.relative_to(directory).as_posix(): sha(path)
            for path in entries if path.is_file()}


def metadata_path(name):
    return name.startswith(('docs/', 'qualification/')) or name in {
        'CONTRIBUTING.md', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt',
        'manifest.json', 'PROVENANCE.json', 'install.sh', 'SHA256SUMS',
        'ASSEMBLY-INFO.json', 'ASSEMBLY-SOURCE-SHA256SUMS'}


def packaging_snapshot(metadata_sources):
    inputs = set(metadata_sources) | {
        'native/DOCUMENTATION', 'native/bootstrap/copy-documentation.sh',
        'native/bootstrap/sdk-doc-links.awk', 'native/bootstrap/release-apps.py',
        Path(__file__).resolve().relative_to(ROOT).as_posix(),
        PROFILES.relative_to(ROOT).as_posix()}
    inputs.update(path.relative_to(ROOT).as_posix()
                  for path in (ROOT / 'native/qualification').rglob('*') if path.is_file())
    for line in (ROOT / 'native/DOCUMENTATION').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        kind, source, _ = line.split('|')
        path = ROOT / source
        if kind == 'file':
            inputs.add(source)
        else:
            assert kind == 'tree'
            inputs.update(p.relative_to(ROOT).as_posix() for p in path.rglob('*')
                          if p.is_file() and p.name != '.DS_Store' and not p.name.startswith('._'))
    assert all(not (ROOT / name).is_symlink() for name in inputs), 'Packaging source symlink'
    return {name: sha(ROOT / name) for name in sorted(inputs)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', required=True, choices=('darwin-arm64', 'linux-x64', 'windows-cygwin-x64'))
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    profiles = json.loads(PROFILES.read_text())
    assert args.platform in profiles, 'No qualified input pins for this platform yet'
    profile = profiles[args.platform]
    windows = args.platform == 'windows-cygwin-x64'
    executable = 'arya.exe' if windows else 'arya'
    sdk, destination = args.sdk.resolve(), args.destination.absolute()
    assert not destination.exists() and not destination.is_symlink(), 'Destination already exists'
    assert destination.name == f'arya-native-2.0.0-{args.platform}', 'Unexpected SDK directory name'
    assert destination != sdk and sdk not in destination.parents, 'Destination must be separate from input'
    spec = importlib.util.spec_from_file_location('release_apps', ROOT / 'native/bootstrap/release-apps.py')
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)
    assert sha(sdk / 'SHA256SUMS') == profile['inventorySHA256'], 'Wrong qualified SDK inventory'
    qualified = controller.verify_sdk(sdk, executable=executable)
    assert sha(sdk / executable) == profile['compilerSHA256'], 'Wrong qualified compiler'
    assert (sdk / 'VERSION').read_text().strip() == '2.0.0'
    assert (ROOT / 'native/VERSION').read_text().strip() == '2.0.0'
    source_identity = controller.verify_sources(ROOT, sdk)
    before = files(sdk)
    assert before == {**controller.checksums(sdk / 'SHA256SUMS'),
                      'SHA256SUMS': profile['inventorySHA256']}, 'Qualified SDK changed before copying'
    if windows:
        assert {'README.txt', 'WINDOWS-DEPENDENCIES.txt'} <= set(before), 'Missing Windows dependency documentation'
        # The final Windows job tests this exact installer. Later metadata-only
        # assembly must not substitute another installer under that qualification.
        installer_pin = profile.get('installerSHA256', '')
        assert re.fullmatch(r'[0-9a-f]{64}', installer_pin), 'Missing qualified Windows installer identity'
        assert before.get('install.sh') == installer_pin, 'Qualified Windows installer identity mismatch'
        assert sha(ROOT / 'native/bootstrap/install-sdk.sh') == installer_pin, 'Windows installer differs from qualified input'
    metadata_sources = {
        'LICENSE': 'LICENSE', 'NOTICE': 'NOTICE',
        'native/THIRD-PARTY-NOTICES.txt': 'THIRD-PARTY-NOTICES.txt',
        'native/manifest.json': 'manifest.json',
        'native/PROVENANCE.json': 'PROVENANCE.json',
        'native/bootstrap/install-sdk.sh': 'install.sh',
    }
    packaging_inputs = packaging_snapshot(metadata_sources)
    shutil.copytree(sdk, destination, copy_function=shutil.copy2)
    for source, target in metadata_sources.items():
        assert not (ROOT / source).is_symlink()
        shutil.copy2(ROOT / source, destination / target)
    shutil.copytree(ROOT / 'native/qualification', destination / 'qualification', dirs_exist_ok=True)
    subprocess.run(['sh', str(ROOT / 'native/bootstrap/copy-documentation.sh'),
                    'sdk', str(ROOT), str(destination)], check=True)
    with (destination / 'qualification/README.txt').open('a') as output:
        output.write('\nFinal metadata assembly: BUILD-INFO.txt and SOURCE-SHA256SUMS retain\n'
                     'the original qualified compiler build snapshot. ASSEMBLY-INFO.json\n'
                     'and ASSEMBLY-SOURCE-SHA256SUMS identify the later installer,\n'
                     'qualification records and documentation copied into this SDK.\n')

    assert packaging_snapshot(metadata_sources) == packaging_inputs, 'Packaging inputs changed during assembly'
    assert controller.verify_sources(ROOT, sdk) == source_identity, 'Native source inputs changed during assembly'
    (destination / 'ASSEMBLY-SOURCE-SHA256SUMS').write_text(''.join(
        f'{digest}  {name}\n' for name, digest in packaging_inputs.items()))

    after = files(destination)
    protected_before = {name: digest for name, digest in before.items() if not metadata_path(name)}
    protected_after = {name: digest for name, digest in after.items() if not metadata_path(name)}
    assert protected_before == protected_after, 'Non-metadata payload changed during assembly'
    installer_identity = {
        'qualifiedSHA256': before['install.sh'], 'assembledSHA256': after['install.sh'],
        'matchesQualified': before['install.sh'] == after['install.sh'],
        'qualifiedMatchRequired': windows,
    }
    if windows:
        assert after['install.sh'] == installer_pin, 'Copied Windows installer differs from qualified input'
    changes = [{'path': name, 'qualifiedSHA256': before.get(name), 'assembledSHA256': after.get(name)}
               for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]
    assert all(metadata_path(item['path']) for item in changes), 'Change outside metadata allowlist'
    record = {
        'status': 'payload-preservation-passed',
        'assembledAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'assemblyCommit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
        'assemblyWorkingTreeStatus': subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True).splitlines(),
        'platform': args.platform, 'executable': executable,
        'qualifiedSourceCommit': profile['sourceCommit'],
        'qualifiedRun': profile['run'], 'qualifiedJob': profile['job'],
        'qualifiedArtifact': profile['artifact'],
        'qualifiedArchiveSHA256': profile['archiveSHA256'],
        'qualifiedSDK': qualified, 'compilerSHA256': profile['compilerSHA256'],
        'sourceIdentity': source_identity, 'protectedFiles': protected_before,
        'installerIdentity': installer_identity,
        'metadataChanges': changes,
        'assemblySourceInventorySHA256': sha(destination / 'ASSEMBLY-SOURCE-SHA256SUMS'),
        'note': 'Compiler, libraries, standard libraries, examples and original build/source identities '
                'are byte-preserved. Only installer, qualification and documentation metadata are refreshed. '
                'The assembly commit is not the compiler build commit. Native installer smoke and '
                'archive qualification are recorded separately and are not claimed by this controller.',
    }
    (destination / 'ASSEMBLY-INFO.json').write_text(json.dumps(record, indent=2) + '\n')
    final = files(destination)
    (destination / 'SHA256SUMS').write_text(''.join(f'{digest}  ./{name}\n'
        for name, digest in sorted(final.items()) if name != 'SHA256SUMS'))
    verified = controller.verify_sdk(destination, executable=executable)
    print(json.dumps({'destination': str(destination), 'verifiedFiles': verified['fileCount'],
                      'protectedFiles': len(protected_before), 'matchedBuildInputs': source_identity['matchedBuildInputs'],
                      'compilerSHA256': profile['compilerSHA256']}, indent=2))


if __name__ == '__main__':
    main()
