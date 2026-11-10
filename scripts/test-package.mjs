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
  const editorAssets = JSON.parse(run('editor', 'path', '--json'));
  assert.equal(editorAssets.version, pkg.version);
  for (const name of ['vsix', 'icon', 'darkIcon', 'grammar', 'guide']) assert.ok((await readFile(editorAssets[name])).length > 0, name);
  const features = JSON.parse(await readFile(join(root, 'node_modules/arya-language/dist/features.json'), 'utf8'));
  assert.ok(features.capabilities.includes('arya.ui.v1'));
  assert.equal(features.runtime, 'node');
  assert.ok(features.capabilities.includes('arya.node.v1'));
  assert.ok(features.capabilities.includes('arya.syntax.flow.v1'));
  assert.ok(features.capabilities.includes('arya.list.v1'));
  assert.ok(features.capabilities.includes('arya.ui.patterns.v1'));
  assert.match(run('init', 'website', '--web'), /(?:created|initialized|ready)/i);
  for (const file of ['main.arya', 'index.html', 'package.json', 'public/styles.css', 'public/app.js', 'README.md', '.gitignore']) {
    assert.ok((await readFile(join(root, 'website', file))).length > 0, file);
  }
  assert.match(run('check', 'website/main.arya'), /Check OK/);
  assert.match(run('build', 'website/main.arya'), /main\.arya\.mjs/);
  const websiteManifest = JSON.parse(await readFile(join(root, 'website/package.json'), 'utf8'));
  assert.equal(websiteManifest.devDependencies['arya-language'], pkg.version);
  assert.equal(websiteManifest.scripts.dev, 'arya run main.arya');
  assert.match(await readFile(join(root, 'website/index.html'), 'utf8'), /<div id="root"><\/div>/);
  const creatorArchive = resolve(`artifacts/create-arya-language-${pkg.version}.tgz`);
  execFileSync(process.execPath, [npm, 'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', creatorArchive], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, [npm, 'exec', '--offline', '--no', '--', 'create-arya-language', 'portable-web', '--template', 'web', '--compiler', archive], { cwd: root, stdio: 'pipe' });
  const portable = join(root, 'moved-project');
  await cp(join(root, 'portable-web'), portable, { recursive: true });
  execFileSync(process.execPath, [npm, 'install', '--offline', '--cache', join(root, 'empty-cache'), '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: portable, stdio: 'pipe' });
  execFileSync(process.execPath, [npm, 'run', 'check'], { cwd: portable, stdio: 'pipe' });
  execFileSync(process.execPath, [npm, 'run', 'build'], { cwd: portable, stdio: 'pipe' });
  const localVersion = execFileSync(process.execPath, [join(portable, 'node_modules/arya-language/dist/cli.cjs'), '--version'], { cwd: portable, encoding: 'utf8' });
  assert.equal(localVersion.trim(), `Arya ${pkg.version}`);
  execFileSync(process.execPath, [npm, 'exec', '--offline', '--no', '--', 'arya-language', 'api-project', '--template', 'api'], { cwd: root, stdio: 'pipe' });
  assert.match(await readFile(join(root, 'api-project/main.arya'), 'utf8'), /html: false/);
  execFileSync(process.execPath, [npm, 'create', 'arya-language', 'npm-created', '--offline', '--', '--template', 'cli'], { cwd: root, stdio: 'pipe' });
  assert.match(await readFile(join(root, 'npm-created/main.arya'), 'utf8'), /fn greet/);
  for (const template of ['ui', 'desktop']) {
    const name = 'registry-' + template;
    run('create', name, '--template', template);
    const manifest = JSON.parse(await readFile(join(root, name, 'package.json'), 'utf8'));
    assert.equal(manifest.devDependencies['arya-language'], pkg.version);
    assert.match(run('check', name + '/main.arya'), /Check OK/);
    assert.match(run('build', name + '/main.arya'), /main\.arya\.mjs/);
  }
  await writeFile(join(root, 'ui-guide.arya'), 'use std "ui" as ui\nsay(ui.preview({section: "guide"}))\n');
  const guide = run('run', 'ui-guide.arya');
  assert.match(guide, /npm create arya-language@latest/);
  assert.match(guide, /Implementation guide/);
  await writeFile(join(root, 'ui-template.arya'), 'use std "ui" as ui\nsay(ui.template("dashboard", {brand: "Installed template", metrics: [{label: "Open tasks", value: 7}], rows: []}))\n');
  const dashboard = run('run', 'ui-template.arya');
  assert.match(dashboard, /Installed template/);
  assert.match(dashboard, /Open tasks/);
  assert.match(run('check', 'fixtures/hello.arya'), /Check OK/);
  assert.match(run('build', 'fixtures/hello.arya'), /hello\.arya\.mjs/);
  assert.match(run('run', 'fixtures/hello.arya'), /Ready to build/);
  assert.match(run('run', 'fixtures/learn/08-arguments.arya', '--', 'literal; argument'), /literal; argument/);
  assert.match(run('run', 'fixtures/bridge.arya'), /Mean: 25/);
  await writeFile(join(root, 'web-preview.arya'), `use std "math" as math
use std "json" as json
use std "mysql" as mysql
task twice(value) { give value * 2 }
say(json.stringify({value: twice(math.sqrt(81))}))
say(view { div bg-dark { h1 "Arya 1.2" } })
`);
  assert.equal(run('run', 'web-preview.arya'), '{"value":18}\n<div class="bg-dark"><h1>Arya 1.2</h1></div>\n');
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
  assert.equal(run('run', 'examples/data-flow/main.arya'), '1. Samira\n2. Hamza\nTotal score: 180\n');
  assert.equal(run('run', 'examples/data-flow/python.arya'), 'Python average: 20.0\n');
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
  assert.equal(installed.exports['./native'], undefined);
  for (const path of ['dist/native.cjs', 'dist/types/native.d.ts', 'bootstrap', 'fixtures/native']) {
    await assert.rejects(readFile(join(root, 'node_modules/arya-language', path)), {code: 'ENOENT'});
  }
  const retired = spawnSync(process.execPath, [cli, 'check', 'fixtures/hello.arya', '--target', 'native', '--json'], {cwd: root, encoding: 'utf8'});
  assert.equal(retired.status, 1);
  assert.match(JSON.parse(retired.stdout).diagnostics[0].message, /Node.js runtime only/);
  console.log(`Clean installed package ${pkg.version}: compiler/creator, bundled editor assets, UI/desktop starters and guide, npm create and npx entry points, portable project install/check/build, Node.js conformance, source maps, arguments, and Python bridge passed.`);
} finally { await rm(root, { recursive: true, force: true }); }
