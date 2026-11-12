import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compile, analyzeSource, AryaError } from '../src/compiler.js';
import { analyze, definitionAt, standardCompletions } from '../src/language-service.js';

const expected = 'fallback\nskipped\n0\n0 false \n42\nARYA\n1-2-3\nno callback\nTypeError\nTypeError\nTypeError\n7\n';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya safe access '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('nullish defaults, optional access/calls, grouping, and multiline chains execute in JavaScript', async t => {
  const root = await fixture(t);
  const source = await readFile('fixtures/arya/conformance/safe-access.arya', 'utf8');
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const result = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
});



test('optional JavaScript method calls preserve receivers and evaluate bases, keys and arguments once', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'receiver.mjs'), `let reads=0; export const object={value:21,get method(){reads++;return function(value){return this.value+value}}};export const count=()=>reads;`);
  const source = "use js \"./receiver.mjs\" as library\nconst object = library.object\nprint(object.method?.(21), library.count())\nprint(object?.[\"method\"]?.(1), library.count())";
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const result = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '42 1\n22 2\n');
});

test('new operators retain lexical checks, conservative assignments, and source positions', () => {
  const source = "const item = null\nprint(item?.value ?? fallback)";
  assert.equal(analyzeSource(source).diagnostics[0]!.token.text, 'fallback');
  const analysis = analyze("const item = null\nprint(item?.value)", 'file:///main.arya');
  assert.equal(definitionAt(analysis, "const item = null\nprint(".length + 1)?.start, 6);
  for (const invalid of ["const item = {}\nitem?.name = 1", "const item = {}\nitem?.[0] += 1", "const item = {}\nitem?.()", "print(missing?.value)"]) {
    if (invalid.endsWith('item?.()')) assert.doesNotThrow(() => compile(invalid));
    else assert.throws(() => compile(invalid), AryaError);
  }
  assert.throws(() => compile("const item = null\nitem?."), /property name/);
  assert.throws(() => compile("print(1 ? 2)"), /Unexpected character|Expected/);
  const completions = standardCompletions('use std "mysql" as mysql\nmysql?.', 'use std "mysql" as mysql\nmysql?.'.length);
  assert.ok(completions.some(item => item.label === 'connect'));
});

test('nullish precedence is explicit and completed statements stay separate from leading-dot chains', async t => {
  const root = await fixture(t);
  const output = join(root, 'precedence.mjs');
  const source = `print(null ?? false or 7)
print(false ?? true and false)
print(null ?? 1 + 2 * 3)
const values = [1, 2, 3]
const result = values
  # A comment inside the chain.
  .slice(1)
  .join("-")
print(result)
fn empty() {
  return
  values.join("-")
}
print(empty() == undefined)
`;
  await writeFile(output, compile(source).code);
  const result = spawnSync(process.execPath, [output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '7\nfalse\n7\n2-3\ntrue\n');
  assert.throws(() => compile("const object = {}\nobject;\n.name"), AryaError);
});

test('optional-chain failures still map to the original member on multiline chains', async t => {
  const root = await fixture(t), filename = join(root, 'chain.arya'), outputFilename = join(root, 'chain.mjs');
  const source = "const object = {child: null}\nobject\n  ?.child\n  .value";
  const result = compile(source, { filename, outputFilename });
  await writeFile(outputFilename, result.code); await writeFile(outputFilename + '.map', result.map);
  const run = spawnSync(process.execPath, ['--enable-source-maps', outputFilename], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /chain\.arya:4:4/);
});
