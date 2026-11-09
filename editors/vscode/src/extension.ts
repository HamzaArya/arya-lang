import * as vscode from 'vscode';
import { dirname, join } from 'node:path';
import { registerAryaLanguage } from './arya-language.js';

/** A portable editor extension. AryaCode already includes these providers. */
export function activate(context: vscode.ExtensionContext): void {
  const builtin = vscode.extensions.getExtension('aryacode.arya-workbench');
  void vscode.commands.executeCommand('setContext', 'aryaLanguage.standalone', !builtin);
  if (builtin) {
    for (const [command, target] of [['aryaLanguage.run', 'arya.runFile'], ['aryaLanguage.check', 'arya.buildFile'], ['aryaLanguage.stop', 'arya.stopFile']] as const) {
      context.subscriptions.push(vscode.commands.registerCommand(command, (uri?: vscode.Uri) => vscode.commands.executeCommand(target, uri)));
    }
    return;
  }
  registerAryaLanguage(context);
  const running = new Map<string, vscode.TaskExecution>();
  const starting = new Set<string>();
  const source = (uri?: vscode.Uri) => {
    const selected = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!selected || selected.scheme !== 'file' || !selected.fsPath.toLowerCase().endsWith('.arya')) throw new Error('Open a saved .arya file first.');
    return selected;
  };
  const start = async (action: 'run' | 'check', uri?: vscode.Uri) => {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before running or checking a source file.');
    const selected = source(uri), key = selected.toString();
    if (starting.has(key) || running.has(key)) { await vscode.commands.executeCommand('workbench.action.terminal.focus'); return; }
    starting.add(key);
    try {
      const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
      if (document?.isDirty && !await document.save()) throw new Error('Save this file before running it.');
      if (!vscode.workspace.isTrusted) throw new Error('Workspace trust changed. Trust this folder before running code.');
      const settings = vscode.workspace.getConfiguration('aryaLanguage', selected);
      const node = settings.get<string>('nodePath', 'node');
      const python = settings.get<string>('pythonPath', '');
      const folder = vscode.workspace.getWorkspaceFolder(selected);
      const task = new vscode.Task({ type: 'arya-language-portable', path: key }, folder ?? vscode.TaskScope.Global, `${action === 'run' ? 'Run' : 'Check'} ${vscode.workspace.asRelativePath(selected)}`, 'Arya', new vscode.ProcessExecution(node, [join(context.extensionPath, 'dist/arya.cjs'), action, selected.fsPath, '--target', settings.get<string>('target', 'js'), ...(settings.get<string>('target', 'js') === 'native' && settings.get<string>('ccPath', '') ? ['--cc', settings.get<string>('ccPath', '')] : [])], { cwd: folder?.uri.fsPath ?? dirname(selected.fsPath), ...(python ? { env: { ARYA_PYTHON: python } } : {}) }), []);
      task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
      const execution = await vscode.tasks.executeTask(task);
      if (vscode.tasks.taskExecutions.includes(execution)) running.set(key, execution);
    } finally { starting.delete(key); }
  };
  for (const [command, action] of [['aryaLanguage.run', 'run'], ['aryaLanguage.check', 'check']] as const) {
    context.subscriptions.push(vscode.commands.registerCommand(command, async (uri?: vscode.Uri) => {
      try { await start(action, uri); } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
    }));
  }
  context.subscriptions.push(vscode.commands.registerCommand('aryaLanguage.stop', (uri?: vscode.Uri) => {
    try { running.get(source(uri).toString())?.terminate(); } catch (error) { void vscode.window.showErrorMessage(String(error)); }
  }), vscode.tasks.onDidEndTask(event => {
    if (event.execution.task.definition.type === 'arya-language-portable') running.delete(event.execution.task.definition.path);
  }));
}
