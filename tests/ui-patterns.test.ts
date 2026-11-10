import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../src/compiler.js';
import {standardCompletions} from '../src/language-service.js';
import {uiPatternExamples} from '../src/std/ui-pattern-preview.js';

async function library(t: {after(fn: () => Promise<unknown>): void}) {
  const root = await mkdtemp(join(tmpdir(), 'arya ui patterns '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const filename = join(root, 'library.mjs');
  await writeFile(filename, compile('use std "ui" as ui\nexport keep tools = ui').code);
  return {ui: (await import(pathToFileURL(filename).href)).tools, root};
}

test('new components render native semantics, labels, measurements, and escaped content', async t => {
  const {ui} = await library(t);
  const html = ui.page({state: {plan: 'team', query: 'a < b', capacity: 65}, body: [
    ui.container(ui.buttonGroup([ui.button('Save')], {label: 'Editor actions'}), {size: 'sm'}),
    ui.image('/photo.png', '<portrait>', {caption: 'A <caption>', width: 640, height: 480}),
    ui.descriptionList([{term: '<Name>', detail: 'Samira'}]),
    ui.timeline([{title: 'Created', time: 'Today', body: '<script>bad()</script>'}]),
    ui.steps([{title: 'Start'}, {title: 'Finish'}], {current: 1}),
    ui.pagination([{label: 'Previous', href: '?page=1', disabled: true}, {label: '2', href: '?page=2', current: true}]),
    ui.segmented([{value: 'personal', label: 'Personal'}, {value: 'team', label: 'Team'}], {id: 'plan-options', bind: 'plan', label: 'Plan'}),
    ui.search({id: 'search-projects', bind: 'query', label: 'Find projects'}),
    ui.meter(ui.bind('capacity'), {label: 'Storage', high: 80}),
  ]});
  assert.match(html, /<figure class="arya-image"><img[^>]*alt="&lt;portrait&gt;"/);
  assert.match(html, /<figcaption[^>]*>A &lt;caption&gt;/);
  assert.match(html, /<dl[^>]*>.*<dt>&lt;Name&gt;<\/dt><dd>Samira<\/dd>/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /<span aria-disabled="true">Previous<\/span>/);
  assert.match(html, /<a(?=[^>]*href="\?page=2")(?=[^>]*aria-current="page")[^>]*>/);
  assert.match(html, /<legend class="arya-sr-only">Plan<\/legend>/);
  assert.match(html, /id="plan-options-1"[^>]*checked/);
  assert.match(html, /<label for="search-projects">Find projects<\/label>/);
  assert.match(html, /type="search"[^>]*value="a &lt; b"/);
  assert.match(html, /<meter[^>]*value="65"[^>]*aria-label="Storage"/);
  assert.ok(!html.includes('<script>bad()</script>'));
});

test('section compositions preserve navigation, heading hierarchy, quotes, and disclosure semantics', async t => {
  const {ui} = await library(t);
  const html = ui.page({body: [
    ui.navbar({brand: '<Brand>', links: [{label: 'Here', href: '#here', current: true}]}),
    ui.hero({title: 'Hello', media: ui.stat('Open', 12)}),
    ui.features([{title: 'Feature', description: '<description>', icon: '01'}], {title: 'Features'}),
    ui.pricing([{title: 'Team', price: '$19', features: ['Useful'], highlighted: true, action: ui.link('Choose', '/checkout')}]),
    ui.testimonials([{name: 'Samira', quote: '<quoted>', role: 'Example'}]),
    ui.faq([{question: 'Question?', answer: 'Answer', open: true}], {id: 'questions'}),
    ui.cta({title: 'Begin', actions: [ui.button('Start')]}), ui.footer({brand: 'Brand', copyright: '2026'}),
  ]});
  assert.match(html, /&lt;Brand&gt;<\/a>/);
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<h2>Features<\/h2>/);
  assert.match(html, /<h3>Feature<\/h3>/);
  assert.match(html, /<blockquote>&lt;quoted&gt;<\/blockquote>/);
  assert.match(html, /<details open><summary>Question\?<\/summary>/);
  assert.match(html, /arya-highlighted/);
  assert.match(html, /<footer/);
});

test('invalid pattern configurations and unsafe URLs fail through the UI contract', async t => {
  const {ui} = await library(t);
  for (const make of [
    () => ui.container([], {size: 'giant'}), () => ui.image('/x', undefined),
    () => ui.image('/x', '', {width: -1}), () => ui.steps([], {}),
    () => ui.steps([{title: 'One'}], {current: 1}),
    () => ui.segmented([{value: 'same'}, {value: 'same'}], {id: 'group', bind: 'plan'}),
    () => ui.segmented([], {id: 'group', bind: 'plan'}),
    () => ui.pagination([{label: '1', href: '/', current: true}, {label: '2', href: '/', current: true}]),
    () => ui.meter(5, {min: 10, max: 0}), () => ui.meter(101),
    () => ui.meter(5, {low: 80, high: 20}), () => ui.hero({align: 'sideways', title: 'Hi'}),
    () => ui.page({body: ui.image('javascript:alert(1)', '')}),
    () => ui.page({body: ui.navbar({links: [{label: 'Unsafe', href: 'javascript:alert(1)'}]})}),
  ]) assert.throws(make, (error: any) => error.code === 'ARYA_UI');
});

test('all full-page templates render customizable escaped content and isolated initial state', async t => {
  const {ui} = await library(t);
  assert.deepEqual(ui.templates(), ['landing', 'dashboard', 'settings', 'sign-in']);
  ui.templates().pop(); assert.equal(ui.templates().length, 4);
  for (const name of ui.templates()) {
    const html = ui.template(name, {brand: '<My brand>', title: 'Custom title', theme: 'light', body: ui.text('Extra content')});
    assert.match(html, /^<!doctype html>/); assert.match(html, /<title>Custom title<\/title>/);
    assert.match(html, /&lt;My brand&gt;/); assert.match(html, /Extra content/);
    assert.match(html, /data-theme="light"/);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.ok(!/<(?:script|link)[^>]+(?:src|href)=/.test(html));
  }
  const settings = ui.template('settings', {state: {name: 'Samira', email: 'samira@example.com'}});
  assert.match(settings, /value="Samira"/); assert.match(settings, /Preview only/);
  assert.ok(!ui.template('settings').includes('samira@example.com'));
  const dashboard = ui.template('dashboard', {metrics: [{label: 'Open tickets', value: 7}], rows: []});
  assert.match(dashboard, /Open tickets/); assert.match(dashboard, /No records yet/);
  const signin = ui.template('sign-in', {submitAction: ui.request('/api/session', {method: 'POST', body: {email: ui.bind('email'), password: ui.bind('password')}, result: 'result', error: 'problem'})});
  assert.match(signin, /\/api\/session/); assert.match(signin, /autocomplete="current-password"/);
  for (const make of [() => ui.template('other'), () => ui.template('landing', {unknown: 1}), () => ui.template('settings', {state: []}), () => ui.template('sign-in', {state: {password: 'secret'}}), () => ui.template('sign-in', {submitAction: () => {}})]) assert.throws(make, (error: any) => error.code === 'ARYA_UI');
});

test('every copyable pattern example compiles and renders as real Arya', async t => {
  const {root} = await library(t);
  for (const item of uiPatternExamples) {
    const source = 'use std "ui" as ui\nexport keep html = ui.page({state: {plan: "personal", query: "", capacity: 65}, body: ' + item.code + '})';
    const filename = join(root, item.id + '.mjs');
    await writeFile(filename, compile(source).code);
    assert.match((await import(pathToFileURL(filename).href)).html, /^<!doctype html>/, item.title);
  }
  const prefix = 'use std "ui" as ui\nui.';
  const names = standardCompletions(prefix, prefix.length).map(item => item.label);
  for (const name of ['hero', 'pricing', 'navbar', 'segmented', 'template', 'templates']) assert.ok(names.includes(name), name);
});

test('sections and template galleries support mounted paths and selectable source examples', async t => {
  const {ui} = await library(t);
  const sections = ui.preview({section: 'sections', basePath: '/library'});
  const templates = ui.preview({section: 'templates', basePath: '/library'});
  assert.match(sections, /Page sections/);
  for (const item of uiPatternExamples.filter(item => item.group === 'sections')) assert.ok(sections.includes('id="' + item.id + '-source"'));
  for (const name of ui.templates()) assert.ok(templates.includes('href="/library/templates/' + name + '"'));
  assert.match(templates, /ui\.template/);
});
