import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AryaError, compile, tokenize } from '../src/compiler.js';
import { hostGlobals } from '../src/host-globals.js';

async function project(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya conformance 🌉 ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function execute(root: string, source: string) {
  const filename = join(root, 'main.arya'), outputFilename = join(root, 'main.mjs');
  const result = compile(source, { filename, outputFilename });
  await writeFile(filename, source);
  await writeFile(`${outputFilename}.map`, result.map);
  await writeFile(outputFilename, result.code);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

test('numeric property access remains valid after decimal literal normalization', async t => {
  const root = await project(t);
  assert.equal(await execute(root, await readFile('fixtures/arya/conformance/numeric-members.arya', 'utf8')), '1 1.00 100 1\n');
});

test('lexical grammar preserves decimal values, supported escapes, comments, and UTF-16 positions', () => {
  const source = '\uFEFF# comment\r\nlet label = "🌉"; // comment\n001 1.25 1e2 1E-2 \'a\\n\\r\\t\\\\\\"\\\'\'';
  const tokens = tokenize(source);
  assert.deepEqual(tokens.filter(token => token.kind === 'number').map(token => token.text), ['001', '1.25', '1e2', '1E-2']);
  assert.deepEqual(tokens.filter(token => token.kind === 'string').map(token => token.text), ['🌉', 'a\n\r\t\\"\'']);
  assert.equal(tokens.find(token => token.text === ';')!.column, 16);
  assert.equal(tokens.find(token => token.text === 'let')!.line, 1);
  for (const source of ['let café = 1', 'let __aryaUser = 1', 'let class = 1', 'let s = "\\u0041"', 'let n = 1e999', 'let n = .5', 'let n = 0x10', 'let n = 1_000']) {
    assert.throws(() => compile(source), AryaError, source);
  }
});

test('newlines continue only at documented grammar positions and return keeps its newline', async t => {
  const root = await project(t);
  const stdout = await execute(root, `
let total =
  1 +
  2
fn choose(
  value,
)
{
  if value
  { return }
  else
  { return 9 }
}
fn empty() { return
42 }
print(total, choose(true) == undefined, empty() == undefined, len([
1,
2,
]))
if false {} print("adjacent compound")
print({true: 1, "__proto__": 2}.true)
`);
  assert.equal(stdout, '3 true true 2\nadjacent compound\n1\n');
  for (const source of ['let x = 1 let y = 2', 'print(1\n2)', 'print(1)\n+ 2\nlet x = -\n1', 'throw\n1', 'if\ntrue {}', 'if true {}; else {}', 'let x = {1: 2}', 'let x = {name}', 'let x = 1\nx %= 2']) {
    assert.throws(() => compile(source), AryaError, source);
  }
});

test('precedence and operand-returning logic conform through standalone output and the CLI', async t => {
  const root = await project(t);
  const source = await readFile('fixtures/arya/conformance/precedence.arya', 'utf8');
  const expected = '[4,-4,512,5,7,8,3,true,"fallback",true]\n kept 0\n';
  assert.equal(await execute(root, source), expected);
  const run = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'run', join(root, 'main.arya')], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, expected);
});

test('scope timing preserves function hoisting, block isolation, closures, and runtime TDZ', async t => {
  const root = await project(t);
  const stdout = await execute(root, `
print(later())
fn later() { return 7 }
let value = "outer"
if true { print(local()); fn local() { return "inner" }; let value = "shadow"; print(value) }
print(value)
fn read() { return future }
try { read() } catch error { print(error.name) }
let future = 42
print(read())
try { let value = value } catch error { print(error.name) }
const box = {value: 1}
box.value += 1
print(box.value)
let callbacks = []
for index in range(3) { callbacks.push(fn() { return index }) }
print(callbacks[0](), callbacks[1](), callbacks[2]())
let items = [1]
try { for items in items {} } catch error { print(error.name) }
try { throw "caught value" } catch caught { print(caught) }
fn shadow(print) { return print }
print(shadow(9))
`);
  assert.equal(stdout, '7\ninner\nshadow\nouter\nReferenceError\n42\nReferenceError\n2\n0 1 2\nReferenceError\ncaught value\n9\n');
  for (const source of ['let print = 1', 'fn f(x) { let x = 1 }', 'for x in [] { const x = 1 }', 'try {} catch x { let x = 1 }', 'while true { fn f() { break } }']) {
    assert.throws(() => compile(source), AryaError, source);
  }
});

