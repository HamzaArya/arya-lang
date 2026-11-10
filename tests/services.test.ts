import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { connect } from 'node:net';
import { compile } from '../src/compiler.js';

const deferred = () => {
  let resolve!: (value?: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { promise, resolve };
};

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya services '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'main.mjs');
  await writeFile(output, compile('use std "web" as web\nuse std "validate" as validate\nuse std "log" as log\nexport keep http = web\nexport keep rules = validate\nexport keep logging = log', join(root, 'main.arya')).code);
  const module = await import(pathToFileURL(output).href);
  const listen = async (routes: Record<string, any>, options: Record<string, any> = {}) => {
    const server = module.http.serve(0, routes, { html: false, assets: false, ...options }) as Server;
    t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    return { server, base, fetch: (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, signal: init.signal ?? AbortSignal.timeout(5000) }) };
  };
  return { root, web: module.http, validate: module.rules, log: module.logging, listen };
}

test('web requests have correlation IDs with explicit trust and protected response headers', async t => {
  const { web, listen } = await fixture(t);
  const client = await listen({ 'GET /': (input: any) => web.response(200, { requestId: input.requestId }, { 'x-request-id': 'spoof' }) });
  const response = await client.fetch('/', { headers: { 'x-request-id': 'untrusted-client-id' } });
  const body = await response.json() as any;
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get('x-request-id'), body.requestId);
  const trusted = await listen({ '/': (input: any) => ({ requestId: input.requestId }) }, { trustRequestId: true });
  assert.equal((await trusted.fetch('/', { headers: { 'x-request-id': 'proxy-request.42' } })).headers.get('x-request-id'), 'proxy-request.42');
  assert.notEqual((await trusted.fetch('/', { headers: { 'x-request-id': 'invalid id' } })).headers.get('x-request-id'), 'invalid id');
});

test('parameter routes decode values, prefer exact paths, and support GET fallback for HEAD', async t => {
  const { listen } = await fixture(t);
  const client = await listen({
    'GET /items/:id': (input: any) => ({ id: input.params.id, method: input.method }),
    'GET /items/count': { count: 42 },
    'GET /groups/:group/items/:id': (input: any) => input.params,
  });
  assert.deepEqual(await (await client.fetch('/items/a%20b')).json(), { id: 'a b', method: 'GET' });
  assert.deepEqual(await (await client.fetch('/items/count')).json(), { count: 42 });
  assert.deepEqual(await (await client.fetch('/groups/work/items/42')).json(), { group: 'work', id: '42' });
  const head = await client.fetch('/items/42', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/items/%2F', '/items/%5c', '/items/%00', '/items/%zz']) assert.equal((await client.fetch(path)).status, 400);
  assert.equal((await client.fetch('/items/')).status, 404);
});

test('route schemas normalize body, query and parameters before running handlers', async t => {
  const { web, validate, listen } = await fixture(t);
  let calls = 0;
  const client = await listen({
    'POST /items/:id': web.route((input: any) => { calls++; return { body: input.body, params: input.params, query: input.query }; }, {
      body: validate.object({ title: validate.string({ trim: true, min: 1, max: 20 }) }),
      params: validate.object({ id: validate.integer({ coerce: true, min: 1 }) }),
      query: validate.object({ limit: validate.optional(validate.integer({ coerce: true, min: 1, max: 100 }), 10) }),
    }),
  });
  const post = (path: string, body: any) => client.fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual(await (await post('/items/42', { title: ' Task ' })).json(), { body: { title: 'Task' }, params: { id: 42 }, query: { limit: 10 } });
  const invalid = await post('/items/no?limit=101', { title: '', extra: 'do-not-echo' });
  assert.equal(invalid.status, 400);
  const failure = await invalid.json() as any;
  assert.equal(failure.code, 'ARYA_VALIDATION');
  assert.ok(failure.issues.some((issue: any) => issue.path.join('.') === 'params.id'));
  assert.ok(failure.issues.some((issue: any) => issue.path.join('.') === 'query.limit'));
  assert.ok(!JSON.stringify(failure).includes('do-not-echo'));
  assert.equal(calls, 1);
});

test('request hooks can short-circuit handlers and custom errors retain safe public codes', async t => {
  const { web, listen } = await fixture(t);
  let calls = 0;
  const client = await listen({
    '/private': () => { calls++; return { ok: true }; },
    '/missing': () => { throw web.error(404, 'Item was not found.', 'ITEM_NOT_FOUND'); },
  }, {
    before: (input: any) => {
      if (input.path === '/private' && input.headers.authorization !== 'test-only') return web.response(401, { error: 'Sign in first.' });
    },
  });
  assert.equal((await client.fetch('/private')).status, 401);
  assert.equal(calls, 0);
  assert.equal((await client.fetch('/private', { headers: { authorization: 'test-only' } })).status, 200);
  assert.equal(calls, 1);
  const missing = await client.fetch('/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Item was not found.', code: 'ITEM_NOT_FOUND' });
});

