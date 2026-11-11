import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

async function start(t: { after(fn: () => Promise<unknown>): void }, root: string) {
  const built = await promisify(execFile)(process.execPath, [resolve('dist/cli.cjs'), 'build', join(root, 'main.arya')]);
  const child = spawn(process.execPath, ['--enable-source-maps', built.stdout.trim()], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  t.after(async () => {
    await writeFile(join(root, 'release'), 'release');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(timer); await rm(root, { recursive: true, force: true }); }
  });
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { errors += data.toString(); });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Python service did not start: ' + errors)), 5000);
    child.stdout.on('data', () => {
      for (const line of output.split('\n')) {
        try { const value = JSON.parse(line); if (Number.isInteger(value.port)) { clearTimeout(timer); resolve(value.port); } }
        catch { /* Wait for complete log records. */ }
      }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Python service exited: ' + errors)); });
  });
  return { fetch: (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${port}` + path, { ...options, signal: options.signal ?? AbortSignal.timeout(5000) }) };
}

test('the reporting example combines JavaScript hashing and Python CSV/statistics through the actual CLI build', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya Python reports '));
  await cp('fixtures/examples/python-web', root, { recursive: true, filter: path => !path.split(/[\\/]/).some(part => ['.arya', '__pycache__'].includes(part)) });
  const client = await start(t, root);
  assert.equal((await client.fetch('/health/live')).status, 200);
  assert.equal((await client.fetch('/health/ready')).status, 200);
  const csv = 'amount\n10\n20\n30\n';
  const post = (body: any) => client.fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post({ csv });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(body.summary, { count: 3, total: 60, mean: 20, median: 20, minimum: 10, maximum: 30 });
  assert.equal(body.checksum, createHash('sha256').update(csv).digest('hex'));
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  assert.equal((await post({ csv, unexpected: true })).status, 400);
  const invalid = await post({ csv: 'amount\nnot-a-number\n' });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json() as any).code, 'INVALID_CSV');
});

test('HTTP remains responsive during Python work and client disconnects cancel that work', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya Python cancellation '));
  await writeFile(join(root, 'worker.py'), `import os, pathlib, time
def wait(start, release):
    pathlib.Path(start).write_text(str(os.getpid()), encoding="utf-8")
    while not pathlib.Path(release).exists():
        time.sleep(0.01)
    return "done"
`);
  await writeFile(join(root, 'main.arya'), `use std "web" as web
use std "python" as python
use python "./worker.py" as worker
const py = python.client({timeoutMs: 5000})
const server = web.serve(0, {
  "GET /health/live": fn() { return {status: "ok"} },
  "GET /status": fn() { return py.stats() },
  "GET /work": async fn(request) {
    return await py.call(worker.wait, [${JSON.stringify(join(root, 'started'))}, ${JSON.stringify(join(root, 'release'))}], {signal: request.signal})
  }
}, {html: false, assets: false})
server.on("listening", fn() { print(JSON.stringify({port: server.address().port})) })
`);
  const client = await start(t, root);
  const controller = new AbortController();
  const pending = client.fetch('/work', { signal: controller.signal }).catch(error => error);
  const deadline = Date.now() + 2500;
  let pid: number | undefined;
  while (Date.now() < deadline) {
    try { pid = Number(await readFile(join(root, 'started'), 'utf8')); break; } catch { /* Wait for Python work to start. */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(pid, 'Python must start before testing JavaScript responsiveness');
  assert.equal((await client.fetch('/health/live', { signal: AbortSignal.timeout(1500) })).status, 200);
  assert.equal((await (await client.fetch('/status')).json() as any).active, 1);
  controller.abort();
  await pending;
  let active = 1;
  const cancelled = Date.now() + 1500;
  while (active && Date.now() < cancelled) {
    active = (await (await client.fetch('/status')).json() as any).active;
    if (active) await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(active, 0);
  assert.throws(() => process.kill(pid!, 0));
});
