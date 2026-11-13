"""Supplemental binary64 toFixed oracle: every precision, wide nonzero results.
Optional evidence controller; it is not part of the language or normal gates.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import struct
import subprocess
import tempfile


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def expected(value, places):
    numerator, denominator = abs(value).as_integer_ratio()
    units, remainder = divmod(numerator * 10**places, denominator)
    if remainder * 2 >= denominator:
        units += 1
    digits = str(units).zfill(places + 1)
    if places:
        digits = digits[:-places] + '.' + digits[-places:]
    return ('-' if value < 0 else '') + digits


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    compiler = Path(os.environ.get('ARYA_NATIVE_BIN', root / '.build/independent/arya')).resolve()
    compiler_sha = sha(compiler)
    assert compiler_sha == 'd6a89f0e72cb7dd81550efc2a3c2347ed0fe88b4bf37f42786940aac50eb49f0'
    rng = random.Random(0x61727961)
    cases = []
    unique = set()

    def add(value, places):
        assert math.isfinite(value) and abs(value) < 1e21
        key = (struct.pack('>d', value), places)
        if key not in unique:
            unique.add(key)
            cases.append((value, places))

    for places in range(101):
        for value in [0., -0., 0.1, -0.1, math.nextafter(1e21, 0), -math.nextafter(1e21, 0)]:
            add(value, places)
        for exponent in [-1074, -1022, -333, -128, -127, -100, -64, -53, -32, -1, 0, 31, 32, 52, 53, 63, 64, 69]:
            power = math.ldexp(1., exponent)
            for neighbor in [math.nextafter(power, 0), power, math.nextafter(power, math.inf)]:
                add(neighbor, places)
                add(-neighbor, places)
        # Uniform bit patterns overwhelmingly round to zero. Restrict exponents
        # for these seeded cases to guarantee nonzero scaled coefficients.
        for _ in range(16):
            exponent = rng.randrange(-int(places * math.log2(10)), 69)
            value = math.ldexp(1. + rng.getrandbits(52) / 2**52, exponent)
            add(value, places)
            add(-value, places)
        # Exact half ties at every precision, including the wide-limb path:
        # (odd / 2**(places+1)) * 10**places = odd * 5**places / 2.
        odd = rng.getrandbits(52) | 1
        tie = math.ldexp(float(odd), -(places + 1))
        for neighbor in [math.nextafter(tie, 0), tie, math.nextafter(tie, math.inf)]:
            add(neighbor, places)
            add(-neighbor, places)

    source_text = ('use std "io" as io\nwhile true {\n'
                   ' const line = io.readLine()\n if line == null { break }\n'
                   ' const row = JSON.parse(line)\n'
                   ' print(number(row[0]).toFixed(row[1]))\n}\n')
    data = ''.join(json.dumps([repr(value), places]) + '\n' for value, places in cases)
    expected_lines = [expected(value, places) for value, places in cases]
    nonzero = sum(any(c in '123456789' for c in line) for line in expected_lines)
    assert nonzero > len(cases) // 2
    with tempfile.TemporaryDirectory(prefix='fixed-wide-reference-', dir=root / '.build') as directory:
        work = Path(directory)
        source = work / 'main.arya'
        source.write_text(source_text)
        binary = work / 'program'
        flags = ['--debug', '--sanitize'] if args.sanitize else ['--release']
        command = [str(compiler), 'build', str(source), '-o', str(binary), *flags, '--runtime-counters']
        build = subprocess.run(command, capture_output=True, text=True, timeout=180)
        assert build.returncode == 0, build.stdout + build.stderr
        environment = {'PATH': '/nonexistent', 'ARYA_GC_STRESS': '1',
                       'ASAN_OPTIONS': 'detect_leaks=0', 'UBSAN_OPTIONS': 'halt_on_error=1'}
        result = subprocess.run([str(binary)], input=data, capture_output=True, text=True,
                                env=environment, timeout=240)
        assert result.returncode == 0, result.stderr
        lines = result.stdout.splitlines()
        assert len(lines) == len(cases), (len(lines), len(cases))
        for pair, actual, wanted in zip(cases, lines, expected_lines):
            assert actual == wanted, (pair, actual, wanted)
        counters = {}
        for line in result.stderr.splitlines():
            if line.startswith('ARYA_'):
                key, value = line.split(' ', 1)
                counters[key] = json.loads(value)
            else:
                raise AssertionError(line)
        assert counters['ARYA_NUMBER_DETAIL']['toFixedFastPaths'] > 0
        assert counters['ARYA_NUMBER_DETAIL']['toFixedFallbacks'] > 0
        assert sha(compiler) == compiler_sha
        print(json.dumps({'passed': True, 'cases': len(cases), 'nonzeroExpectedOutputs': nonzero,
            'precisionRange': [0, 100], 'precisionCount': len({p for _, p in cases}),
            'sanitized': args.sanitize, 'seed': '0x61727961', 'host': platform.platform(),
            'compilerSha256': compiler_sha, 'controllerSha256': sha(__file__),
            'source': source_text, 'sourceSha256': sha(source),
            'generatedCSha256': sha(str(binary) + '.c'), 'binarySha256': sha(binary),
            'inputSha256': hashlib.sha256(data.encode()).hexdigest(),
            'outputSha256': hashlib.sha256(result.stdout.encode()).hexdigest(),
            'command': command, 'runtimeEnvironment': environment, 'counters': counters}))


if __name__ == '__main__':
    main()
