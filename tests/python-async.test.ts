import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { compile } from '../src/compiler.js';
import { analyze } from '../src/language-service.js';

const execute = promisify(execFile);
const code = (expected: string) => (error: any) => error?.code === expected;
const helperSource = `import asyncio, os, pathlib, signal, subprocess, sys, time
counter = 0
def add(left, right=1, *, scale=1):
    return (left + right) * scale
def item(value, *, scale=1):
    global counter
    counter += 1
    return {"value": value * scale, "counter": counter, "pid": os.getpid()}
async def async_double(value):
    await asyncio.sleep(0)
    return value * 2
def delay(seconds):
    time.sleep(seconds)
    return "done"
def stubborn(start):
    signal.signal(signal.SIGTERM, lambda *_: None)
    pathlib.Path(start).write_text(str(os.getpid()), encoding="utf-8")
    while True:
        time.sleep(0.1)
def descendant(start):
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], stdout=sys.stdout, stderr=sys.stderr)
    pathlib.Path(start).write_text(str(child.pid), encoding="utf-8")
    return "parent finished"
def wait(start, release):
    pathlib.Path(start).write_text(str(os.getpid()), encoding="utf-8")
    deadline = time.monotonic() + 10
    while not pathlib.Path(release).exists():
        if time.monotonic() > deadline:
            raise TimeoutError("test release was not received")
        time.sleep(0.01)
    return "released"
def broken(value=0):
    if value < 0:
        raise ValueError("expected failure")
    return value
def unsupported():
    return {1, 2}
def nonfinite():
    return float("nan")
def huge():
    return 10 ** 500
def corrupt():
    os.write(1, b"not-json")
    return 1
def noisy(size):
    print("🌉" * size, file=sys.stderr)
    return 1
def oversized(size):
    return "x" * size
def exit_bad():
    os._exit(7)
def cwd():
    return os.getcwd()
`;

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya async Python 🌉 ')));
  await writeFile(join(root, 'helper.py'), helperSource);
  const source = `use std "python" as python
use python "./helper.py" as helper
use python "math" as math
use python "arya_module_not_installed_9917" as missing
export keep tools = python
export keep py = python.client({timeoutMs: 3000, maxConcurrency: 2})
export keep worker = helper
export keep mathematics = math
export keep absent = missing
`;
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const module = await import(pathToFileURL(output).href);
  t.after(async () => { await module.py.close(); await module.tools.close(); await rm(root, { recursive: true, force: true }); });
  return { root, ...module } as { root: string; tools: any; py: any; worker: any; mathematics: any; absent: any };
}

async function untilFile(filename: string) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    try { await access(filename); return; } catch { /* Await the child process marker. */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Python did not create its test marker.');
}

test('asynchronous Python calls support arguments, keywords, coroutines, and interpreter inspection', async t => {
  const { py, worker, mathematics } = await fixture(t);
  assert.equal(await py.call(worker.add, [2, 3], { kwargs: { scale: 4 } }), 20);
  assert.equal(await py.call(mathematics.sqrt, [81]), 9);
  assert.equal(await py.call(worker.async_double, [21]), 42);
  const info = await py.info();
  assert.match(info.version, /^3\./);
  assert.equal(typeof info.executable, 'string');
  assert.equal(typeof info.virtualenv, 'boolean');
  assert.equal((await py.info({ interpreter: info.executable })).executable, info.executable);
});

test('Python map uses one module instance and process, preserves order, and leaves subsequent calls fresh', async t => {
  const { py, worker, mathematics } = await fixture(t);
  const items = await py.map(worker.item, [3, 1, 2], { kwargs: { scale: 2 } });
  assert.deepEqual(items.map((item: any) => item.value), [6, 2, 4]);
  assert.deepEqual(items.map((item: any) => item.counter), [1, 2, 3]);
  assert.equal(new Set(items.map((item: any) => item.pid)).size, 1);
  assert.equal((await py.call(worker.item, [5])).counter, 1);
  assert.equal((await py.call(worker.item, [5])).counter, 1);
  assert.deepEqual(await py.map(worker.async_double, [1, 2, 3]), [2, 4, 6]);
  assert.deepEqual(await py.map(mathematics.sqrt, []), []);
});

