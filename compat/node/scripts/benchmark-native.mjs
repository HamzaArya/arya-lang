// Run `make native && node scripts/benchmark-native.mjs` from the repository root.
// Node only orchestrates this benchmark; the Arya executables run independently.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { cpus, freemem, loadavg, platform, arch, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = resolve('.');
const compiler = join(root, '.build/independent/arya');
const outputRoot = join(root, '.build/native-benchmark');
await mkdir(outputRoot, { recursive: true });
const directory = await mkdtemp(join(outputRoot, 'run-'));
const rounds = 9;
const warmupSeconds = 0.15;
const targetBatchMs = 50;
const host = () => ({ loadAverage: loadavg(), freeMemoryBytes: freemem() });
const hostStart = host();

function run(command, args = []) {
  const start = performance.now();
  const result = spawnSync(command, args.map(String), {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const wallMs = performance.now() - start;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
  }
  return { stdout: result.stdout.trim(), wallMs };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: median(values),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    samplesMs: values,
  };
}

// Both languages use the same algorithms, input sizes, and binary64 arithmetic.
// Sizes alternate between n and n+1 to keep results observable and avoid
// repeatedly calling a pure function with identical arguments.
const cases = [
  {
    name: 'numeric-sum',
    description: '10 million iterations of total += index * 0.25',
    size: 10000000,
    arya: `fn work(n) {
  let total = 0
  let i = 0
  while i < n { total += i * 0.25; i += 1 }
  return total
}`,
    js: `function work(n) {
  let total = 0;
  let i = 0;
  while (i < n) { total += i * 0.25; i += 1; }
  return total;
}`,
  },
  {
    name: 'numeric-recurrence',
    description: '2 million dependent multiply/add/modulo steps (LCG)',
    size: 2000000,
    arya: `fn work(n) {
  let value = 123456789
  let i = 0
  while i < n { value = (value * 1664525 + 1013904223) % 4294967296; i += 1 }
  return value
}`,
    js: `function work(n) {
  let value = 123456789;
  let i = 0;
  while (i < n) { value = (value * 1664525 + 1013904223) % 4294967296; i += 1; }
  return value;
}`,
  },
  {
    name: 'recursive-fibonacci',
    description: 'Naive recursive Fibonacci of 24 (and 25 on alternate calls)',
    size: 24,
    arya: `fn fib(n) {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}
fn work(n) { return fib(n) }`,
    js: `function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
function work(n) { return fib(n); }`,
  },
  {
    name: 'array-records',
    description: 'Build 20,000 two-field records, then sum selected values',
    size: 20000,
    arya: `fn work(n) {
  const rows = []
  let i = 0
  while i < n { rows.push({value: i, active: i % 3 == 0}); i += 1 }
  let total = 0
  i = 0
  while i < n {
    const row = rows[i]
    if row.active { total += row.value * 2 }
    i += 1
  }
  return total
}`,
    js: `function work(n) {
  const rows = [];
  let i = 0;
  while (i < n) { rows.push({value: i, active: i % 3 === 0}); i += 1; }
  let total = 0;
  i = 0;
  while (i < n) {
    const row = rows[i];
    if (row.active) total += row.value * 2;
    i += 1;
  }
  return total;
}`,
  },
  {
    name: 'json-roundtrip',
    description: 'Parse and stringify 1,000 small nested JSON documents',
    size: 1000,
    arya: `use std "json" as json
fn work(n) {
  const text = """{"id":42,"name":"Arya","active":true,"values":[1,2,3],"meta":{"unit":"USD"}}"""
  let total = 0
  let i = 0
  while i < n {
    const value = json.parse(text)
    const encoded = json.stringify(value)
    total += len(encoded) + value.values[2]
    i += 1
  }
  return total
}`,
    js: `function work(n) {
  const text = '{"id":42,"name":"Arya","active":true,"values":[1,2,3],"meta":{"unit":"USD"}}';
  let total = 0;
  let i = 0;
  while (i < n) {
    const value = JSON.parse(text);
    const encoded = JSON.stringify(value);
    total += encoded.length + value.values[2];
    i += 1;
  }
  return total;
}`,
  },
  {
    name: 'string-processing',
    description: '1,000 ASCII trim / uppercase / split / join operations',
    size: 1000,
    arya: `fn work(n) {
  let total = 0
  let i = 0
  while i < n {
    const fields = ("  arya,compiler,native," + str(i % 10) + "  ").trim().toUpperCase().split(",")
    total += len(fields.join("|"))
    i += 1
  }
  return total
}`,
    js: `function work(n) {
  let total = 0;
  let i = 0;
  while (i < n) {
    const fields = ('  arya,compiler,native,' + String(i % 10) + '  ').trim().toUpperCase().split(',');
    total += fields.join('|').length;
    i += 1;
  }
  return total;
}`,
  },
];

