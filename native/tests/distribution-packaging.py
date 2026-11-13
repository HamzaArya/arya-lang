"""Isolated packaging/installer regression tests; no downloads or shared build mutations."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
checks = 0

def run(*args, good=True):
    global checks
    result = subprocess.run([str(arg) for arg in args], text=True, capture_output=True, timeout=40)
    assert (result.returncode == 0) == good, result.stdout + result.stderr
    checks += 1
    return result

def checksum(directory):
    (directory / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256(file.read_bytes()).hexdigest()}  ./{file.relative_to(directory)}\n'
        for file in sorted(directory.rglob('*')) if file.is_file() and file.name != 'SHA256SUMS'))

def sdk(directory, version):
    directory.mkdir()
    (directory / 'lib').mkdir()
    (directory / 'stdlib').mkdir()
    (directory / 'stdlib/example.arya').write_text('print("fixture")\n')
    (directory / 'lib/runtime.c').write_text('/* fixture */\n')
    (directory / 'VERSION').write_text(version + '\n')
    (directory / 'arya').write_text(f'#!/bin/sh\nprintf "%s\\n" "Arya native {version} fixture"\n')
    (directory / 'arya').chmod(0o755)
    checksum(directory)

with tempfile.TemporaryDirectory(prefix='arya-distribution-test-') as temporary:
    base = Path(temporary)
    fixture = base / 'source tree'
    (fixture / 'native/bootstrap').mkdir(parents=True)
    (fixture / 'editors').mkdir()
    shutil.copy2(ROOT / 'native/bootstrap/editor-package.sh', fixture / 'native/bootstrap')
    shutil.copytree(ROOT / 'editors/native-vscode', fixture / 'editors/native-vscode')
    for name in ['LICENSE', 'NOTICE', 'native/THIRD-PARTY-NOTICES.txt']:
        shutil.copy2(ROOT / name, fixture / name)
    package = fixture / 'native/bootstrap/editor-package.sh'
    output = base / 'output with spaces' / 'arya.vsix'
    for version in ['2.0.0', '2.0.0-beta.1']:
        (fixture / 'native/VERSION').write_text(version + '\n')
        source = base / ('sdk-' + version)
        sdk(source, version)
        for mode in ['bundled', 'portable']:
            run('sh', package, '--mode', mode, '--sdk', source, '--output', output)
            with zipfile.ZipFile(output) as archive:
                metadata = json.loads(archive.read('extension/package.json'))
                assert metadata['version'] == version
                assert metadata['preview'] == ('-' in version)
                tree = ET.fromstring(archive.read('extension.vsixmanifest'))
                ns = {'v': 'http://schemas.microsoft.com/developer/vsx-schema/2011'}
                identity = tree.find('.//v:Identity', ns)
                prop = next(node for node in tree.findall('.//v:Property', ns) if node.attrib['Id'].endswith('.PreRelease'))
                assert prop.attrib['Value'] == str('-' in version).lower()
                assert ('TargetPlatform' in identity.attrib) == (mode == 'bundled')
                assert ('extension/native/arya' in archive.namelist()) == (mode == 'bundled')
                assert not any('/tests/' in name for name in archive.namelist())
                if mode == 'bundled':
                    native = json.loads(archive.read('extension/native/platform.json'))
                    assert native['version'] == version
                    assert identity.attrib['TargetPlatform'] == native['platform'] + '-' + native['arch']
    preserved = output.read_bytes()
    run('sh', package, '--sdk', base / 'sdk-2.0.0', '--output', output, good=False)
    assert output.read_bytes() == preserved
    run('sh', package, '--mode', 'invalid', '--output', output, good=False)
    assert output.read_bytes() == preserved
    installer = ROOT / 'native/bootstrap/install-sdk.sh'
    source = base / 'sdk-2.0.0'
    prefix = base / 'installation with spaces'
    run('sh', installer, source, '--prefix', prefix)
    launcher = prefix / 'bin/arya'
    original = launcher.readlink()
    assert run(launcher, '--version').stdout.strip() == 'Arya native 2.0.0 fixture'
    run('sh', installer, source, '--prefix', prefix, good=False)
    assert launcher.readlink() == original
    next_source = base / 'sdk-2.0.1'
    sdk(next_source, '2.0.1')
    run('sh', installer, next_source, '--prefix', prefix)
    assert original.is_file() and launcher.readlink() != original
    active = launcher.readlink()
    bad = base / 'bad-sdk'
    shutil.copytree(source, bad)
    (bad / 'arya').write_text('#!/bin/sh\nexit 99\n')
    run('sh', installer, bad, '--prefix', prefix, good=False)
    assert launcher.readlink() == active
    shutil.rmtree(bad)
    shutil.copytree(source, bad)
    (bad / 'unlisted.txt').write_text('must reject unlisted SDK inputs')
    run('sh', installer, bad, '--prefix', prefix, good=False)
    (bad / 'unlisted.txt').unlink()
    (bad / 'lib/runtime.c').unlink()
    (bad / 'lib/runtime.c').symlink_to(source / 'lib/runtime.c')
    run('sh', installer, bad, '--prefix', prefix, good=False)
    unmanaged = base / 'unmanaged'
    (unmanaged / 'bin').mkdir(parents=True)
    (unmanaged / 'bin/arya').write_text('preserve me')
    run('sh', installer, source, '--prefix', unmanaged, good=False)
    assert (unmanaged / 'bin/arya').read_text() == 'preserve me'
    run('sh', installer, source, '--prefix', 'relative', good=False)
    assert not list(prefix.glob('.arya-install*'))
print(json.dumps({'passed': True, 'commands': checks, 'fixturesOnly': True}))
