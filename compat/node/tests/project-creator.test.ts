import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { ARYA_VERSION, compile } from '../src/compiler.js';
import { createProject, projectTemplates } from '../src/web-project.js';
import { buildProject, writeProject } from '../src/project.js';

async function directory(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya creator '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function run(cwd: string, args: string[], input = '') {
  const result = spawnSync(process.execPath, [resolve('dist/create.cjs'), ...args], { cwd, input, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  return result;
}
function archive(version: string, name = 'arya-language', ui = false) {
  const entry = (path: string, value: unknown) => {
    const contents = Buffer.from(JSON.stringify(value));
    const header = Buffer.alloc(512);
    header.write(path);
    header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(contents.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257); header.write('00', 263);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([header, contents, Buffer.alloc((512 - contents.length % 512) % 512)]);
  };
  return gzipSync(Buffer.concat([entry('package/package.json', {name, version}), ...(ui ? [entry('package/dist/features.json', {capabilities: ['arya.ui.v1']})] : []), Buffer.alloc(1024)]));
}

test('all templates generate pinned compiler dependencies and usable npm scripts', async t => {
  const root = await directory(t);
  for (const template of projectTemplates) {
    const folder = join(root, template);
    await createProject(folder, { template });
    const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    assert.equal(manifest.devDependencies['arya-language'], ARYA_VERSION);
    assert.equal(manifest.private, true);
    for (const command of ['dev', 'start', 'check', 'build']) assert.equal(typeof manifest.scripts[command], 'string');
    const source = await readFile(join(folder, 'main.arya'), 'utf8');
    assert.doesNotThrow(() => compile(source, join(folder, 'main.arya')));
    const names = await readdir(folder);
    assert.equal(names.includes('index.html'), template === 'web');
    if (template === 'api') assert.match(source, /html: false, assets: false/);
    if (template === 'cli') {
      const executed = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'run', join(folder, 'main.arya'), '--', 'Arya'], { encoding: 'utf8', timeout: 10000 });
      assert.equal(executed.status, 0, executed.stderr);
      assert.equal(executed.stdout, 'Hello, Arya!\n');
    }
  }
});

test('interactive creator asks for the directory and template, reprompting invalid selections', async t => {
  const root = await directory(t);
  const result = run(root, [], 'chosen-app\ninvalid\n2\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Project directory/);
  assert.match(result.stdout, /What do you want to build/);
  for (const label of ['Web app', 'API server', 'CLI tool', 'UI app', 'Desktop GUI']) assert.ok(result.stdout.includes(label));
  assert.match(await readFile(join(root, 'chosen-app', 'main.arya'), 'utf8'), /POST \/api\/echo/);
  assert.match(result.stdout, /npm install/);
  assert.match(result.stdout, /npm run dev/);
  assert.ok(!(await readdir(join(root, 'chosen-app'))).includes('index.html'));
});

test('creator flags support automation and cancellation leaves no partial project', async t => {
  const root = await directory(t);
  const result = run(root, ['automatic', '--template', 'cli']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('What do you want to build'));
  const yes = run(root, ['default-app', '--yes']);
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(await readFile(join(root, 'default-app', 'index.html'), 'utf8'), /id="root"/);
  const cancelled = run(root, ['cancelled'], 'quit\n');
  assert.notEqual(cancelled.status, 0);
  assert.match(cancelled.stderr, /cancelled/);
  assert.ok(!(await readdir(root)).includes('cancelled'));
  for (const args of [['bad', '--template', 'native'], ['bad', '--template', 'unknown'], ['bad', '--template'], ['bad', '--web', '--template', 'web'], ['bad', '--compiler'], ['one', 'two']]) {
    assert.notEqual(run(root, args).status, 0, args.join(' '));
  }
  assert.ok(!(await readdir(root)).includes('bad'));
});

test('UI and desktop starters support registry and portable compiler dependencies', async t => {
  const root = await directory(t);
  const compiler = join(root, 'compiler.tgz');
  await writeFile(compiler, archive(ARYA_VERSION, 'arya-language', true));
  for (const template of ['ui', 'desktop'] as const) {
    const registry = join(root, 'registry-' + template);
    await createProject(registry, {template});
    assert.equal(JSON.parse(await readFile(join(registry, 'package.json'), 'utf8')).devDependencies['arya-language'], ARYA_VERSION);
    const result = run(root, [template, '--template', template, '--compiler', compiler]);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(join(root, template, 'package.json'), 'utf8'));
    assert.equal(manifest.devDependencies['arya-language'], 'file:vendor/arya-language-' + ARYA_VERSION + '.tgz');
    const source = await readFile(join(root, template, 'main.arya'), 'utf8');
    assert.doesNotThrow(() => compile(source));
    assert.match(source, /use std "ui" as ui/);
    assert.match(source, /ui.request/);
    assert.match(source, /ui.motion/);
    assert.match(await readFile(join(root, template, 'serve.mjs'), 'utf8'), /start\(port\)/);
    if (template === 'desktop') {
      assert.equal(manifest.main, 'desktop.cjs');
      assert.match(manifest.scripts.dev, /electron \./);
      assert.equal(manifest.devDependencies.electron, '45.2.3');
    }
  }
  await writeFile(compiler, archive(ARYA_VERSION));
  await assert.rejects(createProject(join(root, 'published-ui'), {template: 'ui', compilerArchive: compiler}), /does not include the UI runtime/);
});

