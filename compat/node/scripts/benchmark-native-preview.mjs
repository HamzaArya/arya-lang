import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { cpus, loadavg, freemem, totalmem } from 'node:os';
const require = createRequire(import.meta.url);
const { compile } = require('../dist/compiler.cjs');
const { buildNativePreview, serializeNativeIR } = require('../dist/native-preview.cjs');
await mkdir('.build/native-preview-benchmark', { recursive: true });
const directory = await mkdtemp(resolve('.build/native-preview-benchmark/run-'));
const source = `fn subtotal(count: number): number {\n let total: number = 0\n let index: number = 0\n while index < count {\n  total += index * 0.25\n  index += 1\n }\n return total\n}\nprint(subtotal(1000000))\n`;
const file = join(directory, 'main.arya');
await writeFile(file, source);
const jsStart = performance.now(),
  javascript = compile(source, 'main.arya').code,
  javascriptCompileMs = performance.now() - jsStart;
await writeFile(join(directory, 'main.mjs'), javascript);
const native = await buildNativePreview(file, {
  output: join(directory, 'program'),
  mode: 'release',
});
await writeFile(join(directory, 'program.ll'), native.llvm);
await writeFile(join(directory, 'program.ir.json'), serializeNativeIR(native.ir));
const hostStart = {
  loadAverage: loadavg(),
  freeMemoryBytes: freemem(),
  totalMemoryBytes: totalmem(),
};
const samples = { javascript: [], native: [] };
let expected;
for (let round = -1; round < 9; round++) {
  for (const backend of round % 2 ? ['native', 'javascript'] : ['javascript', 'native']) {
    const start = performance.now();
    const child = spawnSync(
      backend === 'native' ? native.output : process.execPath,
      backend === 'native' ? [] : [join(directory, 'main.mjs')],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: backend === 'native' ? { PATH: '/nonexistent', LC_ALL: 'C' } : process.env,
      },
    );
    const duration = performance.now() - start;
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr);
    expected ??= child.stdout;
    if (child.stdout !== expected || expected !== '124999875000\n')
      throw new Error('Numeric differential failure');
    if (round >= 0) samples[backend].push(duration);
  }
}
const sourceHashes = {};
for (const path of [
  'src/native-ir.ts',
  'src/native-lower.ts',
  'src/native-backend.ts',
  'src/native-preview.ts',
  'src/compiler.ts',
  'src/emitter.ts',
  'scripts/benchmark-native-preview.mjs',
])
  sourceHashes[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const result = {
  version: JSON.parse(await readFile('package.json', 'utf8')).version,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model,
  statistic:
    'Median of nine alternating process launches after one untimed warmup; process startup plus one-million-iteration calculation; no pure kernel or universal performance claim',
  hostStart,
  hostEnd: { loadAverage: loadavg(), freeMemoryBytes: freemem() },
  source,
  sourceHashes,
  output: expected,
  javascript: {
    bytes: Buffer.byteLength(javascript),
    compileMs: javascriptCompileMs,
    samplesMs: samples.javascript,
    medianMs: [...samples.javascript].sort((a, b) => a - b)[4],
  },
  native: {
    bytes: native.bytes,
    sha256: native.sha256,
    compiler: native.compiler,
    compileMs: native.buildMs,
    samplesMs: samples.native,
    medianMs: [...samples.native].sort((a, b) => a - b)[4],
  },
  directory,
};
await writeFile(
  '.build/native-preview-benchmark/results.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
