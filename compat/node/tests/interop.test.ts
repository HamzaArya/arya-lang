import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compile } from '../src/compiler.js';

async function project(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya bridge 🌉 path ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function run(root: string, source: string, options: { env?: NodeJS.ProcessEnv; preload?: string } = {}) {
  const filename = join(root, 'main 🌉.arya'), outputFilename = join(root, 'program.mjs');
  const result = compile(source, { filename, outputFilename });
  await writeFile(filename, source);
  await writeFile(`${outputFilename}.map`, result.map);
  await writeFile(outputFilename, result.code);
  const execution = spawnSync(process.execPath, [...(options.preload ? ['--import', pathToFileURL(options.preload).href] : []), '--enable-source-maps', outputFilename], {
    cwd: root, env: options.env ?? process.env, encoding: 'utf8', timeout: 15_000, maxBuffer: 12 * 1024 * 1024,
  });
  assert.ifError(execution.error);
  return execution;
}

const caughtPythonCall = 'use python "math" as math\ntry { math.sqrt(4) } catch error { print(JSON.stringify({code: error.code, name: error.name, message: error.message})) }';

test('Python failures identify a missing interpreter, module, file, and callable with actionable codes', async t => {
  const root = await project(t);
  const executable = await run(root, caughtPythonCall, { env: { ...process.env, ARYA_PYTHON: join(root, 'missing-python') } });
  assert.equal(executable.status, 0, executable.stderr);
  const absent = JSON.parse(executable.stdout);
  assert.equal(absent.code, 'ARYA_PYTHON_NOT_FOUND');
  assert.match(absent.message, /ARYA_PYTHON/);
  for (const [specifier, call, code, hint] of [
    ['arya_module_that_does_not_exist_82917', 'module.call()', 'ARYA_PYTHON_MODULE_NOT_FOUND', /selected Python environment/],
    ['./missing helper.py', 'module.call()', 'ARYA_PYTHON_FILE_NOT_FOUND', /relative to the importing Arya source/],
    ['math', 'module.not_a_member()', 'ARYA_PYTHON_MEMBER', /public callable/],
    ['math', 'module.pi()', 'ARYA_PYTHON_MEMBER', /helper function/],
  ] as const) {
    const execution = await run(root, `use python ${JSON.stringify(specifier)} as module\ntry { ${call} } catch error { print(JSON.stringify({code: error.code, message: error.message})) }`);
    assert.equal(execution.status, 0, execution.stderr);
    const error = JSON.parse(execution.stdout);
    assert.equal(error.code, code);
    assert.match(error.message, hint);
    assert.ok(!error.message.includes('Traceback (most recent call last)'));
  }
});

test('Python argument and proxy constraints have stable codes and keep ordinary const-object mutation valid', async t => {
  const root = await project(t);
  const execution = await run(root, `
use python "math" as math
let cycle = {}; cycle.next = cycle
for value in [fn() {}, Symbol("s"), BigInt(1), undefined, Infinity, NaN, cycle] {
  try { math.sqrt(value) } catch error { print(error.code, error.name) }
}
try { math._private() } catch error { print(error.code, error.message) }
try { math.sqrt.with({}, {}) } catch error { print(error.code, error.name) }
print(math.then == undefined, math.sqrt.then == undefined, math[Symbol("s")] == undefined)
`);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'ARYA_PYTHON_INPUT TypeError\n'.repeat(7) +
    'ARYA_PYTHON_PRIVATE Python bridge members must be public.\nARYA_PYTHON_ARGUMENTS TypeError\ntrue true true\n');
});

test('Python exceptions, unsupported returns, fresh state, logging, UTF-8, and batching are preserved', async t => {
  const root = await project(t);
  await writeFile(join(root, 'helper 🌉.py'), `counter = 0
def describe(values, *, label=""):
    global counter
    counter += 1
    print("python log 🌉 " + label)
    return {"sum": sum(values), "count": len(values), "label": label, "counter": counter}
def broken():
    raise ValueError("expected failure 🌉")
def unsupported():
    return {1, 2}
def nonfinite():
    return float("inf")
`);
  const execution = await run(root, `
use python "./helper 🌉.py" as helper
print(JSON.stringify(helper.describe.with([[1, 2, 3]], {label: "سلام 🌉"})))
print(helper.describe([4]).counter)
try { helper.broken() } catch error { print(error.code, error.message) }
for call in [helper.unsupported, helper.nonfinite] {
  try { call() } catch error { print(error.code, error.message.startsWith("Python: ")) }
}
`);
  assert.equal(execution.status, 0, execution.stderr);
  const lines = execution.stdout.trim().split('\n');
  assert.deepEqual(JSON.parse(lines[0]!), { sum: 6, count: 3, label: 'سلام 🌉', counter: 1 });
  assert.equal(lines[1], '1');
  assert.equal(lines[2], 'ARYA_PYTHON_EXCEPTION Python: ValueError: expected failure 🌉');
  assert.deepEqual(lines.slice(3), ['ARYA_PYTHON_RETURN true', 'ARYA_PYTHON_RETURN true']);
  assert.match(execution.stderr, /python log 🌉 سلام 🌉/);
});

