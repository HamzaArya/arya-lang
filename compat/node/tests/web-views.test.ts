import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { SourceMap } from 'node:module';
import { compile, analyzeSource, AryaError, tokenize } from '../src/compiler.js';
import { analyze, definitionAt } from '../src/language-service.js';

const execute = promisify(execFile);
async function run(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'arya-web-view-'));
  try {
    const output = join(root, 'main.mjs');
    await writeFile(output, compile(source, join(root, 'main.arya')).code);
    return (await execute(process.execPath, [output], { cwd: root, timeout: 10_000 })).stdout.trimEnd();
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('views build HTML documents with shorthand classes, text, attributes, and void elements', async () => {
  const html = await run(`
let page = view {
  html(lang="en") {
    head { title "Arya Web"; meta(charset="utf-8") }
    body bg-dark BrandName {
      h1 "Hello from Arya"
      input(type="checkbox", checked=true, disabled=false)
      a(href="/about", aria-label="About Arya") "About"
      br
    }
  }
}
print(page)
`);
  assert.equal(html, '<!doctype html><html lang="en"><head><title>Arya Web</title><meta charset="utf-8"></head><body class="bg-dark BrandName"><h1>Hello from Arya</h1><input type="checkbox" checked><a href="/about" aria-label="About Arya">About</a><br></body></html>');
});

test('view expressions retain lexical checking and escape text and attribute data', async () => {
  const html = await run(`
let message = "<script>alert('x')</script> & friends"
let target = "\\\" autofocus onfocus=\\\"alert(1)"
fn label(name) { return "Hello, " + name }
print(view {
  div(data-message=message, title=target, hidden=null) {
    p (label(message))
    (42)
    (null)
  }
})
`);
  assert.ok(html.includes('data-message="&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; friends"'));
  assert.ok(html.includes('title="&quot; autofocus onfocus=&quot;alert(1)"'));
  assert.ok(html.includes('<p>Hello, &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; friends</p>42'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('hidden='));
  assert.throws(() => compile('print(view { p (missingName) })'), /missingName/);
  assert.throws(() => compile('print(view { input(value=missingValue) })'), /missingValue/);
  const analysis = analyzeSource('let title = "Hello"\nprint(view { h1 (title) })');
  assert.equal(analysis.diagnostics.length, 0);
  assert.ok(analysis.references.some(reference => reference.token.text === 'title' && reference.access === 'read'));
});

test('literal multiline CSS and JavaScript survive compilation and browser behavior is executable', async () => {
  const html = await run(`
print(view {
  style """
.bg-dark { background: #111; color: white; }
"""
  button(id="hello") "Click"
  script """
document.getElementById("hello").onclick = () => {
  alert("Hello from Arya!");
};
"""
})
`);
  assert.ok(html.includes('.bg-dark { background: #111; color: white; }'));
  const source = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(source);
  const button: { onclick?: () => void } = {};
  const messages: string[] = [];
  runInNewContext(source, { document: { getElementById: (id: string) => { assert.equal(id, 'hello'); return button; } }, alert: (message: string) => messages.push(message) });
  assert.equal(typeof button.onclick, 'function'); button.onclick!();
  assert.deepEqual(messages, ['Hello from Arya!']);
});

test('triple-quoted strings preserve code backslashes and source line positions', async () => {
  assert.equal(await run('print("""first\nsecond\\nthird""")'), 'first\nsecond\\nthird');
  const tokens = tokenize('let code = """line one\nline two"""\nlet done = true');
  assert.equal(tokens.find(token => token.text === 'done')?.line, 2);
  assert.throws(() => compile('let page = view {\n p """unclosed'), /[Uu]nclosed|[Uu]nterminated/);
});

test('view is contextual and ordinary identifiers remain usable', async () => {
  assert.equal(await run('let view = "plain value"\nprint(view)\nfn viewName() { return 1 }\nprint(viewName())'), 'plain value\n1');
  assert.equal(await run('fn view(value) { return value + 1 }\nprint(view(2))'), '3');
  assert.equal(await run('print(view { x-card(data-state="ready") { span "Custom" } })'), '<x-card data-state="ready"><span>Custom</span></x-card>');
});

test('views reject malformed elements and dangerous direct browser-code interpolation', () => {
  for (const [source, pattern] of [
    ['print(view { p "hi" )', /HTML element|close|Expected/],
    ['print(view { img "child" })', /void HTML element/],
    ['print(view { a(href="/", href="/again") "Link" })', /Duplicate HTML attribute/],
    ['print(view { div(class="one") two {} })', /class attribute or shorthand/],
    ['print(view { button(onclick="alert(1)") "Click" })', /Inline event/],
    ['print(view { iframe(srcdoc="<script>bad()</script>") })', /srcdoc/],
    ['let code = "alert(1)"\nprint(view { script (code) })', /literal string/],
    ['print(view { script "</ScRiPt><p>bad</p>" })', /closing HTML tag/],
    ['print(view { style "</style><script>bad()</script>" })', /closing HTML tag/],
    ['print(view { html {} p "second root" })', /only root/],
  ] as const) assert.throws(() => compile(source), pattern, source);
  assert.throws(() => compile('print(view {' + 'div {'.repeat(65) + '}'.repeat(65) + '})'), /nested too deeply/);
});

test('dangerous URL schemes are rejected and normal URL text is escaped', async () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
    const output = await run(`try { print(view { a(href=${JSON.stringify(url)}) "Link" }) } catch error { print(error.message) }`);
    assert.match(output, /Unsupported URL scheme/);
  }
  assert.equal(await run('print(view { a(href="/search?a=1&b=2") "Search" })'), '<a href="/search?a=1&amp;b=2">Search</a>');
  assert.equal(await run('print(view { a(href="mailto:hello@example.com") "Mail" })'), '<a href="mailto:hello@example.com">Mail</a>');
});



test('checking views does not execute embedded expressions or load imports', () => {
  const source = 'use js "package-that-does-not-exist" as library\nprint(view { p (library.execute()) })';
  assert.doesNotThrow(() => compile(source));
  assert.doesNotThrow(() => analyzeSource(source));
});

test('view interpolation retains source mappings and same-file lexical navigation', () => {
  const source = 'let title = "Hello"\nlet person = null\nprint(view {\n  h1(title=title) (person.name)\n})\n';
  const compiled = compile(source, 'interpolation.arya');
  const generatedOffset = compiled.code.lastIndexOf('person.name') + 'person.'.length;
  assert.ok(generatedOffset >= 'person.'.length);
  const prefix = compiled.code.slice(0, generatedOffset).split('\n');
  const mapped = new SourceMap(JSON.parse(compiled.map)).findEntry(prefix.length - 1, prefix.at(-1)!.length);
  assert.ok('originalLine' in mapped);
  assert.equal(mapped.originalLine, 3);
  assert.equal(mapped.originalColumn, source.split('\n')[3]!.indexOf('name'));
  const analysis = analyze(source, 'file:///tmp/interpolation.arya');
  assert.equal(analysis.diagnostics.length, 0);
  assert.equal(definitionAt(analysis, source.indexOf('=title') + 1)?.start, source.indexOf('title'));
  assert.equal(definitionAt(analysis, source.lastIndexOf('person'))?.start, source.indexOf('person'));
  assert.equal(definitionAt(analysis, source.indexOf('title=title')), undefined, 'HTML attribute names are not lexical variable references');
  assert.equal(definitionAt(analysis, source.indexOf('name)')), undefined, 'Property names retain ordinary Arya navigation behavior');
});
