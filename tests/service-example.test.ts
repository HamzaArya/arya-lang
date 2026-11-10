import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

test('the multi-file service example builds through the CLI and runs with schemas, request logs, and health endpoints', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya service example '));
  await cp('fixtures/examples/service', root, { recursive: true, filter: source => !source.split(/[\\/]/).includes('.arya') });
  const built = await promisify(execFile)(process.execPath, [resolve('dist/cli.cjs'), 'build', join(root, 'main.arya')]);
  const child = spawn(process.execPath, ['--enable-source-maps', built.stdout.trim()], {
    env: { ...process.env, PORT: '0', LOG_LEVEL: 'info' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise<number | null>(resolve => child.once('close', resolve));
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { errors += chunk.toString(); });
  t.after(async () => {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(timer); await rm(root, { recursive: true, force: true }); }
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Service did not start: ' + errors)), 5000);
    child.stdout.on('data', () => {
      for (const line of output.split('\n')) {
        try {
          const record = JSON.parse(line);
          if (record.message === 'service.listening') { clearTimeout(timer); resolve(record.port); }
        } catch { /* Await complete JSON lines. */ }
      }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Service exited before listening: ' + errors)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (path: string, options: RequestInit = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
  assert.equal((await get('/health/live')).status, 200);
  assert.equal((await get('/health/ready')).status, 200);
  assert.equal((await (await get('/api/greet/Hamza?punctuation=.')).json() as any).message, 'Hello, Hamza.');
  const response = await get('/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"message":"  Hello  "}' });
  const body = await response.json() as any;
  assert.equal(body.message, 'Hello');
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  const invalid = await get('/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"message":"","extra":"private"}' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).code, 'ARYA_VALIDATION');
  const records = output.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(records.some(record => record.message === 'message.accepted' && record.requestId === body.requestId));
  assert.ok(!output.includes('private'));
});
