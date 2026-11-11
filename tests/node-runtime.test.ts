import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeSource, compile, AryaError} from '../src/compiler.js';
import {analyze} from '../src/language-service.js';
import {checkProject, type ProjectOptions} from '../src/project.js';
import {projectTemplates} from '../src/web-project.js';

test('unsupported standard libraries have matching passive compiler and editor diagnostics', () => {
  for (const library of ['io', 'runtime', 'missing']) {
    const source = `use std "${library}" as library`;
    const diagnostics = analyzeSource(source).diagnostics;
    assert.equal(diagnostics[0]?.code, 'ARYA_UNKNOWN_LIBRARY');
    assert.match(diagnostics[0]!.hint!, /Node.js/);
    assert.deepEqual(analyze(source, 'file:///main.arya').diagnostics, diagnostics);
    assert.throws(() => compile(source), (error: unknown) => error instanceof AryaError && error.diagnostics[0]?.code === 'ARYA_UNKNOWN_LIBRARY');
  }
});

test('legacy API native requests fail explicitly before filesystem access', async () => {
  const options = {target: 'native'} as unknown as ProjectOptions;
  await assert.rejects(checkProject('/does-not-exist.arya', options), (error: any) => error.diagnostics[0].code === 'ARYA_UNSUPPORTED_TARGET');
  assert.equal(analyze("print(42)", 'file:///main.arya', options).diagnostics[0]?.code, 'ARYA_UNSUPPORTED_TARGET');
});

test('CLI retires compiler flags while preserving explicit JS compatibility and literal program arguments', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya node runtime '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const filename = join(root, 'main.arya');
  await writeFile(filename, "print(args.join(\"|\"))");
  const cli = resolve('dist/cli.cjs');
  for (const flag of ['--cc', '--cc=missing', '--sanitize', '--debug', '--release', '-o', '--output', '--output=app']) {
    const result = spawnSync(process.execPath, [cli, 'check', filename, flag, '--json'], {encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).diagnostics[0].message, /no longer supported/);
  }
  const checked = spawnSync(process.execPath, [cli, 'check', filename, '--target', 'js', '--json'], {encoding: 'utf8'});
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).target, 'js');
  const retired = spawnSync(process.execPath, [cli, 'run', filename, '--target=native'], {encoding: 'utf8'});
  assert.equal(retired.status, 1);
  assert.match(retired.stderr, /Node.js runtime only/);
  const run = spawnSync(process.execPath, [cli, 'run', filename, '--', '--target', 'native', '--cc'], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '--target|native|--cc\n');
});

test('package exports, project templates, and editor settings expose only the Node product', async () => {
  assert.deepEqual(projectTemplates, ['web', 'api', 'cli', 'ui', 'desktop']);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.exports['./native'], undefined);
  assert.equal(pkg.scripts['bootstrap:native'], undefined);
  const extension = JSON.parse(await readFile('editors/vscode/package.json', 'utf8'));
  assert.equal(extension.contributes.configuration.properties['aryaLanguage.target'], undefined);
  assert.equal(extension.contributes.configuration.properties['aryaLanguage.ccPath'], undefined);
});
