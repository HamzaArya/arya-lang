import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile, analyzeSource, AryaError} from '../src/compiler.js';
import {analyze, completions, definitionAt, hoverAt, semanticTokens, standardCompletions} from '../src/language-service.js';
import {buildProject, checkProject, writeProject} from '../src/project.js';

async function run(t: {after(fn: () => Promise<unknown>): void}, source: string, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'arya flow syntax '));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), {recursive: true}); await writeFile(join(root, name), contents);
  }
  const filename = join(root, 'main.arya'), outputFilename = join(root, 'main.mjs');
  const result = compile(source, {filename, outputFilename});
  await writeFile(filename, source); await writeFile(outputFilename, result.code); await writeFile(outputFilename + '.map', result.map);
  const processResult = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], {encoding: 'utf8', timeout: 10000});
  assert.ifError(processResult.error);
  return processResult;
}

test('short functions compose with defaults, rest arguments, list/call spread, and object expressions', async t => {
  const result = await run(t, `
export fn total(initial = 0, ...values) => values.reduce(fn(sum, value) => sum + value, initial)
fn record(value) => {value: value, ready: true}
fn append(value, values = []) {
  values.push(value)
  return values
}
say(total(), total(10, ...[1, 2, 3]), total(null))
say(JSON.stringify(record(42)))
say(JSON.stringify([...[1, 2], ..."🌉a", 3]))
say(JSON.stringify(append(1)), JSON.stringify(append(2)))
async fn double(value = 2) => await Promise.resolve(value * 2)
say(await double(), await double(0))
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '0 16 null\n{"value":42,"ready":true}\n[1,2,"🌉","a",3]\n[1] [2]\n4 0\n');
});

test('default parameters use the parameter environment, preserve false/zero/null, and retain TDZ', async t => {
  const result = await run(t, `
const label = "outer"
fn read(value = label) { const label = "body"; return value }
fn identity(value = 42) => value
fn forward(first = second, second = 2) => first
say(read(), identity(false), identity(0), identity(null), identity(undefined))
try { forward() } catch error { say(error.name) }
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'outer false 0 null 42\nReferenceError\n');
  assert.throws(() => compile('fn bad(value = helper()) { fn helper() => 1; return value }'), /Unknown name 'helper'/);
  const source = 'fn copy(value, fallback = value) => fallback';
  const analysis = analyze(source, 'file:///main.arya');
  assert.equal(definitionAt(analysis, source.lastIndexOf('value'))?.start, source.indexOf('value'));
});

test('pipeline input, computed receiver, member getter and awaited extra arguments evaluate once in order', async t => {
  const helper = `const events=[];
const method=function(value,extra){events.push('invoke');return this.offset+value+extra};
method.call=method.apply=()=>{throw Error('User call/apply must not be used')};
const owner={offset:40,get method(){events.push('getter');return method}};
export const input=()=>{events.push('input');return 2};
export const object=()=>{events.push('object');return owner};
export const key=()=>{events.push('key');return 'method'};
export const extra=async()=>{events.push('extra');return 3};
export const trace=()=>events.join(',');`;
  const result = await run(t, `use js "./helper.mjs" as helper
const answer = helper.input() |> helper.object()[helper.key()](await helper.extra())
say(answer, helper.trace())`, {'helper.mjs': helper});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '45 input,object,key,getter,extra,invoke\n');
});

