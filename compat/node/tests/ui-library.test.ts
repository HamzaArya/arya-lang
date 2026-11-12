import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {compile} from '../src/compiler.js';
import {uiCatalog} from '../src/ui-catalog.js';
import {uiGuideExamples} from '../src/std/ui-preview.js';
import {buildProject, writeProject} from '../src/project.js';

async function library(t: {after(fn: () => Promise<unknown>): void}) {
  const root = await mkdtemp(join(tmpdir(), 'arya ui library '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const filename = join(root, 'library.mjs');
  await writeFile(filename, compile("use std \"ui\" as ui\nexport const tools = ui").code);
  return (await import(pathToFileURL(filename).href)).tools;
}

test('every exported UI API has one shared reference entry and guide examples compile', async t => {
  const ui = await library(t);
  const names = uiCatalog.map(([name]) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(Object.keys(ui).sort(), [...names].sort());
  for (const example of uiGuideExamples) {
    const source = example.code.includes('use std "ui" as ui') ? example.code : 'use std "ui" as ui\n' + example.code;
    assert.doesNotThrow(() => compile(source), example.title);
  }
});

test('composed components preserve labels, table structure, tab relationships, and safe code text', async t => {
  const ui = await library(t);
  const html = ui.page({state: {selected: 'team', notes: '</textarea> & hello', expanded: false, capacity: 35}, body: [
    ui.field('Workspace', ui.select([{value: 'personal', label: 'Personal'}, {value: 'team', label: 'Team'}], {id: 'workspace', bind: 'selected'}), {hint: 'Choose a workspace.'}),
    ui.textarea({id: 'notes', bind: 'notes'}), ui.slider({id: 'capacity', bind: 'capacity'}),
    ui.when(ui.is('selected', 'team'), ui.text('Team controls'), {id: 'team-controls'}),
    ui.when('expanded', ui.text('Details'), {id: 'details'}),
    ui.table([{key: 'name', label: 'Name'}], [{name: '<danger>'}], {caption: 'People'}),
    ui.tabs([{id: 'first', label: 'First', body: 'One'}, {id: 'second', label: 'Second', body: 'Two'}], {id: 'settings'}),
    ui.dialog('confirm', 'Confirm', [ui.text('Continue?')], {description: 'One more step.'}),
    ui.code('const html = "</script><script>bad()</script>"', {id: 'safe-source'})
  ]});
  assert.match(html, /aria-describedby="workspace-hint"/);
  assert.match(html, /<option value="team" selected>Team<\/option>/);
  assert.match(html, /&lt;\/textarea&gt; &amp; hello<\/textarea>/);
  assert.match(html, /id="team-controls"[^>]*data-arya-bind/);
  assert.match(html, /id="details" hidden/);
  assert.match(html, /<caption>People<\/caption>/);
  assert.match(html, /<th scope="col">Name<\/th>/);
  assert.match(html, /&lt;danger&gt;/);
  assert.match(html, /id="settings-tab-first"[^>]*aria-selected="true"[^>]*aria-controls="settings-panel-first"/);
  assert.match(html, /id="settings-panel-second"[^>]*hidden/);
  assert.match(html, /<dialog[^>]*aria-labelledby="confirm-title"[^>]*aria-describedby="confirm-description"/);
  assert.match(html, /arya-code-keyword/);
  assert.ok(!html.includes('</script><script>bad()'));
});

test('motion descriptors validate timing, custom frames, targets, and awaited infinite actions', async t => {
  const ui = await library(t);
  assert.equal(ui.presets().length, 16);
  for (const preset of ui.presets()) assert.doesNotThrow(() => ui.motion(preset));
  const loop = ui.motion('spin', {repeat: 'infinite', duration: 1000, direction: 'alternate', fill: 'both', trigger: 'visible', stagger: 80});
  assert.equal(ui.animate('sample', loop).wait, false);
  assert.throws(() => ui.animate('sample', loop, {wait: true}), /wait:false/);
  for (const options of [{duration: -1}, {duration: 0, repeat: 'infinite'}, {repeat: 101}, {easing: 'arbitrary()'}, {direction: 'left'}, {fill: 'persist'}, {trigger: 'unsafe'}, {stagger: 60001}]) assert.throws(() => ui.motion('fade', options), (error: any) => error.code === 'ARYA_UI');
  const frames = ui.keyframes([{opacity: 0, transform: 'translateY(20px)'}, {opacity: 1, transform: 'translateY(0)'}]);
  assert.equal(frames.frames.length, 2);
  for (const value of [[], [{opacity: 0}], [{opacity: -1}, {opacity: 1}], [{transform: 'url(https://example.com)'}, {transform: 'none'}], [{left: '2px'}, {left: '0'}], [{offset: .8}, {offset: .2}]]) assert.throws(() => ui.keyframes(value));
  assert.throws(() => ui.animate('#sample', 'rise'), /without #/);
  assert.throws(() => ui.animate('sample', {}), /animation expects/);
  assert.throws(() => ui.parallel([() => {}]), /ui action/);
});

test('component validation explains malformed configurations before serving HTML', async t => {
  const ui = await library(t);
  for (const make of [
    () => ui.badge('Value', {tone: 'unknown'}), () => ui.field('Name', ui.input({})),
    () => ui.tabs([], {id: 'tabs'}), () => ui.tabs([{id: 'one', label: 'One', body: 'One', disabled: true}], {id: 'tabs'}),
    () => ui.tabs([{id: 'one'}, {id: 'one'}], {id: 'tabs'}), () => ui.accordion([], {multiple: false}),
    () => ui.skeleton({lines: 0}), () => ui.progress(10, {max: 0}), () => ui.table([], []),
    () => ui.toast('Notice', {duration: -1}), () => ui.theme('other'), () => ui.is('name', {}),
    () => ui.preview({section: 'other'}), () => ui.preview({basePath: '//remote.test'}),
  ]) assert.throws(make, (error: any) => error.code === 'ARYA_UI');
  assert.throws(() => ui.page({body: ui.select([], {bind: 'values', multiple: true})}), /one selected value/);
  assert.throws(() => ui.page({state: {password: 'never-render-this'}, body: ui.input({type: 'password', bind: 'password'})}), /start empty/);
  assert.doesNotThrow(() => ui.page({state: {password: ''}, body: ui.input({type: 'password', bind: 'password'})}));
});

test('built-in component, motion, and implementation pages render without remote assets', async t => {
  const ui = await library(t);
  for (const section of ['components', 'sections', 'templates', 'motion', 'guide']) {
    const html = ui.preview({section, basePath: '/kit', ...(section === 'components' ? {apiPath: '/api/preview'} : {})});
    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('href="/kit/motion"'));
    assert.ok(html.includes('href="/kit/guide"'));
    assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html));
    assert.ok(!html.includes('innerHTML'));
    if (section === 'components') { assert.match(html, /data-arya-action="[^>]+\/api\/preview/); assert.match(html, /Preview save/); }
    if (section === 'motion') for (const name of ui.presets()) assert.ok(html.includes('id="motion-' + name + '"'));
    if (section === 'guide') { assert.match(html, /The complete API at a glance/); assert.match(html, /aria-label="Guide sections"/); }
  }
});

test('the checked-in preview serves all pages and a validated JSON form endpoint', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya library server '));
  let stopServer = async () => {};
  t.after(async () => { await stopServer(); await rm(root, {recursive: true, force: true}); });
  const filename = join(root, 'main.arya');
  await writeFile(filename, await readFile('fixtures/examples/ui-library/main.arya', 'utf8'));
  const {start, stop} = await import(pathToFileURL(await writeProject(await buildProject(filename))).href);
  const server = start(0); stopServer = () => stop(server); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/', '/sections', '/templates', '/motion', '/guide']) { const response = await fetch(origin + path); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(await response.text(), /Arya UI/); }
  for (const name of ['landing', 'dashboard', 'settings', 'sign-in']) { const response = await fetch(origin + '/templates/' + name); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(await response.text(), /Northstar/); }
  const post = (body: unknown) => fetch(origin + '/api/preview', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  const result = await post({name: 'Arya', email: 'arya@example.com', plan: 'team', updates: true});
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), {message: 'Preview saved for Arya.', plan: 'team'});
  assert.equal((await post({name: 'Arya', email: 'bad', plan: 'team', updates: true})).status, 400);
  assert.equal((await post({name: '', email: 'bad', plan: 'other', updates: 'unsafe'})).status, 400);
});