test('values, identity, conversions, Unicode iteration, and numeric edge cases match the contract', async t => {
  const root = await project(t);
  const stdout = await execute(root, `
const item = {value: 1, value: 2, "__proto__": 3}
let alias = item
alias.value = 4
print(item == alias, item == {value: 4}, [] == [], item.value, item["__proto__"])
print("2" == 2, null == undefined, NaN == NaN, -0 == 0, Object.is(-0, 0))
print(str(-0), str(), number(), number("") == 0, Number.isNaN(number("bad")))
print(1 / 0 == Infinity, 0 / 0 != 0 / 0, Object.is(-1 * 0, -0), 9007199254740993 == 9007199254740992)
print("2" + 1, "2" - 1, true + 1, null + 1)
print(len("🌉"), len([1, 2]), [1][-1] == undefined, [1][5] == undefined)
let letters = []
for letter in "🌉a" { letters.push(letter) }
print(JSON.stringify(letters), [] and "truthy", {} and "truthy")
print(JSON.stringify([NaN, Infinity, -0]))
`);
  assert.equal(stdout, 'true false false 4 3\nfalse false false true false\n0 undefined NaN true true\ntrue true true true\n21 1 2 1\n2 2 true true\n["🌉","a"] truthy truthy\n[null,null,0]\n');
});

test('builtins enforce their documented error types, bounds, and default conversions', async t => {
  const root = await project(t);
  const stdout = await execute(root, `
print(JSON.stringify([range(3), range(3, 0, -1), range(3, 0), range(0, 3, -1), range(0)]))
print(len(range(100000)), str(null), number(null), number(true))
for value in [null, {}, 42, undefined] {
  try { len(value) } catch error { print(error.name + ": " + error.message) }
}
for call in [fn() { return range() }, fn() { return range(1.5) }, fn() { return range(0, 3, 0) }, fn() { return range(Infinity) }] {
  try { call() } catch error { print(error.name + ": " + error.message) }
}
try { range(100001) } catch error { print(error.name + ": " + error.message) }
`);
  assert.equal(stdout, '[[0,1,2],[3,2,1],[],[],[]]\n100000 null 0 1\n' +
    'TypeError: len expects a string or list.\n'.repeat(4) +
    'TypeError: range expects safe integers and a nonzero step.\n'.repeat(4) +
    'RangeError: range supports at most 100000 items.\n');
});

test('the normative host-global list is available on the execution runtime and can be shadowed', async t => {
  const root = await project(t);
  const spec = await readFile('docs/arya-specification.md', 'utf8');
  const section = spec.split('<!-- host-globals:start -->')[1]?.split('<!-- host-globals:end -->')[0];
  assert.ok(section, 'the specification must enumerate the guaranteed host globals');
  assert.deepEqual([...section.matchAll(/`(\w+)`/g)].map(match => match[1]).sort(), [...hostGlobals].sort());
  assert.equal(new Set(hostGlobals).size, hostGlobals.length);
  const source = `let names = ${JSON.stringify(hostGlobals)}\nprint(JSON.stringify(names.filter(fn(name) { return not Object.hasOwn(globalThis, name) })))\nfn shadow() { const Math = 4; return Math }; print(shadow())`;
  assert.equal(await execute(root, source), '[]\n4\n');
});

test('module-level host shadowing preserves builtins and cannot affect runtime initialization', async t => {
  const root = await project(t);
  assert.equal(await execute(root, 'const String = fn(value) { return "custom" }; const Number = fn(value) { return 9 }; print(str(1), number("bad"))'), '1 NaN\n');
  const outputFilename = join(root, 'shadow.mjs');
  const result = compile('const process = {argv: []}\nprint("runtime initialized")', { filename: join(root, 'shadow.arya'), outputFilename });
  await writeFile(outputFilename, result.code);
  await writeFile(`${outputFilename}.map`, result.map);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, 'runtime initialized\n');
});

test('async functions, await grouping, and assignment evaluation retain JavaScript behavior', async t => {
  const root = await project(t);
  const stdout = await execute(root, `
let values = [1]
let calls = 0
fn target() { calls += 1; return values }
target()[0] += 2
let value = 2; value *= 3; value /= 2; value -= 1
print(values[0], calls, value, !false, +"2")
async fn object() { return {value: 7} }
let twice = async fn(value) { await Promise.resolve(); return value * 2 }
print((await object()).value, await twice(4))
try { await Promise.reject("rejection") } catch error { print(error) }
fn first(value) { return value }
print(first() == undefined, first(1, 2))
`);
  assert.equal(stdout, '3 1 2 true 2\n7 8\nrejection\ntrue 1\n');
});

