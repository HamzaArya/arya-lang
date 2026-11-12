import { mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const { discoverEditors, installEditorExtension } = createRequire(import.meta.url)(
  '../dist/editor.cjs',
);
const selected = process.argv[2];
const clients = (await discoverEditors()).filter((client) =>
  selected ? client.id === selected : ['code', 'aryacode'].includes(client.id),
);
if (!clients.length)
  throw new Error(
    'No requested VS Code-compatible editor was found. Pass code or aryacode after the script.',
  );
await mkdir('.build/evidence', { recursive: true });
const reports = [];
const reportPath = resolve('.build/evidence/editor-hosts.json');
await writeFile(reportPath, '[]\n');
for (const client of clients) {
  const root = await realpath(
    await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'arya-host-')),
  );
  const extensions = join(root, 'extensions'),
    data = join(root, 'profile'),
    workspace = join(root, 'workspace');
  await mkdir(workspace);
  const temporary = join(root, 'tmp');
  await mkdir(temporary);
  try {
    const adapterSource =
      client.id === 'aryacode' ? process.env.ARYA_EDITOR_TEST_JS_DEBUG : undefined;
    if (adapterSource)
      await cp(resolve(adapterSource), join(extensions, 'ms-vscode.js-debug'), { recursive: true });
    const installed = await installEditorExtension({
      editor: client.id,
      extensionsDirectory: extensions,
      userDataDirectory: data,
      force: true,
    });
    if (!installed.results[0]?.ok) throw new Error(JSON.stringify(installed.results));
    const extension = (await readdir(extensions)).find((name) =>
      name.startsWith('aryacode.arya-language-'),
    );
    if (!extension) throw new Error('Installed extension folder was not found.');
    const development = join(extensions, extension),
      harness = join(development, 'host-test.cjs'),
      report = join(root, 'result.json');
    await cp('tests/fixtures/editor-host.cjs', harness);
    await cp('tests/fixtures/editor-debug.cjs', join(development, 'host-debug.cjs'));
    let app = client.electron ? client.executable : undefined;
    if (!app && process.platform === 'darwin') {
      let current = dirname(await realpath(client.executable));
      while (dirname(current) !== current && basename(current) !== 'Contents')
        current = dirname(current);
      const binaries = await readdir(join(current, 'MacOS'));
      app = join(
        current,
        'MacOS',
        binaries.find((name) => !name.startsWith('.')),
      );
    }
    if (!app)
      throw new Error(
        'Set up an editor app launcher for this platform before running the optional workbench test.',
      );
    const env = {
      ...process.env,
      TMPDIR: temporary,
      TMP: temporary,
      TEMP: temporary,
      ELECTRON_RUN_AS_NODE: undefined,
      VSCODE_IPC_HOOK_CLI: undefined,
      ARYA_EDITOR_TEST_WORKSPACE: workspace,
      ARYA_EDITOR_TEST_REPORT: report,
      ARYA_EDITOR_TEST_ID: client.id,
      ARYA_EDITOR_TEST_NODE: process.execPath,
      ARYA_EDITOR_TEST_DEBUG_ADAPTER_ORIGIN: adapterSource ? 'isolated-profile' : 'editor',
      ARYA_EDITOR_TEST_TRACE: resolve(`.build/evidence/editor-debug-${client.id}.jsonl`),
    };
    await writeFile(env.ARYA_EDITOR_TEST_TRACE, '');
    await execute(
      app,
      [
        '--user-data-dir',
        data,
        '--extensions-dir',
        extensions,
        '--extensionDevelopmentPath=' + development,
        '--extensionTestsPath=' + harness,
        '--skip-welcome',
        '--disable-workspace-trust',
        '--disable-extension=aryacode.arya-workbench',
        '--skip-release-notes',
        '--disable-updates',
        '--disable-gpu',
        workspace,
      ],
      { env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
    );
    const result = JSON.parse(await readFile(report, 'utf8'));
    result.passed = true;
    result.node = process.version;
    reports.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    reports.push({ editor: client.id, passed: false, error: error.message });
    throw error;
  } finally {
    await writeFile(reportPath, JSON.stringify(reports, null, 2) + '\n');
    await rm(root, { recursive: true, force: true });
  }
}
await writeFile(
  resolve('.build/evidence/editor-hosts.json'),
  JSON.stringify(reports, null, 2) + '\n',
);
