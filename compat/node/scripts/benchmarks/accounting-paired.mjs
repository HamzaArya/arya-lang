import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { invoices, ledger } from './accounting-data.mjs';

// Alternate both backends in one process to reduce process/order effects in
// preparation-dominated end-to-end comparisons. Run separately from other jobs.
const require = createRequire(import.meta.url),
  api = require('../../dist/accounting.cjs');
assert.equal(api.backendInfo().nativeAvailable, true, 'Build the native backend first.');
const results = [],
  rounds = 9;
const normalize = ({ backend, ...result }) => result;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
for (const count of [256, 10000, 100000]) {
  for (const [kind, groups] of [
    ['invoice', 0],
    ['ledger', 128],
    ...(count >= 10000 ? [['ledger', count]] : []),
  ]) {
    const lines = kind === 'invoice' ? invoices(count) : ledger(count, groups);
    const prepare = () =>
      kind === 'invoice'
        ? api.prepareInvoices(lines, { currency: 'AFN', scale: 2, rounding: 'half-even' })
        : api.prepareLedger(lines, { currency: 'AFN', scale: 2 });
    const prepared = prepare();
    assert.deepEqual(
      normalize(prepared.calculate({ backend: 'js' })),
      normalize(prepared.calculate({ backend: 'native' })),
    );
    const checksum = hash(normalize(prepared.calculate({ backend: 'js' })));
    const samples = { js: [], native: [] },
      iterations = count <= 256 ? 10 : 1;
    const action = (backend) => prepare().calculate({ backend });
    for (let i = 0; i < 3; i++) for (const backend of ['js', 'native']) action(backend);
    for (let round = 0; round < rounds; round++) {
      for (const backend of round % 2 ? ['native', 'js'] : ['js', 'native']) {
        global.gc?.();
        const start = performance.now();
        let output;
        for (let i = 0; i < iterations; i++) output = action(backend);
        samples[backend].push((performance.now() - start) / iterations);
        assert.equal(hash(normalize(output)), checksum);
      }
    }
    const result = { kind, count, groups, checksum };
    for (const backend of ['js', 'native'])
      result[backend] = {
        medianMs: [...samples[backend]].sort((a, b) => a - b)[Math.floor(rounds / 2)],
        samplesMs: samples[backend],
      };
    results.push(result);
    console.log(
      `${kind}/${count}/${groups}: JS ${result.js.medianMs.toFixed(3)} ms; native ${result.native.medianMs.toFixed(3)} ms end-to-end`,
    );
  }
}
const sourceHashes = {};
for (const filename of [
  'scripts/benchmarks/accounting-paired.mjs',
  'scripts/benchmarks/accounting-data.mjs',
  'src/accounting.ts',
  'src/accounting-core.ts',
  'dist/accounting.cjs',
])
  sourceHashes[filename] = createHash('sha256')
    .update(await readFile(filename))
    .digest('hex');
await mkdir('.build/accounting-performance', { recursive: true });
await writeFile(
  '.build/accounting-performance/paired.json',
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      rounds,
      statistic:
        'Median of nine alternating same-process samples; preparation and calculation included; GC outside timing',
      sourceHashes,
      nativeBuild: JSON.parse(
        await readFile(`dist/native/${process.platform}-${process.arch}-napi9/build.json`, 'utf8'),
      ),
      results,
    },
    null,
    2,
  ) + '\n',
);
