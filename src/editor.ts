import {access, stat, readFile, mkdtemp, rm} from 'node:fs/promises';
import {constants, readFileSync} from 'node:fs';
import {delimiter, dirname, extname, isAbsolute, join, resolve} from 'node:path';
import {homedir, tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ARYA_VERSION} from './compiler.js';

const execute = promisify(execFile);
export const supportedEditors = ['code', 'aryacode', 'code-insiders', 'cursor', 'codium', 'windsurf'] as const;
export type EditorName = typeof supportedEditors[number];
export interface EditorClient {id: EditorName; executable: string; arguments: string[]; electron: boolean; extensionsDirectory?: string}
export interface EditorDiscovery {env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; applications?: string[]}
export interface EditorInstallOptions extends EditorDiscovery {editor?: EditorName | 'all'; cli?: string; packageRoot?: string; extensionsDirectory?: string; userDataDirectory?: string; force?: boolean}

export function editorAssets(packageRoot = resolve(__dirname, '..')) {
  const root = resolve(packageRoot);
  let extensionVersion: string | undefined;
  try {
    const metadata = JSON.parse(readFileSync(join(root, 'editors/vscode/package.json'), 'utf8'));
    if (typeof metadata.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version)) extensionVersion = metadata.version;
  } catch { /* Assets can be inspected even when optional editor metadata is absent. */ }
  return {version: ARYA_VERSION, languageVersion: ARYA_VERSION, extensionVersion, extensionId: 'aryacode.arya-language', vsix: join(root, 'dist/editor/arya-language.vsix'),
    icon: join(root, 'brand/arya-mark.svg'), darkIcon: join(root, 'brand/arya-mark-dark.svg'),
    grammar: join(root, 'editors/vscode/syntaxes/arya.tmLanguage.json'), adapters: join(root, 'dist/editor/adapters'),
    guide: join(root, 'docs/editor-setup.md')};
}

async function file(path: string, executable = false) {
  try { return (await stat(path)).isFile() && (await access(path, executable && process.platform !== 'win32' ? constants.X_OK : constants.F_OK), true); }
  catch { return false; }
}

const products: Record<EditorName, {app: string; binary: string; windows: string}> = {
  code: {app: 'Visual Studio Code', binary: 'Electron', windows: 'Code'},
  aryacode: {app: 'AryaCode', binary: 'AryaCode', windows: 'AryaCode'},
  'code-insiders': {app: 'Visual Studio Code - Insiders', binary: 'Electron', windows: 'Code - Insiders'},
  cursor: {app: 'Cursor', binary: 'Cursor', windows: 'Cursor'},
  codium: {app: 'VSCodium', binary: 'Electron', windows: 'VSCodium'},
  windsurf: {app: 'Windsurf', binary: 'Windsurf', windows: 'Windsurf'},
};

/** Supported Windows .cmd launchers are resolved to Electron + cli.js, without cmd.exe. */
async function clientFor(id: EditorName, executable: string, platform: NodeJS.Platform): Promise<EditorClient | undefined> {
  if (!await file(executable, true)) return undefined;
  if (platform === 'win32' && ['.cmd', '.bat'].includes(extname(executable).toLowerCase())) {
    const root = dirname(dirname(executable)), cli = join(root, 'resources/app/out/cli.js');
    const binary = join(root, products[id].windows + '.exe');
    if (await file(binary) && await file(cli)) return {id, executable: binary, arguments: [cli], electron: true};
    return undefined;
  }
  return {id, executable, arguments: [], electron: false};
}

