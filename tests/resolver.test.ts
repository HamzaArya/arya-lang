import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compile, analyzeSource, AryaError } from '../src/compiler.js';
import { analyze, completions, definitionAt } from '../src/language-service.js';
import { hostGlobals } from '../src/host-globals.js';

async function project(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya lexical 🌉 ')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('unknown lexical names fail compilation and passive editor analysis', () => {
  const source = 'let greeting = "hello"\nprint(greetng)';
  assert.throws(() => compile(source), (error: unknown) => error instanceof AryaError && /Unknown name 'greetng'/.test(error.message));
  assert.match(analyze(source, 'file:///main.arya').error!.message, /Did you mean 'greeting'/);
});

test('direct and compound const writes fail compilation', () => {
  for (const operator of ['=', '+=', '-=', '*=', '/=']) {
    assert.throws(() => compile(`const limit = 3\n(limit) ${operator} 1`), (error: unknown) => error instanceof AryaError && /Cannot assign to const 'limit'/.test(error.message));
  }
});

test('locals, parameters, import aliases, and captured names are checked in their lexical scope', () => {
  const cases = [
    ['let count = 1\nprint(cout)', 'cout', 'count'],
    ['fn greet(person) { return persn }', 'persn', 'person'],
    ['use js "not-installed" as library\nlibray.run()', 'libray', 'library'],
    ['let outer = 1\nfn make() { return fn() { return outr } }', 'outr', 'outer'],
    ['new MissingConstructor()', 'MissingConstructor', undefined],
  ] as const;
  for (const [source, name, suggestion] of cases) {
    const analysis = analyzeSource(source);
    assert.equal(analysis.diagnostics.length, 1, source);
    assert.equal(analysis.diagnostics[0]!.code, 'ARYA_UNKNOWN_NAME');
    assert.equal(analysis.diagnostics[0]!.token.text, name);
    assert.equal(analysis.diagnostics[0]!.suggestion, suggestion);
  }
});

test('const checks follow resolved bindings through closures, imports, builtins, and shadowing', () => {
  for (const source of [
    'const count = 1\nfn change() { count += 1 }',
    'use js "not-installed" as library\nlibrary = null',
    'use python "not_installed" as py\npy += 1',
    'print = fn() {}', 'args = []', 'range += 1',
  ]) {
    const diagnostics = analyzeSource(source).diagnostics;
    assert.equal(diagnostics.length, 1, source);
    assert.equal(diagnostics[0]!.code, 'ARYA_CONST_ASSIGNMENT', source);
  }
  assert.doesNotThrow(() => compile('const count = 1\nfn change() { let count = 2; count += 1 }\nconst object = {value: 1}; object.value = 2; object["value"] += 1\nfn local(print) { print = 1 }'));
  // A later local declaration still shadows the outer const; timing is runtime TDZ.
  assert.doesNotThrow(() => compile('const count = 1\nfn change() { count = 2; let count = 3 }'));
  assert.equal(analyzeSource('let count = 1\nfn change() { count = 2; const count = 3 }').diagnostics[0]!.code, 'ARYA_CONST_ASSIGNMENT');
});

test('forward declarations, recursion, closures, mutable functions, and known-name TDZ remain valid', () => {
  assert.doesNotThrow(() => compile(`
print(even(4))
fn even(n) { if n == 0 { return true }; return odd(n - 1) }
fn odd(n) { if n == 0 { return false }; return even(n - 1) }
fn read() { return later }
let later = 4
print(read())
if true { print(block()); fn block() { return later }; let later = later }
let self = self
even = fn(n) { return n }
`));
});

