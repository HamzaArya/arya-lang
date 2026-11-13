"""Optional CPU evidence collector for already-built UTF conversion variants.

Build utf8-storage.arya with two SDKs, then pass --binary before:path and
--binary after:path. Python is not required by Arya builds or acceptance.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', action='append', required=True, help='label:path')
    parser.add_argument('--samples', type=int, default=9)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--provenance', type=Path)
    args = parser.parse_args()
    if args.samples < 3 or args.samples % 2 == 0:
        parser.error('choose an odd sample count of at least three')
    if args.output.exists():
        parser.error('output exists; preserve previous evidence')
    root = Path(__file__).resolve().parents[2]
    source = root / 'native/benchmarks/utf8-storage.arya'
    artifacts = {}
    for item in args.binary:
        label, path = item.split(':', 1)
        if not label.isalnum() or label in artifacts:
            parser.error('labels must be unique and alphanumeric')
        binary = Path(path).resolve()
        artifacts[label] = {'binary': str(binary), 'binarySha256': sha(binary),
                            'generatedCSha256': sha(str(binary) + '.c')}
    report = {'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
              'host': platform.platform(), 'architecture': platform.machine(),
              'logicalCpus': os.cpu_count(),
              'cc': subprocess.check_output(['cc', '--version'], text=True),
              'command': [sys.executable, *sys.argv],
              'sourceSha256': sha(source), 'controllerSha256': sha(__file__),
              'method': 'Release binaries; CPU clock inside conversion loop, after20 warmup conversions and collection. One discarded whole-process warmup per variant/case; alternating fresh-process samples. No counters or sanitizers. Build/startup/output excluded. Scalar byte/unit length checksums verified; content/ownership/guard-page tests are separate.',
              'runtimeEnvironment': {'PATH': '/nonexistent'},
              'artifacts': artifacts, 'warmups': [], 'raw': [], 'summary': []}
    if args.provenance:
        report['provenance'] = json.loads(args.provenance.read_text())
        report['provenanceSha256'] = sha(args.provenance)
    cases = [('ascii', 64, 100000), ('ascii', 4096, 4000),
             ('ascii', 262144, 200), ('unicode', 4092, 4000),
             ('early-unicode', 4096, 4000), ('middle-unicode', 4096, 4000),
             ('late-unicode', 4096, 4000)]
    for mode in ['decode', 'encode']:
        for kind, units, count in cases:
            size = units if mode == 'decode' or kind == 'ascii' else units * 2 if kind == 'unicode' else units + 1
            for sample in range(-1, args.samples):
                labels = list(artifacts)
                if sample % 2:
                    labels.reverse()
                for label in labels:
                    command = [artifacts[label]['binary'], mode, str(units), str(count), kind]
                    done = subprocess.run(command, capture_output=True, text=True,
                                          env=report['runtimeEnvironment'], timeout=60, check=True)
                    assert not done.stderr, done.stderr
                    total, cpu = done.stdout.split()
                    assert int(total) == size * count, (command, total, size * count)
                    row = {'label': label, 'mode': mode, 'kind': kind, 'units': units,
                           'iterations': count, 'sample': sample, 'cpuMs': float(cpu),
                           'checksum': int(total), 'command': command, 'load': os.getloadavg()}
                    report['warmups' if sample < 0 else 'raw'].append(row)
            for label in artifacts:
                values = [r['cpuMs'] for r in report['raw'] if r['label'] == label
                          and r['mode'] == mode and r['kind'] == kind and r['units'] == units]
                row = {'label': label, 'mode': mode, 'kind': kind, 'units': units,
                       'iterations': count, 'medianCpuMs': statistics.median(values),
                       'minCpuMs': min(values), 'maxCpuMs': max(values)}
                report['summary'].append(row)
                print(json.dumps(row), flush=True)
    for artifact in artifacts.values():
        assert sha(artifact['binary']) == artifact['binarySha256']
        assert sha(artifact['binary'] + '.c') == artifact['generatedCSha256']
    assert sha(source) == report['sourceSha256'] and sha(__file__) == report['controllerSha256']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
