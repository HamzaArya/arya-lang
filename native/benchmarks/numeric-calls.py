"""Optional paired CPU benchmark for native immediate numeric method calls.

Use --compiler label:path for normal SDK comparisons, or --binary label:path
for separately built controlled variants. Python collects evidence only.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', action='append', default=[], help='label:path')
    parser.add_argument('--binary', action='append', default=[], help='label:path')
    parser.add_argument('--samples', type=int, default=9)
    parser.add_argument('--iterations', type=int, default=40000)
    parser.add_argument('--note', default='')
    parser.add_argument('--origin-compiler', type=Path, help='compiler that generated prebuilt variants (provenance only)')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error('use an odd sample count of at least three')
    if not 10000 <= args.iterations <= 1000000:
        parser.error('iterations must be from 10000 through 1000000')
    if len(args.compiler) + len(args.binary) < 2:
        parser.error('provide at least two compiler/binary variants')
    if args.output.exists():
        parser.error('output exists; preserve previous evidence')
    root = Path(__file__).resolve().parents[2]
    source = root / 'native/benchmarks/numeric-calls.arya'
    work = Path(tempfile.mkdtemp(prefix='numeric-calls-benchmark-', dir=root / '.build'))
    build_env = dict(os.environ)
    build_env.pop('ARYA_GC_STRESS', None)
    build_env.pop('ARYA_NATIVE_LIBDIR', None)
    run_env = {'PATH': '/nonexistent'}
    report = {'recordedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'platform': platform.platform(), 'machine': platform.machine(),
              'cc': subprocess.check_output(['cc', '--version'], text=True).splitlines()[0],
              'sourceSha256': sha(source), 'controllerSha256': sha(__file__),
              'method': 'Nine samples by default; alternating backend order, fresh process per sample, 2000 internal warmup calls followed by collection, then process CPU inside the loop. One additional whole-process warmup per variant/mode discarded. Startup/build/output excluded. No runtime counters in compiler-built variants.',
              'runtimeEnvironment': run_env, 'note': args.note,
              'command': [sys.executable, *sys.argv],
              'loadStart': os.getloadavg(), 'artifacts': {}, 'raw': [], 'summary': []}
    if args.origin_compiler:
        report['originCompiler'] = {'path': str(args.origin_compiler.resolve()),
                                    'sha256': sha(args.origin_compiler)}
    for kind, entries in [('compiler', args.compiler), ('binary', args.binary)]:
        for entry in entries:
            label, value = entry.split(':', 1)
            if not label.isalnum() or label in report['artifacts']:
                parser.error('labels must be unique and alphanumeric')
            original = Path(value).resolve()
            artifact = {'inputKind': kind, 'input': str(original)}
            if kind == 'compiler':
                binary = work / label
                command = [str(original), 'build', str(source), '-o', str(binary), '--release']
                start = time.perf_counter()
                built = subprocess.run(command, capture_output=True, text=True, env=build_env, timeout=120)
                (work / (label + '.build.log')).write_text(built.stdout + built.stderr)
                assert built.returncode == 0, built.stderr
                artifact.update({'compilerSha256': sha(original), 'buildCommand': command,
                                 'buildWallMs': (time.perf_counter() - start) * 1000})
            else:
                binary = original
            generated = Path(str(binary) + '.c')
            artifact.update({'binary': str(binary), 'binarySha256': sha(binary),
                             'binaryBytes': binary.stat().st_size,
                             'generatedCSha256': sha(generated) if generated.exists() else None})
            report['artifacts'][label] = artifact
    for mode in ['fixed', 'radix', 'decimal']:
        lengths = [len(str(i) + '.25' if mode == 'fixed' else format(i, 'x') if mode == 'radix' else str(i)) for i in range(10000)]
        expected = sum(lengths) * (args.iterations // 10000) + sum(lengths[:args.iterations % 10000])
        for sample in range(-1, args.samples):
            order = list(report['artifacts'])
            if sample % 2:
                order.reverse()
            for label in order:
                binary = report['artifacts'][label]['binary']
                done = subprocess.run([binary, mode, str(args.iterations)], capture_output=True, text=True, env=run_env, check=True, timeout=60)
                assert not done.stderr, done.stderr
                checksum, cpu = done.stdout.split()
                assert int(checksum) == expected, (label, mode, checksum, expected)
                if sample >= 0:
                    report['raw'].append({'label': label, 'mode': mode, 'iterations': args.iterations,
                                          'sample': sample, 'cpuMs': float(cpu), 'checksum': int(checksum),
                                          'loadAverage': os.getloadavg()})
        for label in report['artifacts']:
            values = [r['cpuMs'] for r in report['raw'] if r['label'] == label and r['mode'] == mode]
            row = {'label': label, 'mode': mode, 'iterations': args.iterations,
                   'medianCpuMs': statistics.median(values), 'minCpuMs': min(values), 'maxCpuMs': max(values)}
            report['summary'].append(row)
            print(json.dumps(row), flush=True)
    for artifact in report['artifacts'].values():
        assert sha(artifact['binary']) == artifact['binarySha256'], 'binary changed during measurement'
        if artifact['inputKind'] == 'compiler':
            assert sha(artifact['input']) == artifact['compilerSha256'], 'compiler changed during measurement'
    if args.origin_compiler:
        assert sha(args.origin_compiler) == report['originCompiler']['sha256'], 'origin compiler changed during measurement'
    report['loadEnd'] = os.getloadavg()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
