import test from 'node:test';
import assert from 'node:assert/strict';
import promises, { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { createWebProject } from '../src/web-project.js';

const files = ['.gitignore', 'README.md', 'index.html', 'main.arya', 'package.json', 'public/app.js', 'public/styles.css'];
const executable = resolve('dist/cli.cjs');

async function directory(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya web project ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function cli(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [executable, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  return result;
}

async function start(t: { after(fn: () => Promise<unknown>): void }, entry: string, cwd: string) {
  const child = spawn(process.execPath, ['--enable-source-maps', entry, '0'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  t.after(async () => {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(timer); }
  });
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('Web app did not announce a URL: ' + output + errors)); }, 10_000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Web app exited before announcing its URL (${code ?? signal}): ${output}${errors}`));
    });
  });
}

test('web scaffolding creates a conventional HTML, CSS, JavaScript and Arya project', async t => {
  const root = await directory(t);
  const target = join(root, 'site');
  assert.deepEqual((await createWebProject(target)).sort(), files);
  const html = await readFile(join(target, 'index.html'), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html[^>]*lang=/i);
  assert.match(html, /<body>\s*<div id="root"><\/div>\s*<\/body>/);
  assert.ok(!html.includes('<main>'), 'the page shell must not duplicate rendered application content');
  assert.match(html, /(?:href|src)=["']\/?styles\.css["']/);
  assert.match(html, /src=["']\/?app\.js["']/);
  assert.match(await readFile(join(target, 'main.arya'), 'utf8'), /use std "web" as web/);
  assert.match(await readFile(join(target, '.gitignore'), 'utf8'), /\.arya\//);
  for (const file of files) assert.ok((await readFile(join(target, file))).length > 0, file);
});

test('web init supports new and current empty folders and rejects invalid arguments', async t => {
  const root = await directory(t);
  assert.match(cli(root, '--help').stdout, /init.*--web/);
  const named = cli(root, 'init', 'named', '--web');
  assert.equal(named.status, 0, named.stderr);
  await access(join(root, 'named', 'index.html'));
  const current = join(root, 'current');
  await mkdir(current);
  const before = await lstat(current);
  const initialized = cli(current, 'init', '--web');
  assert.equal(initialized.status, 0, initialized.stderr);
  const after = await lstat(current);
  assert.equal(after.ino, before.ino, 'initializing the current folder must preserve its directory identity');
  assert.equal(after.dev, before.dev);
  await access(join(current, 'main.arya'));
  for (const args of [['init'], ['init', 'missing'], ['init', '--web', '--web'], ['init', '--web', '--unknown'], ['init', 'one', 'two', '--web']]) {
    const result = cli(root, ...args);
    assert.notEqual(result.status, 0, args.join(' '));
  }
  assert.equal((await readdir(root)).includes('missing'), false);
});

test('web init refuses existing content, hidden files, and symlink targets without changing them', async t => {
  const root = await directory(t);
  for (const name of ['index.html', '.private']) {
    const target = join(root, name === 'index.html' ? 'existing' : 'hidden');
    await mkdir(target);
    await writeFile(join(target, name), 'keep this exact content');
    await assert.rejects(createWebProject(target));
    assert.deepEqual(await readdir(target), [name]);
    assert.equal(await readFile(join(target, name), 'utf8'), 'keep this exact content');
  }
  const destination = join(root, 'destination');
  await mkdir(destination);
  const link = join(root, 'linked');
  await symlink(destination, link, 'dir');
  await assert.rejects(createWebProject(link));
  assert.deepEqual(await readdir(destination), []);
});

test('concurrent init never overwrites a successfully created project or leaves staging files', async t => {
  const root = await directory(t);
  const target = join(root, 'site');
  const results = await Promise.allSettled([createWebProject(target), createWebProject(target)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const file of files) assert.ok((await readFile(join(target, file))).length > 0, file);
  assert.deepEqual(await readdir(root), ['site']);
});

test('a publication failure rolls back created files while preserving an existing empty destination', async t => {
  const root = await directory(t);
  const target = join(root, 'site');
  await mkdir(target);
  const before = await lstat(target);
  const originalLink = promises.link;
  let publications = 0;
  const replacement = t.mock.method(promises, 'link', async (source: Parameters<typeof originalLink>[0], destination: Parameters<typeof originalLink>[1]) => {
    publications++;
    if (publications === 2) throw Object.assign(new Error('Simulated publication permission failure'), { code: 'EACCES' });
    await originalLink(source, destination);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(createWebProject(target), /Simulated publication permission failure/);
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(publications, 2, 'failure occurs after at least one prepared file was published');
  assert.deepEqual(await readdir(target), []);
  assert.equal((await lstat(target)).ino, before.ino);
  assert.deepEqual(await readdir(root), ['site'], 'staging files must be cleaned up');
});

test('generated web project checks, builds and serves HTML/assets from an unrelated working directory', async t => {
  const root = await directory(t);
  const target = join(root, 'site');
  const unrelated = join(root, 'elsewhere');
  await mkdir(unrelated);
  await createWebProject(target);
  const source = join(target, 'main.arya');
  const checked = cli(unrelated, 'check', source);
  assert.equal(checked.status, 0, checked.stderr);
  const built = cli(unrelated, 'build', source);
  assert.equal(built.status, 0, built.stderr);
  const base = await start(t, built.stdout.trim(), unrelated);
  const get = (path: string) => fetch(base + path, { signal: AbortSignal.timeout(5000) });
  const html = await get('/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type')!, /text\/html/);
  assert.equal(await html.text(), await readFile(join(target, 'index.html'), 'utf8'));
  const css = await get('/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type')!, /text\/css/);
  assert.equal(await css.text(), await readFile(join(target, 'public/styles.css'), 'utf8'));
  const script = await get('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type')!, /(?:application|text)\/javascript/);
  const browserSource = await script.text();
  assert.equal(browserSource, await readFile(join(target, 'public/app.js'), 'utf8'));
  let click: (() => Promise<void>) | undefined;
  const button = { disabled: false, addEventListener: (event: string, callback: () => Promise<void>) => { assert.equal(event, 'click'); click = callback; } };
  const status = { textContent: '' };
  const mount = { innerHTML: '', querySelector: (selector: string) => selector === '#check-server' ? button : status };
  runInNewContext(browserSource, {
    document: { querySelector: (selector: string) => { assert.equal(selector, '#root'); return mount; } },
    fetch: (path: string) => get(path)
  });
  assert.match(mount.innerHTML, /<main>/);
  assert.match(mount.innerHTML, /id="status"/);
  assert.ok(click);
  await click();
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /connected/i);
  assert.deepEqual(await (await get('/api/health')).json(), { status: 'ok', language: 'Arya' });
  assert.equal((await get('/main.arya')).status, 404);
});
