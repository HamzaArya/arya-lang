#!/usr/bin/env node
// Optional benchmark/oracle host. Neither the compiler nor its programs use Node.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [command, ...args] = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const out = resolve(option('--out', join(root, '.build/performance-2026-11-12')));
const ledger = resolve(option('--ledger', join(root, '../accounting-database')));
const label = option('--label', 'baseline');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
function run(exe, argv, options = {}) {
  const result = spawnSync(exe, argv, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 600000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${exe} ${argv.join(' ')}\n${result.error || result.stderr || result.stdout}`);
  return result;
}
const source = join(out, 'ledger');
function compileC(input, binary, library) {
  const code = readFileSync(input, 'utf8');
  const argv = ['-std=c11', '-O2', '-ffp-contract=off', '-I', library, '-I', join(library, 'include'), input, '-o', binary, join(library, 'libmpdec.a'), '-lm'];
  for (const [flag, lib] of [['CRYPTO','crypto'], ['REGEX','pcre2-16'], ['HTTP','llhttp'], ['URL','ada']]) {
    if (code.includes(`#define ARYA_${flag} 1`)) argv.push(join(library, `lib${lib}.a`));
  }
  if (code.includes('#define ARYA_URL 1')) argv.push(platform() === 'darwin' ? '-lc++' : '-lstdc++');
  const result = run(process.env.CC || 'cc', argv);
  writeFileSync(binary + '.cc.log', result.stdout + result.stderr);
}
const types = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'otherIncome', 'otherExpense'];
const varied = args.includes('--varied');
const payload = count => ({ types, rows: Array.from({ length: count }, (_, index) => ({ index,
  type: types[index % types.length], balance: varied ? (((index * 7919) % 2000001 - 1000000) / 1000).toFixed(3) : index % 5 ? '100.005' : '-20.035' })) });

const phaseArya = `use std "io" as io
use std "json" as json
use std "runtime" as runtime
use arya "./report-preparation.arya" as reports
while true {
  const c0 = runtime.clock()
  const w0 = runtime.elapsed()
  const text = io.readLine()
  const c1 = runtime.clock()
  const w1 = runtime.elapsed()
  if text == null { break }
  const request: any = json.parse(text)
  const c2 = runtime.clock()
  const w2 = runtime.elapsed()
  guard len(text) <= 8388608 else { throw new Error("Native calculation input exceeds 8 MiB") }
  const c3 = runtime.clock()
  const w3 = runtime.elapsed()
  const result = reports.groupByType(request.payload.rows, request.payload.types)
  const c4 = runtime.clock()
  const w4 = runtime.elapsed()
  const encoded = json.stringify({id: request.id, result: result})
  const c5 = runtime.clock()
  const w5 = runtime.elapsed()
  print(encoded)
  const c6 = runtime.clock()
  const w6 = runtime.elapsed()
  print(json.stringify({cpuMs: [(c1-c0)*1000, (c2-c1)*1000, (c3-c2)*1000, (c4-c3)*1000, (c5-c4)*1000, (c6-c5)*1000], wallMs: [w1-w0, w2-w1, w3-w2, w4-w3, w5-w4, w6-w5]}))
}
`;

