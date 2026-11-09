import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const archive = resolve(`artifacts/${pkg.name}-${pkg.version}.tgz`);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:package.');
const root = await mkdtemp(join(tmpdir(), 'arya clean package '));
try {
  await writeFile(join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', archive], { cwd: root, stdio: 'pipe' });
  const installed = JSON.parse(await readFile(join(root, 'node_modules', pkg.name, 'package.json'), 'utf8'));
  assert.equal(installed.name, 'arya-language');
  assert.equal(installed.license, 'Apache-2.0');
  for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) {
    assert.equal(await readFile(join(root, 'node_modules', pkg.name, filename), 'utf8'), await readFile(filename, 'utf8'));
  }
  const api = execFileSync(process.execPath, ['--input-type=module', '-e', 'import {compile,ARYA_VERSION} from "arya-language"; console.log(ARYA_VERSION); if (!compile("print(42)").code.includes("42")) process.exit(1)'], { cwd: root, encoding: 'utf8' });
  assert.equal(api.trim(), pkg.version);
  await cp(join(root, 'node_modules/arya-language/fixtures/arya'), join(root, 'fixtures'), { recursive: true, filter: path => !['.arya', '__pycache__'].includes(basename(path)) });
  const cli = join(root, 'node_modules/arya-language/dist/cli.cjs');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.match(run('--version'), new RegExp(pkg.version.replaceAll('.', '\\.')));
  const launched = execFileSync(process.execPath, [npm, 'exec', '--offline', '--no', '--', 'arya', '--version'], { cwd: root, encoding: 'utf8' });
  assert.equal(launched.trim(), `Arya ${pkg.version}`);
  assert.match(run('check', 'fixtures/hello.arya'), /Check OK/);
  assert.match(run('build', 'fixtures/hello.arya'), /hello\.arya\.mjs/);
  assert.match(run('run', 'fixtures/hello.arya'), /Ready to build/);
  assert.match(run('run', 'fixtures/learn/08-arguments.arya', '--', 'literal; argument'), /literal; argument/);
  assert.match(run('run', 'fixtures/bridge.arya'), /Mean: 25/);
  assert.equal(run('run', 'fixtures/conformance/numeric-members.arya'), '1 1.00 100 1\n');
  assert.equal(run('run', 'fixtures/conformance/precedence.arya'), '[4,-4,512,5,7,8,3,true,"fallback",true]\n kept 0\n');
  assert.match(run('check', 'fixtures/check/valid-scopes.arya'), /Check OK/);
  assert.equal(run('run', 'fixtures/check/valid-scopes.arya'), '2 3\n1\n');
  for (const [file, pattern] of [['unknown-name', /Unknown name 'greetng'.*Did you mean 'greeting'/], ['const-write', /Cannot assign to const 'limit'/]]) {
    const check = spawnSync(process.execPath, [cli, 'check', `fixtures/check/${file}.arya`], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 1);
    assert.match(check.stderr, pattern);
  }
  const analysis = execFileSync(process.execPath, ['--input-type=module', '-e', 'import {analyze,definitionAt} from "arya-language/language-service"; const source="const value = 1; value = missing"; const result=analyze(source,"file:///main.arya"); console.log(JSON.stringify({codes:result.diagnostics.map(item=>item.code),definition:definitionAt(result,source.lastIndexOf("value"))?.start}));'], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(analysis), { codes: ['ARYA_CONST_ASSIGNMENT', 'ARYA_UNKNOWN_NAME'], definition: 6 });
  assert.match(run('check', 'fixtures/modules/tasks/main.arya'), /Check OK/);
  assert.equal(run('run', 'fixtures/modules/tasks/main.arya'), 'Completed: 2 of 3\nRemaining: 1\nProject: tasks.arya\n');
  const graph = execFileSync(process.execPath, ['--input-type=module', '-e', 'import {checkProject} from "arya-language/project"; const graph=await checkProject("fixtures/modules/tasks/main.arya"); console.log(graph.modules.length);'], { cwd: root, encoding: 'utf8' });
  assert.equal(graph.trim(), '3');
  for (const file of ['01-hello', '02-decisions', '03-lists-and-loops', '04-functions-and-objects', '05-javascript', '06-python', '07-async', '08-arguments', '09-task-list']) run('run', `fixtures/learn/${file}.arya`);
  await cp(join(root, 'node_modules/arya-language/fixtures/examples'), join(root, 'examples'), { recursive: true, filter: path => !['.arya', 'node_modules', '__pycache__'].includes(basename(path)) });
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: join(root, 'examples/npm'), stdio: 'pipe' });
  assert.equal(run('run', 'examples/npm/main.arya'), 'local npm package 42 6\n');
  assert.deepEqual(JSON.parse(run('run', 'examples/python-batch/main.arya')), { count: 4, sum: 100, mean: 25, doubled: [20, 40, 60, 80] });
  const failure = spawnSync(process.execPath, [cli, 'run', 'fixtures/runtime-error.arya'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /runtime-error\.arya:3:15/);
  assert.match(failure.stderr, /runtime-error\.arya:5:1/);
  const map = JSON.parse(await readFile(join(root, 'fixtures/.arya/build/runtime-error.arya.mjs.map'), 'utf8'));
  assert.ok(map.sourcesContent[0].includes('return item.name'));
  assert.deepEqual(map.sources, ['../../runtime-error.arya']);
  const built = run('build', 'fixtures/runtime-error.arya').trim();
  const standalone = spawnSync(process.execPath, ['--enable-source-maps', built], { cwd: root, encoding: 'utf8' });
  assert.notEqual(standalone.status, 0);
  assert.match(standalone.stderr, /runtime-error\.arya:3:15/);
  assert.match(standalone.stderr, /runtime-error\.arya:5:1/);
  console.log(`Clean installed package ${pkg.version}: API, CLI check/build/run, conformance fixtures, mapped CLI/standalone traces, arguments, and Python bridge passed.`);
} finally { await rm(root, { recursive: true, force: true }); }