function aryaHarness(source) {
  return `use std "runtime" as runtime
${source}
const n = number(args[0])
const repetitions = number(args[1])
if repetitions == 0 { print(work(n), work(n + 1)) }
else {
  const warmStart = runtime.clock()
  let i = 0
  let checksum = 0
  while i < 8 or runtime.clock() - warmStart < ${warmupSeconds} {
    checksum += work(n + i % 2)
    i += 1
  }
  print(checksum)
  checksum = 0
  i = 0
  const wallStart = Date.now()
  const start = runtime.clock()
  while i < repetitions { checksum += work(n + i % 2); i += 1 }
  const elapsed = (runtime.clock() - start) * 1000
  const wallElapsed = Date.now() - wallStart
  print(checksum, elapsed, wallElapsed)
}
`;
}

function jsHarness(source) {
  return `${source}
function clock() { const cpu = process.cpuUsage(); return (cpu.user + cpu.system) / 1e6; }
const n = Number(process.argv[2]);
const repetitions = Number(process.argv[3]);
if (repetitions === 0) console.log(work(n), work(n + 1));
else {
  const warmStart = clock();
  let i = 0;
  let checksum = 0;
  while (i < 8 || clock() - warmStart < ${warmupSeconds}) {
    checksum += work(n + i % 2);
    i += 1;
  }
  console.log(checksum);
  checksum = 0;
  i = 0;
  const wallStart = Date.now();
  const start = clock();
  while (i < repetitions) { checksum += work(n + i % 2); i += 1; }
  const elapsed = (clock() - start) * 1000;
  const wallElapsed = Date.now() - wallStart;
  console.log(checksum, elapsed, wallElapsed);
}
`;
}

const versions = {
  arya: run(compiler, ['--version']).stdout,
  node: process.version,
  cc: run(process.env.CC || 'cc', ['--version']).stdout,
};
console.log(`${versions.arya} vs Node ${versions.node}`);

async function buildProgram(name, arya, js) {
  const source = join(directory, `${name}.arya`);
  const javascript = join(directory, `${name}.mjs`);
  const binary = join(directory, name);
  await writeFile(source, arya);
  await writeFile(javascript, js);
  const compilation = run(compiler, ['build', source, '-o', binary, '--release']);
  return {
    source, javascript, binary,
    compileMs: compilation.wallMs,
    binaryBytes: (await stat(binary)).size,
    sourceSha256: createHash('sha256').update(arya).digest('hex'),
    javascriptSha256: createHash('sha256').update(js).digest('hex'),
  };
}

const startup = await buildProgram('startup', 'print(1)\n', 'console.log(1);\n');
const startupSamples = { arya: [], node: [] };
for (let round = -3; round < 15; round++) {
  const order = round % 2 ? ['node', 'arya'] : ['arya', 'node'];
  for (const backend of order) {
    const result = backend === 'arya' ? run(startup.binary) : run(process.execPath, [startup.javascript]);
    if (result.stdout !== '1') throw new Error('Startup output mismatch');
    if (round >= 0) startupSamples[backend].push(result.wallMs);
  }
}
const startupResult = {
  description: 'Wall time to launch, print 1, and exit; three warm launches, 15 alternating measured launches',
  arya: summary(startupSamples.arya),
  node: summary(startupSamples.node),
  artifacts: startup,
};
startupResult.nodeOverArya = startupResult.node.medianMs / startupResult.arya.medianMs;
console.log(`startup: Arya ${startupResult.arya.medianMs.toFixed(3)} ms; Node ${startupResult.node.medianMs.toFixed(3)} ms`);

