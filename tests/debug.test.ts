import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import { compile } from '../src/compiler.js';
import { analyze } from '../src/language-service.js';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya debug '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('debug inspection handles cycles without executing getters or custom inspectors', async t => {
  const root = await fixture(t), filename = join(root, 'debug.mjs');
  await writeFile(filename, compile("use std \"debug\" as debug\nexport const tools = debug").code);
  const { tools } = await import(pathToFileURL(filename).href);
  let invoked = false;
  const object: any = { value: 42, get dangerous() { invoked = true; throw new Error('must not execute'); }, [inspect.custom]() { invoked = true; return 'wrong'; } };
  object.self = object;
  const text = tools.inspect(object);
  assert.match(text, /value: 42/);
  assert.match(text, /Circular/);
  assert.equal(invoked, false);
  assert.throws(() => tools.inspect(object, { depth: -1 }), /depth/);
  assert.throws(() => tools.inspect(object, { maxArrayLength: 1001 }), /maxArrayLength/);
  assert.throws(() => tools.inspect(object, { getters: true }), /Unknown/);
  assert.equal(tools.assert(42), 42);
  assert.throws(() => tools.assert(false, 'Expected a positive value.'), (error: any) => error.code === 'ARYA_ASSERTION' && error.name === 'AryaAssertionError');
});

test('debug trace and assertion failures retain actual Arya call sites with source maps', async t => {
  const root = await fixture(t), filename = join(root, 'main.arya'), outputFilename = join(root, 'main.mjs');
  const source = "use std \"debug\" as debug\nconst total = debug.trace(\"total\", 42)\nprint(total)\ndebug.assert(total < 0, \"Expected a negative total.\")";
  const result = compile(source, { filename, outputFilename });
  await writeFile(outputFilename, result.code); await writeFile(outputFilename + '.map', result.map);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '42\n');
  assert.match(run.stderr, /total = 42/);
  assert.match(run.stderr, /main\.arya:2:/);
  assert.match(run.stderr, /main\.arya:4:/);
  assert.match(run.stderr, /Expected a negative total/);
});

test('debug checking is passive', () => {
  const source = 'use std "debug" as debug\ndebug.assert(false, "not executed")';
  assert.doesNotThrow(() => compile(source));
  assert.deepEqual(analyze(source, 'file:///main.arya').diagnostics, []);
});
