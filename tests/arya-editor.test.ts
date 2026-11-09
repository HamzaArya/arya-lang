import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-languageserver-protocol/node.js';
import type { Diagnostic, CompletionItem, DocumentSymbol, Hover, Location } from 'vscode-languageserver-protocol';
import { Registry, parseRawGrammar } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import { hoverAt } from '../src/language-service.js';

test('TextMate grammar recognizes real Arya tokens and contains strings/comments correctly', async () => {
  await loadWASM(new Uint8Array(await readFile('node_modules/vscode-oniguruma/release/onig.wasm')).buffer);
  const raw = await readFile('editors/vscode/syntaxes/arya.tmLanguage.json', 'utf8');
  const registry = new Registry({ onigLib: Promise.resolve({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: text => new OnigString(text) }), loadGrammar: async () => parseRawGrammar(raw, 'arya.tmLanguage.json') });
  try {
    const grammar = await registry.loadGrammar('source.arya'); assert.ok(grammar);
    const scopes = (line: string, text: string, scope: string) => {
      const position = line.indexOf(text); assert.ok(position >= 0);
      const token = grammar.tokenizeLine(line, null).tokens.find(token => token.startIndex <= position && token.endIndex > position);
      assert.ok(token?.scopes.some(value => value.startsWith(scope)), `${text}: ${JSON.stringify(token)}`);
    };
    scopes('let name = "Arya"', 'let', 'storage.type');
    scopes('fn greet(name) { return name }', 'greet', 'entity.name.function');
    scopes('use python "math" as math', 'python', 'storage.type.bridge');
    scopes('use arya "./math.arya" as math', 'arya', 'storage.type.bridge');
    scopes('if true and 1.5e2 >= 2 { print(args) }', 'if', 'keyword.control');
    scopes('if true and 1.5e2 >= 2 { print(args) }', 'and', 'keyword.operator.logical');
    scopes('if true and 1.5e2 >= 2 { print(args) }', '1.5e2', 'constant.numeric');
    scopes('if true and 1.5e2 >= 2 { print(args) }', 'print', 'support.function');
    scopes('print("# not a comment, fn is text") # real comment', '# not', 'string.quoted');
    scopes('print("# not a comment, fn is text") # real comment', '# real', 'comment.line');
    scopes('print("a\\n")', '\\n', 'constant.character.escape');
    scopes('print("a\\q")', '\\q', 'invalid.illegal.escape');
    scopes('print("a\\\"b")', '\\"', 'constant.character.escape');
    scopes('// let print = 1', 'print', 'comment.line');
  } finally { registry.dispose(); }
});

test('builtin hover does not describe strings, comments, or object members as global functions', () => {
  for (const source of ['"print"', '# print', '// print', 'library.print']) assert.equal(hoverAt(source, source.indexOf('print') + 2), undefined, source);
  assert.match(hoverAt('print("Hello")', 2)!.text, /write values/);
});

