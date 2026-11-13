// Optional integration test run by an isolated VS Code extension host.
const vscode = require('vscode');
const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('aryacode.arya-language');
  assert.ok(extension); await extension.activate();
  assert.equal(vscode.workspace.getConfiguration('arya').get('compilerPath', ''), '');
  const {resolveCompiler} = require(path.join(extension.extensionPath, 'compiler-path.cjs'));
  const selectedCompiler = resolveCompiler({directory: extension.extensionPath});
  if (process.env.ARYA_NATIVE_EDITOR_MODE === 'portable') {
    assert.equal(selectedCompiler, process.platform === 'win32' ? 'arya.exe' : 'arya');
    assert.equal(process.env.PATH.split(path.delimiter)[0], process.env.ARYA_NATIVE_EDITOR_BIN);
  } else {
    assert.equal(selectedCompiler, path.join(extension.extensionPath, 'native', process.platform === 'win32' ? 'arya.exe' : 'arya'));
  }
  const root = process.env.ARYA_NATIVE_EDITOR_WORKSPACE;
  const filename = path.join(root, 'main.arya');
  const source = 'use std "ui" as ui\nconst value: number = 4   \nfn twice(n: number): number => n * 2\nprint(twice(value))\nui.text("Hello")\n';
  await fs.writeFile(filename, source);
  const document = await vscode.workspace.openTextDocument(filename);
  await vscode.window.showTextDocument(document);
  assert.equal(document.languageId, 'arya');
  const hover = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, new vscode.Position(1, 7));
  assert.ok(hover.length && hover[0].contents.some(value => value.value.includes('number')));
  const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, new vscode.Position(4, 4));
  assert.ok(completion.items.some(value => value.label === 'text'));
  assert.ok(completion.items.some(value => value.label === 'template'));
  const definition = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, new vscode.Position(3, 8));
  assert.equal(definition[0].range.start.line, 2);
  const references = await vscode.commands.executeCommand('vscode.executeReferenceProvider', document.uri, new vscode.Position(1, 7));
  assert.equal(references.length, 2);
  const renamed = await vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', document.uri, new vscode.Position(1, 7), 'amount');
  assert.equal(renamed.get(document.uri).length, 2);
  const formatted = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, {tabSize: 2, insertSpaces: true});
  assert.ok(formatted.length > 0 && formatted.every(value => typeof value.newText === 'string'));
  const tokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri);
  assert.ok(tokens.data.length > 0);
  const symbol = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
  assert.ok(symbol.some(value => value.name === 'twice'));
  const edit = new vscode.WorkspaceEdit(); edit.replace(document.uri, new vscode.Range(1, 22, 1, 23), '"bad"');
  await vscode.workspace.applyEdit(edit);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !vscode.languages.getDiagnostics(document.uri).some(value => String(value.code).startsWith('ARYA_TYPE'))) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(vscode.languages.getDiagnostics(document.uri).some(value => String(value.code).startsWith('ARYA_TYPE')));
  await fs.writeFile(process.env.ARYA_NATIVE_EDITOR_REPORT, JSON.stringify({passed: true, provider: 'native Arya LSP', selectedCompiler, checks: ['default compiler selection', 'hover', 'UI completion', 'definition', 'references', 'rename', 'format', 'semantic tokens', 'symbols', 'live type diagnostics']}));
};
