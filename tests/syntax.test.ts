import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AryaError, analyzeSource, compile, keywords, parseProgram } from '../src/compiler.js';
import { checkNativeProject, writeNativeProject } from '../src/native.js';

async function project(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya branded syntax ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('branded declarations, decisions, loops, closures and legacy syntax compose', async t => {
  const root = await project(t);
  const source = `
say(classify(-1), classify(0), classify(1))
export keep title = "Arya"
export task classify(value) {
  when value < 0 { give "negative" }
  otherwise when value == 0 { give "zero" }
  otherwise { give "positive" }
}
task counter() {
  let count = 0
  give task() { count += 1; give count }
}
keep next = counter()
let total = 0
each value in range(1, 5) {
  if value == 2 { continue }
  total += value
}
fn legacy() { return 7 }
when total == 8 { say(title, next(), next(), legacy()) }
let doubled = [1, 2].map(task(value) { give value * 2 })
say(JSON.stringify(doubled))
async task later(value) { give await Promise.resolve(value) }
say(await later(9))
`;
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'negative zero positive\nArya 1 2 7\n[2,4]\n9\n');
});

test('branded syntax preserves scopes, const checks, export metadata and original positions', () => {
  const source = 'export keep threshold = 60\nexport task passed(score) { give score >= threshold }\nthreshold = 90';
  const analysis = analyzeSource(source, 'main.arya');
  assert.deepEqual(analysis.exports.map(token => token.text), ['threshold', 'passed']);
  assert.equal(analysis.bindings.find(binding => binding.name === 'threshold')?.kind, 'const');
  assert.equal(analysis.references.find(reference => reference.token.text === 'threshold' && reference.token.line === 1)?.binding?.kind, 'const');
  assert.equal(analysis.diagnostics[0]?.code, 'ARYA_CONST_ASSIGNMENT');
  assert.equal(analysis.diagnostics[0]?.token.line, 2);
  assert.throws(() => compile(source), /Cannot assign to const 'threshold'/);
  assert.throws(() => compile('give 1'), /inside a function/);
  assert.throws(() => compile('task invalid() { await Promise.resolve(1) }'), /async/);
  assert.throws(() => compile('each value in [] { task inner() { break } }'), /inside a loop/);
  const parsed = parseProgram('keep record = {task: 1, when: 2}\nsay(record.task + record.when)', 'main.arya');
  assert.equal(parsed.diagnostics.length, 0);
});

test('new branded spellings are explicit reserved-word migrations', () => {
  for (const word of ['keep', 'task', 'when', 'otherwise', 'each', 'give']) {
    assert.ok(keywords.includes(word));
    assert.throws(() => compile(`let ${word} = 1`), AryaError);
  }
  assert.throws(() => compile('say = 2'), /Cannot assign to const 'say'/);
  assert.throws(() => compile('let say = 2'), /already defined/);
});

test('give preserves negative return values and newline return behavior', async t => {
  const root = await project(t);
  const output = join(root, 'return.mjs');
  await writeFile(output, compile('task negative() { give -1 }\ntask empty() { give\n42 }\nsay(negative(), empty())').code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '-1 undefined\n');
});

test('native target runs the same branded syntax without Node', { skip: process.platform === 'win32' }, async t => {
  const root = await project(t);
  const filename = join(root, 'main.arya');
  await writeFile(filename, await readFile('fixtures/native/branded.arya', 'utf8'));
  const native = await checkNativeProject(filename);
  const build = await writeNativeProject(native);
  const run = spawnSync(build.executable, [], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, PATH: '/nonexistent', ARYA_GC_STRESS: '1' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'Arya total: 15\nReady\n-1\n');
});
