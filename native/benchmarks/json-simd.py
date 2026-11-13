"""Optional paired JSON parsing benchmark; Python records evidence only.

Build json-simd.arya with each SDK, then pass --binary label:path repeatedly.
The JSON construction, warmup, collection and output are outside the CPU timer.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', action='append', required=True, help='label:path')
    parser.add_argument('--samples', type=int, default=9)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--note', default='')
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error('use an odd sample count of at least three')
    if len(args.binary) < 2 or args.output.exists():
        parser.error('provide at least two variants and a new output path')
    source = Path(__file__).with_suffix('.arya')
    env = {'PATH': '/nonexistent'}
    report = {'recordedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'platform': platform.platform(), 'machine': platform.machine(),
              'cc': subprocess.check_output(['cc', '--version'], text=True).splitlines()[0],
              'sourceSha256': sha(source), 'controllerSha256': sha(__file__),
              'method': 'Fresh process per sample; alternating backend order; one discarded process warmup per mode/backend; 20 internal warmup parses then collection; CPU timer encloses parse loop only. No runtime counters. All checksums independently verified.',
              'runtimeEnvironment': env, 'note': args.note, 'loadStart': os.getloadavg(),
              'artifacts': {}, 'raw': [], 'summary': []}
    for entry in args.binary:
        label, path = entry.split(':', 1)
        if not label.isalnum() or label in report['artifacts']:
            parser.error('labels must be unique and alphanumeric')
        binary = Path(path).resolve()
        generated = Path(str(binary) + '.c')
        report['artifacts'][label] = {'binary': str(binary), 'binarySha256': sha(binary),
                                     'binaryBytes': binary.stat().st_size,
                                     'generatedCSha256': sha(generated) if generated.exists() else None}
    cases = [('ascii8192', 10000, 8192), ('unicode8192', 10000, 8192),
             ('escaped8192', 10000, 8189), ('short', 50000, 4),
             ('rows', 1500, 100), ('mixed', 1500, 100)]
    for mode, iterations, length in cases:
        for sample in range(-1, args.samples):
            order = list(report['artifacts'])
            if sample % 2:
                order.reverse()
            for label in order:
                command = [report['artifacts'][label]['binary'], mode, str(iterations)]
                done = subprocess.run(command, capture_output=True, text=True, env=env, check=True, timeout=60)
                assert not done.stderr, done.stderr
                checksum, cpu = done.stdout.split()
                assert int(checksum) == iterations * length, (mode, label, checksum)
                if sample >= 0:
                    report['raw'].append({'label': label, 'mode': mode, 'iterations': iterations,
                                          'sample': sample, 'cpuMs': float(cpu), 'checksum': int(checksum),
                                          'loadAverage': os.getloadavg()})
        for label in report['artifacts']:
            values = [r['cpuMs'] for r in report['raw'] if r['label'] == label and r['mode'] == mode]
            row = {'label': label, 'mode': mode, 'iterations': iterations,
                   'medianCpuMs': statistics.median(values), 'minCpuMs': min(values), 'maxCpuMs': max(values)}
            report['summary'].append(row)
            print(json.dumps(row), flush=True)
    for artifact in report['artifacts'].values():
        assert sha(artifact['binary']) == artifact['binarySha256'], 'binary changed during measurement'
    report['loadEnd'] = os.getloadavg()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