test('bound Python imports use ordinary call syntax with async results and shared call options', async t => {
  const { py, worker, mathematics } = await fixture(t);
  const math = py.bind(mathematics);
  assert.equal(await math.sqrt(81), 9);
  const helper = py.bind(worker, { kwargs: { scale: 3 } });
  assert.equal(await helper.add(2, 3), 15);
  assert.equal(await helper.add.with([2, 3], { scale: 4 }), 20);
  assert.equal(await py.bind(worker.async_double)(21), 42);
  assert.equal(math.then, undefined);
  assert.equal(math.toJSON, undefined);
  assert.equal(await Promise.resolve(math), math);
  assert.throws(() => math._private, code('ARYA_PYTHON_PRIVATE'));
  assert.throws(() => py.bind(() => {}), code('ARYA_PYTHON_ARGUMENTS'));
  const controller = new AbortController();
  const cancelled = py.bind(worker, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled.add(1), code('ARYA_PYTHON_CANCELLED'));
});

test('JavaScript remains responsive while Python waits, with no polling hidden inside the bridge', async t => {
  const { root, py, worker } = await fixture(t);
  const start = join(root, 'started'), release = join(root, 'release');
  const pending = py.call(worker.wait, [start, release]);
  try {
    await untilFile(start);
    let ticked = false;
    await new Promise<void>(resolve => setImmediate(() => { ticked = true; resolve(); }));
    assert.equal(ticked, true);
    assert.equal(py.stats().active, 1);
  } finally { await writeFile(release, 'release'); }
  assert.equal(await pending, 'released');
});

test('Python clients bound active jobs and queues, remove cancelled jobs, and drain on close', async t => {
  const { root, tools, worker } = await fixture(t);
  const py = tools.client({ timeoutMs: 3000, maxConcurrency: 1, queueLimit: 1 });
  t.after(() => py.close());
  const start = join(root, 'queue-start'), release = join(root, 'queue-release');
  const first = py.call(worker.wait, [start, release]);
  try {
    await untilFile(start);
    const controller = new AbortController();
    const queued = py.call(worker.add, [1, 2], { signal: controller.signal });
    assert.deepEqual(py.stats(), { active: 1, queued: 1, closed: false });
    await assert.rejects(py.call(worker.add, [3, 4]), code('ARYA_PYTHON_QUEUE_FULL'));
    controller.abort();
    await assert.rejects(queued, code('ARYA_PYTHON_CANCELLED'));
    assert.equal(py.stats().queued, 0);
    const last = py.call(worker.add, [3, 4]);
    const closing = py.close();
    assert.equal(py.close(), closing);
    await assert.rejects(py.call(worker.add, [1]), code('ARYA_PYTHON_CLOSED'));
    await writeFile(release, 'release');
    assert.equal(await first, 'released');
    assert.equal(await last, 7);
    await closing;
    assert.deepEqual(py.stats(), { active: 0, queued: 0, closed: true });
  } finally { await writeFile(release, 'release'); await first; }
});

test('Python cancellation terminates and reaps its active child before rejecting', async t => {
  const { root, py, worker } = await fixture(t);
  const start = join(root, 'cancel-start'), release = join(root, 'never-release');
  const controller = new AbortController();
  const pending = py.call(worker.wait, [start, release], { signal: controller.signal });
  await untilFile(start);
  const pid = Number(await readFile(start, 'utf8'));
  controller.abort();
  await assert.rejects(pending, code('ARYA_PYTHON_CANCELLED'));
  assert.throws(() => process.kill(pid, 0));
  assert.equal(py.stats().active, 0);
  assert.equal(await py.call(worker.add, [1]), 2);
});

test('Python deadlines include queue time and do not strand concurrency slots', async t => {
  const { root, tools, worker } = await fixture(t);
  const py = tools.client({ timeoutMs: 3000, maxConcurrency: 1 });
  t.after(() => py.close());
  const start = join(root, 'deadline-start'), release = join(root, 'deadline-release');
  const first = py.call(worker.wait, [start, release]);
  try {
    await untilFile(start);
    await assert.rejects(py.call(worker.add, [1], { timeoutMs: 20 }), code('ARYA_PYTHON_TIMEOUT'));
    assert.deepEqual(py.stats(), { active: 1, queued: 0, closed: false });
  } finally { await writeFile(release, 'release'); await first; }
  await assert.rejects(py.call(worker.delay, [10], { timeoutMs: 30 }), code('ARYA_PYTHON_TIMEOUT'));
  assert.equal(py.stats().active, 0);
  assert.equal(await py.call(worker.add, [1]), 2);
});

