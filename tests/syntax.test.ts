import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeSource, builtins, compile, keywords, parseProgram } from '../src/compiler.js';
import { analyze, completions, hoverAt, semanticTokens } from '../src/language-service.js';

const removedWords = ['keep', 'task', 'when', 'otherwise', 'each', 'give', 'say'];
async function project(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya canonical syntax ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('canonical declarations, conditions, loops, closures, callbacks and async functions compose', async t => {
  const root = await project(t);
  const source = `
print(classify(-1), classify(0), classify(1))
export const title = "Arya"
export fn classify(value) {
  if value < 0 { return "negative" }
  else if value == 0 { return "zero" }
  else { return "positive" }
}
fn counter() {
  let count = 0
  return fn() { count += 1; return count }
}
const next = counter()
let total = 0
for value in range(1, 5) {
  if value == 2 { continue }
  total += value
}
fn value() { return 7 }
if total == 8 { print(title, next(), next(), value()) }
const doubled = [1, 2].map(fn(value) { return value * 2 })
print(JSON.stringify(doubled))
async fn later(value) { return await Promise.resolve(value) }
print(await later(9))
`;
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'negative zero positive\nArya 1 2 7\n[2,4]\n9\n');
});

test('canonical syntax preserves scopes, const checks, export metadata and original positions', () => {
  const source = 'export const threshold = 60\nexport fn passed(score) { return score >= threshold }\nthreshold = 90';
  const analysis = analyzeSource(source, 'main.arya');
  assert.deepEqual(analysis.exports.map(token => token.text), ['threshold', 'passed']);
  assert.equal(analysis.bindings.find(binding => binding.name === 'threshold')?.kind, 'const');
  assert.equal(analysis.references.find(reference => reference.token.text === 'threshold' && reference.token.line === 1)?.binding?.kind, 'const');
  assert.equal(analysis.diagnostics[0]?.code, 'ARYA_CONST_ASSIGNMENT');
  assert.equal(analysis.diagnostics[0]?.token.line, 2);
  assert.throws(() => compile(source), /Cannot assign to const 'threshold'/);
  assert.throws(() => compile('return 1'), /inside a function/);
  assert.throws(() => compile('fn invalid() { await Promise.resolve(1) }'), /async/);
  assert.throws(() => compile('for value in [] { fn inner() { break } }'), /inside a loop/);
  assert.deepEqual(parseProgram('const record = {task: 1, when: 2}\nprint(record.task + record.when)', 'main.arya').diagnostics, []);
});

test('alternate statement/function spellings and the implicit say builtin are removed in compiler and editor analysis', () => {
  const rejected = [
    'keep value = 1', 'export keep value = 1',
    'task work() {}', 'export task work() {}', 'async task work() {}',
    'const work = task() {}', 'const work = async task() {}',
    'when true {}', 'if true {} otherwise {}', 'if false {} else when true {}',
    'each value in [1] {}', 'each value at index in [1] {}',
    'fn work() { give 1 }', 'fn work() { give }', 'say(1)',
  ];
  for (const source of rejected) {
    assert.throws(() => compile(source), Error, source);
    assert.ok(analyze(source, 'file:///main.arya').diagnostics.length > 0, source);
  }
  assert.equal(analyzeSource('say(1)').diagnostics[0]?.code, 'ARYA_UNKNOWN_NAME');
  const labels = completions(analyze('print(1)', 'file:///main.arya')).map(item => item.label);
  for (const word of removedWords) {
    assert.ok(!keywords.includes(word), word);
    assert.ok(!Object.hasOwn(builtins, word), word);
    assert.ok(!labels.includes(word), word);
    assert.equal(hoverAt(word, 1), undefined, word);
  }
});

test('removed words are ordinary names and properties without injected runtime declarations', async t => {
  const root = await project(t);
  const source = `${removedWords.filter(word => word !== 'say').map((word, index) => `const ${word} = ${index + 1}`).join('\n')}
fn say(value) => value + keep + task + when + otherwise + each + give
print(say(1))
print(JSON.stringify({keep: keep, task: task, when: when, otherwise: otherwise, each: each, give: give, say: say(0)}))
`;
  assert.deepEqual(analyzeSource(source).diagnostics, []);
  const tokens = semanticTokens(source);
  const call = tokens.find(token => token.start === source.indexOf('say(1)'));
  assert.equal(call?.type, 'function');
  assert.ok(!call?.modifiers.includes('defaultLibrary'));
  const output = join(root, 'names.mjs');
  await writeFile(output, compile(source).code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '22\n{"keep":1,"task":2,"when":3,"otherwise":4,"each":5,"give":6,"say":21}\n');
  assert.throws(() => compile('const say = 1\nsay = 2'), /Cannot assign to const 'say'/);
});

test('return preserves negative values and newline return behavior', async t => {
  const root = await project(t);
  const output = join(root, 'return.mjs');
  await writeFile(output, compile('fn negative() { return -1 }\nfn empty() { return\n42 }\nprint(negative(), empty())').code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '-1 undefined\n');
});

test('canonical syntax conformance fixture runs on Node.js', async t => {
  const root = await project(t);
  const filename = join(root, 'main.arya');
  await writeFile(filename, await readFile('fixtures/arya/conformance/canonical.arya', 'utf8'));
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(await readFile(filename, 'utf8'), filename).code);
  const run = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'Arya total: 15\nReady\n-1\n');
});