export async function discoverEditors(options: EditorDiscovery = {}): Promise<EditorClient[]> {
  const platform = options.platform ?? process.platform, env = options.env ?? process.env;
  const roots = options.applications ?? (platform === 'darwin' ? ['/Applications', join(homedir(), 'Applications')] : []);
  const clients: EditorClient[] = [];
  for (const id of supportedEditors) {
    let selected: EditorClient | undefined;
    const searchPath = env.PATH ?? (platform === 'win32' ? env.Path ?? env.path : undefined) ?? '';
    for (const entry of searchPath.split(platform === 'win32' ? ';' : delimiter).filter(Boolean)) {
      const directory = platform === 'win32' ? entry.replace(/^"(.*)"$/, '$1') : entry;
      for (const suffix of platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']) {
        selected = await clientFor(id, resolve(directory, id + suffix), platform);
        if (selected) break;
      }
      if (selected) break;
    }
    if (!selected && platform === 'darwin') for (const root of roots) {
      const app = join(root, products[id].app + '.app/Contents');
      selected = await clientFor(id, join(app, 'Resources/app/bin', id), platform);
      if (!selected) {
        const executable = join(app, 'MacOS', products[id].binary), cli = join(app, 'Resources/app/out/cli.js');
        if (await file(executable, true) && await file(cli)) {
          selected = {id, executable, arguments: [cli], electron: true};
          try {
            const product = JSON.parse(await readFile(join(app, 'Resources/app/product.json'), 'utf8')) as {dataFolderName?: string};
            if (product.dataFolderName && /^[.A-Za-z0-9_-]+$/.test(product.dataFolderName) && !['.', '..'].includes(product.dataFolderName)) selected.extensionsDirectory = join(homedir(), product.dataFolderName, 'extensions');
          } catch { /* Optional metadata is used only by the compatibility-manager fallback. */ }
        }
      }
      if (selected) break;
    }
    if (!selected && platform === 'win32') {
      const folder = id === 'code' ? 'Microsoft VS Code' : id === 'code-insiders' ? 'Microsoft VS Code Insiders' : products[id].app;
      for (const root of [env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : undefined, env.ProgramFiles, env['ProgramFiles(x86)']].filter((value): value is string => Boolean(value))) {
        selected = await clientFor(id, join(root, folder, 'bin', id + '.cmd'), platform);
        if (selected) break;
      }
    }
    if (selected && !selected.extensionsDirectory) {
      const roots = [selected.arguments[0] ? dirname(dirname(selected.arguments[0])) : undefined, dirname(dirname(selected.executable))].filter((value): value is string => Boolean(value));
      for (const root of roots) {
        for (const path of [join(root, 'product.json'), join(root, 'resources/app/product.json')]) {
          try {
            const product = JSON.parse(await readFile(path, 'utf8')) as {dataFolderName?: string};
            if (product.dataFolderName && /^[.A-Za-z0-9_-]+$/.test(product.dataFolderName) && !['.', '..'].includes(product.dataFolderName)) selected.extensionsDirectory = join(homedir(), product.dataFolderName, 'extensions');
          } catch { /* Non-app launchers need no metadata to work normally. */ }
          if (selected.extensionsDirectory) break;
        }
        if (selected.extensionsDirectory) break;
      }
    }
    if (selected) clients.push(selected);
  }
  return clients;
}

export async function installEditorExtension(options: EditorInstallOptions = {}) {
  const assets = editorAssets(options.packageRoot);
  if (!await file(assets.vsix)) throw new Error('The bundled editor extension is missing. Reinstall the complete arya-language package or build this checkout first.');
  if (options.cli && !isAbsolute(options.cli)) throw new Error('--cli must be an absolute executable path.');
  const detected = await discoverEditors(options);
  let clients = detected;
  if (options.cli) {
    const client = await clientFor(options.editor && options.editor !== 'all' ? options.editor : 'code', options.cli, options.platform ?? process.platform);
    if (!client) throw new Error('Editor CLI is unavailable or its Windows launcher layout is unsupported. Install the VSIX manually: ' + assets.vsix);
    clients = [client];
  } else if (options.editor && options.editor !== 'all') clients = clients.filter(client => client.id === options.editor);
  if (!clients.length) throw new Error('No supported editor CLI was found. Use --cli /absolute/path/to/code, or Extensions: Install from VSIX with ' + assets.vsix);
  const results: {editor: EditorName; ok: boolean; message: string; manager?: EditorName}[] = [];
  for (const client of clients) {
    const args = [...client.arguments, '--install-extension', assets.vsix,
      ...(options.force ? ['--force'] : []),
      ...(options.extensionsDirectory ? ['--extensions-dir', resolve(options.extensionsDirectory)] : []),
      ...(options.userDataDirectory ? ['--user-data-dir', resolve(options.userDataDirectory)] : [])];
    const env: NodeJS.ProcessEnv = {...(options.env ?? process.env), ...(client.electron ? {ELECTRON_RUN_AS_NODE: '1'} : {})};
    if (options.extensionsDirectory || options.userDataDirectory) delete env.VSCODE_IPC_HOOK_CLI;
    try {
      const result = await execute(client.executable, args, {env, timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true});
      results.push({editor: client.id, ok: true, message: result.stdout.trim() || 'Editor accepted the extension installation.'});
    } catch (error) {
      const failure = error as Error & {stderr?: string};
      const message = failure.stderr?.trim() || failure.message;
      const manager = detected.find(item => ['code', 'code-insiders', 'codium'].includes(item.id));
      const extensions = options.extensionsDirectory ?? client.extensionsDirectory;
      if (client.id === 'aryacode' && /Cannot find module[\s\S]*cliProcessMain\.js|Error reading NLS messages file/.test(message) && manager && extensions) {
        const temporary = options.userDataDirectory ? undefined : await mkdtemp(join(tmpdir(), 'arya editor manager '));
        try {
          const managerEnv: NodeJS.ProcessEnv = {...(options.env ?? process.env), ...(manager.electron ? {ELECTRON_RUN_AS_NODE: '1'} : {})};
          delete managerEnv.VSCODE_IPC_HOOK_CLI;
          const result = await execute(manager.executable, [...manager.arguments, '--install-extension', assets.vsix, '--extensions-dir', resolve(extensions), '--user-data-dir', resolve(options.userDataDirectory ?? temporary!), ...(options.force ? ['--force'] : [])], {env: managerEnv, timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true});
          results.push({editor: client.id, ok: true, manager: manager.id, message: 'Installed in AryaCode using ' + manager.id + ' as the compatibility manager. ' + result.stdout.trim()});
        } catch (fallback) {
          const problem = fallback as Error & {stderr?: string};
          results.push({editor: client.id, ok: false, message: problem.stderr?.trim() || problem.message});
        } finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
      } else results.push({editor: client.id, ok: false, message});
    }
  }
  return {assets, results};
}