test('loop header, body, catch, and sibling scopes resolve with the M2 boundaries', () => {
  const source = `
let iterable = [1]
for item in iterable { const iterable = []; print(item, iterable) }
try { throw 1 } catch caught { print(caught) }
if true { let privateValue = 1 }
if false { print(privateValue) }
print(item, caught)
`;
  const result = analyzeSource(source);
  assert.deepEqual(result.diagnostics.map(error => error.token.text), ['privateValue', 'item', 'caught']);
  const iterableRefs = result.references.filter(reference => reference.token.text === 'iterable');
  assert.equal(iterableRefs[0]!.binding!.kind, 'let', 'body declarations must not shadow the iterable expression');
  assert.equal(iterableRefs[1]!.binding!.kind, 'const');
  const self = analyzeSource('let items = [1]\nfor items in items { print(items) }');
  assert.deepEqual(self.diagnostics, []);
  assert.ok(self.references.filter(item => item.token.text === 'items').every(item => item.binding?.kind === 'loop'));
  for (const source of ['for item in [] { let item = 1 }', 'try {} catch error { const error = 1 }', 'fn f(x, x) {}', 'fn f(x) { let x = 1 }', 'let x = 1; fn x() {}']) {
    assert.throws(() => compile(source), AryaError, source);
  }
});

test('properties, quoted keys, and object keys stay outside lexical lookup, while indexes are references', () => {
  assert.doesNotThrow(() => compile('const box = {unbound: 1, default: 2, "__aryaData": 3}\nprint(box.unbound, box.unknown, box["unbound"], new Map().size)'));
  assert.deepEqual(analyzeSource('const box = {}\nbox[missing] = value').diagnostics.map(item => item.token.text), ['missing', 'value']);
  assert.deepEqual(analyzeSource('print({key: missing})').diagnostics.map(item => item.token.text), ['missing']);
});

test('approved bare host names are deterministic and unknown host extensions require explicit access', () => {
  assert.deepEqual(analyzeSource(`print([${hostGlobals.join(', ')}])`).diagnostics, []);
  assert.deepEqual(analyzeSource('print(require, module, exports, __dirname, window, document, Deno)').diagnostics.map(item => item.token.text), ['require', 'module', 'exports', '__dirname', 'window', 'document', 'Deno']);
  assert.doesNotThrow(() => compile('const Math = 3; print(Math, globalThis.optionalExtension); fn f(process) { return process }'));
});

test('independent semantic diagnostics have exact UTF-16 spans and retain completion/Outline symbols', () => {
  const source = 'const emoji = "🌉"; const count = 1; count += misspelled; unknown = 2\nfn declared() { return absent }';
  const analysis = analyze(source, 'untitled:example');
  assert.deepEqual(analysis.diagnostics.map(error => error.code), ['ARYA_CONST_ASSIGNMENT', 'ARYA_UNKNOWN_NAME', 'ARYA_UNKNOWN_NAME', 'ARYA_UNKNOWN_NAME']);
  assert.deepEqual(analysis.diagnostics.map(error => source.slice(error.token.start, error.token.end)), ['count', 'misspelled', 'unknown', 'absent']);
  assert.equal(analysis.diagnostics[0]!.token.column, source.indexOf('count +='));
  assert.equal(analysis.diagnostics[3]!.token.line, 1);
  assert.equal(analysis.error, analysis.diagnostics[0]);
  assert.deepEqual(analysis.symbols.map(symbol => symbol.name), ['emoji', 'count', 'declared']);
  assert.ok(completions(analysis).some(item => item.label === 'declared'));
  assert.throws(() => compile(source), (error: unknown) => error instanceof AryaError && error.diagnostics.length === 4 && error.token === error.diagnostics[0]!.token);
  const syntax = analyze('let = 1', 'file:///invalid.arya');
  assert.equal(syntax.diagnostics.length, 1);
  assert.equal(syntax.diagnostics[0]!.code, 'ARYA_SYNTAX');
});

test('typo suggestions are unique single edits, support transpositions, and ignore inaccessible declarations', () => {
  assert.equal(analyzeSource('prnit(1)').diagnostics[0]!.suggestion, 'print');
  assert.equal(analyzeSource('let cat = 1; let car = 2; print(cap)').diagnostics[0]!.suggestion, undefined);
  assert.equal(analyzeSource('if true { let secret = 1 }; print(secrt)').diagnostics[0]!.suggestion, undefined);
  assert.equal(analyzeSource('let exact = 1; print(exact)').diagnostics.length, 0);
  assert.equal(analyzeSource('let names = 1; print(NameThatIsNotClose)').diagnostics[0]!.suggestion, undefined);
});

