"""Signal acceptance controller; the applications use only native Arya."""
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys

binary = str(Path(sys.argv[1]).resolve())
for arguments in [[], ['dispose']]:
    child = subprocess.Popen([binary, *arguments], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env={'PATH': '/nonexistent', 'ARYA_GC_STRESS': '1', 'ASAN_OPTIONS': 'detect_leaks=0', 'UBSAN_OPTIONS': 'halt_on_error=1'})
    try:
        selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
        assert selector.select(10), 'native signal fixture did not start'
        assert child.stdout.readline().strip() == 'ready'
        child.send_signal(signal.SIGTERM)
        output, errors = child.communicate(timeout=10)
        if arguments:
            assert child.returncode == -signal.SIGTERM and not output, (child.returncode, output, errors)
        else:
            assert child.returncode == 0 and output.strip() == 'SIGTERM cleanup complete', (child.returncode, output, errors)
        assert 'ERROR: AddressSanitizer' not in errors and 'runtime error:' not in errors, errors
    finally:
        if child.poll() is None: child.kill(); child.wait()
print('native signals: cooperative async cleanup and handler disposal passed')
