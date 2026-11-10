import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { buildProject, writeProject } from '../src/project.js';
import { uiProjectFiles } from '../src/ui-project.js';

// Opt in with a local Chrome/Chromium executable; no browser download or user profile is used.
test('real browser runs the generated UI, validates forms, calls Arya routes, and respects CSP', {skip: !process.env.ARYA_TEST_BROWSER, timeout: 30000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya ui browser '));
  let cleanBrowser = async () => {};
  let cleanServer = async () => {};
  t.after(async () => { await cleanBrowser(); await cleanServer(); await rm(root, {recursive: true, force: true}); });
  const entry = join(root, 'main.arya');
  await writeFile(entry, uiProjectFiles['main.arya']!);
  const filename = await writeProject(await buildProject(entry));
  const {start, stop} = await import(pathToFileURL(filename).href);
  const server = start(0);
  cleanServer = () => stop(server);
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = join(root, 'chrome-profile'); await mkdir(profile);
  const child = spawn(process.env.ARYA_TEST_BROWSER!, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  const closed = new Promise(resolve => child.once('close', resolve));
  cleanBrowser = async () => { child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); try { await closed; } finally { clearTimeout(timer); } };
  const endpoint = await new Promise<string>((resolve, reject) => {
    let errors = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out: ' + errors.slice(-2000))), 10000);
    child.stderr.on('data', chunk => {
      errors += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(errors);
      if (match) { clearTimeout(timer); resolve(match[1]!); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited: ' + errors.slice(-2000))); });
  });
  const socket = new WebSocket(endpoint);
  t.after(() => socket.close());
  await once(socket, 'open');
  let nextId = 0;
  const waiting = new Map<number, (value: any) => void>();
  const exceptions: unknown[] = [], violations: unknown[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) waiting.get(message.id)?.(message);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params);
    if (message.method === 'Log.entryAdded' && /content security|refused to/i.test(message.params.entry.text)) violations.push(message.params.entry);
  });
  const send = (method: string, params = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('CDP timeout: ' + method)); }, 5000);
    waiting.set(id, message => { clearTimeout(timer); waiting.delete(id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const command = (method: string, params = {}) => send(method, params, sessionId);
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  const evaluate = async (expression: string) => {
    const result = await command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await command('Page.navigate', {url: origin + '/'});
  await evaluate(`new Promise(resolve => { const check = () => { if (document.querySelector('#hours')) resolve(true); else setTimeout(check, 10); }; check(); })`);
  assert.equal(await evaluate(`document.querySelector('#hours').value`), '12');
  assert.equal(await evaluate(`document.querySelector('#rate').value`), '40');
  await evaluate(`document.querySelector('#hours').value = '5'; document.querySelector('#hours').dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('button[type=submit]').click();`);
  await evaluate(`new Promise(resolve => { const check = () => { if (document.body.textContent.includes('Estimated total: $200.00')) resolve(true); else setTimeout(check, 10); }; check(); })`);
  assert.equal(await evaluate(`document.querySelector('button[type=submit]').disabled`), false);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Reset form').click()`);
  assert.equal(await evaluate(`document.querySelector('#hours').value`), '12');
  assert.equal(await evaluate(`document.body.textContent.includes('Enter your hours and rate to begin.')`), true);
  await evaluate(`document.querySelector('#hours').value = '-1'; document.querySelector('#hours').dispatchEvent(new Event('input')); document.querySelector('button[type=submit]').click();`);
  assert.equal(await evaluate(`document.querySelector('form').checkValidity()`), false);
  assert.equal(await evaluate(`document.body.textContent.includes('Estimated total:')`), false);
  const invalid = await fetch(origin + '/api/estimate', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{"hours":-1,"rate":40}'});
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).code, 'ARYA_VALIDATION');
  await command('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
  assert.equal(await evaluate(`document.getAnimations().length`), 0);
  assert.deepEqual(exceptions, []); assert.deepEqual(violations, []);
});