test('JavaScript imports preserve nullish fallback, load timing, alias TDZ, and live exports', async t => {
  const root = await project(t);
  await writeFile(join(root, 'empty.mjs'), 'globalThis.importedBeforeBody = true; export const named = 3;');
  for (const [name, value] of [['null', 'null'], ['undefined', 'undefined'], ['zero', '0'], ['false', 'false'], ['text', '""']]) {
    await writeFile(join(root, `${name}.mjs`), `export default ${value}; export const named = 7;`);
  }
  const moduleFile = join(root, 'counter.arya'), moduleOutput = join(root, 'counter.mjs');
  const exported = compile('export let count = 0\nexport fn increment() { count += 1 }', { filename: moduleFile, outputFilename: moduleOutput });
  await writeFile(moduleOutput, exported.code);
  await writeFile(`${moduleOutput}.map`, exported.map);
  const stdout = await execute(root, `
print(globalThis.importedBeforeBody)
try { print(library) } catch error { print(error.name) }
use js "./empty.mjs" as library
use js "./null.mjs" as nil
use js "./undefined.mjs" as absent
use js "./zero.mjs" as zero
use js "./false.mjs" as no
use js "./text.mjs" as text
use js "./counter.mjs" as counter
print(library.named, nil.default == null, absent.default == undefined, nil.named, absent.named, zero == 0, no == false, text == "")
print(counter.count)
counter.increment()
print(counter.count)
`);
  assert.equal(stdout, 'true\nReferenceError\n3 true true 7 7 true true true\n0\n1\n');
});

test('Python JSON transport specifies nonfinite rejection, negative zero, precision, and fresh state', async t => {
  const root = await project(t);
  await writeFile(join(root, 'numeric.py'), 'import math\ncounter = 0\ndef describe(value):\n    return {"negative": math.copysign(1, value) < 0, "value": value}\ndef negative_zero():\n    return -0.0\ndef nonfinite():\n    return float("nan")\ndef huge():\n    return 9007199254740993\ndef bump():\n    global counter\n    counter += 1\n    return counter\n');
  const stdout = await execute(root, `
use python "./numeric.py" as py
print(py.describe(-0).negative, Object.is(py.negative_zero(), -0), py.huge() == 9007199254740992)
print(py.bump(), py.bump(), py.then == undefined)
let cycle = {}; cycle.self = cycle
for value in [undefined, NaN, Infinity, fn() {}, Symbol("s"), BigInt(1), cycle] {
  try { py.describe(value) } catch error { print(error.name) }
}
try { py.nonfinite() } catch error { print(error.message.startsWith("Python: ValueError:")) }
try { py._private() } catch error { print(error.message) }
try { py.describe.with({}, {}) } catch error { print(error.name) }
`);
  assert.equal(stdout, 'false true true\n1 1 true\n' + 'TypeError\n'.repeat(7) + 'true\nPython bridge members must be public.\nTypeError\n');
});

test('implementation resource limits distinguish UTF-16 source units, tokens, and nesting', () => {
  assert.doesNotThrow(() => compile('#' + 'a'.repeat(256 * 1024 - 1)));
  assert.throws(() => compile('#' + 'a'.repeat(256 * 1024)), /256 KiB/);
  assert.doesNotThrow(() => tokenize('\n'.repeat(50_000)));
  assert.throws(() => tokenize('\n'.repeat(50_001)), /too many tokens/);
  assert.throws(() => compile('print(' + '('.repeat(200) + '1' + ')'.repeat(200) + ')'), /nested too deeply/);
  assert.deepEqual(compile('use arya "./other.arya" as other').imports.map(item => item.specifier), ['./other.arya']);
});

test('CLI UTF-8 byte limit can reject a Unicode source accepted by the compiler API', async t => {
  const root = await project(t);
  const source = '#' + '🌉'.repeat(70_000);
  assert.ok(source.length < 256 * 1024);
  assert.ok(Buffer.byteLength(source) > 256 * 1024);
  assert.doesNotThrow(() => compile(source));
  const filename = join(root, 'large.arya');
  await writeFile(filename, source);
  const run = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'check', filename], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(run.error);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /256 KiB/);
});
