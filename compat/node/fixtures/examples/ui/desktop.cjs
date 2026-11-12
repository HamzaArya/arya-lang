const { app, BrowserWindow } = require('electron');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

let server;
let window;
let shutdown;
let quitting = false;
async function stop() {
  if (!server) return;
  const closing = server;
  server = undefined;
  await shutdown(closing);
}
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  stop().catch(console.error).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
app.whenReady().then(async () => {
  const backend = await import(pathToFileURL(join(__dirname, '.arya/build/main.arya.mjs')).href);
  const { start } = backend;
  shutdown = backend.stop;
  if (quitting) return;
  server = start(0);
  await once(server, 'listening');
  if (quitting) { await stop(); return; }
  const origin = 'http://127.0.0.1:' + server.address().port;
  window = new BrowserWindow({
    width: 1120, height: 800, minWidth: 420, minHeight: 480,
    title: 'Arya Studio', backgroundColor: '#101416', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false }
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const eventName of ['will-navigate', 'will-redirect']) {
    contents.on(eventName, (event, url) => {
      try { if (new URL(url).origin === origin) return; } catch {}
      event.preventDefault();
    });
  }
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = undefined; });
  await window.loadURL(origin + '/');
}).catch(async error => {
  console.error(error);
  process.exitCode = 1;
  try { await stop(); } finally { app.quit(); }
});
