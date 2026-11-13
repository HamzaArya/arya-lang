"""Seeded compiler Check robustness; Python is an optional test controller only.

Every subprocess executes with PATH=/nonexistent. Check must never execute the
program, crash, hang, or produce a non-JSON diagnostic. A failing input and command
are retained beside the report so that the seed is not the only reproducer.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--compiler", default=".build/independent/arya")
parser.add_argument("--seed", type=int, default=731923)
parser.add_argument("--cases", type=int, default=256)
parser.add_argument("--output")
options = parser.parse_args()
if not 1 <= options.cases <= 10000:
    parser.error("--cases must be from 1 to 10000")
compiler = Path(options.compiler).resolve()
work = Path(tempfile.mkdtemp(prefix="arya-parser-fuzz-"))
source = work / "main.arya"
marker = work / "must-not-execute"
(work / "helper.arya").write_text(
    'use std "fs" as fs\nfs.writeTextSync(' + json.dumps(str(marker)) + ', "executed")\nexport const value = 1\n'
)
seeds = [
    'const n: number = 12\nprint(n + 3)\n',
    'fn twice(n: number): number => n * 2\nprint(3 |> twice())\n',
    'let rows = [{name: "Arya", score: 1}]\nfor row at i in rows { print(i, row.name) }\n',
    'try { throw new Error("test") } catch error { print(error.message) } finally { print("done") }\n',
    'use arya "./helper.arya" as helper\nprint(helper.value)\n',
    'const s = "سلام \\uD83C\\uDF09"\nprint(s?.length ?? 0)\n',
    'async fn work(value = 1, ...rest) { return await Promise.resolve(value) }\n',
    'const currency = "AFN"\nconst key = "total"\nconst base = {currency}\nconst row = {...base, [key]: 3, currency}\nprint(row)\n',
]
cases = [(s, True) for s in seeds]
# Deterministic resource-bound regressions, including the formerly unbounded
# unary recursion that exposed the compiler's own call-depth exception.
cases += [('print(' + 'not ' * 600 + 'false)\n', False),
          ('print(' + '(' * 150 + '1' + ')' * 150 + ')\n', False),
          ('const n: ' + 'Promise<' * 40 + 'number' + '>' * 40 + ' = 1\n', False)]
rng = random.Random(options.seed)
alphabet = list('(){}[],:;\n\"\'\\?!+-*/|#=') + ['🌉', '\x00', 'not ', 'await ', '...', '=>']
for _ in range(options.cases):
    value = rng.choice(seeds)
    for _ in range(rng.randint(1, 5)):
        at = rng.randrange(len(value) + 1)
        if rng.randrange(3) == 0 and at < len(value):
            value = value[:at] + value[at + rng.randint(1, 4):]
        else:
            value = value[:at] + rng.choice(alphabet) + value[at:]
    cases.append((value, None))
failures = []
for index, (value, expected) in enumerate(cases):
    source.write_text(value)
    command = [str(compiler), 'check', str(source), '--json']
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                env={**os.environ, 'PATH': '/nonexistent'}, timeout=5)
        report = json.loads(result.stdout)
        assert result.returncode in (0, 1), f'exit {result.returncode}'
        assert isinstance(report.get('ok'), bool), 'missing boolean ok'
        assert report['ok'] == (result.returncode == 0), 'inconsistent status'
        assert expected is None or report['ok'] == expected, 'unexpected acceptance'
        assert not marker.exists(), 'Check executed an import'
        if not report['ok']:
            assert report.get('diagnostics'), 'missing diagnostic'
            assert all(d.get('code') and d.get('message') for d in report['diagnostics'])
        if index == len(seeds):
            diagnostic = report['diagnostics'][0]
            assert diagnostic['code'] == 'ARYA_SYNTAX', 'internal error escaped for unary nesting'
            assert diagnostic.get('line') == 1 and diagnostic.get('column', 0) > 0, 'missing user location'
    except (AssertionError, ValueError, subprocess.TimeoutExpired) as error:
        reproduction = work / f'failure-{index}.arya'
        reproduction.write_text(value)
        failures.append({'case': index, 'error': str(error), 'source': str(reproduction),
                         'command': [str(compiler), 'check', str(reproduction), '--json']})
summary = {'seed': options.seed, 'mutations': options.cases, 'totalCases': len(cases),
           'compilerSha256': hashlib.sha256(compiler.read_bytes()).hexdigest(),
           'controllerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'environment': 'compiler subprocess PATH=/nonexistent; Python controller only',
           'failures': failures, 'reproductions': str(work)}
encoded = json.dumps(summary, indent=2) + '\n'
if options.output:
    with Path(options.output).open('x') as stream:
        stream.write(encoded)
print(encoded, end='')
raise SystemExit(bool(failures))
