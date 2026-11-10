import {mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute = promisify(execFile);
const {discoverEditors, installEditorExtension} = createRequire(import.meta.url)('../dist/editor.cjs');
const selected = process.argv[2];
const clients = (await discoverEditors()).filter(client => selected ? client.id === selected : ['code', 'aryacode'].includes(client.id));
if (!clients.length) throw new Error('No requested VS Code-compatible editor was found. Pass code or aryacode after the script.');
await mkdir('.build/evidence', {recursive: true});
const reports = [];
for (const client of clients) {
  const root = await mkdtemp(join(tmpdir(), 'arya editor host '));
  const extensions = join(root, 'extensions'), data = join(root, 'profile'), workspace = join(root, 'workspace');
  await mkdir(workspace);
  try {
    const installed = await installEditorExtension({editor: client.id, extensionsDirectory: extensions, userDataDirectory: data, force: true});
    if (!installed.results[0]?.ok) throw new Error(JSON.stringify(installed.results));
    const extension = (await readdir(extensions)).find(name => name.startsWith('aryacode.arya-language-'));
    if (!extension) throw new Error('Installed extension folder was not found.');
    const development = join(extensions, extension), harness = join(development, 'host-test.cjs'), report = join(root, 'result.json');
    await cp('tests/fixtures/editor-host.cjs', harness);
    let app = client.electron ? client.executable : undefined;
    if (!app && process.platform === 'darwin') {
      let current = dirname(await realpath(client.executable));
      while (dirname(current) !== current && basename(current) !== 'Contents') current = dirname(current);
      const binaries = await readdir(join(current, 'MacOS'));
      app = join(current, 'MacOS', binaries.find(name => !name.startsWith('.')));
    }
    if (!app) throw new Error('Set up an editor app launcher for this platform before running the optional workbench test.');
    const env = {...process.env, ELECTRON_RUN_AS_NODE: undefined, VSCODE_IPC_HOOK_CLI: undefined, ARYA_EDITOR_TEST_WORKSPACE: workspace, ARYA_EDITOR_TEST_REPORT: report, ARYA_EDITOR_TEST_ID: client.id};
    await execute(app, ['--user-data-dir', data, '--extensions-dir', extensions, '--extensionDevelopmentPath=' + development, '--extensionTestsPath=' + harness, '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-gpu', workspace], {env, timeout: 120000, maxBuffer: 4 * 1024 * 1024});
    const result = JSON.parse(await readFile(report, 'utf8')); reports.push(result); console.log(JSON.stringify(result));
  } finally { await rm(root, {recursive: true, force: true}); }
}
await writeFile(resolve('.build/evidence/editor-hosts.json'), JSON.stringify(reports, null, 2) + '\n');
