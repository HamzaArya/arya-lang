import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { cpus } from 'node:os';
const require = createRequire(import.meta.url),
  { compile } = require('../dist/compiler.cjs');
const quick = process.argv.includes('--quick'),
  rounds = quick ? 3 : 7,
  sizes = quick ? [1, 256, 10000] : [1, 256, 1000, 10000, 100000, 1000000];
await mkdir('.build/accounting-benchmark', { recursive: true });
await mkdir('.build/accounting-performance', { recursive: true });
const decimal = compile('use std "decimal" as decimal\nexport const d = decimal', 'decimal.arya');
await writeFile('.build/accounting-benchmark/decimal.mjs', decimal.code);
const results = [];
for (const count of sizes) {
  for (const [kind, groups, variants] of [
    [
      'invoice',
      0,
      count <= 100000 ? ['decimal-wrapper', 'decimal-batch', 'js', 'native'] : ['js', 'native'],
    ],
    ['ledger', Math.min(count, 128), ['js', 'native']],
    ...(count >= 10000 ? [['ledger', Math.min(count, 100000), ['js', 'native']]] : []),
  ]) {
    let checksum;
    for (const variant of variants) {
      const started = performance.now();
      const child = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          'scripts/benchmarks/accounting-worker.mjs',
          kind,
          variant,
          String(count),
          String(groups),
          String(rounds),
        ],
        { encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024 },
      );
      if (child.error) throw child.error;
      if (child.status !== 0) throw new Error(child.stderr || child.stdout);
      const result = JSON.parse(child.stdout.trim());
      if (checksum && checksum !== result.checksum)
        throw new Error(`Different accounting result: ${kind}/${count}/${groups}/${variant}`);
      checksum = result.checksum;
      results.push({ ...result, freshProcessMs: performance.now() - started });
      console.log(
        `${kind} ${count} rows / ${groups} groups / ${variant}: ${result.prepared.medianMs.toFixed(4)} ms prepared${result.endToEnd ? ', ' + result.endToEnd.medianMs.toFixed(4) + ' ms end-to-end' : ''}`,
      );
    }
  }
}
const cold = [];
for (const variant of ['decimal-wrapper', 'decimal-batch', 'js', 'native']) {
  const samples = [];
  for (let i = 0; i < (quick ? 2 : 5); i++) {
    const started = performance.now();
    const child = spawnSync(
      process.execPath,
      ['scripts/benchmarks/accounting-worker.mjs', 'invoice', variant, '1', '0', '1'],
      { env: { ...process.env, ARYA_BENCH_COLD: '1' }, encoding: 'utf8', timeout: 30000 },
    );
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr);
    samples.push({ ...JSON.parse(child.stdout.trim()), processMs: performance.now() - started });
  }
  cold.push({
    variant,
    samples,
    medianProcessMs: samples.map((sample) => sample.processMs).sort((a, b) => a - b)[
      Math.floor(samples.length / 2)
    ],
  });
}
const nativePath = resolve(
  'dist/native',
  process.platform + '-' + process.arch + '-napi9/accounting.node',
);
const sourceFiles = [
  'src/accounting.ts',
  'src/accounting-core.ts',
  'native/accounting/kernel.h',
  'native/accounting/addon.cc',
  'scripts/benchmark-accounting.mjs',
  'scripts/benchmarks/accounting-worker.mjs',
  'scripts/benchmarks/accounting-data.mjs',
];
const hashes = {};
for (const filename of sourceFiles)
  hashes[filename] = createHash('sha256')
    .update(await readFile(filename))
    .digest('hex');
const result = {
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model,
  rounds,
  statistic: 'Median warmed per-call milliseconds; all raw samples retained',
  policy:
    'AFN tag, scale 2, half-even, per-line gross/discount/tax rounding; identical prepared inputs and output hashes',
  scope:
    'Decimal comparisons are arithmetic baselines on valid bounded data, not interchangeable public APIs. End-to-end comparison uses the same fully validated accounting API for JS and native. Fresh-process time includes the entire worker benchmark, not just startup.',
  bytes: {
    javascript: (await stat('dist/accounting.cjs')).size,
    native: (await stat(nativePath)).size,
    decimalProgram: Buffer.byteLength(decimal.code),
  },
  nativeBuild: JSON.parse(
    await readFile(
      resolve('dist/native', process.platform + '-' + process.arch + '-napi9/build.json'),
      'utf8',
    ),
  ),
  sourceHashes: hashes,
  cold,
  results,
};
await writeFile(
  '.build/accounting-performance/results.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log('Results: .build/accounting-performance/results.json');
