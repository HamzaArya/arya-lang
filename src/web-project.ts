import { link, lstat, mkdir, mkdtemp, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ARYA_VERSION } from './compiler.js';
import { uiProjectFiles, desktopMain } from './ui-project.js';

const webFiles: Readonly<Record<string, string>> = {
  'main.arya': `use std "web" as web

const port = number(args[0] or "3000")
const server = web.serve(port, {
  "GET /api/health": fn() {
    return {status: "ok", language: "Arya"}
  }
})

server.on("listening", fn() {
  say("Arya: http://127.0.0.1:" + str(server.address().port))
})
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="A fresh start with Arya.">
    <title>Made with Arya</title>
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/app.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
  'public/styles.css': `:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #101415; color: #f1f3ec; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at 90% 0%, #263a2c 0, transparent 50%); }
main { max-width: 1100px; margin: auto; padding: 3rem clamp(1.5rem, 6vw, 5rem); }
.wordmark { display: inline-block; margin-bottom: 6rem; color: inherit; font-size: 2rem; font-weight: 750; text-decoration: none; letter-spacing: -.08em; }
.wordmark span { color: #c3f58b; }
.eyebrow { color: #c3f58b; font-size: .72rem; font-weight: 700; letter-spacing: .18em; }
h1 { max-width: 850px; font-size: clamp(2.6rem, 6vw, 4.8rem); font-weight: 550; line-height: 1.08; letter-spacing: -.055em; }
.intro { max-width: 34rem; color: #aebbb0; font-size: 1.1rem; line-height: 1.8; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1.5rem; margin-top: 2.5rem; }
button { display: flex; gap: 2rem; align-items: center; border: 0; border-radius: .4rem; padding: 1rem 1.3rem; background: #c3f58b; color: #172015; font: inherit; font-weight: 650; cursor: pointer; }
button:hover { background: #d4ffa6; }
button:focus-visible, a:focus-visible { outline: 3px solid #f1f3ec; outline-offset: 5px; }
button:disabled { opacity: .65; cursor: wait; }
#status { color: #aebbb0; font-size: .85rem; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-top: 7rem; border-top: 1px solid #354039; padding-top: 1.5rem; color: #809184; font-size: .65rem; letter-spacing: .12em; }
@media (max-width: 600px) { .wordmark { margin-bottom: 4rem; } footer { margin-top: 4rem; } }
`,
  'public/app.js': `const root = document.querySelector('#root');
if (!root) throw new Error('The application requires a div#root in index.html.');

root.innerHTML = \`
    <main>
      <a class="wordmark" href="/" aria-label="Arya home">arya<span>.</span></a>
      <p class="eyebrow">YOUR NEXT IDEA STARTS HERE</p>
      <h1>A clear beginning.<br>A world of possibilities.</h1>
      <p class="intro">Your Arya project is ready. Make something useful, thoughtful, and entirely yours.</p>
      <div class="actions">
        <button id="check-server" type="button">Check connection <span aria-hidden="true">↗</span></button>
        <p id="status" role="status" aria-live="polite">Ready when you are.</p>
      </div>
      <footer>BUILT WITH ARYA <span>01 / A FRESH START</span></footer>
    </main>
\`;

const button = root.querySelector('#check-server');
const status = root.querySelector('#status');

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Connecting…';
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('The server could not complete the request.');
    const result = await response.json();
    if (result.status !== 'ok') throw new Error('Unexpected server response.');
    status.textContent = 'Connected. Your Arya server is ready.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
`,
  '.gitignore': `.arya/
node_modules/
.env
.DS_Store
`
};

export const projectTemplates = ['web', 'api', 'cli', 'ui', 'desktop'] as const;
export type ProjectTemplate = typeof projectTemplates[number];
export interface CreateProjectOptions { template?: ProjectTemplate; compilerArchive?: string }

function archiveInfo(bytes: Uint8Array): { version: string; ui: boolean } {
  const tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 });
  let version: string | undefined, ui = false;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    if (!name) break;
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid compiler archive.');
    if (name === 'package/package.json') {
      const manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8')) as { name?: string; version?: string };
      if (manifest.name !== 'arya-language' || typeof manifest.version !== 'string') throw new Error('Archive must contain the arya-language npm package.');
      version = manifest.version;
    }
    if (name === 'package/dist/features.json') {
      const features = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8')) as { capabilities?: unknown };
      ui = Array.isArray(features.capabilities) && features.capabilities.includes('arya.ui.v1');
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!version) throw new Error('Compiler archive is missing package/package.json.');
  return { version, ui };
}

async function projectFiles(target: string, options: CreateProjectOptions): Promise<Record<string, string | Uint8Array>> {
  const template = options.template ?? 'web';
  if (!(projectTemplates as readonly string[]).includes(template)) throw new Error('Choose a project template: web, api, cli, ui, or desktop.');
  const ui = template === 'ui' || template === 'desktop';
  let dependency = ARYA_VERSION;
  const extra: Record<string, Uint8Array> = {};
  if (options.compilerArchive) {
    const filename = resolve(options.compilerArchive);
    if ((await stat(filename)).size > 32 * 1024 * 1024) throw new Error('Compiler archive exceeds 32 MiB.');
    const bytes = await readFile(filename);
    const info = archiveInfo(bytes);
    if (info.version !== ARYA_VERSION) throw new Error('Compiler archive version must match creator version ' + ARYA_VERSION + '.');
    if (ui && !info.ui) throw new Error('This archive does not include the UI runtime. Use a compiler archive with UI capability metadata.');
    const relative = 'vendor/arya-language-' + ARYA_VERSION + '.tgz';
    dependency = 'file:' + relative;
    extra[relative] = bytes;
  }
  const name = basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '').slice(0, 100) || 'arya-app';
  const manifest = {
    name, version: '0.0.0', private: true, type: 'module',
    scripts: {
      dev: ui ? 'npm run build && ' + (template === 'desktop' ? 'electron .' : 'node serve.mjs') : 'arya run main.arya',
      start: ui ? 'npm run dev' : 'arya run main.arya',
      check: 'arya check main.arya', build: 'arya build main.arya',
      ...(template === 'desktop' ? { web: 'npm run build && node serve.mjs' } : {})
    },
    ...(template === 'desktop' ? { main: 'desktop.cjs' } : {}),
    devDependencies: { 'arya-language': dependency, ...(template === 'desktop' ? { electron: '45.2.3' } : {}) }, engines: { node: '>=22.15' }
  };
  const source = template === 'api' ? `use std "web" as web

const port = number(args[0] or "3000")
const server = web.serve(port, {
  "GET /api/health": fn() { return {status: "ok", language: "Arya"} },
  "POST /api/echo": fn(request) { return {received: request.body} }
}, {html: false, assets: false})
server.on("listening", fn() { say("Arya API: http://127.0.0.1:" + str(server.address().port)) })
` : `fn greet(name) {
  return "Hello, " + name + "!"
}

const name = args[0] or "World"
say(greet(name))
`;
  const description = ui ? (template === 'desktop' ? 'Desktop GUI and web application' : 'Declarative web UI application') : template === 'web' ? 'Web application' : template === 'api' ? 'API server' : 'Command-line application';
  const readme = '# ' + name + '\n\n' + description + ' created with Arya ' + ARYA_VERSION + '.\n\n' +
    '    npm install\n    npm run dev\n\n' +
    'Use npm run check and npm run build to check or compile the application.\n' +
    (template === 'web' ? '\nindex.html contains the single div#root mount point. public/app.js renders the interface and data inside it; public/styles.css styles the app. main.arya defines server routes.\n\nOpen http://127.0.0.1:3000. Edit browser assets and refresh to see changes; restart after editing Arya source. This starter does not supply Vite or hot module replacement.\n' : '') +
    (template === 'api' ? '\nOpen http://127.0.0.1:3000/api/health. No HTML entry is needed for this API-only starter.\n' : '') +
    (ui ? '\nEdit main.arya to change components, state, animations, and API routes. serve.mjs starts the exported start(port) function. Restart npm run dev after editing. The UI library needs no frontend packages or bundler. Do not put secrets in page state: it is sent to the browser.\n' : '') +
    (template === 'ui' ? '\nOpen http://127.0.0.1:3000. The form calls the validated /api/estimate route.\n' : '') +
    (template === 'desktop' ? '\nnpm run dev opens an Electron window. npm run web opens the same application as a web server at http://127.0.0.1:3000. Electron downloads a platform binary during npm install. The renderer has no Node access; add privileged features through validated server routes. Closing the window stops the local server and quits. npm run build compiles Arya only; installers, signing, and updates need a separate distribution setup. Keep Electron updated before distributing.\n' : '') +
    '\nCompiler version is pinned in package.json. ' + (options.compilerArchive ? 'The compiler archive in vendor/ makes this project installable on another machine with Node/npm, without a registry release.\n' : 'This exact compiler version must be published to npm before npm install can retrieve it. For an unpublished preview, create the project with --compiler /path/to/arya-language-' + ARYA_VERSION + '.tgz to include a portable local dependency.\n');
  return {
    'package.json': JSON.stringify(manifest, null, 2) + '\n',
    ...(ui ? uiProjectFiles : template === 'web' ? webFiles : { 'main.arya': source }),
    ...(template === 'desktop' ? { 'desktop.cjs': desktopMain } : {}),
    'README.md': readme,
    ...(template === 'web' ? {} : { '.gitignore': '.arya/\nnode_modules/\n.env\n.DS_Store\n' }),
    ...extra
  };
}

/** Compatibility entry point for callers selecting the web template directly. */
export async function createWebProject(directory: string, options: Omit<CreateProjectOptions, 'template'> = {}): Promise<string[]> {
  return createProject(directory, { ...options, template: 'web' });
}

/** Publish a complete starter into a new or empty directory, without overwriting files. */
export async function createProject(directory: string, options: CreateProjectOptions = {}): Promise<string[]> {
  const target = resolve(directory);
  const files = await projectFiles(target, options);
  const inspect = async () => {
    try {
      const stat = await lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(target)).length !== 0) {
        throw new Error('Project destination must be a new or empty directory: ' + target);
      }
      return stat;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  };
  let original = await inspect();
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), '.' + basename(target) + '-arya-'));
  let reserved = false;
  const published: string[] = [];
  const directories: string[] = [];
  try {
    for (const [relative, source] of Object.entries(files)) {
      const filename = join(staging, relative);
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(filename, source, { flag: 'wx' });
    }
    // Reserve a new destination, then check its identity immediately before publication.
    if (!original) { await mkdir(target); reserved = true; original = await lstat(target); }
    const current = await inspect();
    if (!current || current.ino !== original.ino || current.dev !== original.dev) {
      throw new Error('Project destination changed during creation: ' + target);
    }
    // Keep existing directory identities intact, including a caller's working directory.
    // Exclusive links publish prepared files without ever replacing existing content.
    for (const relative of Object.keys(files)) {
      const parent = dirname(relative);
      if (parent !== '.' && !directories.includes(parent)) {
        await mkdir(join(target, parent));
        directories.push(parent);
      }
      await link(join(staging, relative), join(target, relative));
      published.push(relative);
    }
    return Object.keys(files);
  } catch (error) {
    for (const relative of published.reverse()) {
      try {
        const [expected, actual] = await Promise.all([lstat(join(staging, relative)), lstat(join(target, relative))]);
        if (expected.ino === actual.ino && expected.dev === actual.dev) await unlink(join(target, relative));
      } catch { /* Preserve files another process replaced. */ }
    }
    for (const directory of directories.reverse()) {
      try { await rmdir(join(target, directory)); } catch { /* Preserve unrelated content. */ }
    }
    if (reserved) {
      try { await rmdir(target); } catch { /* Never remove files added by another process. */ }
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