test('worker boundaries classify timeout, stdout/stderr buffer exhaustion, startup, and exit failures', async t => {
  const root = await project(t);
  // This preload simulates Node's documented spawnSync result boundary without
  // delaying the suite for 30 seconds or filling its output with 8 MiB of logs.
  for (const [nodeCode, expected, text] of [
    ['ETIMEDOUT', 'ARYA_PYTHON_TIMEOUT', /30000 ms/],
    ['ENOBUFS', 'ARYA_PYTHON_OUTPUT_LIMIT', /8 MiB/],
    ['EACCES', 'ARYA_PYTHON_START', /executable permissions/],
  ] as const) {
    for (const stream of nodeCode === 'ENOBUFS' ? ['stdout', 'stderr'] : ['stdout']) {
      const preload = join(root, 'boundary.mjs');
      await writeFile(preload, `import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; import {resolve} from 'node:path'; import assert from 'node:assert/strict'; child.spawnSync = (file, args, options) => { assert.equal(options.timeout, 30000); assert.equal(options.maxBuffer, 8 * 1024 * 1024); assert.equal(options.env.PYTHONIOENCODING, 'utf-8'); assert.equal(options.env.PYTHONUTF8, '1'); assert.equal(resolve(options.cwd), ${JSON.stringify(root)}); return {error: Object.assign(new Error('controlled boundary'), {code:${JSON.stringify(nodeCode)}}),status:null,stdout:'',stderr:${JSON.stringify(stream === 'stderr' ? 'controlled Python logging' : '')}}; }; syncBuiltinESMExports();`);
      const execution = await run(root, caughtPythonCall, { preload });
      assert.equal(execution.status, 0, execution.stderr);
      const error = JSON.parse(execution.stdout);
      assert.equal(error.code, expected);
      assert.match(error.message, text);
    }
  }
  const preload = join(root, 'exit.mjs');
  await writeFile(preload, "import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; child.spawnSync = () => ({status:7,stdout:'',stderr:'exit log'}); syncBuiltinESMExports();");
  const execution = await run(root, caughtPythonCall, { preload });
  assert.equal(execution.status, 0);
  assert.equal(JSON.parse(execution.stdout).code, 'ARYA_PYTHON_EXIT');
  assert.match(execution.stderr, /exit log/);
});

test('failed Unicode stderr is capped at 64 KiB of UTF-8 bytes despite a shadowed Buffer binding', async t => {
  const root = await project(t), preload = join(root, 'unicode-stderr.mjs');
  await writeFile(preload, "import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; child.spawnSync = () => ({error:Object.assign(new Error('oversized Unicode stderr'),{code:'ENOBUFS'}),status:null,stdout:'',stderr:'🌉'.repeat(70000)}); syncBuiltinESMExports();");
  const execution = await run(root, 'const Buffer = null\n' + caughtPythonCall, { preload });
  assert.equal(execution.status, 0, execution.stderr.slice(-1000));
  assert.equal(JSON.parse(execution.stdout).code, 'ARYA_PYTHON_OUTPUT_LIMIT');
  assert.equal(Buffer.byteLength(execution.stderr, 'utf8'), 65536);
  assert.equal(execution.stderr, '🌉'.repeat(16384));
});

test('malformed, truncated, or structurally invalid worker responses fail as protocol errors', async t => {
  const root = await project(t);
  for (const response of ['not JSON', '{"ok":true', 'null', '[]', '0', '{"ok":true}', '{"ok":"true","value":1}', '{"ok":false,"error":7}']) {
    const preload = join(root, 'protocol.mjs');
    await writeFile(preload, `import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; child.spawnSync = () => ({status:0,stdout:${JSON.stringify(response)},stderr:''}); syncBuiltinESMExports();`);
    const execution = await run(root, caughtPythonCall, { preload });
    assert.equal(execution.status, 0, execution.stderr);
    const error = JSON.parse(execution.stdout);
    assert.equal(error.code, 'ARYA_PYTHON_PROTOCOL', response);
    assert.match(error.message, /invalid JSON response/);
  }
});

test('real oversized Python logs/results are bounded and native stdout corruption is rejected', async t => {
  const root = await project(t);
  await writeFile(join(root, 'hostile.py'), `import os
def noisy():
    print("x" * (9 * 1024 * 1024))
    return 1
def oversized():
    return "x" * (9 * 1024 * 1024)
def corrupt():
    os.write(1, b"not-json")
    return 1
`);
  for (const [member, code] of [['noisy', 'ARYA_PYTHON_OUTPUT_LIMIT'], ['oversized', 'ARYA_PYTHON_OUTPUT_LIMIT'], ['corrupt', 'ARYA_PYTHON_PROTOCOL']] as const) {
    const execution = await run(root, `use python "./hostile.py" as helper\ntry { helper.${member}() } catch error { print(error.code) }`);
    assert.equal(execution.status, 0, execution.stderr.slice(-2000));
    assert.equal(execution.stdout, code + '\n');
    assert.ok(execution.stderr.length <= 65536, 'failed calls must not dump multi-megabyte stderr');
  }
});

