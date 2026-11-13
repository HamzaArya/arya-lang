"""Independent byte oracle and positive/negative checker regression cases."""
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(os.environ.get('ARYA_NATIVE_BIN', root / '.build/independent/arya')).resolve()
sanitizers = os.environ.get('ARYA_TEST_SANITIZERS') != 'unavailable'
if not sanitizers and sys.platform != 'cygwin':
    raise SystemExit('Sanitizer fallback requires the recorded Cygwin capability gate.')
prefix = 'const typed: boolean = true\n'
decimal = 'use std "decimal" as decimal\n'
web = 'use std "web" as web\nuse std "process" as process\n'
cases = [
    (False, decimal + 'decimal.quantize("1.25", 2)'),
    (False, decimal + 'decimal.divide("1", "2", 2)'),
    (False, decimal + 'decimal.values.quantize(decimal.values.parse("1"), 2)'),
    (False, decimal + 'decimal.values.divide(decimal.values.parse("1"), decimal.values.parse("2"), 2)'),
    (True, decimal + 'decimal.quantize("1.25", 2, "half-even")'),
    (True, decimal + 'decimal.divide("1", "2", 2, "half-even")'),
    (True, web + 'const options = {root: process.cwd(), html: false, assets: false}\nweb.serve(0, {}, options)'),
    (True, web + 'web.serve(0, {}, {root: process.cwd(), html: false, assets: false})'),
    (True, web + 'const options = {timeoutMs: 1000}\nweb.health({}, options)\nweb.shutdown({}, options)'),
    (False, web + 'const options = {host: 3}\nweb.serve(0, {}, options)'),
    (False, web + 'const options = {maxBodyBytes: "large"}\nweb.serve(0, {}, options)'),
    (False, web + 'const options = {timeoutMs: "soon"}\nweb.shutdown({}, options)'),
    (True, 'use std "fs" as fs\nconst bytes: any = Buffer.from([0, 255])\nawait fs.writeBytes("a", bytes)\nfs.writeBytesSync("b", bytes)\nawait fs.appendBytes("a", bytes)\nfs.appendBytesSync("b", bytes)\nawait fs.readBytes("a")\nfs.readBytesSync("b")'),
    (False, 'use std "fs" as fs\nfs.writeBytesSync("a")'),
    (False, 'use std "fs" as fs\nfs.readBytesSync(5)'),
    (True, 'use std "fs" as fs\nfs.writeTextAtomicSync("a", "x")\nfs.writeBytesAtomicSync("b", Buffer.from([0]))'),
    (False, 'use std "fs" as fs\nfs.writeTextAtomicSync("a", 2)'),
]


def run(command, **kwargs):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True, timeout=180, **kwargs)
    if result.returncode:
        raise AssertionError(f'{command}\n{result.stdout}\n{result.stderr}')
    return result


with tempfile.TemporaryDirectory(prefix='api-contracts-', dir=root / '.build') as directory:
    temporary = Path(directory)
    probe = temporary / 'check.arya'
    for expected, source in cases:
        probe.write_text(prefix + source + '\n')
        result = subprocess.run([str(compiler), 'check', str(probe), '--json'], capture_output=True, text=True, timeout=30)
        report = json.loads(result.stdout)
        assert report['ok'] == expected, (expected, source, report)
        if not expected:
            assert report['diagnostics'][0]['code'] == 'ARYA_TYPE', report
    # Unannotated code remains dynamic by design; runtime validates its calls.
    probe.write_text(decimal + 'decimal.quantize("1.25", 2)\n')
    assert json.loads(run([compiler, 'check', probe, '--json']).stdout)['ok']
    for variant in ('optimized', 'reference'):
        binary = temporary / variant
        options = ['--debug', *(['--sanitize'] if sanitizers else [])]
        if variant == 'reference':
            options += ['--no-data-opt']
        run([compiler, 'build', root / 'native/tests/fixtures/api-contracts.arya', '-o', binary, *options])
        data = temporary / (variant + '-data')
        data.mkdir()
        (data / 'limit.bin').write_bytes(b'\xa5' * (16 * 1024 * 1024))
        (data / 'oversize.bin').write_bytes(b'\xa5' * (16 * 1024 * 1024 + 1))
        (data / 'sentinel').write_bytes(b'untouched')
        (data / 'symlink').symlink_to(data / 'sentinel')
        (data / 'dangling').symlink_to(data / 'not-created')
        (data / 'atomic.txt.tmp').symlink_to(data / 'sentinel')
        (data / 'target-directory').mkdir()
        result = run([binary, data], env={**os.environ, 'ARYA_GC_STRESS': '1', 'ASAN_OPTIONS': 'detect_leaks=0', 'UBSAN_OPTIONS': 'halt_on_error=1'})
        assert (data / 'roundtrip.bin').read_bytes() == bytes([0, 1, 127, 128, 195, 40, 255, 10, 0, 254, 253])
        assert (data / 'view.bin').read_bytes() == bytes([127, 128, 195, 40, 255])
        assert (data / 'empty.bin').read_bytes() == b''
        assert (data / 'created.bin').read_bytes() == bytes([0, 1, 127, 128, 195, 40, 255, 10])
        assert (data / 'atomic.txt').read_bytes() == 'Unicode: کابل\n'.encode()
        assert (data / 'atomic.bin').read_bytes() == bytes([0, 255, 195, 40])
        assert (data / 'atomic.txt').stat().st_mode & 0o777 == 0o600
        assert (data / 'sentinel').read_bytes() == b'untouched'
        assert (data / 'symlink').is_symlink() and (data / 'dangling').is_symlink()
        assert (data / 'atomic.txt.tmp').is_symlink()
        assert not (data / 'not-created').exists()
        assert not list(data.glob('*.stage-*'))
        (data / 'atomic-failed.bin').write_text('preserve')
        def restrict_writes():
            signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
            resource.setrlimit(resource.RLIMIT_FSIZE, (1024, 1024))
        failed_write = run([binary, data, 'atomic-write-failure'], preexec_fn=restrict_writes,
                           env={**os.environ, 'ASAN_OPTIONS': 'detect_leaks=0', 'UBSAN_OPTIONS': 'halt_on_error=1'})
        assert 'atomic failure preserved destination' in failed_write.stdout
        assert (data / 'atomic-failed.bin').read_bytes() == b'preserve'
        assert not list(data.glob('*.stage-*'))
        print(f'{variant}: {result.stdout.strip()}')
instrumentation = 'ASan/UBSan + GC stress' if sanitizers else 'debug + GC stress (Cygwin ASan/UBSan unavailable)'
print(f'API contracts: {len(cases)} typed checks, dynamic compatibility, independent byte oracle; {instrumentation} passed')
