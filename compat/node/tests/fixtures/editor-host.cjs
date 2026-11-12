const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.run = async () => {
  const extension = vscode.extensions.getExtension('aryacode.arya-language');
  assert.ok(extension, 'installed Arya extension');
  await extension.activate();
  const filename = path.join(process.env.ARYA_EDITOR_TEST_WORKSPACE, 'colors.arya');
  const source =
    'use std "ui" as ui\nconst emoji = "🌉"\nfn greeting(name = emoji) => name |> ui.text\nprint(greeting("Arya"))\n';
  await fs.writeFile(filename, source);
  const document = await vscode.workspace.openTextDocument(filename);
  await vscode.window.showTextDocument(document);
  assert.equal(document.languageId, 'arya', '.arya association');
  const legend = await vscode.commands.executeCommand(
    'vscode.provideDocumentSemanticTokensLegend',
    document.uri,
  );
  const tokens = await vscode.commands.executeCommand(
    'vscode.provideDocumentSemanticTokens',
    document.uri,
  );
  assert.ok(legend?.tokenTypes.includes('parameter'));
  assert.ok(tokens?.data?.length > 0);
  const colored = [];
  let line = 0,
    column = 0;
  for (let index = 0; index < tokens.data.length; index += 5) {
    const delta = tokens.data[index];
    line += delta;
    column = delta ? tokens.data[index + 1] : column + tokens.data[index + 1];
    const start = document.offsetAt(new vscode.Position(line, column));
    colored.push({
      text: source.slice(start, start + tokens.data[index + 2]),
      type: legend.tokenTypes[tokens.data[index + 3]],
    });
  }
  for (const [text, type] of [
    ['ui', 'namespace'],
    ['greeting', 'function'],
    ['name', 'parameter'],
    ['text', 'method'],
  ])
    assert.ok(
      colored.some((token) => token.text === text && token.type === type),
      text + ' => ' + type,
    );
  await vscode.commands.executeCommand('aryaLanguage.enableFileIcons');
  assert.equal(vscode.workspace.getConfiguration('workbench').get('iconTheme'), 'arya-file-icons');
  for (const [theme, kind] of [
    ['Arya Dark', vscode.ColorThemeKind.Dark],
    ['Arya Light', vscode.ColorThemeKind.Light],
  ]) {
    await vscode.workspace
      .getConfiguration('workbench')
      .update('colorTheme', theme, vscode.ConfigurationTarget.Global);
    for (let attempt = 0; attempt < 60 && vscode.window.activeColorTheme.kind !== kind; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(vscode.window.activeColorTheme.kind, kind, theme);
  }
  const builtin = Boolean(vscode.extensions.getExtension('aryacode.arya-workbench')?.isActive);
  assert.equal(builtin, false, 'isolate candidate extension from AryaCode embedded providers');
  let workspaceNavigation = false;
  if (!builtin) {
    const root = process.env.ARYA_EDITOR_TEST_WORKSPACE;
    await fs.writeFile(path.join(root, 'lib.arya'), 'export fn total(n: number): number => n + 1');
    await fs.writeFile(
      path.join(root, 'caller.arya'),
      'use arya "./lib.arya" as lib\nprint(lib.total(3))',
    );
    const main = 'use arya "./lib.arya" as lib\nprint(lib.total(2))';
    await fs.writeFile(path.join(root, 'main.arya'), main);
    const consumer = await vscode.workspace.openTextDocument(path.join(root, 'main.arya'));
    await vscode.window.showTextDocument(consumer);
    const point = consumer.positionAt(main.indexOf('total'));
    const definitions = await vscode.commands.executeCommand(
      'vscode.executeDefinitionProvider',
      consumer.uri,
      point,
    );
    assert.ok(
      definitions.some(
        (location) => (location.uri ?? location.targetUri).fsPath === path.join(root, 'lib.arya'),
      ),
      'definition in unopened module',
    );
    const references = await vscode.commands.executeCommand(
      'vscode.executeReferenceProvider',
      consumer.uri,
      point,
    );
    assert.equal(references.length, 3, 'references include unopened caller and declaration');
    const rename = await vscode.commands.executeCommand(
      'vscode.executeDocumentRenameProvider',
      consumer.uri,
      point,
      'sum',
    );
    assert.equal(rename.entries().length, 3, 'rename includes all three source files');
    assert.ok(
      rename
        .entries()
        .flatMap(([, edits]) => edits)
        .every((edit) => edit.newText === 'sum'),
    );
    assert.equal(await vscode.workspace.applyEdit(rename), true);
    assert.equal(await vscode.workspace.saveAll(false), true);
    for (const [uri, edits] of rename.entries()) {
      const changed = await vscode.workspace.openTextDocument(uri);
      assert.equal(await changed.save(), true);
    }
    assert.match(await fs.readFile(path.join(root, 'caller.arya'), 'utf8'), /lib.sum/);
    const renamed = consumer.getText();
    assert.match(renamed, /lib.sum/);
    const replace = async (text) => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        consumer.uri,
        new vscode.Range(consumer.positionAt(0), consumer.positionAt(consumer.getText().length)),
        text,
      );
      assert.equal(await vscode.workspace.applyEdit(edit), true);
    };
    const waitDiagnostics = async (predicate) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate(vscode.languages.getDiagnostics(consumer.uri))) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.fail(
        'Expected workspace diagnostics: ' +
          JSON.stringify(vscode.languages.getDiagnostics(consumer.uri)),
      );
    };
    await replace(renamed.replace('sum(2)', 'sum("bad")'));
    assert.equal(consumer.isDirty, true, 'unsaved buffer');
    await waitDiagnostics((values) => values.some((value) => value.code === 'ARYA_TYPE'));
    await vscode.window.showTextDocument(consumer);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    const reopened = await vscode.workspace.openTextDocument(consumer.uri);
    assert.equal(reopened.getText(), renamed, 'closing restores disk source');
    await waitDiagnostics((values) => values.length === 0);
    // Change a dependency on disk after closing its editor buffer.
    const dependency = await vscode.workspace.openTextDocument(path.join(root, 'lib.arya'));
    await vscode.window.showTextDocument(dependency);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await fs.writeFile(path.join(root, 'lib.arya'), 'export fn sum(n: string): string => n');
    await waitDiagnostics((values) => values.some((value) => value.code === 'ARYA_TYPE'));
    await fs.writeFile(path.join(root, 'lib.arya'), 'export fn sum(n: number): number => n + 1');
    await waitDiagnostics((values) => values.length === 0);
    workspaceNavigation = true;
  }
  const debugging = await require('./host-debug.cjs').checkDebugging(extension);
  const before = vscode.workspace.textDocuments.length;
  await vscode.commands.executeCommand('aryaLanguage.openExample');
  assert.ok(vscode.workspace.textDocuments.length > before);
  assert.equal(vscode.window.activeTextEditor.document.languageId, 'arya');
  assert.ok(vscode.window.activeTextEditor.document.isUntitled);
  await fs.writeFile(
    process.env.ARYA_EDITOR_TEST_REPORT,
    JSON.stringify(
      {
        editor: process.env.ARYA_EDITOR_TEST_ID,
        vscode: vscode.version,
        extension: extension.id,
        languageVersion: extension.packageJSON.aryaLanguageVersion,
        tokens: colored.length,
        workspaceNavigation,
        appliedRename: true,
        unsavedDiagnostics: true,
        diskRefresh: true,
        debugging,
        fileIcons: 'arya-file-icons',
        themes: ['Arya Dark', 'Arya Light'],
        aryacodeBuiltin: builtin,
      },
      null,
      2,
    ) + '\n',
  );
};
