"""Optional paired native-runtime benchmark with exact output checks.

Python collects evidence only. Native SDKs, applications and normal acceptance
do not depend on it. Counter runs are separate from timed release runs.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import resource
import statistics
import subprocess
import tempfile
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', action='append', required=True, help='label:path')
    parser.add_argument('--samples', type=int, default=9)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error('use an odd sample count of at least three')
    if args.output.exists():
        parser.error('output already exists; preserve previous evidence')
    root = Path(__file__).resolve().parents[2]
    work = Path(tempfile.mkdtemp(prefix='fastpaths-benchmark-', dir=root / '.build'))
    environment = dict(os.environ)
    for name in ['ARYA_NATIVE_LIBDIR', 'ARYA_GC_STRESS']:
        environment.pop(name, None)
    selected_cc = environment.get('ARYA_CC') or environment.get('CC') or 'cc'
    sources = {'kernels': root / 'native/benchmarks/performance.arya',
               'stream': root / 'native/examples/stream-ledger.arya'}
    report = {'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
              'host': platform.platform(), 'cpuCount': os.cpu_count(),
              'ccCommand': selected_cc,
              'cc': subprocess.check_output([selected_cc, '--version'], text=True, env=environment),
              'sourceSha256': {name: sha(path) for name, path in sources.items()},
              'controllerSha256': sha(__file__), 'evidenceDirectory': str(work),
              'method': 'Release -O2 -ffp-contract=off; one discarded process per workload/SDK; alternating SDK order; fresh process per sample; warm filesystem caches. Kernels report CPU inside the operation and independently checked scalar checksums (not full data equality). CSV reports whole-process child CPU and wall time including input/output, startup and cleanup, with independent full exact-output equality. Instrumented allocation runs are separate and their timings are excluded.',
              'runtimeEnvironment': {'PATH': '/nonexistent'}, 'compilers': {},
              'inputs': {}, 'warmups': [], 'raw': [], 'allocationRuns': [], 'summary': []}
    binaries = {}
    for item in args.compiler:
        label, path = item.split(':', 1)
        if not label.isalnum() or label in binaries:
            parser.error('compiler labels must be unique alphanumeric names')
        compiler = Path(path).resolve()
        report['compilers'][label] = {'path': str(compiler), 'sha256': sha(compiler), 'builds': []}
        binaries[label] = {}
        for name, source in sources.items():
            for counters in [False, True]:
                kind = name + ('-counters' if counters else '')
                binary = work / (label + '-' + kind)
                command = [str(compiler), 'build', str(source), '-o', str(binary), '--release']
                if counters:
                    command.append('--runtime-counters')
                start = time.perf_counter_ns()
                result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=180)
                elapsed = (time.perf_counter_ns() - start) / 1e6
                (work / (binary.name + '.build.log')).write_text(result.stdout + result.stderr)
                assert result.returncode == 0, result.stderr
                binaries[label][kind] = binary
                report['compilers'][label]['builds'].append({'kind': kind, 'command': command,
                    'wallMs': elapsed, 'binarySha256': sha(binary), 'generatedCSha256': sha(str(binary) + '.c'),
                    'bytes': binary.stat().st_size})

    text = json.dumps({f'key{i}': i for i in range(20000)}, separators=(',', ':'))
    json_input = work / 'wide.json'
    json_input.write_text(text)
    report['inputs']['wide.json'] = {'sha256': sha(json_input), 'bytes': json_input.stat().st_size}
    cases = []
    for mode, count in [('concat', 40000), ('record', 20000), ('json-parse', 20000),
                        ('json-stringify', 20000), ('promise', 16000), ('map-read', 16000)]:
        expected = (count - 1 if mode in ['record', 'json-parse'] else len(text) if mode == 'json-stringify'
                    else count * (count - 1) // 2 if mode == 'map-read' else count)
        cases.append({'name': mode, 'kind': 'kernels', 'arguments': [mode, str(count), str(json_input)],
                      'input': None, 'expected': expected})
    for count in [10000, 100000]:
        source = work / f'{count}.csv'
        totals = {}
        with source.open('w', newline='') as output:
            writer = csv.writer(output)
            writer.writerow(['account', 'amount'])
            for index in range(count):
                slot = index % 100
                account = ['=print(99)', '__proto__', 'حساب', 'quoted,account'][slot] if slot < 4 else f'account-{slot}'
                units = -20035 if index % 5 == 0 else 100005
                writer.writerow([account, '-20.035' if units < 0 else '100.005'])
                totals[account] = totals.get(account, 0) + units
        def rounded(units):
            cents, remainder = divmod(abs(units), 10)
            if remainder > 5 or remainder == 5 and cents % 2:
                cents += 1
            return ('-' if units < 0 and cents else '') + str(cents // 100) + '.' + str(cents % 100).zfill(2)
        expected = {'rows': count, 'accounts': [{'account': name, 'total': {'amount': rounded(units),
                    'currency': 'USD', 'scale': 2, 'rounding': 'half-even'}} for name, units in totals.items()]}
        report['inputs'][source.name] = {'sha256': sha(source), 'bytes': source.stat().st_size}
        cases.append({'name': 'csv-' + str(count), 'kind': 'stream', 'arguments': ['USD', '2', 'half-even'],
                      'input': source, 'expected': expected})

    def run(label, case, counters=False):
        kind = case['kind'] + ('-counters' if counters else '')
        command = [str(binaries[label][kind]), *case['arguments']]
        stream = case['input'].open('rb') if case['input'] else subprocess.DEVNULL
        load = os.getloadavg()
        before = resource.getrusage(resource.RUSAGE_CHILDREN)
        start = time.perf_counter_ns()
        try:
            result = subprocess.run(command, stdin=stream, capture_output=True, text=True,
                                    env={'PATH': '/nonexistent'}, timeout=90)
        finally:
            if case['input']:
                stream.close()
        wall = (time.perf_counter_ns() - start) / 1e6
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        child_cpu = ((after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime)) * 1000
        assert result.returncode == 0, (command, result.stdout, result.stderr)
        if case['kind'] == 'kernels':
            answer, cpu = result.stdout.split()
            assert float(answer) == case['expected'], (case['name'], answer, case['expected'])
            cpu = float(cpu)
        else:
            assert json.loads(result.stdout) == case['expected'], case['name']
            cpu = child_cpu
        assert math.isfinite(cpu) and cpu >= 0, (command, cpu)
        row = {'label': label, 'workload': case['name'], 'cpuMs': cpu, 'childCpuMs': child_cpu,
               'wallMs': wall, 'loadBefore': load, 'loadAfter': os.getloadavg(),
               'command': command, 'outputSha256': hashlib.sha256(result.stdout.encode()).hexdigest()}
        if counters:
            for line in result.stderr.splitlines():
                if line.startswith('ARYA_'):
                    key, value = line.split(' ', 1)
                    row[key] = json.loads(value)
            assert 'ARYA_RUNTIME_COUNTERS' in row and 'ARYA_ALLOCATION_DETAIL' in row
        else:
            assert not result.stderr, result.stderr
        return row

    for case in cases:
        for sample in range(-1, args.samples):
            labels = list(binaries)
            if sample % 2:
                labels.reverse()
            for label in labels:
                row = run(label, case)
                row['sample'] = sample
                report['warmups' if sample < 0 else 'raw'].append(row)
        for label in binaries:
            rows = [r for r in report['raw'] if r['label'] == label and r['workload'] == case['name']]
            summary = {'label': label, 'workload': case['name']}
            for key in ['cpuMs', 'wallMs']:
                values = [r[key] for r in rows]
                summary[key] = {'median': statistics.median(values), 'min': min(values), 'max': max(values)}
            report['summary'].append(summary)
            report['allocationRuns'].append(run(label, case, counters=True))
            print(json.dumps(summary), flush=True)
    for info in report['compilers'].values():
        assert sha(info['path']) == info['sha256'], 'compiler changed during measurement'
        for built in info['builds']:
            path = built['command'][built['command'].index('-o') + 1]
            assert sha(path) == built['binarySha256'], 'binary changed during measurement'
            assert sha(path + '.c') == built['generatedCSha256'], 'generated C changed during measurement'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
