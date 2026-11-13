"""Rebuild migrated native applications and test their real storage boundaries.

Python is test orchestration only. The existing smoke drivers receive the real
compiled Arya executable. Their temporary stores are instrumented with a .tmp
symlink sentinel, then separate processes test rejected DATA_FILE entries.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]

if len(sys.argv) > 1 and sys.argv[1] == '--instrument-smoke':
    smoke, executable = sys.argv[2:4]
    original = tempfile.TemporaryDirectory

    class SentinelDirectory(original):
        def __enter__(self):
            directory = super().__enter__()
            self.sentinel = Path(directory) / 'atomic-storage-sentinel'
            self.link = Path(directory) / 'data.json.tmp'
            self.sentinel.write_bytes(b'private staging must not overwrite this')
            self.link.symlink_to(self.sentinel)
            return directory

        def __exit__(self, *arguments):
            try:
                assert self.sentinel.read_bytes() == b'private staging must not overwrite this'
                assert self.link.is_symlink(), 'Application consumed predictable .tmp sentinel'
            finally:
                super().__exit__(*arguments)

    tempfile.TemporaryDirectory = SentinelDirectory
    sys.argv = [smoke, executable]
    runpy.run_path(smoke, run_name='__main__')
    raise SystemExit(0)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execute(command, cwd, log):
    with log.open('w') as output:
        process = subprocess.run([str(x) for x in command], cwd=cwd, stdout=output,
                                 stderr=subprocess.STDOUT, timeout=240)
    assert process.returncode == 0, f'{command}\n{log.read_text()[-6000:]}'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--build', action='store_true')
parser.add_argument('--filter', default='')
parser.add_argument('--compiler', default=str(ROOT / 'bin/arya'))
options = parser.parse_args()
projects = sorted(list((ROOT / 'developer-projects').glob('0*/*/main.arya')) +
                  list((ROOT / 'native-desktop-projects').glob('0*/main.arya')))
projects = [p.parent for p in projects if 'writeTextAtomicSync' in p.read_text()
            and options.filter in str(p.relative_to(ROOT))]
assert projects, 'No matching migrated projects'
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
logs = ROOT / '.build/language-api-repairs' / ('applications-' + stamp)
logs.mkdir(parents=True)
report = {'host': sys.platform, 'compiler': str(Path(options.compiler).resolve()),
          'compiler_version': subprocess.check_output([options.compiler, '--version'], text=True).strip(),
          'projects': []}
for project in projects:
    relative = str(project.relative_to(ROOT))
    print('VERIFY ' + relative, flush=True)
    native = project.parent.name == 'native-desktop-projects'
    binary = project / '.build' / ('worker' if native else 'verified-app')
    binary.parent.mkdir(exist_ok=True)
    label = relative.replace('/', '--')
    if options.build:
        execute([options.compiler, 'check', 'main.arya'], project, logs / (label + '-check.log'))
        execute([options.compiler, 'build', 'main.arya', '-o', binary, '--release', '--force'],
                project, logs / (label + '-build.log'))
    execute([sys.executable, __file__, '--instrument-smoke', project / 'smoke.py', binary],
            project, logs / (label + '-smoke.log'))
    count = 0
    for kind in ('symlink', 'dangling', 'directory'):
        with tempfile.TemporaryDirectory(prefix='arya-store-boundary-') as directory:
            folder = Path(directory)
            sentinel = folder / 'sentinel'
            sentinel.write_bytes(b'original unrelated file')
            store = folder / 'data.json'
            if kind == 'symlink':
                store.symlink_to(sentinel)
            elif kind == 'dangling':
                store.symlink_to(folder / 'absent.json')
            else:
                store.mkdir()
            arguments = ['list', '{}'] if native else ['list'] if project.name.startswith('cli-') else []
            result = subprocess.run([str(binary), *arguments], cwd=folder,
                                    env={**os.environ, 'DATA_FILE': str(store), 'PORT': '0'},
                                    capture_output=True, text=True, timeout=8)
            if native:
                response = json.loads(result.stdout)
                assert result.returncode == 0 and response['ok'] is False, (relative, kind, result.stdout)
            else:
                assert result.returncode != 0, (relative, kind, result.stdout, result.stderr)
            assert 'regular' in (result.stdout + result.stderr).lower(), (relative, kind, result.stdout, result.stderr)
            assert sentinel.read_bytes() == b'original unrelated file'
            assert store.is_dir() if kind == 'directory' else store.is_symlink()
            assert not (folder / 'absent.json').exists()
            count += 1
    report['projects'].append({'path': relative, 'status': 'passed', 'source_sha256': sha(project / 'main.arya'),
                               'smoke_sha256': sha(project / 'smoke.py'), 'binary_sha256': sha(binary),
                               'boundary_cases': count, 'tmp_sentinel_instrumented_smoke': True})
    (logs / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print('  PASS: smoke + .tmp sentinel + 3 store entry boundaries', flush=True)
print(f'PASS: {len(projects)} applications, {len(projects) * 3} store entry cases; logs {logs.relative_to(ROOT)}')
