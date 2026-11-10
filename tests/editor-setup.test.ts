import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {discoverEditors, editorAssets, installEditorExtension} from '../src/editor.js';

async function fixture(t: {after(fn: () => Promise<unknown>): void}) {
  const root = await mkdtemp(join(tmpdir(), 'arya editor setup '));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'dist/editor'), {recursive: true});
  await writeFile(join(root, 'dist/editor/arya-language.vsix'), 'test fixture');
  return root;
}
const mockEditor = '#!' + process.execPath + '\nconst fs=require("node:fs");fs.appendFileSync(process.env.ARYA_EDITOR_CAPTURE,JSON.stringify({args:process.argv.slice(2),electron:process.env.ELECTRON_RUN_AS_NODE,ipc:process.env.VSCODE_IPC_HOOK_CLI})+"\\n");if(process.env.ARYA_EDITOR_BROKEN&&process.argv[1].endsWith("AryaCode")){console.error("Cannot find module cliProcessMain.js");process.exit(1);}if(process.env.ARYA_EDITOR_FAIL){console.error("test editor failure");process.exit(1);}console.log("Installed Arya.");\n';

test('npm build includes a complete offline VSIX, icons, themes, walkthrough, and compiler', async () => {
  const assets = editorAssets(resolve('.'));
  const archive = unzipSync(await readFile(assets.vsix));
  const manifest = JSON.parse(Buffer.from(archive['extension/package.json']!).toString());
  assert.equal(manifest.publisher + '.' + manifest.name, assets.extensionId);
  assert.equal(manifest.aryaLanguageVersion, assets.version);
  for (const name of ['dist/extension.cjs', 'dist/arya.cjs', 'media/arya-mark.svg', 'media/arya-mark-dark.svg', 'icons/arya-file-icons.json', 'themes/arya-dark.json', 'themes/arya-light.json', 'examples/editor-tour.arya', 'walkthroughs/icons.md']) assert.ok(archive['extension/' + name]?.length, name);
  const icons = JSON.parse(Buffer.from(archive['extension/icons/arya-file-icons.json']!).toString());
  assert.equal(icons.fileExtensions.arya, 'arya'); assert.equal(icons.languageIds.arya, 'arya');
  assert.equal(icons.light.fileExtensions.arya, 'arya-light');
  for (const icon of Object.values(icons.iconDefinitions) as {iconPath: string}[]) {
    const path = resolve('editors/vscode/icons', icon.iconPath); await access(path);
  }
  for (const theme of manifest.contributes.themes) {
    const value = JSON.parse(await readFile(resolve('editors/vscode', theme.path), 'utf8'));
    assert.equal(value.semanticHighlighting, true);
    for (const kind of ['namespace', 'function', 'method', 'parameter', 'variable.readonly', 'property']) assert.ok(value.semanticTokenColors[kind]);
  }
  for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) assert.deepEqual(Buffer.from(archive['extension/' + (filename === 'LICENSE' ? 'LICENSE.txt' : filename)]!), await readFile(filename));
});