test('Python bridge errors retain mapped Arya function and caller frames', async t => {
  const root = await project(t);
  const execution = await run(root, 'use python "math" as math\nfn fail() {\n  return math.sqrt(-1)\n}\nfail()');
  assert.notEqual(execution.status, 0);
  assert.match(execution.stderr, /Python: ValueError/);
  assert.match(execution.stderr, /main 🌉\.arya:3:15/);
  assert.match(execution.stderr, /main 🌉\.arya:5:1/);
});

test('JavaScript namespace, default, CommonJS, callbacks, receivers, constructors, and async stay native', async t => {
  const root = await project(t);
  await writeFile(join(root, 'namespace.mjs'), 'export const answer = 42; export const twice = value => value * 2;');
  await writeFile(join(root, 'default.mjs'), 'export default value => value + 1; export const named = 7;');
  await writeFile(join(root, 'common.cjs'), 'module.exports = callback => callback(21);');
  await writeFile(join(root, 'library.mjs'), 'export class Box { constructor(value) { this.value = value; } read() { return this.value; } } export async function answer() { return 42; }');
  const execution = await run(root, `
use js "./namespace.mjs" as namespace
use js "./default.mjs" as increment
use js "./common.cjs" as common
use js "./library.mjs" as library
let box = new library.Box(8)
print(namespace.answer, increment(2), common(namespace.twice), box.read(), await library.answer())
print(JSON.stringify([1, 2].map(namespace.twice)))
`);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, '42 3 42 8 42\n[2,4]\n');
});

test('JavaScript nullish defaults retain M2 namespace fallback while false/zero/empty select defaults', async t => {
  const root = await project(t);
  for (const [name, value] of [['nil', 'null'], ['absent', 'undefined'], ['zero', '0'], ['no', 'false'], ['text', '""']]) {
    await writeFile(join(root, `${name}.mjs`), `export default ${value}; export const named = 7;`);
  }
  const execution = await run(root, `
use js "./nil.mjs" as nil
use js "./absent.mjs" as absent
use js "./zero.mjs" as zero
use js "./no.mjs" as no
use js "./text.mjs" as text
print(nil.default == null, absent.default == undefined, nil.named, absent.named, zero == 0, no == false, text == "")
`);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'true true 7 7 true true true\n');
});

test('JavaScript loader/property failures stay native and library exceptions retain mapped Arya callers', async t => {
  const root = await project(t);
  const missingPackage = await run(root, 'use js "arya_package_not_installed_82917" as missing\nprint(missing)');
  assert.notEqual(missingPackage.status, 0);
  assert.match(missingPackage.stderr, /ERR_MODULE_NOT_FOUND/);
  await writeFile(join(root, 'library.mjs'), 'export function fail() { throw new Error("library failure"); }');
  const missingExport = await run(root, 'use js "./library.mjs" as library\nprint(library.absent == undefined)\nlibrary.absent()');
  assert.notEqual(missingExport.status, 0);
  assert.equal(missingExport.stdout, 'true\n');
  assert.match(missingExport.stderr, /TypeError/);
  assert.match(missingExport.stderr, /main 🌉\.arya:3:/);
  const failure = await run(root, 'use js "./library.mjs" as library\nlibrary.fail()');
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /library\.mjs:1:/);
  assert.match(failure.stderr, /main 🌉\.arya:2:9/);
});

test('shipped offline npm and Python batch examples run from their documented project layout', async t => {
  const root = await project(t), npm = process.env.npm_execpath;
  assert.ok(npm, 'Run the full suite through npm run check so the active npm CLI is available.');
  const npmRoot = join(root, 'npm');
  await cp('fixtures/examples/npm', npmRoot, { recursive: true });
  const install = spawnSync(process.execPath, [npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: npmRoot, env: { ...process.env, npm_config_cache: join(root, 'npm-cache'), npm_config_update_notifier: 'false' }, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(install.error);
  assert.equal(install.status, 0, install.stderr);
  const npmExecution = await run(npmRoot, await readFile(join(npmRoot, 'main.arya'), 'utf8'));
  assert.equal(npmExecution.status, 0, npmExecution.stderr);
  assert.equal(npmExecution.stdout, 'local npm package 42 6\n');
  const batchRoot = join(root, 'batch');
  await cp('fixtures/examples/python-batch', batchRoot, { recursive: true });
  const batchExecution = await run(batchRoot, await readFile(join(batchRoot, 'main.arya'), 'utf8'));
  assert.equal(batchExecution.status, 0, batchExecution.stderr);
  assert.deepEqual(JSON.parse(batchExecution.stdout), { count: 4, sum: 100, mean: 25, doubled: [20, 40, 60, 80] });
  assert.equal(batchExecution.stderr.replace(/\r\n/g, '\n'), 'processed one batch\n');
});
