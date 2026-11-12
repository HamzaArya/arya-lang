import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { compile } from '../src/compiler.js';
import { analyze, completions, hoverAt } from '../src/language-service.js';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya standard '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function load(root: string, source: string) {
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  return import(pathToFileURL(output).href);
}

test('standard files, JSON, math and path execute together with canonical functions', async t => {
  const root = await fixture(t);
  const module = await load(root, `
use std "fs" as files
use std "json" as json
use std "math" as math
use std "path" as path
const folder = ${JSON.stringify(root)}
const file = path.join(folder, "report.json")
await json.write(file, {root: math.sqrt(81), values: [1, 2]})
export const report = await json.read(file)
export const text = await files.readText(file)
export const exists = await files.exists(file)
export const missing = await files.exists(path.join(folder, "absent"))
export const names = await files.list(folder)
`);
  assert.deepEqual(module.report, { root: 9, values: [1, 2] });
  assert.match(module.text, /"root": 9/);
  assert.equal(module.exists, true);
  assert.equal(module.missing, false);
  assert.ok(module.names.includes('report.json'));
});

test('web serves views and asynchronous JSON routes with bounded request bodies', async t => {
  const root = await fixture(t);
  const module = await load(root, `
use std "web" as web
const home = view { html { body { h1 "Arya web" } } }
export const server = web.serve(0, {
  "/": home,
  "GET /api": async fn(request) { return {name: request.query.name, method: request.method} },
  "POST /api": fn(request) { return web.response(201, request.body, {"x-arya": "yes"}) },
  "/empty": fn() {},
  "/broken": fn() { throw null },
  "/bad-status": fn() { throw {aryaHttpStatus: 900} }
}, {maxBodyBytes: 64, html: false})
`);
  const server = module.server as Server;
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const get = (path: string, options: RequestInit = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
  const home = await get('/');
  assert.match(home.headers.get('content-type')!, /text\/html/);
  assert.equal(await home.text(), '<!doctype html><html><body><h1>Arya web</h1></body></html>');
  assert.deepEqual(await (await get('/api?name=Arya')).json(), { name: 'Arya', method: 'GET' });
  const saved = await get('/api', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"value":42}' });
  assert.equal(saved.status, 201);
  assert.equal(saved.headers.get('x-arya'), 'yes');
  assert.deepEqual(await saved.json(), { value: 42 });
  assert.equal((await get('/empty')).status, 204);
  assert.equal((await get('/missing')).status, 404);
  assert.equal((await get('/toString')).status, 404);
  const invalid = await get('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await get('/api', { method: 'POST', body: 'x'.repeat(65) })).status, 413);
  for (const path of ['/broken', '/bad-status']) {
    const response = await get(path);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
  }
  assert.equal((await get('/')).status, 200, 'handler failures must leave server usable');
});

test('MySQL adapter resolves optional mysql2, forwards parameters and unwraps rows', async t => {
  const root = await fixture(t);
  const packageRoot = join(root, 'node_modules', 'mysql2');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'mysql2', type: 'module', exports: { './promise': './promise.mjs' } }));
  await writeFile(join(packageRoot, 'promise.mjs'), `export default {createPool(options) {
    return {getConnection: async () => ({release() {}}), execute: async (sql, parameters) => [[{sql, parameters, host: options.host}], []], end: async () => 'closed'};
  }};`);
  const module = await load(root, `
use std "mysql" as mysql
const db = await mysql.connect({host: "test-host"})
export const rows = await db.rows("SELECT ? AS name", ["O'Reilly"])
export const result = await db.execute("SELECT 1")
export let rejected = false
try { await db.rows("SELECT ?", {}) } catch error { rejected = true }
export const closed = await db.close()
`);
  assert.deepEqual(module.rows, [{ sql: 'SELECT ? AS name', parameters: ["O'Reilly"], host: 'test-host' }]);
  assert.deepEqual(module.result[0].parameters, []);
  assert.equal(module.rejected, true);
  assert.equal(module.closed, 'closed');
});

test('checking standard libraries is passive and editor analysis agrees with compilation', () => {
  const source = "use std \"mysql\" as mysql\nuse std \"web\" as web\nconst db = mysql.connect({})";
  assert.doesNotThrow(() => compile(source));
  assert.equal(analyze(source, 'file:///main.arya').diagnostics.length, 0);
  assert.throws(() => compile('use std "missing" as library'), /Unknown Arya standard library/);
  assert.ok(analyze('use std "missing" as library', 'file:///main.arya').diagnostics.length > 0);
  const labels = completions(analyze("print(1)", 'file:///main.arya')).map(item => item.label);
  for (const label of ['fn', 'const', 'if', 'else', 'for', 'return', 'print', 'view']) assert.ok(labels.includes(label), label);
  for (const label of ['keep', 'task', 'when', 'otherwise', 'each', 'give', 'say']) assert.ok(!labels.includes(label), 'Removed spelling should not be suggested: ' + label);
});

test('builtin hover excludes multiline CSS and browser JavaScript literals', () => {
  const source = "const page = view { script \"\"\"\nprint(1)\n\"\"\" }\nprint(1)";
  assert.equal(hoverAt(source, source.indexOf('print') + 2), undefined);
  assert.match(hoverAt(source, source.lastIndexOf('print') + 1)!.text, /print/);
});
