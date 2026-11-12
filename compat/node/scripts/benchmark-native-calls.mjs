// Node orchestrates measurements; every measured program is an independent binary.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, loadavg, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = resolve('.');
const inputCompiler = resolve(process.env.ARYA_NATIVE_BIN || '.build/independent/arya');
const directoryRoot = join(root, '.build/native-call-benchmark');
await mkdir(directoryRoot, { recursive: true });
const directory = await mkdtemp(join(directoryRoot, 'run-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
// Keep a concurrent source build from replacing the compiler during measurement.
const sdk = join(directory, 'sdk');
await mkdir(sdk);
const compiler = join(sdk, 'arya');
await cp(inputCompiler, compiler);
await cp(join(dirname(inputCompiler), 'lib'), join(sdk, 'lib'), { recursive: true });
await cp(join(dirname(inputCompiler), 'stdlib'), join(sdk, 'stdlib'), { recursive: true });
const compilerSourceHashes = {};
for (const filename of (await readdir(dirname(inputCompiler))).filter((name) => name.endsWith('.arya'))) {
  compilerSourceHashes[filename] = hash(await readFile(join(dirname(inputCompiler), filename)));
}
const compilerGeneratedCSha256 = hash(await readFile(inputCompiler + '.c'));
const harnessSha256 = hash(await readFile(join(root, 'scripts/benchmark-native-calls.mjs')));
function run(binary, args = []) {
  const started = performance.now();
  const result = spawnSync(binary, args.map(String), { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(binary + ' failed: ' + result.stderr);
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), wallMs: performance.now() - started };
}
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1), samplesMs: values };
}
const cases = [
  {
    name: 'recursive-fibonacci', size: 24, expected: [46368, 75025],
    source: 'fn fib(n) { if n < 2 { return n }; return fib(n - 1) + fib(n - 2) }\nfn work(n) => fib(n)\n',
  },
  {
    name: 'general-boolean-calls', size: 100000, expected: [100000, -100001],
    source: 'fn flip(value) => not value\nfn work(n) { let value = false; let i = 0; while i < n { value = flip(value); i += 1 }; if value { return -i }; return i }\n',
  },
  {
    name: 'captured-dynamic-calls', size: 20000, expected: [20000, 20001],
    source: 'fn factory() { let total = 0; return fn(step) { total += step; return total } }\nfn work(n) { const next = factory(); let i = 0; let value = 0; while i < n { value = next(1); i += 1 }; return value }\n',
  },
];
const harness = [
  'const n = number(args[0])',
  'const repetitions = number(args[1])',
  'if repetitions == 0 { print(work(n), work(n + 1)) }',
  'else {',
  '  const warmStart = runtime.clock()',
  '  let i = 0; let checksum = 0',
  '  while i < 8 or runtime.clock() - warmStart < 0.15 { checksum += work(n + i % 2); i += 1 }',
  '  i = 0; checksum = 0',
  '  const wallStart = performance.now(); const start = runtime.clock()',
  '  while i < repetitions { checksum += work(n + i % 2); i += 1 }',
  '  const elapsed = (runtime.clock() - start) * 1000',
  '  const wallElapsed = performance.now() - wallStart',
  '  print(checksum, elapsed, wallElapsed)',
  '}',
  '',
].join('\n');
const hostStart = { loadAverage: loadavg() };
const results = [];
for (const item of cases) {
  const source = 'use std "runtime" as runtime\n' + item.source + harness;
  const kernelSource = 'const n = number(args[0])\n' + item.source + 'print(work(n), work(n + 1))\n';
  const sourcePath = join(directory, item.name + '.arya');
  const kernelPath = join(directory, item.name + '-kernel.arya');
  await writeFile(sourcePath, source);
  await writeFile(kernelPath, kernelSource);
  const variants = {};
  for (const variant of ['optimized', 'reference']) {
    const flags = variant === 'reference' ? ['--no-call-opt'] : [];
    const binary = join(directory, item.name + '-' + variant);
    const build = run(compiler, ['build', sourcePath, '-o', binary, '--release', ...flags]);
    const counterBinary = binary + '-counters';
    run(compiler, ['build', kernelPath, '-o', counterBinary, '--release', '--runtime-counters', ...flags]);
    const counterRun = run(counterBinary, [item.size]);
    if (counterRun.stdout !== item.expected.join(' ')) throw new Error(item.name + ': counter correctness mismatch');
    const counterLine = counterRun.stderr.split('\n').find((line) => line.startsWith('ARYA_RUNTIME_COUNTERS '));
    if (!counterLine) throw new Error('Missing counters');
    if (run(binary, [item.size, 0]).stdout !== item.expected.join(' ')) throw new Error(item.name + ': correctness mismatch');
    variants[variant] = {
      binary, buildWallMs: build.wallMs, binaryBytes: (await stat(binary)).size,
      binarySha256: hash(await readFile(binary)), cSha256: hash(await readFile(binary + '.c')),
      counters: JSON.parse(counterLine.slice('ARYA_RUNTIME_COUNTERS '.length)),
      cpu: [], wall: [],
    };
  }
  function measure(variant, repetitions) {
    const output = run(variants[variant].binary, [item.size, repetitions]).stdout.split(/\s+/).map(Number);
    const checksum = Math.ceil(repetitions / 2) * item.expected[0] + Math.floor(repetitions / 2) * item.expected[1];
    if (output.length !== 3 || output.some((value) => !Number.isFinite(value)) || output[0] !== checksum) {
      throw new Error(item.name + ': measured checksum/timing mismatch');
    }
    return { cpu: output[1] / repetitions, wall: output[2] / repetitions };
  }
  const repetitions = {};
  for (const variant of ['optimized', 'reference']) {
    const pilot = measure(variant, 2);
    // Even batches give each variant exactly equal n/n+1 proportions. Calibrate
    // separately so a faster call path does not force minutes-long slow batches.
    repetitions[variant] = 2 * Math.max(1, Math.min(5000, Math.ceil(25 / Math.max(pilot.cpu, 0.001))));
  }
  for (let sample = 0; sample < 9; sample++) {
    const order = sample % 2 ? ['reference', 'optimized'] : ['optimized', 'reference'];
    for (const variant of order) {
      const measurement = measure(variant, repetitions[variant]);
      variants[variant].cpu.push(measurement.cpu);
      variants[variant].wall.push(measurement.wall);
    }
  }
  for (const variant of Object.values(variants)) {
    variant.cpu = summary(variant.cpu);
    variant.wall = summary(variant.wall);
  }
  const speedup = variants.reference.cpu.medianMs / variants.optimized.cpu.medianMs;
  console.log(item.name + ': ' + variants.reference.cpu.medianMs.toFixed(3) + ' -> ' + variants.optimized.cpu.medianMs.toFixed(3) + ' ms CPU; ' + speedup.toFixed(2) + 'x');
  results.push({ name: item.name, input: item.size, repetitions, source, kernelSource, sourceSha256: hash(source), variants, cpuSpeedup: speedup });
}
const report = {
  recordedAt: new Date().toISOString(),
  compilerVersion: run(compiler, ['--version']).stdout,
  compilerSha256: hash(await readFile(compiler)),
  compilerGeneratedCSha256, compilerSourceHashes, harnessSha256,
  cc: run(process.env.CC || 'cc', ['--version']).stdout,
  host: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  hostStart, hostEnd: { loadAverage: loadavg() },
  method: {
    samples: 'Nine alternating fresh-process samples per variant, each warming for >=150 ms CPU and eight calls. Separately calibrated even batches target >=50 ms CPU and equal n/n+1 proportions; repetitions are retained.',
    timing: 'Milliseconds per work() call: process CPU from runtime.clock(), monotonic wall from performance.now(). No startup/build/output in measured region. Checked n/n+1 outputs and every checksum.',
    reference: 'Same compiler/source/runtime and C11 -O2 -ffp-contract=off; --no-call-opt disables frame-local storage, scope elision, direct calls and numeric specialization.',
    counters: 'Separate instrumented kernel processes evaluate work(n) and work(n+1) once; never used for timing. callocCalls counts the runtime calloc wrapper, not every system allocation. Peak managed bytes is not RSS.',
    limits: 'One developer host, with recorded load; microbenchmarks do not qualify other platforms or general application performance.',
  },
  workloads: results,
};
const output = join(directory, 'results.json');
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log('Results: ' + output);
