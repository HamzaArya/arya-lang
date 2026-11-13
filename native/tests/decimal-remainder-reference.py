#!/usr/bin/env python3
"""Generate/check remainder vectors using Python integers, not libmpdec."""
import argparse
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'native/tests/fixtures/decimal-remainder-vectors.arya'


def units(text):
    negative = text.startswith('-')
    text = text.lstrip('-')
    whole, dot, fraction = text.partition('.')
    value = int(whole + fraction)
    return (-value if negative else value), len(fraction)


def canonical(value, scale):
    if not value:
        return '0'
    digits = str(abs(value)).zfill(scale + 1)
    text = digits[:-scale] + '.' + digits[-scale:] if scale else digits
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return ('-' if value < 0 else '') + text


def remainder(left, right):
    a, sa = units(left)
    b, sb = units(right)
    scale = max(sa, sb)
    a *= 10 ** (scale - sa)
    b *= 10 ** (scale - sb)
    # Magnitudes avoid Python's divisor-sign modulo convention.
    result = abs(a) % abs(b)
    return canonical(-result if a < 0 else result, scale)


def render():
    cases = [('7', '3'), ('-7', '3'), ('7', '-3'), ('-7', '-3'),
             ('5.5', '2'), ('-5.5', '2'), ('5.5', '-2'), ('-5.5', '-2'),
             ('0', '1'), ('-0.00', '-3'), ('1.0000', '0.10'),
             ('1', '10'), ('-1', '10'), ('1.2300', '0.200'),
             ('-9223372036854775808', '-1'), ('9223372036854775807', '0.3'),
             ('-9223372036854775808', '3'), ('1', '0.' + '0' * 1021 + '3'),
             ('9' * 1024, '3'), ('-' + '9' * 1023, '7'),
             ('9' * 1024, '0.' + '0' * 1021 + '3'),
             ('-' + '9' * 1023, '0.' + '0' * 1021 + '3'),
             ('0.' + '0' * 1021 + '1', '2'),
             ('0.' + '9' * 1022, '0.' + '0' * 1021 + '7')]
    rng = random.Random(20261113)
    for _ in range(160):
        operands = []
        for _ in range(2):
            width = rng.randrange(1, 129)
            coefficient = rng.randrange(1, 10 ** width)
            if rng.randrange(2):
                coefficient = -coefficient
            operands.append(canonical(coefficient, rng.randrange(101)))
        cases.append(tuple(operands))
    lines = ['# Independent scaled-integer reference vectors; regenerate with decimal-remainder-reference.py.',
             'export const vectors = [']
    lines += ['  ' + json.dumps([a, b, remainder(a, b)]) + ',' for a, b in cases]
    lines += [']', '']
    return '\n'.join(lines), len(cases)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    options = parser.parse_args()
    content, count = render()
    if options.write:
        OUTPUT.write_text(content)
    else:
        assert OUTPUT.read_text() == content, 'Stored reference vectors differ from independent integer oracle'
    print(f'decimal remainder: {count} independent scaled-integer vectors verified')