test('portable LSP supports Unicode diagnostics, edits, completion, hover, outline, close, and shutdown without executing code', { timeout: 15_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya lsp '))); t.after(() => rm(root, { recursive: true, force: true }));
  const canary = join(root, 'CANARY');
  await writeFile(join(root, 'never-execute.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(canary)}, 'executed');`);
  const child = spawn(process.execPath, [resolve('dist/lsp.cjs'), '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const exit = new Promise<number | null>((ok, fail) => { child.on('error', fail); child.on('exit', ok); });
  const connection = createProtocolConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  t.after(() => { connection.dispose(); child.kill(); }); connection.listen();
  const diagnosticWait = (uri: string, version?: number) => new Promise<Diagnostic[]>((ok, fail) => {
    const timer = setTimeout(() => { subscription.dispose(); fail(new Error(`No diagnostics for ${uri}; ${stderr}`)); }, 3000);
    const subscription = connection.onNotification('textDocument/publishDiagnostics', value => {
      if (value.uri === uri && value.version === version) { clearTimeout(timer); subscription.dispose(); ok(value.diagnostics); }
    });
  });
  const initialized = await connection.sendRequest<{ capabilities: { textDocumentSync: number } }>('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {} });
  assert.equal(initialized.capabilities.textDocumentSync, 2); await connection.sendNotification('initialized', {});
  const uri = pathToFileURL(join(root, 'main.arya')).href;
  const source = 'use js "./never-execute.mjs" as library\nfn greet(name) { return name }\nprint("print")\n';
  const opened = diagnosticWait(uri, 1);
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'arya', version: 1, text: source } });
  assert.deepEqual(await opened, []);
  const items = await connection.sendRequest<CompletionItem[]>('textDocument/completion', { textDocument: { uri }, position: { line: 2, character: 2 } });
  assert.ok(items.some(item => item.label === 'print')); assert.ok(items.some(item => item.label === 'greet'));
  const hover = await connection.sendRequest<Hover>('textDocument/hover', { textDocument: { uri }, position: { line: 2, character: 2 } });
  assert.match(JSON.stringify(hover.contents), /write values/);
  assert.equal(await connection.sendRequest('textDocument/hover', { textDocument: { uri }, position: { line: 2, character: 9 } }), null);
  const symbols = await connection.sendRequest<DocumentSymbol[]>('textDocument/documentSymbol', { textDocument: { uri } });
  assert.deepEqual(symbols.map(symbol => symbol.name), ['library', 'greet']);
  const second = pathToFileURL(join(root, 'unicode.arya')).href, invalid = 'let emoji = "🌉"; let value = @';
  const errors = diagnosticWait(second, 1);
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: second, languageId: 'arya', version: 1, text: invalid } });
  const diagnostics = await errors; assert.equal(diagnostics[0]!.range.start.character, invalid.indexOf('@'));
  const fixed = diagnosticWait(second, 2);
  await connection.sendNotification('textDocument/didChange', { textDocument: { uri: second, version: 2 }, contentChanges: [{ range: { start: { line: 0, character: invalid.indexOf('@') }, end: { line: 0, character: invalid.length } }, text: '42' }] });
  assert.deepEqual(await fixed, []);
  const semantic = 'use js "./never-execute.mjs" as library\nconst emoji = "🌉"; const total = 1; total += missing\nfn outer(value) { return fn() { return value } }\nlibrary.run()\nprint(unknown)';
  const semanticErrors = diagnosticWait(second, 3);
  await connection.sendNotification('textDocument/didChange', { textDocument: { uri: second, version: 3 }, contentChanges: [{ text: semantic }] });
  const lexical = await semanticErrors;
  assert.deepEqual(lexical.map(item => item.code), ['ARYA_CONST_ASSIGNMENT', 'ARYA_UNKNOWN_NAME', 'ARYA_UNKNOWN_NAME']);
  const line = semantic.split('\n')[1]!;
  assert.equal(lexical[0]!.range.start.character, line.lastIndexOf('total'));
  assert.equal(lexical[0]!.range.end.character, line.lastIndexOf('total') + 5);
  assert.equal(lexical[1]!.range.start.character, line.indexOf('missing'));
  const semanticSymbols = await connection.sendRequest<DocumentSymbol[]>('textDocument/documentSymbol', { textDocument: { uri: second } });
  assert.deepEqual(semanticSymbols.map(symbol => symbol.name), ['library', 'emoji', 'total', 'outer']);
  const semanticCompletions = await connection.sendRequest<CompletionItem[]>('textDocument/completion', { textDocument: { uri: second }, position: { line: 4, character: 0 } });
  assert.ok(semanticCompletions.some(item => item.label === 'outer'));
  const definition = await connection.sendRequest<Location>('textDocument/definition', { textDocument: { uri: second }, position: { line: 2, character: semantic.split('\n')[2]!.lastIndexOf('value') + 2 } });
  assert.equal(definition.uri, second);
  assert.deepEqual(definition.range, { start: { line: 2, character: 9 }, end: { line: 2, character: 14 } });
  assert.equal(await connection.sendRequest('textDocument/definition', { textDocument: { uri: second }, position: { line: 3, character: 9 } }), null);
  const resolved = diagnosticWait(second, 4);
  await connection.sendNotification('textDocument/didChange', { textDocument: { uri: second, version: 4 }, contentChanges: [{ text: 'const total = 1\nprint(total)' }] });
  assert.deepEqual(await resolved, []);
  assert.deepEqual((await connection.sendRequest<DocumentSymbol[]>('textDocument/documentSymbol', { textDocument: { uri } })).map(symbol => symbol.name), ['library', 'greet']);
  const cleared = diagnosticWait(second);
  await connection.sendNotification('textDocument/didClose', { textDocument: { uri: second } }); assert.deepEqual(await cleared, []);
  await assert.rejects(access(canary));
  await connection.sendRequest('shutdown'); await connection.sendNotification('exit'); assert.equal(await exit, 0, stderr);
});