test('declaration kinds and reference access survive resolution for same-file navigation', () => {
  const source = 'use js "missing" as lib\nconst top = 1\nfn outer(param) { let local = param; for item in [local] { try { item += top } catch error { print(error, lib) } }; return fn() { return local } }';
  const analysis = analyze(source, 'file:///navigation.arya');
  assert.deepEqual(analysis.diagnostics, []);
  const userBindings = analysis.bindings.filter(binding => binding.token);
  assert.deepEqual(userBindings.map(binding => binding.kind), ['import', 'const', 'function', 'parameter', 'let', 'loop', 'catch']);
  assert.equal(analysis.references.find(reference => reference.token.text === 'item')!.access, 'readwrite');
  assert.equal(definitionAt(analysis, source.lastIndexOf('local'))!.start, source.indexOf('local'));
  assert.equal(definitionAt(analysis, source.indexOf('param;'))!.start, source.indexOf('param)'));
  assert.equal(definitionAt(analysis, source.indexOf('print(')), undefined);
  const shadow = 'let value = 1\nfn f(value) { return value }\nprint(value)';
  const resolved = analyze(shadow, 'file:///shadow.arya');
  assert.equal(definitionAt(resolved, shadow.indexOf('return value') + 7)!.start, shadow.indexOf('value)'));
  assert.equal(definitionAt(resolved, shadow.lastIndexOf('value'))!.start, shadow.indexOf('value'));
  const property = 'let box = {field: 1}\nprint(box.field)';
  assert.equal(definitionAt(analyze(property, 'file:///property.arya'), property.lastIndexOf('field')), undefined);
});

test('analysis does not import JavaScript, launch Python, or write files even with lexical errors', async t => {
  const root = await project(t), canary = join(root, 'CANARY');
  await writeFile(join(root, 'library.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(canary)}, 'bad');`);
  await writeFile(join(root, 'helper.py'), `open(${JSON.stringify(canary)}, 'w').write('bad')`);
  const source = 'use js "./library.mjs" as library\nuse python "./helper.py" as py\nuse js "missing-package" as absent\nlibrary.call(); py.call(); absent.call(); unknown';
  assert.deepEqual(analyze(source, pathToFileURL(join(root, 'main.arya')).href).diagnostics.map(item => item.code), ['ARYA_UNKNOWN_NAME']);
  assert.throws(() => compile(source, join(root, 'main.arya')), AryaError);
  await assert.rejects(access(canary), { code: 'ENOENT' });
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
});

test('CLI Check reports every lexical error and neither Build nor Run replaces or executes stale output', async t => {
  const root = await project(t), filename = join(root, 'main.arya');
  const cli = (command: string) => spawnSync(process.execPath, [resolve('dist/cli.cjs'), command, filename], { encoding: 'utf8', timeout: 10_000 });
  await writeFile(filename, 'print("stale output must not execute")');
  assert.equal(cli('build').status, 0);
  const output = join(root, '.arya', 'build', 'main.arya.mjs');
  const previous = [await readFile(output, 'utf8'), await readFile(`${output}.map`, 'utf8')];
  await writeFile(filename, 'const limit = 1\nlimit = 2\nprint(mispelled)\nother = 3');
  for (const command of ['check', 'build', 'run']) {
    const result = cli(command);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /main\.arya:2:1: Cannot assign to const 'limit'/);
    assert.match(result.stderr, /main\.arya:3:7: Unknown name 'mispelled'/);
    assert.match(result.stderr, /main\.arya:4:1: Unknown name 'other'/);
    assert.equal(result.stdout, '');
    assert.equal(await readFile(output, 'utf8'), previous[0]);
    assert.equal(await readFile(`${output}.map`, 'utf8'), previous[1]);
  }
});
