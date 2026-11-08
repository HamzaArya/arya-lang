import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SourceMap } from 'node:module';
import { compile } from '../src/compiler.js';

test('CLI runtime errors map function and caller frames to original Arya source', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya mapped path ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'runtime-error.arya');
  await writeFile(source, await readFile('fixtures/arya/runtime-error.arya', 'utf8'));
  const result = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'run', source], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TypeError/);
  assert.match(result.stderr, /runtime-error\.arya:3:15/);
  assert.match(result.stderr, /runtime-error\.arya:5:1/);
});

test('CLI build writes a complete map pair without executing, ready for standalone Node', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya build 🌉 # ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, 'runtime error 🌉 #.arya');
  const source = await readFile('fixtures/arya/runtime-error.arya', 'utf8');
  await writeFile(filename, source);
  const build = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'build', filename], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(build.status, 0, build.stderr);
  const outputFilename = join(root, '.arya', 'build', `${basename(filename)}.mjs`);
  assert.equal(build.stdout.trim(), outputFilename);
  const code = await readFile(outputFilename, 'utf8');
  assert.ok(code.endsWith(`//# sourceMappingURL=${encodeURIComponent(basename(outputFilename) + '.map')}\n`));
  assert.ok(!code.includes('\0'), 'internal origin annotations must not reach artifacts');
  const metadata = JSON.parse(await readFile(`${outputFilename}.map`, 'utf8'));
  assert.equal(metadata.version, 3);
  assert.equal(metadata.file, basename(outputFilename));
  assert.deepEqual(metadata.sources, [`../../${encodeURIComponent(basename(filename))}`]);
  assert.deepEqual(metadata.sourcesContent, [source]);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(run.status, 0);
  assert.ok(run.stderr.includes(`${basename(filename)}:3:15`), run.stderr);
  assert.ok(run.stderr.includes(`${basename(filename)}:5:1`), run.stderr);
});

test('CLI check stays passive and syntax failures preserve the previous code and map', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya map publication ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, 'main.arya');
  const outputFilename = join(root, '.arya', 'build', 'main.arya.mjs');
  const cli = (command: string) => spawnSync(process.execPath, [resolve('dist/cli.cjs'), command, filename], { encoding: 'utf8', timeout: 10_000 });
  await writeFile(filename, 'use js "missing-package" as library\nuse python "missing_module" as py\n');
  const check = cli('check');
  assert.equal(check.status, 0, check.stderr);
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
  await writeFile(filename, 'print("stale output must not execute")\n');
  assert.equal(cli('build').status, 0);
  const previousCode = await readFile(outputFilename, 'utf8');
  const previousMap = await readFile(`${outputFilename}.map`, 'utf8');
  await writeFile(filename, 'const =\n');
  for (const command of ['check', 'build', 'run']) {
    const result = cli(command);
    assert.notEqual(result.status, 0, command);
    assert.match(result.stderr, /main\.arya:1:/);
    assert.ok(!result.stdout.includes('stale output'), 'a failed compile must never run previous output');
    assert.equal(await readFile(outputFilename, 'utf8'), previousCode);
    assert.equal(await readFile(`${outputFilename}.map`, 'utf8'), previousMap);
  }
});

test('CLI source-map flag preserves program arguments literally after the module path', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya mapped arguments ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, 'args.arya');
  await writeFile(filename, 'print(JSON.stringify(args))\n');
  const args = ['--enable-source-maps', '--no-warnings', 'literal; argument', '🌉 #', ''];
  const run = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'run', filename, '--', ...args], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), args);
});

test('CLI and standalone maps cover multiline, await, Python, built-ins, Unicode, and spaced paths', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya 🌉 mapped path ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases: { file: string; line: number; column: number; error: string; callerLine: number }[] = JSON.parse(await readFile('fixtures/arya/errors/cases.json', 'utf8'));
  for (const item of cases) {
    const source = await readFile(join('fixtures/arya', item.file), 'utf8');
    const filename = join(root, item.file.endsWith('unicode.arya') ? 'unicode 🌉 #.arya' : basename(item.file)), outputFilename = filename + '.mjs';
    await writeFile(filename, source);
    const result = compile(source, { filename, outputFilename });
    await writeFile(join(root, result.mapFilename), result.map); await writeFile(outputFilename, result.code);
    const metadata = JSON.parse(result.map);
    assert.equal(metadata.file, basename(outputFilename));
    assert.equal(metadata.sourcesContent[0], source);
    assert.deepEqual(new SourceMap(metadata).findEntry(0, 0), {}, 'generated header/runtime must be unmapped');
    for (const args of [[resolve('dist/cli.cjs'), 'run', filename], ['--enable-source-maps', outputFilename]]) {
      const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 10_000 });
      assert.notEqual(run.status, 0, item.file);
      assert.ok(run.stderr.includes(item.error), run.stderr);
      assert.ok(run.stderr.includes(filename), run.stderr);
      assert.ok(run.stderr.includes(`${basename(filename)}:${item.line}:${item.column}`), run.stderr);
      assert.ok(run.stderr.includes(`${basename(filename)}:${item.callerLine}:`), run.stderr);
    }
  }
});

test('multiple expressions on one line retain distinct source columns and literals cannot inject origins', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya columns ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const failure of ['first', 'second']) {
    const source = `const first = ${failure === 'first' ? 'null' : '{name: 1}'}; const second = null; print(first.name, second.name)`;
    const filename = join(root, 'columns.arya'), outputFilename = join(root, 'columns.mjs');
    const result = compile(source, { filename, outputFilename });
    await writeFile(filename, source); await writeFile(outputFilename, result.code); await writeFile(join(root, result.mapFilename), result.map);
    const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8' });
    const column = source.indexOf(`${failure}.name`) + failure.length + 2;
    assert.ok(run.stderr.includes(`columns.arya:1:${column}`), run.stderr);
  }
  const filename = join(root, 'literal.arya'), outputFilename = join(root, 'literal.mjs');
  const result = compile('print("\0' + '123:456\0")', { filename, outputFilename });
  await writeFile(outputFilename, result.code); await writeFile(join(root, result.mapFilename), result.map);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '\0' + '123:456\0\n');
});

test('JavaScript library frames stay in the library while the Arya call site is mapped', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya imported stack ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'thrower.mjs'), 'export function fail() { throw new Error("library failure"); }\n');
  const filename = join(root, 'caller.arya'), outputFilename = join(root, 'caller.mjs');
  const source = 'use js "./thrower.mjs" as library\nlibrary.fail()\n';
  const result = compile(source, { filename, outputFilename });
  await writeFile(filename, source); await writeFile(outputFilename, result.code); await writeFile(join(root, result.mapFilename), result.map);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /thrower\.mjs:1:/);
  assert.match(run.stderr, /caller\.arya:2:9/);
});
