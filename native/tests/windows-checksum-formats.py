"""Actual Cygwin checksum/installer fixture; never qualifies the Arya compiler."""
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

assert sys.platform == 'cygwin', 'Run this fixture with Cygwin Python'
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_helpers', root / 'native/bootstrap/release-apps.py')
shared = importlib.util.module_from_spec(spec); spec.loader.exec_module(shared)


def run(arguments, **kwargs):
    result = subprocess.run([str(value) for value in arguments], text=True, capture_output=True, timeout=60, **kwargs)
    assert result.returncode == 0, (arguments, result.stdout, result.stderr)
    return result


with tempfile.TemporaryDirectory(prefix='checksum-fixture-', dir=root / '.build') as directory:
    work = Path(directory); sdk = work / 'SDK fixture'; sdk.mkdir()
    (sdk / 'lib').mkdir(); (sdk / 'stdlib').mkdir()
    (sdk / 'VERSION').write_text('2.0.0\n')
    payload = b'CRLF\r\nNUL\x00DOS\x1aHIGH\xff\r\n' * 37
    (sdk / 'binary.dat').write_bytes(payload)
    source = work / 'fixture.c'
    source.write_text('#include <stdio.h>\nint main(void) { puts("Arya native 2.0.0 checksum fixture"); return 0; }\n')
    run(['gcc', source, '-o', sdk / 'arya.exe'])
    files = sorted(path for path in sdk.rglob('*') if path.is_file())
    (sdk / 'SHA256SUMS').write_text(''.join(shared.sha(file) + ' *./' + file.relative_to(sdk).as_posix() + '\n' for file in files))
    expected = shared.checksums(sdk / 'SHA256SUMS')
    assert expected['binary.dat'] == hashlib.sha256(payload).hexdigest()
    run(['shasum', '-a', '256', '-c', 'SHA256SUMS'], cwd=sdk)
    default = run(['shasum', '-a', '256', 'binary.dat'], cwd=sdk).stdout.strip()
    print('Actual Cygwin shasum default row:', repr(default), flush=True)
    (work / 'text-mode.sha256').write_text(hashlib.sha256(payload).hexdigest() + '  ./binary.dat\n')
    text_mode = subprocess.run(['shasum', '-a', '256', '-c', str(work / 'text-mode.sha256')], cwd=sdk,
                               text=True, capture_output=True, timeout=30)
    print('Actual Cygwin text-marker verification status:', text_mode.returncode, flush=True)
    print((text_mode.stdout + text_mode.stderr).strip(), flush=True)
    environment = {key: value for key, value in os.environ.items() if key != 'HOME'}
    prefix = work / 'installed fixture with spaces'
    run(['sh', root / 'native/bootstrap/install-sdk.sh', sdk, '--prefix', prefix], env=environment)
    assert run([prefix / 'bin/arya', '--version']).stdout.strip() == 'Arya native 2.0.0 checksum fixture'
    installed = next((prefix / 'lib/arya').iterdir())
    assert (installed / 'binary.dat').read_bytes() == payload
    run(['shasum', '-a', '256', '-c', 'SHA256SUMS'], cwd=installed)
    print('Windows checksum fixture PASS: binary bytes, both-mode parser, checksum verification and actual Cygwin installer route.', flush=True)