const results = [];
for (const item of cases) {
  const artifacts = await buildProgram(item.name, aryaHarness(item.arya), jsHarness(item.js));
  const command = (backend, repetitions) => backend === 'arya'
    ? run(artifacts.binary, [item.size, repetitions])
    : run(process.execPath, [artifacts.javascript, item.size, repetitions]);
  const oracle = command('node', 0).stdout;
  if (command('arya', 0).stdout !== oracle) throw new Error(`${item.name}: output mismatch`);
  const expected = oracle.split(/\s+/).map(Number);
  function sample(backend, repetitions) {
    const result = command(backend, repetitions);
    const last = result.stdout.split('\n').at(-1).split(/\s+/).map(Number);
    const expectedChecksum = Math.ceil(repetitions / 2) * expected[0] + Math.floor(repetitions / 2) * expected[1];
    if (last.length !== 3 || last[0] !== expectedChecksum || !(last[1] > 0) || !(last[2] > 0)) {
      throw new Error(`${item.name}/${backend}: invalid measured result ${result.stdout}, expected checksum ${expectedChecksum}`);
    }
    return { cpu: last[1] / repetitions, wall: last[2] / repetitions };
  }
  const repetitions = {};
  for (const backend of ['arya', 'node']) {
    const pilotMs = sample(backend, 2).cpu;
    // Even batches give both backends exactly the same mix of n and n+1.
    repetitions[backend] = Math.max(2, Math.min(10000, 2 * Math.ceil(targetBatchMs / pilotMs / 2)));
  }
  const samples = { arya: [], node: [] };
  for (let round = 0; round < rounds; round++) {
    for (const backend of round % 2 ? ['node', 'arya'] : ['arya', 'node']) {
      samples[backend].push(sample(backend, repetitions[backend]));
    }
  }
  const result = {
    name: item.name,
    description: item.description,
    size: item.size,
    expectedOutputs: expected,
    repetitions,
    arya: { cpu: summary(samples.arya.map((s) => s.cpu)), wall: summary(samples.arya.map((s) => s.wall)) },
    node: { cpu: summary(samples.node.map((s) => s.cpu)), wall: summary(samples.node.map((s) => s.wall)) },
    artifacts,
  };
  result.nodeOverArya = result.node.wall.medianMs / result.arya.wall.medianMs;
  result.nodeOverAryaCpu = result.node.cpu.medianMs / result.arya.cpu.medianMs;
  results.push(result);
  console.log(`${item.name}: Arya ${result.arya.wall.medianMs.toFixed(3)} ms; Node ${result.node.wall.medianMs.toFixed(3)} ms; Node/Arya ${result.nodeOverArya.toFixed(3)} (wall)`);
}

const trackedSources = [
  'native/compiler/compiler.arya', 'native/runtime/core.c',
  'scripts/benchmark-native.mjs',
];
const sourceHashes = {};
for (const path of trackedSources) {
  sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const report = {
  recordedAt: new Date().toISOString(),
  versions,
  machine: { platform: platform(), architecture: arch(), osRelease: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
  gitHead: run('git', ['rev-parse', 'HEAD']).stdout,
  dirtyWorkingTree: run('git', ['status', '--porcelain']).stdout.length > 0,
  compilerSha256: createHash('sha256').update(await readFile(compiler)).digest('hex'),
  sourceHashes,
  method: {
    timing: 'Wall and process CPU milliseconds per complete work() call. Both use Date.now() for batch wall time (1 ms resolution); native clock()/CLOCKS_PER_SEC vs Node process.cpuUsage() user+system for CPU. Excludes startup, compilation, warmup and output; includes allocations and GC during measured work.',
    samples: 'Median of nine alternating fresh-process samples per backend and workload. Each process warms for at least 150 ms of CPU and eight calls. Pilot-calibrated batch sizes target 50 ms; inputs alternate between n and n+1.',
    correctness: 'Both outputs are compared for n and n+1 before timing, then every measured checksum is checked. Workload definitions and generated programs are saved beside this report.',
    nativeMode: 'C11 -O2 -ffp-contract=off; generated executable launched directly',
    nodeMode: 'Default Node/V8 flags; handwritten equivalent JavaScript',
    ratio: 'nodeOverArya > 1 means Arya is faster by wall time; < 1 means Node is faster. nodeOverAryaCpu gives the corresponding CPU-time ratio.',
    limitations: 'Single host, microbenchmarks, no HTTP/database/I/O/application-throughput or memory qualification; does not establish universal performance superiority.',
  },
  hostStart,
  hostEnd: host(),
  startup: startupResult,
  workloads: results,
  directory,
};
const resultPath = join(directory, 'results.json');
await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
await writeFile(join(outputRoot, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Results: ${resultPath}`);
