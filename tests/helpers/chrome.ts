import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

/** Headless integration fixture with a fresh profile, bounded commands, and deterministic cleanup. */
export async function chrome(t: {after(fn: () => Promise<unknown> | unknown): void}, origin: string) {
  const profile = await mkdtemp(join(tmpdir(), 'arya gallery chrome '));
  let socket: WebSocket | undefined;
  const child = spawn(process.env.ARYA_TEST_BROWSER!, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  const closed = new Promise(resolve => child.once('close', resolve));
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    socket?.close(); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(timer); await rm(profile, {recursive: true, force: true}); }
  })();
  t.after(close);
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out: ' + output.slice(-2000))), 10000);
    child.stderr.on('data', chunk => { output += chunk; const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited: ' + output.slice(-2000))); });
  });
  socket = new WebSocket(endpoint); await once(socket, 'open');
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
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('CDP timeout: ' + method)); }, 8000);
    waiting.set(id, message => { clearTimeout(timer); waiting.delete(id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket!.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const command = (method: string, params = {}) => send(method, params, sessionId);
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
  const evaluate = async (expression: string) => {
    const response = await command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const until = async (expression: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('Boolean(' + expression + ')')) return;
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    throw new Error('Browser condition timed out: ' + expression);
  };
  const navigate = async (path: string) => {
    await command('Page.navigate', {url: origin + path});
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if (await evaluate('location.href === ' + JSON.stringify(origin + path) + ' && document.readyState === "complete"')) return; }
      catch (error) { if (!/context|navigat/i.test(String(error))) throw error; }
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    throw new Error('Navigation timed out: ' + path);
  };
  const screenshot = async (filename: string) => {
    const result = await command('Page.captureScreenshot', {format: 'png'});
    await writeFile(filename, Buffer.from(result.data, 'base64'));
  };
  return {command, evaluate, until, navigate, screenshot, exceptions, violations, close};
}