export async function runEditorSetup(args: string[]): Promise<void> {
  const [command = 'status', ...rest] = args;
  const help = 'Arya editor setup\n\n  arya editor status [--json]\n  arya editor path [--json]\n  arya editor install [--editor all|code|aryacode|code-insiders|cursor|codium|windsurf]\n    [--cli /absolute/path] [--force] [--extensions-dir directory] [--user-data-dir directory]\n\nThe npm package includes icons, themes, grammar, and an offline VSIX. Install defaults to all detected supported editors.\nOther editors: arya-lsp --stdio and the adapters reported by status.\n';
  if (command === '--help' || args.includes('--help')) { console.log(help); return; }
  if (!['status', 'path', 'install'].includes(command)) throw new Error('Use arya editor status, path, or install.');
  const options: EditorInstallOptions = {};
  let json = false;
  const seen = new Set<string>();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index]!;
    if (seen.has(flag)) throw new Error('Specify ' + flag + ' once.');
    seen.add(flag);
    if (flag === '--json') json = true;
    else if (command === 'install' && flag === '--force') options.force = true;
    else if (command === 'install' && ['--editor', '--cli', '--extensions-dir', '--user-data-dir'].includes(flag)) {
      const value = rest[++index];
      if (!value || value.startsWith('-')) throw new Error(flag + ' requires a value.');
      if (flag === '--editor') {
        if (value !== 'all' && !(supportedEditors as readonly string[]).includes(value)) throw new Error('Choose a supported editor. See arya editor --help.');
        options.editor = value as EditorName | 'all';
      } else if (flag === '--cli') options.cli = value;
      else if (flag === '--extensions-dir') options.extensionsDirectory = value;
      else options.userDataDirectory = value;
    } else throw new Error('Unknown editor option: ' + flag);
  }
  const assets = editorAssets();
  if (command === 'path') { console.log(json ? JSON.stringify(assets) : assets.vsix); return; }
  if (command === 'status') {
    const clients = await discoverEditors();
    const report = {assets, bundled: await file(assets.vsix), editors: clients};
    console.log(json ? JSON.stringify(report) : 'Arya language ' + ARYA_VERSION + '\nBundled extension ' + (assets.extensionVersion ?? '(metadata unavailable)') + ' (separate version)\n\nVSIX: ' + assets.vsix + '\nIcon: ' + assets.icon + '\nGrammar: ' + assets.grammar + '\nAdapters: ' + assets.adapters + '\nDetected: ' + (clients.map(client => client.id).join(', ') || 'none') + '\n\nInstall: npx --no-install arya editor install\nThen choose Arya: Editor Setup Guide in your editor.');
    return;
  }
  const report = await installEditorExtension(options);
  console.log(json ? JSON.stringify(report) : report.results.map(result => (result.ok ? 'Installed in ' : 'Failed in ') + result.editor + ': ' + result.message).join('\n') + '\n\nReload the editor, then run Arya: Editor Setup Guide. Colors work with your existing theme. Choose Arya File Icons / Arya Dark / Arya Light when you want those appearance settings.');
  if (report.results.some(result => !result.ok)) process.exitCode = 1;
}