test('pipelines support explicit async stages, preserve promises, and continue across comments/newlines', async t => {
  const result = await run(t, `
fn add(value, amount = 1) => value + amount
async fn double(value) => await Promise.resolve(value * 2)
const pending = 2 |> double
say(Promise.resolve(pending) == pending, await pending)
const answer = 20
  |> await double
  # A documented continuation.
  |> add(2)
say(answer, 3 |> (fn(value) => value * 2))
say(null ?? 2 + 3 |> add(1) |> add(2))
say(await (2 |> double))
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true 4\n42 6\n8\n4\n');
});

test('guard fallbacks enforce exits and work with functions, nested branches, continue and break', async t => {
  const result = await run(t, `
fn greet(name) {
  guard name else { return "Guest" }
  return name
}
fn require(value) {
  guard value else { if value == null { throw "missing" } else { return "empty" } }
  return value
}
const values = []
each value in range(6) {
  guard value % 2 == 0 else { continue }
  guard value < 4 else { break }
  values.push(value)
}
say(greet(null), greet("Arya"), require("ready"), require(false), values.join("-"))
try { require(null) } catch error { say(error) }
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Guest Arya ready empty 0-2\nmissing\n');
});

test('indexed loops preserve iterable semantics, fresh captures, and outer names in iterable expressions', async t => {
  const result = await run(t, `
const index = 100
each value at index in [index] { say(value, index) }
const callbacks = []
each value at position in "🌉a" { callbacks.push(fn() => str(position) + ":" + value) }
say(callbacks[0](), callbacks[1]())
const positions = []
each value at position in new Set(["a", "b"]) {
  positions.push(position)
  position = 99
}
say(positions.join(","), index)
let at = "contextual"
say(at)
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '100 0\n0:🌉 1:a\n0,1 100\ncontextual\n');
});

test('finally runs for returns, exceptions, guard exits and loop control, including awaited cleanup', async t => {
  const result = await run(t, `
const events = []
async fn work(ready = true) {
  try {
    guard ready else { return "blocked" }
    return "done"
  } finally {
    await Promise.resolve()
    events.push("cleanup")
  }
}
say(await work(), await work(false))
try { throw "problem" } catch error { events.push(error) } finally { events.push("after catch") }
each value in [1, 2] {
  try { if value == 1 { continue }; break } finally { events.push(value) }
}
fn override() { try { return 1 } finally { return 2 } }
say(events.join("|"), override())
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'done blocked\ncleanup|cleanup|problem|after catch|1|2 2\n');
});

test('new syntax rejects ambiguous or unsafe forms with targeted diagnostics', () => {
  const rejected: [string, RegExp][] = [
    ['fn invalid(...values, next) {}', /rest parameter last/],
    ['fn invalid(...values,) {}', /rest parameter last/],
    ['fn invalid(...values = []) {}', /rest parameter cannot have a default/],
    ['async fn invalid(value = await Promise.resolve(1)) {}', /Use await/],
    ['guard true else { say("fallthrough") }', /guard fallback must exit/],
    ['fn invalid() { guard true else { if false { return 1 } } }', /guard fallback must exit/],
    ['guard true { throw "missing else" }', /guard condition else/],
    ['1 |> 42', /Pipe into a function/],
    ['const object = {}\n1 |> (object?.method)()', /Pipe into a function/],
    ['1 |> fn(value) => value', /Wrap an inline function/],
    ['fn invalid() => 1 |> await say', /awaited pipeline/],
    ['try {}', /catch or finally/],
    ['each item at item in [] {}', /already defined/],
    ['let guard = 1', /Expected a name/],
  ];
  for (const [source, pattern] of rejected) assert.throws(() => compile(source), pattern, source);
  assert.throws(() => compile('fn value() => missing'), /Unknown name 'missing'/);
  assert.equal(analyze('guard true else { say(1) }', 'file:///main.arya').diagnostics[0]?.hint?.includes('return/throw'), true);
});

test('pipeline failures have stable error codes and preserve original source frames', async t => {
  const badStage = await run(t, 'const stage = 42\ntry { 1 |> stage } catch error { say(error.code, error.name) }');
  assert.equal(badStage.status, 0, badStage.stderr);
  assert.equal(badStage.stdout, 'ARYA_PIPELINE_STAGE TypeError\n');
  const failure = await run(t, 'fn fail(value) => value.missing\nnull\n  |> fail');
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /main\.arya:1:\d+/);
  assert.match(failure.stderr, /main\.arya:3:\d+/);
});

test('default values, guards, indexed bindings, pipelines and finally remain passive in editor services', () => {
  const source = `use std "mysql" as mysql
fn connect(config = missingLibrary.load()) => config |> awaiter
const db = {} |> await mysql.connect
try {} finally { db. }
`;
  const offset = source.lastIndexOf('db.') + 3;
  const labels = standardCompletions(source, offset).map(item => item.label);
  assert.ok(labels.includes('transaction'));
  const valid = 'fn format(value, suffix = "!") => value + suffix\nconst result = "Arya" |> format\neach name at index in [result] { guard name else { continue }; try { say(index) } finally { say(format(name)) } }';
  assert.deepEqual(analyzeSource(valid).diagnostics, []);
  const tokens = semanticTokens(valid);
  assert.equal(tokens.find(token => token.start === valid.lastIndexOf('format'))?.type, 'function');
  assert.equal(tokens.find(token => token.start === valid.indexOf('suffix ='))?.type, 'parameter');
  assert.ok(tokens.find(token => token.start === valid.indexOf('index in'))?.modifiers.includes('declaration'));
  assert.throws(() => compile(source), AryaError);
  assert.match(hoverAt('guard ready else { return null }', 2)!.text, /exit early/);
  assert.equal(hoverAt('object.guard', 9), undefined);
  assert.equal(hoverAt('{guard: true}', 3), undefined);
  assert.match(completions(analyze('', 'file:///main.arya')).find(item => item.label === 'finally')!.detail!, /cleanup/);
});

test('exported short functions and pipeline namespace calls retain project export checks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya flow modules '));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'math.arya'), 'export fn scale(value, factor = 2) => value * factor');
  const filename = join(root, 'main.arya');
  await writeFile(filename, 'use arya "./math.arya" as math\nsay(21 |> math.scale)');
  const output = await writeProject(await buildProject(filename));
  const result = spawnSync(process.execPath, ['--enable-source-maps', output], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '42\n');
  await writeFile(filename, 'use arya "./math.arya" as math\n21 |> math.missing');
  await assert.rejects(checkProject(filename), (error: any) => error.diagnostics[0].code === 'ARYA_MODULE_EXPORT');
});