test('Python cancellation escalates when a worker ignores graceful termination', async t => {
  const { root, py, worker } = await fixture(t);
  const start = join(root, 'stubborn-start');
  const controller = new AbortController();
  const pending = py.call(worker.stubborn, [start], { signal: controller.signal });
  await untilFile(start);
  const pid = Number(await readFile(start, 'utf8'));
  controller.abort();
  await assert.rejects(pending, code('ARYA_PYTHON_CANCELLED'));
  assert.throws(() => process.kill(pid, 0));
  assert.equal(py.stats().active, 0);
});

test('inherited pipes from Python descendants do not hold cancelled bridge jobs open', async t => {
  const { root, py, worker } = await fixture(t);
  const start = join(root, 'descendant-start');
  const controller = new AbortController();
  const pending = py.call(worker.descendant, [start], { signal: controller.signal });
  let pid: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await untilFile(start);
    pid = Number(await readFile(start, 'utf8'));
    controller.abort();
    await Promise.race([
      assert.rejects(pending, code('ARYA_PYTHON_CANCELLED')),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Inherited pipes blocked cancellation')), 1500); }),
    ]);
    assert.equal(py.stats().active, 0);
  } finally {
    clearTimeout(timer);
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ } }
    await pending.catch(() => {});
  }
});

test('Python errors retain tracebacks, failing batch indexes, and stable dependency/result codes', async t => {
  const { root, py, worker, absent } = await fixture(t);
  await assert.rejects(py.map(worker.broken, [1, -1, 3]), (error: any) => error.code === 'ARYA_PYTHON_EXCEPTION' && error.index === 1 && error.pythonTraceback.includes('helper.py') && error.pythonTraceback.includes('ValueError'));
  for (const target of [worker.unsupported, worker.nonfinite, worker.huge]) await assert.rejects(py.call(target), code('ARYA_PYTHON_RETURN'));
  await assert.rejects(py.call(absent.call), code('ARYA_PYTHON_MODULE_NOT_FOUND'));
  await assert.rejects(py.call(worker.add, [1], { interpreter: join(root, 'missing-python') }), code('ARYA_PYTHON_NOT_FOUND'));
  await assert.rejects(py.call(worker.exit_bad), code('ARYA_PYTHON_EXIT'));
  await assert.rejects(py.call(worker.corrupt), code('ARYA_PYTHON_PROTOCOL'));
});

test('Python settings, metadata, JSON inputs, and input byte budgets are validated before starting work', async t => {
  const { tools, py, worker } = await fixture(t);
  for (const options of [null, [], { timeoutMs: 0 }, { maxConcurrency: 0 }, { maxConcurrency: 65 }, { queueLimit: -1 }, { interpreter: '' }, { typo: true }]) assert.throws(() => tools.client(options), code('ARYA_PYTHON_OPTIONS'));
  for (const options of [null, { signal: {} }, { kwargs: [] }, { timeout: 1 }]) await assert.rejects(py.call(worker.add, [1], options), (error: any) => ['ARYA_PYTHON_OPTIONS', 'ARYA_PYTHON_ARGUMENTS'].includes(error.code));
  for (const target of [() => {}, null, worker]) await assert.rejects(py.call(target), code('ARYA_PYTHON_ARGUMENTS'));
  await assert.rejects(py.call(worker.add, {}), code('ARYA_PYTHON_ARGUMENTS'));
  await assert.rejects(py.map(worker.item, Array(10001).fill(1)), code('ARYA_PYTHON_ARGUMENTS'));
  const cycle: any = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, 1n, Symbol('s'), () => {}, cycle]) await assert.rejects(py.call(worker.add, [value]), code('ARYA_PYTHON_INPUT'));
  await assert.rejects(py.call(worker.add, ['🌉'.repeat(100)], { maxInputBytes: 100 }), code('ARYA_PYTHON_INPUT'));
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
  await assert.rejects(py.call(worker.add, [1], { signal: alreadyCancelled.signal }), code('ARYA_PYTHON_CANCELLED'));
  const duringSerialization = new AbortController();
  await assert.rejects(py.call(worker.add, [{ toJSON() { duringSerialization.abort(); return 1; } }], { signal: duringSerialization.signal }), code('ARYA_PYTHON_CANCELLED'));
  assert.deepEqual(py.stats(), { active: 0, queued: 0, closed: false });
  assert.equal(await py.call(worker.add, [1], { timeoutMs: undefined }), 2);
});

