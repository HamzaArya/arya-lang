/** Shared Arya UI starter: the same routes and components run in a browser or desktop window. */
export const uiProjectFiles: Readonly<Record<string, string>> = {
  'main.arya': `use std "web" as web
use std "ui" as ui
use std "validate" as validate

const estimateSchema = validate.object({
  hours: validate.number({min: 0, max: 10000}),
  rate: validate.number({min: 0, max: 1000000})
})

fn page() {
  return ui.page({
    title: "Arya Studio",
    state: {hours: 12, rate: 40, result: null, busy: false, problem: ""},
    body: ui.stack([
      ui.text("MADE WITH ARYA", {class: "arya-eyebrow"}),
      ui.heading("Turn an idea into something useful."),
      ui.text("One Arya interface. A web app or a desktop window.", {class: "arya-muted"}),
      ui.grid([
        ui.card([
          ui.heading("Project estimate", {level: 2}),
          ui.form([
            ui.label("Hours of work", "hours"),
            ui.input({id: "hours", type: "number", min: 0, max: 10000, step: 0.5, required: true, bind: "hours"}),
            ui.label("Hourly rate (USD)", "rate"),
            ui.input({id: "rate", type: "number", min: 0, max: 1000000, step: 0.01, required: true, bind: "rate"}),
            ui.button("Calculate estimate", {type: "submit", disabled: ui.bind("busy", false)})
          ], {action: ui.request("/api/estimate", {
            method: "POST",
            body: {hours: ui.bind("hours"), rate: ui.bind("rate")},
            result: "result", pending: "busy", error: "problem"
          })})
        ], {animate: "rise"}),
        ui.card([
          ui.heading("Your estimate", {level: 2}),
          ui.text(ui.bind("result.message", "Enter your hours and rate to begin."), {role: "status", "aria-live": "polite"}),
          ui.text(ui.bind("problem"), {role: "alert"}),
          ui.text("Adjust the hours or rate to compare project estimates. Reset the form to start again.", {class: "arya-muted"}),
          ui.button("Reset form", {variant: "secondary", action: [ui.set("hours", 12), ui.set("rate", 40), ui.set("result", null), ui.set("problem", "")], disabled: ui.bind("busy", false)})
        ], {animate: ui.motion("rise", {delay: 120, duration: 500})})
      ])
    ])
  })
}

export fn start(port) {
  return web.serve(port, {
    "GET /": fn() { return web.response(200, page(), {"cache-control": "no-store"}) },
    "POST /api/estimate": web.route(fn(request) {
      const total = request.body.hours * request.body.rate
      return {total: total, message: "Estimated total: $" + total.toFixed(2)}
    }, {body: estimateSchema})
  }, {html: false, assets: false})
}

export async fn stop(server) {
  await web.shutdown(server, {timeoutMs: 5000})
}
`,
  'serve.mjs': `import { once } from 'node:events';
import { start, stop } from './.arya/build/main.arya.mjs';

const port = Number(process.argv[2] ?? 3000);
const server = start(port);
await once(server, 'listening');
console.log('Arya UI: http://127.0.0.1:' + server.address().port);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => stop(server).catch(error => { console.error(error); process.exitCode = 1; }));
}
`,
  '.gitignore': '.arya/\nnode_modules/\n.env\n.DS_Store\n'
};

export const desktopMain = `const { app, BrowserWindow } = require('electron');
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
`;