test('HTTP logs correlate handler and access records without logging query strings or credentials', async t => {
  const { log, listen } = await fixture(t);
  const lines: string[] = [];
  const logger = log.create({ sink: (line: string) => lines.push(line) });
  const client = await listen({
    '/': (input: any) => { input.log.info('handled', { password: 'private' }); return { ok: true }; },
    '/broken': () => { throw Object.assign(new Error('private error details'), { code: 'APP_FAILURE' }); },
  }, { logger });
  const response = await client.fetch('/?token=private-query', { headers: { authorization: 'private-header' } });
  await response.text();
  const records = lines.map(line => JSON.parse(line));
  assert.equal(records[0].requestId, response.headers.get('x-request-id'));
  assert.equal(records[0].password, '[Redacted]');
  assert.equal(records[1].message, 'http.request');
  assert.equal(records[1].path, '/');
  const broken = await client.fetch('/broken');
  assert.equal(broken.status, 500);
  assert.deepEqual(await broken.json(), { error: 'Internal server error', code: 'APP_FAILURE' });
  assert.ok(!lines.join('').includes('private'));
  const resilient = await listen({ '/': { ok: true } }, { logger: log.create({ sink() { throw new Error('logging unavailable'); } }) });
  assert.equal((await resilient.fetch('/')).status, 200);
});

test('handler deadlines return 504, signal cancellation, and leave the server usable', async t => {
  const { listen } = await fixture(t);
  let aborted = false;
  const client = await listen({
    '/slow': async (input: any) => new Promise(resolve => input.signal.addEventListener('abort', () => { aborted = true; resolve({ late: true }); }, { once: true })),
    '/': { ok: true },
  }, { handlerTimeoutMs: 20 });
  const response = await client.fetch('/slow');
  assert.equal(response.status, 504);
  assert.equal((await response.json() as any).code, 'ARYA_HTTP_TIMEOUT');
  assert.equal(aborted, true);
  assert.equal((await client.fetch('/')).status, 200);
});

test('disconnecting clients signal cancellation to active handlers', async t => {
  const { listen } = await fixture(t);
  const started = deferred(), aborted = deferred();
  const client = await listen({ '/': (input: any) => {
    started.resolve();
    return new Promise(resolve => input.signal.addEventListener('abort', () => { aborted.resolve(); resolve(null); }, { once: true }));
  } });
  const call = request(client.base);
  call.on('error', () => {});
  call.end();
  await started.promise;
  call.destroy();
  await Promise.race([aborted.promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('No cancellation signal')), 1000); timer.unref(); })]);
});

test('shutdown drains requests before cleanup and shares one completion promise', async t => {
  const { web, listen } = await fixture(t);
  const started = deferred(), release = deferred();
  let cleaned = false;
  const client = await listen({ '/': async () => { started.resolve(); await release.promise; return { ok: true }; } });
  const response = client.fetch('/');
  await started.promise;
  const shutdown = web.shutdown(client.server, { timeoutMs: 1000, cleanup: () => { cleaned = true; } });
  assert.equal(web.shutdown(client.server), shutdown);
  assert.equal(cleaned, false);
  release.resolve();
  assert.equal((await response).status, 200);
  await shutdown;
  assert.equal(cleaned, true);
});

test('shutdown deadlines cancel active work, close connections, and skip unsafe cleanup', async t => {
  const { web, listen } = await fixture(t);
  const started = deferred();
  let aborted = false, cleaned = false;
  const client = await listen({ '/': (input: any) => {
    started.resolve();
    return new Promise(resolve => input.signal.addEventListener('abort', () => { aborted = true; resolve(null); }, { once: true }));
  } });
  const response = client.fetch('/').catch(() => null);
  await started.promise;
  await assert.rejects(web.shutdown(client.server, { timeoutMs: 20, cleanup: () => { cleaned = true; } }), (error: any) => error.code === 'ARYA_SHUTDOWN_TIMEOUT');
  await response;
  assert.equal(aborted, true);
  assert.equal(cleaned, false);
});