test('discovery handles PATH launchers and AryaCode apps without a bin command', {skip: process.platform === 'win32'}, async t => {
  const root = await fixture(t), bin = join(root, 'bin'), applications = join(root, 'applications');
  await mkdir(bin); await writeFile(join(bin, 'code'), mockEditor, {mode: 0o755});
  const contents = join(applications, 'AryaCode.app/Contents');
  await mkdir(join(contents, 'MacOS'), {recursive: true}); await mkdir(join(contents, 'Resources/app/out'), {recursive: true});
  await writeFile(join(contents, 'MacOS/AryaCode'), mockEditor, {mode: 0o755});
  await writeFile(join(contents, 'Resources/app/out/cli.js'), 'test cli');
  const env = {PATH: bin, ARYA_EDITOR_CAPTURE: join(root, 'calls.jsonl')};
  const clients = await discoverEditors({env, applications: [applications], platform: 'darwin'});
  assert.deepEqual(clients.map(client => client.id), ['code', 'aryacode']);
  assert.equal(clients[1]!.electron, true);
  const report = await installEditorExtension({packageRoot: root, env, applications: [applications], platform: 'darwin', extensionsDirectory: join(root, 'isolated extensions'), userDataDirectory: join(root, 'isolated data'), force: true});
  assert.deepEqual(report.results.map(result => result.ok), [true, true]);
  const calls = (await readFile(env.ARYA_EDITOR_CAPTURE, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls[1].electron, '1');
  assert.ok(calls[0].args.includes(join(root, 'dist/editor/arya-language.vsix')));
  assert.ok(calls[0].args.includes(join(root, 'isolated extensions')));
  assert.ok(calls[0].args.includes('--force'));
  const recovered = await installEditorExtension({packageRoot: root, editor: 'aryacode', env: {...env, ARYA_EDITOR_BROKEN: '1'}, applications: [applications], platform: 'darwin', extensionsDirectory: join(root, 'fallback extensions')});
  assert.equal(recovered.results[0]!.ok, true);
  assert.equal(recovered.results[0]!.manager, 'code');
  const recoveredCalls = (await readFile(env.ARYA_EDITOR_CAPTURE, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const managed = recoveredCalls.at(-1);
  assert.ok(managed.args.includes(join(root, 'fallback extensions')));
  await assert.rejects(access(managed.args[managed.args.indexOf('--user-data-dir') + 1]), 'temporary compatibility-manager profile must be removed');
});

test('installation uses literal argument arrays, isolates profiles, and reports failures', {skip: process.platform === 'win32'}, async t => {
  const root = await fixture(t), executable = join(root, 'editor with spaces & symbols');
  await writeFile(executable, mockEditor, {mode: 0o755});
  const log = join(root, 'calls.jsonl'), marker = join(root, 'MUST_NOT_EXIST');
  const directory = join(root, 'extensions $(touch MUST_NOT_EXIST)');
  const env = {PATH: '', ARYA_EDITOR_CAPTURE: log, VSCODE_IPC_HOOK_CLI: 'must-not-leak'};
  const report = await installEditorExtension({packageRoot: root, cli: executable, env, applications: [], extensionsDirectory: directory});
  assert.equal(report.results[0]!.ok, true);
  const call = JSON.parse((await readFile(log, 'utf8')).trim());
  assert.ok(call.args.includes(directory)); assert.equal(call.ipc, undefined);
  await assert.rejects(access(marker));
  const failed = await installEditorExtension({packageRoot: root, cli: executable, env: {...env, ARYA_EDITOR_FAIL: '1'}, applications: []});
  assert.equal(failed.results[0]!.ok, false); assert.match(failed.results[0]!.message, /test editor failure/);
  await assert.rejects(installEditorExtension({packageRoot: root, cli: 'relative-code'}), /absolute/);
  await assert.rejects(installEditorExtension({packageRoot: root, env: {PATH: ''}, applications: []}), /No supported editor/);
});

test('Windows discovery resolves known batch launchers to Electron plus cli.js without a command shell', async t => {
  const root = await fixture(t), app = join(root, 'Code & tools'), bin = join(app, 'bin');
  await mkdir(bin, {recursive: true}); await mkdir(join(app, 'resources/app/out'), {recursive: true});
  await writeFile(join(bin, 'code.cmd'), 'test launcher', {mode: 0o755});
  await writeFile(join(app, 'Code.exe'), 'test binary', {mode: 0o755});
  await writeFile(join(app, 'resources/app/out/cli.js'), 'test cli');
  const clients = await discoverEditors({platform: 'win32', env: {Path: '"' + bin + '"'}, applications: []});
  assert.equal(clients.length, 1); assert.equal(clients[0]!.executable, join(app, 'Code.exe'));
  assert.deepEqual(clients[0]!.arguments, [join(app, 'resources/app/out/cli.js')]);
  assert.equal(clients[0]!.electron, true);
});

test('editor CLI validates its flags and reports assets without changing editor settings', () => {
  const cli = resolve('dist/cli.cjs');
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, 'editor', ...args], {encoding: 'utf8', timeout: 10000});
  const status = run('status', '--json'); assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout); assert.equal(parsed.bundled, true); assert.ok(parsed.assets.vsix.endsWith('.vsix'));
  const path = run('path'); assert.equal(path.status, 0); assert.equal(path.stdout.trim(), parsed.assets.vsix);
  for (const args of [['unsupported'], ['status', '--force'], ['install', '--editor', 'unknown'], ['install', '--cli'], ['install', '--editor', 'code', '--editor', 'code']]) assert.notEqual(run(...args).status, 0, args.join(' '));
  assert.ok(run('--help').stdout.includes('aryacode'));
  const invalid = run('install', '--editor', 'unknown', '--json');
  assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stdout).error.code, 'ARYA_EDITOR');
});
