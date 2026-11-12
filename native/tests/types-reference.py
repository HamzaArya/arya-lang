"""Native type/flow acceptance from independently evaluated legacy cases."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

compiler = str(Path(sys.argv[1]).resolve())
root = Path(__file__).resolve().parents[2]
cases = json.loads((root / 'native/tests/fixtures/type-cases.json').read_text())['cases']
failures = []
with tempfile.TemporaryDirectory(prefix='arya-native-types-', dir=root / '.build') as directory:
    source = Path(directory) / 'main.arya'
    for index, case in enumerate(cases):
        source.write_text(case['source'])
        result = subprocess.run([compiler, 'check', str(source), '--json'], capture_output=True, text=True, env={**os.environ, 'PATH': '/nonexistent'}, timeout=30)
        try:
            report = json.loads(result.stdout)
        except ValueError:
            failures.append({'index': index, 'source': case['source'], 'error': result.stderr, 'stdout': result.stdout})
            continue
        if report['ok'] != case['valid']:
            failures.append({'index': index, 'source': case['source'], 'expected': case['valid'], 'actual': report})
for failure in failures:
    print(json.dumps(failure, ensure_ascii=False))
assert not failures, f'{len(failures)} / {len(cases)} native flow cases diverged'
print(f'native types: {len(cases)} independent flow, closure, alias and contract cases passed')