test('shutdown rejects calls from its own active request rather than waiting on itself', async t => {
  const { web, listen } = await fixture(t);
  const client = await listen({ '/': async () => {
    try { await web.shutdown(client.server); }
    catch (error: any) { return { code: error.code }; }
  } });
  assert.deepEqual(await (await client.fetch('/')).json(), { code: 'ARYA_SHUTDOWN_CONTEXT' });
  await web.shutdown(client.server);
});

test('shutdown closes browser preconnections and incomplete headers without waiting for a request timeout', async t => {
  const {web, listen} = await fixture(t);
  const client = await listen({'GET /': {ok: true}});
  let accept!: () => void, accepted = 0;
  const ready = new Promise<void>(resolve => { accept = resolve; });
  client.server.on('connection', () => { if (++accepted === 2) accept(); });
  const url = new URL(client.base);
  const sockets = [connect(Number(url.port), '127.0.0.1'), connect(Number(url.port), '127.0.0.1')];
  for (const socket of sockets) socket.on('error', () => {});
  const closed = sockets.map(socket => new Promise<void>(resolve => socket.once('close', () => resolve())));
  try {
    await Promise.all(sockets.map(socket => once(socket, 'connect')));
    await ready;
    sockets[1]!.write('GET /unfinished HTTP/1.1\r\nHost: localhost');
    let cleaned = false;
    await web.shutdown(client.server, {timeoutMs: 1000, cleanup: () => { cleaned = true; }});
    await Promise.all(closed);
    assert.equal(cleaned, true);
    assert.equal(client.server.listening, false);
  } finally { for (const socket of sockets) socket.destroy(); }
});

test('readiness checks distinguish success, failures, and cooperative timeouts without exposing details', async t => {
  const { web, listen } = await fixture(t);
  let aborted = false;
  const client = await listen({
    '/ready': () => web.health({ database: () => true }),
    '/unready': () => web.health({ database: () => { throw new Error('private credentials'); }, cache: () => false, worker: (signal: AbortSignal) => new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(false); }, { once: true })) }, { timeoutMs: 20 }),
  });
  const ready = await client.fetch('/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ready.json(), { status: 'ready', checks: { database: 'ok' } });
  const unready = await client.fetch('/unready');
  assert.equal(unready.status, 503);
  assert.deepEqual(await unready.json(), { status: 'unready', checks: { database: 'failed', cache: 'failed', worker: 'timeout' } });
  assert.equal(aborted, true);
});

test('service configuration rejects ambiguous routes, invalid schemas, and invalid deadlines before listening', async t => {
  const { web } = await fixture(t);
  for (const routes of [{ 'GET /:id': null, 'GET /:name': null }, { 'GET /:id/:id': null }, { 'GET /:bad-name': null }, { 'not-a-path': null }]) assert.throws(() => web.serve(0, routes, { html: false, assets: false }), /Route|route|parameter/);
  for (const options of [{ requestTimeoutMs: 0 }, { handlerTimeoutMs: -1 }, { before: true }, { logger: {} }, { trustRequestId: 'yes' }]) assert.throws(() => web.serve(0, {}, { html: false, ...options }));
  assert.throws(() => web.route(() => {}, { body: {} }), /schema/);
  assert.throws(() => web.route(() => {}, { unknown: {} }), /Unknown route schema/);
  await assert.rejects(web.shutdown({}), /returned by web.serve/);
});

test('schemas and shutdown handles work across separately compiled Arya modules', async t => {
  const { root, web } = await fixture(t);
  await mkdir(join(root, 'shared'));
  const helper = join(root, 'shared', 'rules.arya');
  await writeFile(helper + '.mjs', compile('use std "validate" as validate\nexport keep body = validate.object({title: validate.string({trim: true, min: 1})})', helper).code);
  const filename = join(root, 'portable.arya');
  const source = `use std "web" as web
use arya "./shared/rules.arya" as rules
export keep server = web.serve(0, {
  "POST /items": web.route(fn(request) { return request.body }, {body: rules.body})
}, {html: false, assets: false})
export keep shutdown = web.shutdown
`;
  await writeFile(filename + '.mjs', compile(source, filename).code);
  const module = await import(pathToFileURL(filename + '.mjs').href);
  const server = module.server as Server;
  t.after(() => web.shutdown(server));
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":" Task "}' });
  assert.deepEqual(await response.json(), { title: 'Task' });
});