test('portable compiler archives become relative vendor dependencies and mismatches fail before writing', async t => {
  const root = await directory(t);
  const compiler = join(root, 'compiler.tgz');
  const bytes = archive(ARYA_VERSION);
  await writeFile(compiler, bytes);
  const target = join(root, 'portable');
  await createProject(target, { template: 'web', compilerArchive: compiler });
  const relative = `vendor/arya-language-${ARYA_VERSION}.tgz`;
  const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(manifest.devDependencies['arya-language'], 'file:' + relative);
  assert.deepEqual(await readFile(join(target, relative)), bytes);
  await writeFile(compiler, archive('0.0.0'));
  await assert.rejects(createProject(join(root, 'mismatch'), { compilerArchive: compiler }), /version must match/);
  await writeFile(compiler, archive(ARYA_VERSION, 'wrong-package'));
  await assert.rejects(createProject(join(root, 'wrong'), { compilerArchive: compiler }), /arya-language npm package/);
  assert.ok(!(await readdir(root)).includes('mismatch'));
  assert.ok(!(await readdir(root)).includes('wrong'));
});

test('the generated UI launcher loads the actual build output and serves the validated app', async t => {
  const root = await directory(t);
  const compiler = join(root, 'compiler.tgz');
  await writeFile(compiler, archive(ARYA_VERSION, 'arya-language', true));
  const target = join(root, 'app');
  await createProject(target, {template: 'ui', compilerArchive: compiler});
  await writeProject(await buildProject(join(target, 'main.arya')));
  const child = spawn(process.execPath, [join(target, 'serve.mjs'), '0'], {stdio: ['ignore', 'pipe', 'pipe']});
  const closed = new Promise(resolve => child.once('close', resolve));
  t.after(async () => { child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); try { await closed; } finally { clearTimeout(timer); } });
  const origin = await new Promise<string>((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('UI launcher did not start: ' + output + errors)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('UI launcher exited: ' + errors)); });
  });
  const page = await fetch(origin, {signal: AbortSignal.timeout(3000)});
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(await page.text(), /<title>Arya Studio<\/title>/);
  const post = (hours: number) => fetch(origin + '/api/estimate', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({hours, rate: 40}), signal: AbortSignal.timeout(3000)});
  const valid = await post(5); assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), {total: 200, message: 'Estimated total: $200.00'});
  const invalid = await post(-1); assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).code, 'ARYA_VALIDATION');
});
