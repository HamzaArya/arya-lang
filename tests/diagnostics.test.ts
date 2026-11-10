import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeSource, diagnosticFixes, formatDiagnostics, AryaError, compile } from '../src/compiler.js';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya diagnostics 🌉 ')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('diagnostic excerpts show codes, exact tokens, spelling repairs, and binding-specific help', () => {
  const source = 'keep total = 1\ntotal = 2\nsay(totla)';
  const diagnostics = analyzeSource(source).diagnostics;
  const output = formatDiagnostics('main.arya', source, diagnostics);
  assert.match(output, /main\.arya:2:1: Cannot assign to const 'total'\. \[ARYA_CONST_ASSIGNMENT\]/);
  assert.match(output, /2 \| total = 2\n\s+\| \^\^\^\^\^/);
  assert.match(output, /help: Use let/);
  assert.match(output, /help: Replace 'totla' with 'total'/);
  assert.match(formatDiagnostics('missing.arya', undefined, diagnostics), /ARYA_UNKNOWN_NAME/);
  const imported = analyzeSource('use js "missing" as library\nlibrary = 2').diagnostics;
  assert.match(imported[0]!.hint!, /imports and built-ins/);
});

test('diagnostic excerpts expand tabs, escape controls, bound long lines, and show EOF insertion points', () => {
  const source = '\tkeep value = "\x1b"; say(missing)';
  const rendered = formatDiagnostics('unicode.arya', source, analyzeSource(source).diagnostics);
  assert.ok(rendered.includes('\\u001b'));
  assert.ok(!rendered.includes('\x1b'));
  const long = 'keep text = "' + 'x'.repeat(10000) + '"; say(missing)';
  assert.ok(formatDiagnostics('long.arya', long, analyzeSource(long).diagnostics).length < 1000);
  try { compile('fn run() {\n'); assert.fail('Expected a syntax error'); }
  catch (error) {
    assert.ok(error instanceof AryaError);
    assert.match(formatDiagnostics('eof.arya', 'fn run() {\n', error.diagnostics), /Close the current block/);
  }
});

test('quick fixes use current lexical suggestions and exact UTF-16 source spans only', () => {
  const source = 'keep total = "🌉"\nsay(totla)';
  const diagnostics = analyzeSource(source).diagnostics;
  const [fix] = diagnosticFixes(source, diagnostics);
  assert.ok(fix);
  assert.equal(fix.start, source.indexOf('totla'));
  assert.equal(source.slice(fix.start, fix.end), 'totla');
  assert.equal(fix.replacement, 'total');
  assert.deepEqual(analyzeSource(source.slice(0, fix.start) + fix.replacement + source.slice(fix.end)).diagnostics, []);
  assert.deepEqual(diagnosticFixes(source.replace('totla', 'other'), diagnostics), []);
  assert.deepEqual(diagnosticFixes(source, diagnostics, 0, 4), []);
  const ambiguous = 'keep cat = 1; keep car = 2; say(cap)';
  assert.deepEqual(diagnosticFixes(ambiguous, analyzeSource(ambiguous).diagnostics), []);
  assert.deepEqual(diagnosticFixes('keep x = 1\nx = 2', analyzeSource('keep x = 1\nx = 2').diagnostics), []);
});

test('CLI code frames and JSON check reports remain passive and preserve diagnostic locations', async t => {
  const root = await fixture(t), filename = join(root, 'main.arya');
  const canary = join(root, 'CANARY');
  await writeFile(join(root, 'library.mjs'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(canary)},'executed');`);
  const source = 'use js "./library.mjs" as library\nkeep total = "🌉"\nsay(totla)';
  await writeFile(filename, source);
  const cli = (...args: string[]) => spawnSync(process.execPath, [resolve('dist/cli.cjs'), ...args], { encoding: 'utf8', timeout: 10000 });
  const human = cli('check', filename);
  assert.equal(human.status, 1);
  assert.match(human.stderr, /3 \| say\(totla\)/);
  assert.match(human.stderr, /ARYA_UNKNOWN_NAME/);
  const json = cli('check', filename, '--json');
  assert.equal(json.status, 1);
  assert.equal(json.stderr, '');
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.file, filename);
  const [diagnostic] = report.diagnostics;
  assert.equal(diagnostic.line, 3);
  assert.equal(diagnostic.column, 5);
  assert.equal(diagnostic.start, source.indexOf('totla'));
  assert.equal(diagnostic.fixes[0].replacement, 'total');
  await assert.rejects(access(canary));
  await assert.rejects(access(join(root, '.arya')));
  await writeFile(filename, source.replace('totla', 'total'));
  const valid = cli('check', filename, '--json');
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout).diagnostics, []);
  await assert.rejects(access(canary));
  const usage = cli('check', filename, '--target', 'invalid', '--json');
  assert.equal(usage.status, 1);
  assert.equal(JSON.parse(usage.stdout).diagnostics[0].code, 'ARYA_CLI');
  await writeFile(filename, 'say(args[0])');
  const argument = cli('run', filename, '--json');
  assert.equal(argument.status, 0, argument.stderr);
  assert.equal(argument.stdout, '--json\n');
  assert.equal(await readFile(filename, 'utf8'), 'say(args[0])');
});

test('JSON checking also supports the native profile without invoking a C toolchain', async t => {
  const root = await fixture(t), filename = join(root, 'main.arya');
  await writeFile(filename, 'say(null?.value ?? 42)');
  const run = spawnSync(process.execPath, [resolve('dist/cli.cjs'), 'check', filename, '--target', 'native', '--json'], { encoding: 'utf8', env: { ...process.env, ARYA_CC: 'missing-compiler-for-passive-check' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).target, 'native');
});