if (command === 'prepare') {
  mkdirSync(source, { recursive: true });
  const app = join(ledger, 'backend/src/arya');
  const sources = {};
  for (const name of readdirSync(app).filter(name => name.endsWith('.arya') && statSync(join(app, name)).isFile())) {
    copyFileSync(join(app, name), join(source, name)); sources[name] = hash(join(source, name));
  }
  writeFileSync(join(source, 'phases.arya'), phaseArya);
  const testPath = join(ledger, 'scripts/test-arya-native.mjs');
  // Reuse Ledger's deterministic cases verbatim, with no application writes.
  let cases = readFileSync(testPath, 'utf8').split('\ntest(')[0];
  assert(cases.includes('const cases = []'));
  cases = cases.replace('createRequire(import.meta.url)', `createRequire(${JSON.stringify(pathToFileURL(testPath).href)})`);
  cases += '\nexport { cases };\n';
  writeFileSync(join(out, 'ledger-cases.mjs'), cases);
  save(join(out, 'ledger-source.json'), { ledger, revision: run('git', ['-C', ledger, 'rev-parse', 'HEAD']).stdout.trim(),
    sources, testSourceSha256: hash(testPath), generatedReferences: Object.fromEntries(readdirSync(join(app, 'generated'))
      .filter(n => n.endsWith('.cjs')).map(n => [n, hash(join(app, 'generated', n))])) });
  // A stdio peer with the same report algorithm, decimal policy and envelope.
  writeFileSync(join(out, 'node-worker.cjs'), `const {groupByType}=require(${JSON.stringify(join(app, 'generated/report-preparation.cjs'))});
const {performance}=require('node:perf_hooks');
const rl=require('node:readline').createInterface({input:process.stdin});
const phases=process.argv.includes('--phases');
rl.on('line',text=>{const c1=process.cpuUsage(),w1=performance.now();const req=JSON.parse(text);
const c2=process.cpuUsage(),w2=performance.now();if(text.length>8388608)throw Error('Input limit');
const c3=process.cpuUsage(),w3=performance.now();const result=groupByType(req.payload.rows,req.payload.types);
const c4=process.cpuUsage(),w4=performance.now();const encoded=JSON.stringify({id:req.id,result});
const c5=process.cpuUsage(),w5=performance.now();process.stdout.write(encoded+'\\n');
const c6=process.cpuUsage(),w6=performance.now();
if(phases){const diff=(a,b)=>(a.user+a.system-b.user-b.system)/1000;
process.stdout.write(JSON.stringify({cpuMs:[null,diff(c2,c1),diff(c3,c2),diff(c4,c3),diff(c5,c4),diff(c6,c5)],wallMs:[null,w2-w1,w3-w2,w4-w3,w5-w4,w6-w5]})+'\\n');}});
`);
  console.log(`Prepared unchanged Ledger sources and deterministic fixtures in ${source}`);
} else if (command === 'build') {
  const compiler = resolve(option('--compiler', join(root, '.build/independent/arya')));
  const dir = join(out, label); mkdirSync(dir, { recursive: true });
  const artifacts = {};
  for (const [name, input, flags] of [
    ['worker', 'native-worker.arya', []], ['phases', 'phases.arya', []],
    ['counters', 'native-worker.arya', ['--runtime-counters']],
  ]) {
    const binary = join(dir, name), start = performance.now();
    const result = run(compiler, ['build', join(source, input), '-o', binary, '--release', '--force', ...flags], { cwd: root });
    writeFileSync(binary + '.build.log', result.stdout + result.stderr);
    artifacts[name] = { sha256: hash(binary), cSha256: hash(binary + '.c'), bytes: statSync(binary).size, buildMs: performance.now() - start };
  }
  save(join(dir, 'artifacts.json'), { compiler, compilerSha256: hash(compiler), version: run(compiler, ['--version']).stdout.trim(),
    flags: '-std=c11 -O2 -ffp-contract=off; counters separately enabled', artifacts });
  console.log(`${label}: built ${Object.keys(artifacts).join(', ')}`);
} else if (command === 'diagnose') {
  const binary = join(out, 'baseline/counters-detail');
  run('python3', [join(root, 'native/benchmarks/instrument-baseline.py'), join(out, 'baseline/counters.c'), binary + '.c']);
  compileC(binary + '.c', binary, join(root, '.build/independent/lib'));
  const samples = [];
  for (const count of [1000, 10000]) {
    const input = readFileSync(join(out, `input-${count}.jsonl`));
    const result = run(binary, [], { input });
    assert.deepEqual(JSON.parse(result.stdout), JSON.parse(readFileSync(join(out, `expected-${count}.json`))));
    samples.push({ rows: count, stderr: result.stderr });
  }
  save(join(out, 'baseline/allocation-detail.json'), { binarySha256: hash(binary), cSha256: hash(binary + '.c'),
    scope: 'calloc wrapper requests and string payloads; excludes realloc, raw malloc, mpdecimal, mark worklists and allocator metadata. Instrumented GC CPU only.', samples });
  console.log(JSON.stringify(samples, null, 2));
} else if (command === 'startup') {
  const labels = option('--labels', 'baseline,candidate,node').split(',');
  const samples = Number(option('--samples', '15')), raw = [];
  const input = JSON.stringify({ id: 1, task: 'report-groups', payload: payload(0) }) + '\n';
  for (let i = -2; i < samples; i++) for (const name of (i % 2 ? [...labels].reverse() : labels)) {
    const start = performance.now();
    const result = name === 'node' ? run(process.execPath, [join(out, 'node-worker.cjs')], { input }) : run(join(out, name, 'worker'), [], { input });
    assert.equal(JSON.parse(result.stdout).result.length, types.length);
    if (i >= 0) raw.push({ sample: i, name, wallMs: performance.now() - start });
  }
  save(join(out, option('--session-name', 'startup') + '.json'), { boundary: 'Fresh process, module initialization, one empty report, stdio transfer and final cleanup/exit. Warm filesystem cache; two discarded warm launches. Node loads the existing generated report bundle; native loads the full worker.', raw });
  console.log('Startup samples retained');
} else if (command === 'runtime') {
  // Runtime-only stage: retain the exact baseline frontend and emitted program.
  const dir = join(out, label); mkdirSync(dir, { recursive: true });
  const runtimeFile = join(dir, 'runtime.c');
  run(join(root, '.build/independent/embed'), [join(root, 'native/runtime/core.c'), runtimeFile, join(root, 'native/vendor/ryu'), '--c']);
  const runtime = readFileSync(runtimeFile, 'utf8'), artifacts = {}, base = option('--base', 'baseline');
  for (const name of ['worker', 'phases', 'counters']) {
    const baseline = readFileSync(join(out, base, name + '.c'), 'utf8');
    const begin = baseline.indexOf('/* Arya native runtime.');
    const end = baseline.indexOf('\nstatic AV amod[');
    assert(begin >= 0 && end > begin);
    const binary = join(dir, name), start = performance.now();
    writeFileSync(binary + '.c', baseline.slice(0, begin) + runtime + baseline.slice(end));
    compileC(binary + '.c', binary, join(root, '.build/independent/lib'));
    artifacts[name] = { sha256: hash(binary), cSha256: hash(binary + '.c'), bytes: statSync(binary).size, buildMs: performance.now() - start };
  }
  save(join(dir, 'artifacts.json'), { runtimeOnly: true, runtimeSha256: hash(runtimeFile), base, artifacts });
  console.log(`${label}: compiled runtime-only comparison`);
} else if (command === 'check') {
  const { cases } = await import(pathToFileURL(join(out, 'ledger-cases.mjs')));
  const input = cases.map(({ id, task, payload }) => JSON.stringify({ id, task, payload })).join('\n') + '\n';
  const checks = [];
  for (const zone of ['Asia/Kabul', 'America/Los_Angeles']) {
    const result = run(join(out, label, 'worker'), [], { input, cwd: out,
      env: { TZ: zone, PATH: '/nonexistent', ARYA_PYTHON: '/nonexistent' } });
    const values = result.stdout.trim().split('\n').map(x => JSON.parse(x));
    assert.equal(values.length, cases.length);
    for (let i = 0; i < cases.length; i++) assert.deepEqual(values[i], { id: cases[i].id, result: cases[i].expected }, `${zone}: case ${i} ${cases[i].task}`);
    checks.push({ zone, cases: cases.length, identical: true });
  }
  save(join(out, label, 'compatibility.json'), checks);
  console.log(`${label}: ${cases.length} unchanged Ledger cases passed in both time zones with no interpreter PATH`);
} else if (command === 'measure') {
  const labels = option('--labels', 'baseline,candidate,node').split(',');
  const samples = Number(option('--samples', '9')), warmup = Number(option('--warmup', '3'));
  const rows = option('--rows', '1000,10000').split(',').map(Number);
  const sessions = Number(option('--sessions', '2'));
  const sessionName = option('--session-name', 'results');
  const { createRequire } = await import('node:module');
  const oracle = createRequire(import.meta.url)(join(ledger, 'backend/src/arya/generated/report-preparation.cjs'));
  class Peer {
    constructor(name, phases) {
      this.queue = []; this.lines = []; this.stderr = ''; this.name = name; this.phases = phases;
      const exe = name === 'node' ? process.execPath : join(out, name, phases ? 'phases' : 'worker');
      const argv = name === 'node' ? [join(out, 'node-worker.cjs'), ...(phases ? ['--phases'] : [])] : [];
      const env = { ...process.env, TZ: 'Asia/Kabul' }; delete env.ARYA_GC_STRESS;
      this.child = spawn(exe, argv, { env });
      this.child.stderr.on('data', data => { this.stderr += data; });
      createInterface({ input: this.child.stdout }).on('line', line => {
        this.lines.push(line);
        if (this.lines.length === (phases ? 2 : 1)) { const lines = this.lines; this.lines = []; this.queue.shift()?.(lines); }
      });
      this.exited = new Promise((resolveExit, reject) => {
        this.child.on('error', reject); this.child.on('close', status => status ? reject(Error(`${name}: exit ${status}: ${this.stderr}`)) : resolveExit());
      });
    }
    async request(request) {
      const encodeStart = performance.now(), text = JSON.stringify(request), encodeMs = performance.now() - encodeStart;
      const start = performance.now();
      const lines = await new Promise(resolveLines => { this.queue.push(resolveLines); this.child.stdin.write(text + '\n'); });
      const receiveMs = performance.now() - start, decodeStart = performance.now();
      const result = JSON.parse(lines[0]), decodeMs = performance.now() - decodeStart;
      return { result, sample: { roundTripMs: receiveMs, hostEncodeMs: encodeMs, hostDecodeMs: decodeMs,
        ...(this.phases ? { phases: JSON.parse(lines[1]) } : {}) } };
    }
    async close() { this.child.stdin.end(); await this.exited; }
  }
  const raw = [], starts = [], diagnostics = [];
  for (let session = 0; session < sessions; session++) {
    for (const count of rows) {
      const request = { id: 1, task: 'report-groups', payload: payload(count) };
      const expected = { id: 1, result: oracle.groupByType(request.payload.rows, types) };
      writeFileSync(join(out, `input-${count}.jsonl`), JSON.stringify(request) + '\n');
      save(join(out, `expected-${count}.json`), expected);
      for (const phases of [false, true]) {
        const peers = Object.fromEntries(labels.map(name => [name, new Peer(name, phases)]));
        try {
          for (const name of labels) {
            const value = await peers[name].request(request); assert.deepEqual(value.result, expected);
            starts.push({ session, rows: count, name, instrumentedPhases: phases, ...value.sample });
          }
          for (let i = -warmup; i < samples; i++) {
            const order = (i + warmup + session) % 2 ? [...labels].reverse() : labels;
            for (const name of order) {
              const value = await peers[name].request(request); assert.deepEqual(value.result, expected);
              if (i >= 0) raw.push({ session, rows: count, sample: i, name, instrumentedPhases: phases, ...value.sample });
            }
          }
        } finally { for (const peer of Object.values(peers)) await peer.close(); }
      }
      for (const name of labels.filter(n => n !== 'node')) {
        const input = JSON.stringify(request) + '\n', binary = join(out, name, 'counters');
        const result = run(binary, [], { input });
        assert.deepEqual(JSON.parse(result.stdout), expected);
        diagnostics.push({ session, rows: count, name, stderr: result.stderr });
      }
    }
  }
  const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.ceil(p*values.length)-1)];
  const stats = values => ({ median: percentile(values, .5), p95: percentile(values, .95) });
  const summary = [];
  for (const count of rows) for (const name of labels) {
    const values = raw.filter(x => x.rows === count && x.name === name && !x.instrumentedPhases);
    const phaseValues = raw.filter(x => x.rows === count && x.name === name && x.instrumentedPhases);
    summary.push({ rows: count, name, samples: values.length, roundTripMs: stats(values.map(x => x.roundTripMs)),
      hostEncodeMs: stats(values.map(x => x.hostEncodeMs)), hostDecodeMs: stats(values.map(x => x.hostDecodeMs)),
      phases: ['readDecode', 'parse', 'envelopeValidation', 'calculation', 'serialization', 'writeEncode'].map((phase, i) => ({ phase,
        cpuMs: name === 'node' && i === 0 ? null : stats(phaseValues.map(x => x.phases.cpuMs[i])),
        wallMs: name === 'node' && i === 0 ? null : stats(phaseValues.map(x => x.phases.wallMs[i])) })) });
  }
  const resources = [];
  for (const count of rows) for (const name of labels) {
    const argv = name === 'node' ? [process.execPath, join(out, 'node-worker.cjs')] : [join(out, name, 'worker')];
    const result = run('/usr/bin/time', [platform() === 'darwin' ? '-l' : '-v', ...argv], { input: readFileSync(join(out, `input-${count}.jsonl`)) });
    resources.push({ name, rows: count, measurement: result.stderr });
  }
  save(join(out, sessionName + '.json'), { schema: 1, node: process.version, platform: platform(), arch: process.arch,
    inputDistribution: varied ? 'Deterministic varied signed decimal balances, eight repeating types' : 'Two repeating decimal balances, eight repeating types',
    cpu: cpus()[0].model, loadAverage: loadavg(), samples, warmup, sessions, phaseOrder: ['readDecode','parse','envelopeValidation','calculation','serialization','writeEncode'],
    boundaries: 'Direct persistent stdio workers. Round trip excludes host JSON encoding/decoding. Phase binaries are separate. Native read includes idle pipe wait; CPU read is meaningful, wall read is not isolated disk time. Validation is the existing envelope length guard; row decimal checks stay in calculation. Node readline decoding is outside its phase timer. Warm filesystem cache; startup is first request, not cold disk.',
    inputs: Object.fromEntries(rows.map(count => [count, { sha256: hash(join(out, `input-${count}.jsonl`)), bytes: statSync(join(out, `input-${count}.jsonl`)).size,
      expectedSha256: hash(join(out, `expected-${count}.json`)) }])), summary, raw, firstRequest: starts, diagnostics, resources });
  console.log(JSON.stringify(summary.map(x => ({ rows: x.rows, name: x.name, ...x.roundTripMs, parseCpu: x.phases[1].cpuMs.median, calculationCpu: x.phases[3].cpuMs.median })), null, 2));
} else {
  throw Error('Usage: ledger.mjs prepare|build|check|measure [--out DIR] [--ledger DIR] [--compiler FILE] [--label NAME] [--labels baseline,candidate,node] [--samples 9] [--sessions 2]');
}
