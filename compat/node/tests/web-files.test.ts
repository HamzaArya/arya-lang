import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep as fsPathSeparator } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { request } from 'node:http';
import type { Server } from 'node:http';
import { compile } from '../src/compiler.js';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya web files '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function load(root: string, source: string, suffix = 'main') {
  const output = join(root, suffix + '.mjs');
  await writeFile(output, compile(source, join(root, suffix + '.arya')).code);
  return import(pathToFileURL(output).href);
}

async function running(t: { after(fn: () => Promise<unknown>): void }, server: Server) {
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    fetch: (path: string, options: RequestInit = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) }),
    raw: (path: string) => new Promise<number | undefined>((resolve, reject) => {
      const call = request(base, { path }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      call.on('error', reject); call.setTimeout(5000, () => call.destroy(new Error('Request timeout'))); call.end();
    })
  };
}

test('web requires index.html before listening and reports how to create a project', async t => {
  const root = await fixture(t);
  await assert.rejects(load(root, 'use std "web" as web\nweb.serve(0)'), /requires an HTML entry file:.*index\.html.*arya init --web/);
  await writeFile(join(root, 'index.html'), '<!doctype html><h1>Home</h1>');
  const module = await load(root, "use std \"web\" as web\nexport const server = web.serve(0)", 'with-index');
  const client = await running(t, module.server);
  const home = await client.fetch('/');
  assert.equal(home.status, 200);
  assert.equal(await home.text(), '<!doctype html><h1>Home</h1>');
});

test('web source roots survive generated output directories and unrelated working directories', async t => {
  const root = await fixture(t);
  const project = join(root, 'source');
  const generated = join(root, 'build');
  await mkdir(project); await mkdir(generated);
  await writeFile(join(project, 'index.html'), '<h1>Source-relative page</h1>');
  const output = join(generated, 'main.mjs');
  await writeFile(output, compile("use std \"web\" as web\nexport const server = web.serve(0)", join(project, 'main.arya')).code);
  const module = await import(pathToFileURL(output).href);
  const client = await running(t, module.server);
  assert.notEqual(process.cwd(), project);
  assert.equal(await (await client.fetch('/')).text(), '<h1>Source-relative page</h1>');
});

test('web serves public assets with MIME, byte lengths and HEAD without exposing source files', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'index.html'), '<h1>Arya</h1>');
  const css = 'body { color: white; } /* سلام */';
  await writeFile(join(root, 'public', 'styles.css'), css);
  await writeFile(join(root, 'public', 'app.js'), 'document.title = "Arya";');
  await writeFile(join(root, 'main.arya'), 'private source');
  await mkdir(join(root, 'public', 'folder'));
  const module = await load(root, "use std \"web\" as web\nexport const server = web.serve(0)");
  const client = await running(t, module.server);
  const style = await client.fetch('/styles.css?cache=1');
  assert.equal(style.status, 200);
  assert.equal(style.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal(style.headers.get('content-length'), String(Buffer.byteLength(css)));
  assert.equal(style.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await style.text(), css);
  const head = await client.fetch('/styles.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(css)));
  assert.equal(await head.text(), '');
  const script = await client.fetch('/app.js');
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await script.text(), /document.title/);
  assert.equal((await client.fetch('/main.arya')).status, 404);
  assert.equal((await client.fetch('/folder/')).status, 404);
  assert.equal((await client.fetch('/styles.css', { method: 'POST' })).status, 404);
  await writeFile(join(root, 'index.html'), '<h1>Updated</h1>');
  assert.equal(await (await client.fetch('/')).text(), '<h1>Updated</h1>');
});

test('explicit API routes override files and html:false keeps API-only applications explicit', async t => {
  const root = await fixture(t);
  const module = await load(root, `use std "web" as web
export const server = web.serve(0, {
  "/": "Inline page",
  "GET /api/status": fn() { return {ready: true} }
}, {html: false})`);
  const client = await running(t, module.server);
  assert.equal(await (await client.fetch('/')).text(), 'Inline page');
  assert.deepEqual(await (await client.fetch('/api/status')).json(), { ready: true });
  await writeFile(join(root, 'index.html'), '<h1>Default</h1>');
  await mkdir(join(root, 'public')); await writeFile(join(root, 'public', 'status.json'), '{"file":true}');
  const override = await load(root, `use std "web" as web
export const server = web.serve(0, {"/": "Route first", "GET /status.json": {route: true}})`, 'override');
  const second = await running(t, override.server);
  assert.equal(await (await second.fetch('/')).text(), 'Route first');
  assert.deepEqual(await (await second.fetch('/status.json')).json(), { route: true });
});

