// Optional Ledger benchmark adapter. Native Arya build/runtime do not use Node.
// Keep the frozen application's original timing, payload and parity code; only
// select the user's four comparisons and fix relative imports after relocation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadavg, platform, arch } from 'node:os';

const argv = process.argv.slice(2), forwarded = [], selected = {};
let all = false;
for (let i = 0; i < argv.length; i += 2) {
  assert.ok(argv[i]?.startsWith('--') && argv[i + 1], 'Every option requires a value');
  const name = argv[i].slice(2), value = argv[i + 1];
  if (name === 'all') { assert.ok(value === 'true' || value === 'false'); all = value === 'true'; }
  else { forwarded.push(argv[i], value); selected[name] = value; }
}
assert.ok(selected.app && selected.native && selected.output, '--app, --native and --output are required');
const app = resolve(selected.app), output = resolve(selected.output);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const source = join(app, 'scripts/perf-arya-calculations.mjs');
const freeze = join(app, 'BENCHMARK-SOURCES.json');
const frozen = JSON.parse(readFileSync(freeze, 'utf8'));
function verifyInputs() {
  for (const [name, digest] of Object.entries(frozen.files)) assert.equal(hash(join(app, name)), digest, `Frozen input changed: ${name}`);
}
verifyInputs();
const binaryPaths = [resolve(selected.native), ...(selected['baseline-native'] ? [resolve(selected['baseline-native'])] : [])];
const binaries = Object.fromEntries(binaryPaths.flatMap(file => [[file, hash(file)], [join(dirname(file), 'manifest.json'), hash(join(dirname(file), 'manifest.json'))]]));
const evidence = output + '.evidence';
mkdirSync(evidence); // Never replace a prior run or its generated driver.
let code = readFileSync(source, 'utf8');
const replaceOnce = (before, after) => {
  assert.equal(code.split(before).length, 2, `Frozen controller no longer matches adapter anchor: ${before}`);
  code = code.replace(before, after);
};
for (const name of ['perf-metrics', 'arya-modules']) {
  replaceOnce(`"./lib/${name}.mjs"`, JSON.stringify(pathToFileURL(join(app, 'scripts/lib', name + '.mjs')).href));
}
const targets = [
  ['aging-settlement-1000', 'direct-rule-vs-persistent-native-round-trip'],
  ['allocation-index-10000', 'direct-rule-vs-persistent-native-round-trip'],
  ['reports-10000', 'report-service-including-host-validation'],
  ['production-schedule-1000', 'production-service-including-host-validation'],
];
if (!all) {
  replaceOnce('const raw = [], firstCalls = [];', `const chosen = new Set(${JSON.stringify(targets.map(([name, boundary]) => name + '|' + boundary))});\nconst chosenNames = new Set(${JSON.stringify(targets.map(([name]) => name))});\nconst raw = [], firstCalls = [];`);
  replaceOnce('async function compare(name, boundary, contract, backends, expected, session) {', 'async function compare(name, boundary, contract, backends, expected, session) {\n  if (!chosen.has(name + "|" + boundary)) return;');
  replaceOnce('for (const item of cases) {', 'for (const item of cases.filter(item => chosenNames.has(item.name))) {');
}
const driver = join(evidence, 'driver.mjs');
writeFileSync(driver, code, { flag: 'wx' });
const command = [process.execPath, driver, ...forwarded];
const before = {
  startedAtUtc: new Date().toISOString(), command, node: process.version,
  platform: platform(), architecture: arch(), loadStart: loadavg(),
  adapter: { path: fileURLToPath(import.meta.url), sha256: hash(fileURLToPath(import.meta.url)) },
  originalController: { path: source, sha256: hash(source) },
  generatedController: { path: driver, sha256: hash(driver) },
  frozenAppManifest: { path: freeze, sha256: hash(freeze) }, binaries,
  selectedComparisons: all ? 'all original comparisons' : targets,
  differences: 'Original timing and assertion bodies unchanged. Relative imports point to the frozen app. Target mode omits nonselected cases/comparisons, changing preceding workload/GC history; compare before/after within this run, not directly against earlier timings.',
  boundary: 'Aging/allocation Node is direct calculation; native includes JSON and pipe transfer. Report/production rows include their actual host service. Native production routing is not changed.',
};
writeFileSync(join(evidence, 'started.json'), JSON.stringify(before, null, 2) + '\n', { flag: 'wx' });
const result = spawnSync(command[0], command.slice(1), {
  env: { PATH: process.env.PATH, TZ: 'Asia/Kabul', NODE_ENV: 'test' },
  encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 300000,
});
writeFileSync(join(evidence, 'stdout.log'), result.stdout ?? '', { flag: 'wx' });
writeFileSync(join(evidence, 'stderr.log'), result.stderr ?? '', { flag: 'wx' });
assert.equal(result.status, 0, result.error?.message ?? result.stderr);
verifyInputs();
for (const [file, digest] of Object.entries(binaries)) assert.equal(hash(file), digest, `Artifact changed: ${file}`);
const report = JSON.parse(readFileSync(output, 'utf8'));
if (!all) assert.deepEqual(new Set(report.results.map(row => row.name + '|' + row.boundary)), new Set(targets.map(([name, boundary]) => name + '|' + boundary)));
assert.equal(hash(source), before.originalController.sha256);
assert.equal(hash(driver), before.generatedController.sha256);
assert.equal(hash(freeze), before.frozenAppManifest.sha256);
assert.equal(hash(fileURLToPath(import.meta.url)), before.adapter.sha256);
writeFileSync(join(evidence, 'completed.json'), JSON.stringify({
  ...before, finishedAtUtc: new Date().toISOString(), loadEnd: loadavg(), exitCode: result.status,
  outputSha256: hash(output), assertions: report.parityAssertions, allInputsUnchanged: true,
}, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(report.results, null, 2) + '\n');
