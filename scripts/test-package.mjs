import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const archive = resolve(`artifacts/arya-lang-${pkg.version}.tgz`);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:package.');
const root = await mkdtemp(join(tmpdir(), 'arya clean package '));
try {
  await writeFile(join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', archive], { cwd: root, stdio: 'pipe' });
  const api = execFileSync(process.execPath, ['--input-type=module', '-e', 'import {compile,ARYA_VERSION} from "arya-lang"; console.log(ARYA_VERSION); if (!compile("print(42)").code.includes("42")) process.exit(1)'], { cwd: root, encoding: 'utf8' });
  assert.equal(api.trim(), pkg.version);
  await cp('fixtures/arya', join(root, 'fixtures'), { recursive: true, filter: path => !path.includes('/.arya/') && !path.includes('/__pycache__/') });
  const cli = join(root, 'node_modules/arya-lang/dist/cli.cjs');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.match(run('--version'), new RegExp(pkg.version.replaceAll('.', '\\.')));
  assert.match(run('check', 'fixtures/hello.arya'), /Syntax OK/);
  assert.match(run('build', 'fixtures/hello.arya'), /hello\.arya\.mjs/);
  assert.match(run('run', 'fixtures/hello.arya'), /Ready to build/);
  assert.match(run('run', 'fixtures/learn/08-arguments.arya', '--', 'literal; argument'), /literal; argument/);
  assert.match(run('run', 'fixtures/bridge.arya'), /Mean: 25/);
  console.log(`Clean installed package ${pkg.version}: API, CLI check/build/run, arguments, and Python bridge passed.`);
} finally { await rm(root, { recursive: true, force: true }); }