test('web root options resolve relative to the importing source and validate configuration', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'site')); await mkdir(join(root, 'site', 'assets'));
  await writeFile(join(root, 'site', 'home.html'), '<h1>Configured</h1>');
  await writeFile(join(root, 'site', 'assets', 'app.css'), 'body{}');
  const module = await load(root, `use std "web" as web
export const server = web.serve(0, {}, {root: "site", html: "home.html", assets: "assets"})`);
  const client = await running(t, module.server);
  assert.equal(await (await client.fetch('/')).text(), '<h1>Configured</h1>');
  assert.equal((await client.fetch('/app.css')).status, 200);
  for (const [suffix, options, pattern] of [
    ['options-null', 'null', /options object/],
    ['root-invalid', '{root: 1}', /root must/],
    ['host-invalid', '{host: 1}', /host must/],
    ['html-invalid', '{html: "source.arya"}', /html must/],
    ['html-escape', '{html: "../outside.html"}', /inside the web root/],
    ['assets-escape', '{html: false, assets: "../outside"}', /inside the web root/]
  ] as const) await assert.rejects(load(root, `use std "web" as web\nweb.serve(0, {}, ${options})`, suffix), pattern);
});

test('web responses preserve status and headers across separately compiled Arya modules', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'helper.arya.mjs'), compile(`use std "web" as web
export fn created() { return web.response(201, {created: true}, {"x-created": "yes"}) }`, join(root, 'helper.arya')).code);
  const module = await load(root, `use std "web" as web
use arya "./helper.arya" as helper
export const server = web.serve(0, {"POST /created": helper.created}, {html: false})`);
  const client = await running(t, module.server);
  const response = await client.fetch('/created', { method: 'POST' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-created'), 'yes');
  assert.deepEqual(await response.json(), { created: true });
});

test('public files reject raw traversal, malformed encodings, dotfiles and symlink escapes', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'index.html'), '<h1>Safe</h1>');
  await writeFile(join(root, 'secret.txt'), 'private');
  await writeFile(join(root, 'public', '.env'), 'private-token');
  await mkdir(join(root, 'public', '.hidden'));
  await writeFile(join(root, 'public', '.hidden', 'file.txt'), 'private');
  await symlink(join(root, 'secret.txt'), join(root, 'public', 'escape.txt'));
  await symlink(join(root, 'public', '.env'), join(root, 'public', 'hidden-alias.txt'));
  await symlink(root, join(root, 'public', 'outside'));
  const module = await load(root, "use std \"web\" as web\nexport const server = web.serve(0)");
  const client = await running(t, module.server);
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2Eenv', '/.env', '/.hidden/file.txt', '/%2f..%2fsecret.txt', '/%5c..%5csecret.txt', '/%00', '/%zz']) {
    assert.equal(await client.raw(path), 400, path);
  }
  assert.equal((await client.fetch('/escape.txt')).status, 404);
  assert.equal((await client.fetch('/hidden-alias.txt')).status, 404);
  assert.equal((await client.fetch('/outside/secret.txt')).status, 404);
});

// Windows' legacy realpath resolver can retain an 8.3 alias while the native
// promise API expands it. Model that mismatch even on macOS/Linux.
test('web uses one native canonical path for startup and request containment', async t => {
  const outer = await fixture(t);
  await mkdir(join(outer, 'long-project-name'));
  const root = fs.realpathSync.native(join(outer, 'long-project-name'));
  const alias = join(outer, 'SHORT~1');
  await symlink(root, alias, 'junction');
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'index.html'), '<h1>Native root</h1>');
  await writeFile(join(root, 'public', 'site.css'), 'body{}');
  const original = fs.realpathSync;
  const legacy = Object.assign(((path: any, options: any) => {
    const actual = original(path, options);
    return typeof actual === 'string' && (actual === root || actual.startsWith(root + fsPathSeparator))
      ? alias + actual.slice(root.length) : actual;
  }) as typeof original, { native: original.native });
  const mock = t.mock.method(fs, 'realpathSync', legacy);
  syncBuiltinESMExports();
  try {
    const module = await load(root, 'use std "web" as web\nexport const server = web.serve(0)');
    const client = await running(t, module.server);
    assert.equal(await (await client.fetch('/')).text(), '<h1>Native root</h1>');
    assert.equal(await (await client.fetch('/site.css')).text(), 'body{}');
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});
