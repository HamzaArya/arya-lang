import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProject, writeProject } from '../src/project.js';
import { desktopMain, uiProjectFiles } from '../src/ui-project.js';

const execute = promisify(execFile);
test('Electron desktop runs the Arya form, isolates the renderer, blocks navigation, and closes its server', {skip: !process.env.ARYA_TEST_ELECTRON, timeout: 30000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya desktop '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const entry = join(root, 'main.arya');
  await writeFile(entry, uiProjectFiles['main.arya']!);
  await writeProject(await buildProject(entry));
  await writeFile(join(root, 'desktop.cjs'), desktopMain);
  await writeFile(join(root, 'smoke.cjs'), `
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {app, BrowserWindow} = require('electron');
app.setPath('userData', ${JSON.stringify(join(root, 'profile'))});
app.on('browser-window-created', (_event, window) => {
  window.show = () => {};
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once('did-finish-load', async () => {
    try {
      const origin = new URL(window.webContents.getURL()).origin;
      const preferences = window.webContents.getLastWebPreferences();
      assert.equal(preferences.nodeIntegration, false);
      assert.equal(preferences.contextIsolation, true);
      assert.equal(preferences.sandbox, true);
      assert.deepEqual(await window.webContents.executeJavaScript('[typeof require, typeof process]'), ['undefined', 'undefined']);
      await window.webContents.executeJavaScript('document.querySelector("button[type=submit]").click()');
      await window.webContents.executeJavaScript('new Promise(resolve => { const check = () => { if (document.body.textContent.includes("Estimated total: $480.00")) resolve(true); else setTimeout(check, 10); }; check(); })');
      await window.webContents.executeJavaScript('window.open("https://example.com"); location.href = "https://example.com";');
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(new URL(window.webContents.getURL()).origin, origin);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      assert.equal(await window.webContents.executeJavaScript('document.querySelector("[role=status]").textContent'), 'Estimated total: $480.00');
      await window.webContents.executeJavaScript('Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
      if (process.env.ARYA_UI_SCREENSHOT) await fs.writeFile(process.env.ARYA_UI_SCREENSHOT, (await window.capturePage()).toPNG());
      console.log('ARYA_DESKTOP_SMOKE ' + JSON.stringify({origin, result: 'Estimated total: $480.00'}));
      window.close();
    } catch (error) { console.error(error); process.exitCode = 1; app.quit(); }
  });
});
require('./desktop.cjs');
`);
  const result = await execute(resolve(process.env.ARYA_TEST_ELECTRON!), [join(root, 'smoke.cjs')], {
    timeout: 25000, maxBuffer: 1024 * 1024,
    env: {...process.env, ELECTRON_RUN_AS_NODE: undefined}
  });
  const match = /ARYA_DESKTOP_SMOKE (\{[^\n]+\})/.exec(result.stdout);
  assert.ok(match, result.stdout + result.stderr);
  const report = JSON.parse(match[1]!);
  assert.equal(report.result, 'Estimated total: $480.00');
  await assert.rejects(fetch(report.origin, {signal: AbortSignal.timeout(2000)}), /fetch failed/);
});
