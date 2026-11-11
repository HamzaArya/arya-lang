const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.run = async () => {
  const extension = vscode.extensions.getExtension('aryacode.arya-language');
  assert.ok(extension, 'installed Arya extension');
  await extension.activate();
  const filename = path.join(process.env.ARYA_EDITOR_TEST_WORKSPACE, 'colors.arya');
  const source = "use std \"ui\" as ui\nconst emoji = \"🌉\"\nfn greeting(name = emoji) => name |> ui.text\nprint(greeting(\"Arya\"))\n";
  await fs.writeFile(filename, source);
  const document = await vscode.workspace.openTextDocument(filename);
  await vscode.window.showTextDocument(document);
  assert.equal(document.languageId, 'arya', '.arya association');
  const legend = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', document.uri);
  const tokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri);
  assert.ok(legend?.tokenTypes.includes('parameter'));
  assert.ok(tokens?.data?.length > 0);
  const colored = [];
  let line = 0, column = 0;
  for (let index = 0; index < tokens.data.length; index += 5) {
    const delta = tokens.data[index]; line += delta; column = delta ? tokens.data[index + 1] : column + tokens.data[index + 1];
    const start = document.offsetAt(new vscode.Position(line, column));
    colored.push({text: source.slice(start, start + tokens.data[index + 2]), type: legend.tokenTypes[tokens.data[index + 3]]});
  }
  for (const [text, type] of [['ui', 'namespace'], ['greeting', 'function'], ['name', 'parameter'], ['text', 'method']]) assert.ok(colored.some(token => token.text === text && token.type === type), text + ' => ' + type);
  await vscode.commands.executeCommand('aryaLanguage.enableFileIcons');
  assert.equal(vscode.workspace.getConfiguration('workbench').get('iconTheme'), 'arya-file-icons');
  for (const [theme, kind] of [['Arya Dark', vscode.ColorThemeKind.Dark], ['Arya Light', vscode.ColorThemeKind.Light]]) {
    await vscode.workspace.getConfiguration('workbench').update('colorTheme', theme, vscode.ConfigurationTarget.Global);
    for (let attempt = 0; attempt < 60 && vscode.window.activeColorTheme.kind !== kind; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(vscode.window.activeColorTheme.kind, kind, theme);
  }
  const before = vscode.workspace.textDocuments.length;
  await vscode.commands.executeCommand('aryaLanguage.openExample');
  assert.ok(vscode.workspace.textDocuments.length > before);
  assert.equal(vscode.window.activeTextEditor.document.languageId, 'arya');
  assert.ok(vscode.window.activeTextEditor.document.isUntitled);
  await fs.writeFile(process.env.ARYA_EDITOR_TEST_REPORT, JSON.stringify({editor: process.env.ARYA_EDITOR_TEST_ID, vscode: vscode.version, extension: extension.id, languageVersion: extension.packageJSON.aryaLanguageVersion, tokens: colored.length, fileIcons: 'arya-file-icons', themes: ['Arya Dark', 'Arya Light'], aryacodeBuiltin: Boolean(vscode.extensions.getExtension('aryacode.arya-workbench'))}, null, 2) + '\n');
};
