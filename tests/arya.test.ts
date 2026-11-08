import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { AryaError, compile, tokenize } from '../src/compiler.js';

const execute = promisify(execFile);
async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya program ')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function run(root: string, source: string, env: NodeJS.ProcessEnv = process.env) {
  const file = join(root, 'main.arya');
  const compiled = compile(source, file); const output = join(root, 'program.mjs');
  await writeFile(output, compiled.code);
  return execute(process.execPath, [output, 'literal; argument'], { cwd: root, env, timeout: 10_000 });
}

test('Arya values, precedence, recursion, closures, loops, mutation, and control flow execute', async t => {
  const root = await fixture(t);
  const { stdout } = await run(root, `
fn factorial(n) { if n <= 1 { return 1 }; return n * factorial(n - 1) }
fn counter() { let n = 0; return fn() { n += 1; return n } }
let next = counter()
let values = []
for n in range(1, 5) { if n == 2 { continue }; values.push(n) }
let i = 0
while true { i += 1; if i == 3 { break } }
let result = {factorial: factorial(5), sum: 1 + 2 * 3, power: 2 ** 3 ** 2, count: next() + next(), items: values, i: i}
result.items[0] = 9
print(JSON.stringify(result))
print(not false and true or false, len("hello"), str(42), number("3"), args[0])
`);
  assert.deepEqual(JSON.parse(stdout.split('\n')[0]!), { factorial: 120, sum: 7, power: 512, count: 3, items: [9, 3, 4], i: 3 });
  assert.match(stdout, /true 5 42 3 literal; argument/);
});

test('JavaScript interoperability preserves callbacks, receivers, constructors, async, ESM and CommonJS', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'library.mjs'), 'export const twice = x => x * 2; export class Box { constructor(value) { this.value = value; } get() { return this.value; } }');
  const packageRoot = join(root, 'node_modules', 'arya-test-library'); await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), '{"name":"arya-test-library","main":"index.cjs"}');
  await writeFile(join(packageRoot, 'index.cjs'), 'module.exports = callback => callback(21);');
  const { stdout } = await run(root, `
use js "./library.mjs" as library
use js "arya-test-library" as framework
use js "node:path" as path
async fn answer() { return await Promise.resolve(framework(library.twice)) }
let box = new library.Box(await answer())
print(box.get(), path.basename("/tmp/demo.arya"))
print(JSON.stringify([1, 2].map(fn(value) { return library.twice(value) })))
`);
  assert.equal(stdout, '42 demo.arya\n[2,4]\n');
});

test('Python bridge supports modules, local files, nested JSON, kwargs, output, and exceptions', async t => {
  const python = process.env.ARYA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  if (!python) { t.skip('Python is required for the bridge integration test.'); return; }
  const root = await fixture(t);
  await writeFile(join(root, 'helper.py'), 'def summarize(values, *, factor=1):\n    print("python log")\n    return {"value": sum(values) * factor, "nested": [True, None]}\ndef broken():\n    raise ValueError("expected failure")\n');
  const { stdout, stderr } = await run(root, `
use python "math" as math
use python "./helper.py" as helper
print(math.sqrt(81))
print(JSON.stringify(helper.summarize.with([[1, 2, 3]], {factor: 2})))
try { helper.broken() } catch error { print(error.message) }
try { helper.summarize([fn() { return 1 }]) } catch error { print(error.message) }
`, { ...process.env, ARYA_PYTHON: python });
  assert.equal(stdout.split('\n')[0], '9');
  assert.deepEqual(JSON.parse(stdout.split('\n')[1]!), { value: 12, nested: [true, null] });
  assert.match(stdout, /Python: ValueError: expected failure/); assert.match(stdout, /must be JSON-compatible/); assert.match(stderr, /python log/);
});

test('syntax diagnostics have source positions and reject invalid constructs without executing imports', () => {
  for (const source of ['let = 1', 'fn f(a, a) {}', 'return 1', 'break', 'if true {', 'let n = "unclosed', 'let a = 1 let b = 2', 'let x = 1\nlet x = 2', 'fn f() { await task() }', 'use ruby "math" as m', 'let x = (1 + )', 'let __arya_source = 1', 'let class = 1', '(1 + 2) = 3', 'fn f() { export let n = 1 }']) assert.throws(() => compile(source), AryaError, source);
  assert.throws(() => compile('# comment\nlet value = @'), (error: unknown) => error instanceof AryaError && error.token.line === 1 && error.token.column === 12);
  assert.doesNotThrow(() => compile('use js "does-not-exist" as library\nuse python "also_missing" as py'));
  assert.throws(() => compile('let a = ' + '('.repeat(200) + '1' + ')'.repeat(200)), AryaError);
  assert.throws(() => tokenize('a'.repeat(256 * 1024 + 1)), AryaError);
});

test('strings, comments, multiline collections, else-if, and exports produce valid modules', async t => {
  const root = await fixture(t);
  const { stdout } = await run(root, `# comment
export const label = "# not a comment // \\n"
export fn choose(n) {
  if n < 0 { return "negative" }
  else if n == 0 { return "zero" }
  else { return "positive" }
}
let object = {
  "__proto__": 42,
  name: 'Arya',
}
print(choose(0), object.name, object["__proto__"], len([
  1,
  2,
])) // comment
`);
  assert.equal(stdout, 'zero Arya 42 2\n');
});

test('all shipped Arya examples compile to syntactically valid JavaScript', async t => {
  const root = await fixture(t);
  for (const name of ['hello', 'bridge', 'web', 'express']) {
    const source = resolve('fixtures/arya', `${name}.arya`), output = join(root, `${name}.mjs`);
    await writeFile(output, compile(await readFile(source, 'utf8'), source).code);
    await execute(process.execPath, ['--check', output]);
  }
});
