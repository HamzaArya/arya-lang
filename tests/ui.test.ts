import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { compile } from '../src/compiler.js';
import { analyze } from '../src/language-service.js';
import { standardCompletions } from '../src/standard-completions.js';
import { uiClient } from '../src/ui-client.js';

async function library(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya ui '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, 'ui.mjs');
  await writeFile(filename, compile('use std "ui" as ui\nexport keep tools = ui').code);
  return (await import(pathToFileURL(filename).href)).tools;
}

test('UI components render escaped HTML, initial state, semantic controls, and a nonce policy', async t => {
  const ui = await library(t);
  const html = ui.page({
    title: '<Arya>', state: {count: 0, enabled: false, name: '</script><script>bad()</script>'},
    body: ui.card([
      ui.heading('Hello <world>'), ui.label('Name', 'name'),
      ui.input({id: 'name', bind: 'name', required: true}),
      ui.text(ui.bind('count', 99)),
      ui.button('Add', {action: ui.increment('count'), 'aria-expanded': false}),
      ui.text(ui.bind('missing', 'No result yet'))
    ], {animate: ui.motion('rise', {duration: 300})})
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>&lt;Arya&gt;<\/title>/);
  assert.match(html, /Hello &lt;world&gt;/);
  assert.match(html, /<label for="name">Name<\/label>/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /data-arya-text="[^"]+">0<\/span>/);
  assert.match(html, /No result yet/);
  assert.ok(!html.includes('</script><script>bad()'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  const nonce = /<style nonce="([^"]+)"/.exec(html)![1];
  assert.ok(html.includes('script-src &#39;nonce-' + nonce));
  assert.match(html, /data-arya-motion/);
  assert.match(html, /prefers-reduced-motion/);
  assert.ok(!html.includes('innerHTML'));
});

test('UI rejects executable attributes, invalid actions, unsafe state, and malformed components', async t => {
  const ui = await library(t);
  const page = (body: any) => ui.page({body});
  for (const [tag, props] of [
    ['button', {onclick: 'alert(1)'}], ['div', {style: 'color:red'}],
    ['a', {href: 'javascript:alert(1)'}], ['img', {src: 'data:text/html,evil'}],
    ['a', {href: 'java\tscript:alert(1)'}], ['div', {'data-arya-action': '{}'}],
    ['button', {action: () => 42}], ['input', {bind: 'name', value: 'conflict'}],
    ['input', {bind: 'file', type: 'file'}], ['div', {id: 'arya-ui-state'}],
  ] as const) assert.throws(() => page(ui.element(tag, props)), (error: any) => error.code === 'ARYA_UI');
  assert.throws(() => ui.element('script', {}, 'bad()'), /unsupported/);
  assert.throws(() => page([ui.input({id: 'same'}), ui.input({id: 'same'})]), /unique/);
  assert.throws(() => page(ui.element('input', {}, 'invalid')), /void element/);
  assert.throws(() => page(ui.text({arbitrary: 'object'})), /children/);
  assert.throws(() => ui.page({css: '</StYle><script>bad()</script>'}), /closing style/);
  assert.throws(() => ui.page({state: {value: Infinity}}), /JSON/);
  assert.throws(() => ui.page({state: {secret: () => 42}}), /JSON/);
  const cycle: any = {}; cycle.self = cycle;
  assert.throws(() => ui.page({state: cycle}), /cycles/);
  assert.throws(() => ui.page({state: {large: '😀'.repeat(300000)}}), /1 MiB/);
  assert.throws(() => ui.page({state: {sparse: new Array(10001)}}), /10000/);
  assert.throws(() => ui.page({state: JSON.parse('{"__proto__": {"polluted":true}}')}), /unsafe/);
  assert.throws(() => ui.bind('constructor.prototype'), /state keys/);
  assert.throws(() => ui.bind('foo', Infinity), /fallback/);
  assert.throws(() => ui.motion('unknown'), /preset/);
  assert.throws(() => ui.motion('fade', {repeat: Infinity}), /repeat/);
  assert.throws(() => ui.increment('count', NaN), /finite/);
  for (const path of ['https://other.test/api', '//other.test/api', '/\\other.test/api', '/api\nreport']) assert.throws(() => ui.request(path), /same-origin/);
  assert.throws(() => ui.request('/api', {body: {value: 1}}), /GET/);
  assert.throws(() => ui.request('/api', {result: 'same', pending: 'same'}), /different/);
  let getter = false;
  assert.throws(() => ui.page({state: {get dangerous() { getter = true; return 1; }}}), /unsafe/);
  assert.equal(getter, false);
});

class Element {
  dataset: Record<string, string>;
  listeners: Record<string, (event: any) => Promise<void> | void> = {};
  textContent = ''; value = ''; type = 'text'; checked = false; disabled = false; hidden = false;
  attributes: Record<string, string> = {};
  constructor(readonly tagName: string, data: Record<string, unknown> = {}) {
    this.dataset = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  }
  addEventListener(name: string, callback: (event: any) => Promise<void> | void) { this.listeners[name] = callback; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  async fire(name: string) { await this.listeners[name]!({preventDefault() {}}); }
}
function browser(state: unknown, elements: Element[], fetch: (...args: any[]) => any, reduced = true) {
  const error = new Element('DIV');
  let motionChange: (() => void) | undefined;
  const media = {matches: reduced, addEventListener: (_: string, fn: () => void) => { motionChange = fn; }};
  runInNewContext(uiClient, {
    document: {
      getElementById: (id: string) => id === 'arya-ui-state' ? {textContent: JSON.stringify({state})} : error,
      querySelectorAll: (selector: string) => elements.filter(element => Object.hasOwn(element.dataset, selector.replace(/^\[data-arya-/, 'arya-').replace(/\]$/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase())))
    }, fetch, AbortController, setTimeout, clearTimeout, matchMedia: () => media
  });
  return { error, reduce: () => { media.matches = true; motionChange?.(); } };
}

test('browser state updates, two-way controls, boolean attributes, and actions require no evaluation', async t => {
  const ui = await library(t);
  const output = new Element('SPAN', {aryaText: {key: 'count', fallback: 99}});
  const increment = new Element('BUTTON', {aryaAction: ui.increment('count', 2)});
  const input = new Element('INPUT', {aryaModel: 'count', aryaBind: {value: {key: 'count', fallback: ''}}}); input.type = 'number';
  const toggle = new Element('BUTTON', {aryaAction: ui.toggle('hidden')});
  const panel = new Element('P', {aryaBind: {hidden: {key: 'hidden', fallback: false}, 'aria-hidden': {key: 'hidden', fallback: false}}});
  const reset = new Element('BUTTON', {aryaAction: [ui.set('count', 0), ui.set('hidden', false)]});
  browser({count: 0, hidden: false}, [output, increment, input, toggle, panel, reset], () => { throw new Error('must not fetch'); });
  assert.equal(output.textContent, '0');
  assert.equal(input.value, '0');
  await increment.fire('click'); assert.equal(output.textContent, '2');
  input.value = '12'; await input.fire('input'); assert.equal(output.textContent, '12');
  await toggle.fire('click'); assert.equal(panel.hidden, true); assert.equal(panel.attributes['aria-hidden'], 'true');
  await reset.fire('click'); assert.equal(output.textContent, '0'); assert.equal(panel.hidden, false);
  assert.equal(increment.disabled, false);
});

test('browser requests resolve form data and reset pending state on success, HTTP failure, and timeout', async t => {
  const ui = await library(t);
  const request = ui.request('/api/estimate', {method: 'POST', body: {hours: ui.bind('hours')}, result: 'result', pending: 'busy', error: 'problem', timeoutMs: 20});
  const form = new Element('FORM', {aryaAction: request});
  const result = new Element('SPAN', {aryaText: {key: 'result.message', fallback: ''}});
  const problem = new Element('SPAN', {aryaText: {key: 'problem', fallback: ''}});
  const submit = new Element('BUTTON', {aryaBind: {disabled: {key: 'busy', fallback: false}}});
  let mode = 'ok', calls = 0;
  browser({hours: 12, busy: false}, [form, result, problem, submit], async (path, options) => {
    calls++;
    assert.equal(path, '/api/estimate'); assert.equal(options.body, '{"hours":12}');
    assert.equal(options.redirect, 'error'); assert.equal(submit.disabled, true);
    if (mode === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return {ok: mode !== 'fail', status: mode === 'fail' ? 400 : 200, json: async () => { if (mode === 'json') throw new Error('Invalid JSON.'); return {message: '<safe text>'}; }};
  });
  const first = form.fire('submit'); await form.fire('submit'); await first;
  assert.equal(calls, 1, 'repeated submissions on the same form are suppressed');
  assert.equal(result.textContent, '<safe text>'); assert.equal(submit.disabled, false);
  mode = 'fail'; await form.fire('submit'); assert.match(problem.textContent, /HTTP 400/); assert.equal(submit.disabled, false);
  mode = 'json'; await form.fire('submit'); assert.match(problem.textContent, /Invalid JSON/); assert.equal(submit.disabled, false);
  mode = 'timeout'; await form.fire('submit'); assert.match(problem.textContent, /timed out/); assert.equal(submit.disabled, false);
});

test('motion honors initial and changed reduced-motion preferences', () => {
  const element = new Element('DIV', {aryaMotion: {preset: 'rise', duration: 300, delay: 20, repeat: 2}});
  let calls = 0, cancelled = false;
  Object.assign(element, {animate: (frames: unknown[], options: any) => {
    calls++; assert.equal(frames.length, 2); assert.equal(options.duration, 300); assert.equal(options.iterations, 2);
    return {finished: new Promise(() => {}), cancel: () => { cancelled = true; }};
  }});
  browser({}, [element], () => {}, true); assert.equal(calls, 0);
  const context = browser({}, [element], () => {}, false); assert.equal(calls, 1);
  context.reduce(); assert.equal(cancelled, true);
});

test('UI checking remains passive, editor hints describe APIs, and native gets a profile diagnostic', () => {
  const source = 'use std "ui" as ui\nkeep page = ui.page({state: {notExecuted: missingPackage()}})';
  assert.throws(() => compile(source), /missingPackage/);
  assert.doesNotThrow(() => compile('use std "ui" as ui\nui.page({state: {bad: Infinity}})'.replace('Infinity', '1 / 0')));
  const prefix = 'use std "ui" as ui\nui.';
  const labels = standardCompletions(prefix, prefix.length).map(item => item.label);
  for (const label of ['page', 'input', 'request', 'motion', 'bind']) assert.ok(labels.includes(label));
  assert.ok(analyze('use std "ui" as ui', 'file:///main.arya', {target: 'native'}).diagnostics.some(item => item.code === 'ARYA_NATIVE_UNSUPPORTED'));
});