test('explicit virtual environments and imported Python functions retain their separate source roots', async t => {
  const { root, tools } = await fixture(t);
  const { executable } = await tools.info();
  await execute(executable, ['-m', 'venv', '--without-pip', join(root, '.venv')]);
  const relative = process.platform === 'win32' ? './.venv/Scripts/python.exe' : './.venv/bin/python';
  const py = tools.client({ interpreter: relative, timeoutMs: 3000 });
  t.after(() => py.close());
  assert.equal((await py.info()).virtualenv, true);
  const sub = join(root, 'sub'); await mkdir(sub);
  await writeFile(join(sub, 'helper.py'), 'import os\ndef cwd():\n    return os.getcwd()\n');
  const filename = join(sub, 'module.arya');
  await writeFile(filename + '.mjs', compile('use python "./helper.py" as helper\nexport keep cwd = helper.cwd', filename).code);
  const module = await import(pathToFileURL(filename + '.mjs').href);
  assert.equal(await py.call(module.cwd), sub);
});

test('Python callable arguments are rejected without importing their module through JSON serialization', async t => {
  const { root, py, worker } = await fixture(t);
  const canary = join(root, 'must-not-import');
  await writeFile(join(root, 'side_effect.py'), `import pathlib\npathlib.Path(${JSON.stringify(canary)}).write_text("imported")\ndef value():\n    return 1\n`);
  const filename = join(root, 'side_effect.arya');
  await writeFile(filename + '.mjs', compile('use python "./side_effect.py" as helper\nexport keep callback = helper.value', filename).code);
  const module = await import(pathToFileURL(filename + '.mjs').href);
  await assert.rejects(py.call(worker.add, [module.callback]), code('ARYA_PYTHON_INPUT'));
  await assert.rejects(access(canary));
  assert.equal(py.stats().active, 0);
});

test('async Python error stacks include the original Arya await call through source maps', async t => {
  const { root } = await fixture(t);
  const filename = join(root, 'async-caller.arya'), outputFilename = join(root, 'async-caller.mjs');
  const source = 'use std "python" as python\nuse python "./helper.py" as helper\nasync fn fail() {\n  return await python.call(helper.broken, [-1])\n}\nawait fail()';
  const compiled = compile(source, { filename, outputFilename });
  await writeFile(outputFilename, compiled.code); await writeFile(outputFilename + '.map', compiled.map);
  const result = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /async-caller\.arya:4:/);
  assert.match(result.stderr, /expected failure/);
});

test('async Python output limits and failed UTF-8 logs stay bounded without shadowable Buffer helpers', async t => {
  const { root } = await fixture(t);
  const source = `use std "python" as python
use python "./helper.py" as helper
keep Buffer = null
try { await python.call(helper.noisy, [70000], {maxOutputBytes: 128 * 1024}) }
catch error { say(error.code) }
try { await python.call(helper.oversized, [10000], {maxOutputBytes: 100}) }
catch error { say(error.code) }
`;
  const filename = join(root, 'limits.mjs');
  await writeFile(filename, compile(source, join(root, 'limits.arya')).code);
  const result = spawnSync(process.execPath, [filename], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.slice(-1000));
  assert.equal(result.stdout, 'ARYA_PYTHON_OUTPUT_LIMIT\nARYA_PYTHON_OUTPUT_LIMIT\n');
  assert.ok(Buffer.byteLength(result.stderr) <= 65536);
});

test('checking async Python use remains passive', () => {
  const source = 'use std "python" as python\nuse python "not_installed" as library\nkeep client = python.client({interpreter: "missing"})\nkeep result = await client.call(library.run)';
  assert.doesNotThrow(() => compile(source));
  assert.deepEqual(analyze(source, 'file:///main.arya').diagnostics, []);
});
