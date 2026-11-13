'use strict';
// Editor-host transport only. Parsing, checking and language services run in the
// native Arya process. VS Code provides these host modules to every extension.
const vscode = require('vscode');
const {spawn} = require('child_process');
const {dirname, join} = require('path');
const {tmpdir} = require('os');
const {readFile} = require('fs/promises');
const {resolveCompiler} = require('./compiler-path.cjs');
const selector = {language: 'arya', scheme: 'file'};
const selectors = [selector, {language: 'arya', scheme: 'untitled'}];
const position = value => new vscode.Position(value.line, value.character);
const range = value => new vscode.Range(position(value.start), position(value.end));
const location = value => new vscode.Location(vscode.Uri.parse(value.uri), range(value.range));
const point = value => ({line: value.line, character: value.character});
const span = value => ({start: point(value.start), end: point(value.end)});
const documentId = document => ({uri: document.uri.toString()});
function setting(name, fallback) {
  const settings = vscode.workspace.getConfiguration('arya');
  if (vscode.workspace.isTrusted) return settings.get(name, fallback);
  return settings.inspect(name)?.globalValue ?? fallback;
}
function compilerExecutable() { return resolveCompiler({configured: setting('compilerPath', '')}); }
function workspaceEdit(value) {
  const edit = new vscode.WorkspaceEdit();
  for (const change of value.documentChanges ?? []) {
    const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === change.textDocument.uri);
    if (document && change.textDocument.version != null && document.version !== change.textDocument.version) throw new Error('The document changed. Retry the edit.');
    edit.set(vscode.Uri.parse(change.textDocument.uri), change.edits.map(item => vscode.TextEdit.replace(range(item.range), item.newText)));
  }
  for (const [uri, changes] of Object.entries(value.changes ?? {})) edit.set(vscode.Uri.parse(uri), changes.map(item => vscode.TextEdit.replace(range(item.range), item.newText)));
  return edit;
}
class NativeClient {
  constructor(output, diagnostics) {
    this.output = output; this.diagnostics = diagnostics; this.next = 0; this.pending = new Map(); this.documents = new Map(); this.buffer = Buffer.alloc(0); this.bytes = null; this.writes = Promise.resolve(); this.closed = false;
    this.child = spawn(compilerExecutable(), ['lsp', '--stdio'], {cwd: tmpdir(), stdio: ['pipe','pipe','pipe'], windowsHide: true, shell: false});
    this.child.on('error', error => this.fail(new Error(`Cannot start native Arya: ${error.message}. Set arya.compilerPath to the native SDK executable.`)));
    this.child.on('exit', (code, signal) => this.fail(new Error(`Native Arya language server stopped (${signal ?? code}).`)));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stderr.on('data', data => output.append(data.toString('utf8')));
    this.child.stdout.on('data', data => { try { this.receive(data); } catch (error) { this.fail(error); this.child.kill(); } });
    this.ready = this.rawRequest('initialize', {processId: process.pid, clientInfo: {name: 'Arya Native Editor'}, capabilities: {general: {positionEncodings: ['utf-16']}}, workspaceFolders: (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => ({uri: folder.uri.toString(), name: folder.name}))}).then(result => { if(result.serverInfo?.name!=='Arya Native Language Server'){this.child.kill();throw new Error('Choose a native Arya SDK in arya.compilerPath.');}this.notifyNow('initialized', {}); return result; });
    this.ready.catch(error => output.appendLine(error.message));
  }
  fail(error) {
    if (this.closed) return; this.closed = true; this.output.appendLine(error.message);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear();
  }
  send(value) {
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > 16 * 1024 * 1024) return Promise.reject(new Error('Arya message exceeds 16 MiB.'));
    const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
    const written = this.writes.then(() => new Promise((resolve, reject) => { if (this.closed) { reject(new Error('Arya language server is closed.')); return; } this.child.stdin.write(frame, error => error ? reject(error) : resolve()); }));
    this.writes = written.catch(error => this.fail(error)); return written;
  }
  rawRequest(method, params) {
    if (this.pending.size >= 512) return Promise.reject(new Error('Too many pending Arya requests.'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Arya request timed out: ${method}`)); }, 30000);
      this.pending.set(id, {resolve, reject, timer}); this.send({jsonrpc: '2.0', id, method, params}).catch(error => {clearTimeout(timer); this.pending.delete(id); reject(error);});
    });
  }
  async request(method, params) { await this.ready; return this.rawRequest(method, params); }
  notifyNow(method, params) { this.send({jsonrpc: '2.0', method, params}).catch(error => this.output.appendLine(error.message)); }
  async notify(method, params) { await this.ready; this.notifyNow(method, params); }
  receive(data) {
    if (this.buffer.length + data.length > 17 * 1024 * 1024) throw new Error('Oversized Arya response.');
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      if (this.bytes == null) {
        const end = this.buffer.indexOf('\r\n\r\n');
        if (end < 0) { if (this.buffer.length > 8192) throw new Error('Invalid Arya frame header.'); return; }
        const headers = this.buffer.subarray(0,end).toString('ascii'); const lengths = [...headers.matchAll(/^Content-Length: ([0-9]+)\r?$/gmi)];
        if (lengths.length !== 1 || Number(lengths[0][1]) > 16 * 1024 * 1024) throw new Error('Invalid Arya frame length.');
        this.bytes = Number(lengths[0][1]); this.buffer = this.buffer.subarray(end + 4);
      }
      if (this.buffer.length < this.bytes) return;
      const message = JSON.parse(this.buffer.subarray(0,this.bytes).toString('utf8')); this.buffer = this.buffer.subarray(this.bytes); this.bytes = null;
      if (Object.hasOwn(message, 'id')) {
        const item = this.pending.get(message.id); if (!item) continue; this.pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
      } else if (message.method === 'textDocument/publishDiagnostics') {
        const {uri, diagnostics, version} = message.params; const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === uri);
        if (document && version != null && version < document.version) continue;
        this.diagnostics.set(vscode.Uri.parse(uri), diagnostics.map(value => { const item = new vscode.Diagnostic(range(value.range), value.message, value.severity == null ? vscode.DiagnosticSeverity.Error : value.severity - 1); item.code = value.code; item.source = 'Arya'; return item; }));
      }
    }
  }
  async open(document) {
    await this.ready; const uri = document.uri.toString();
    if (this.documents.has(uri)) return;
    if (document.getText().length > 4 * 1024 * 1024) throw new Error('Arya editing supports documents up to 4 Mi UTF-16 units.');
    this.documents.set(uri, document.version); this.notifyNow('textDocument/didOpen', {textDocument: {uri, languageId: 'arya', version: document.version, text: document.getText()}});
  }
  async query(document, method, params = {}) { await this.open(document); return this.request(method, {textDocument: documentId(document), ...params}); }
  dispose() {
    if (this.closed) return;
    this.rawRequest('shutdown', {}).catch(() => {}).finally(() => { this.notifyNow('exit', {}); this.child.stdin.end(); });
    const timer = setTimeout(() => this.child.kill(), 1000); timer.unref();
  }
}
function activate(context) {
  const output = vscode.window.createOutputChannel('Arya Native'); const diagnostics = vscode.languages.createDiagnosticCollection('arya');
  let client = null; const get = () => { if (!client || client.closed) { client = new NativeClient(output, diagnostics); } return client; };
  const quiet = (operation, fallback) => operation.catch(error => { output.appendLine(error.message); return fallback; });
  const query = (document, method, params, fallback = null) => quiet(get().query(document, method, params), fallback);
  const register = disposable => context.subscriptions.push(disposable);
  register(output); register(diagnostics); register({dispose() {client?.dispose();}});
  register(vscode.workspace.onDidOpenTextDocument(document => {if (document.languageId === 'arya') quiet(get().open(document));}));
  register(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId !== 'arya' || !client?.documents.has(event.document.uri.toString())) return;
    client.documents.set(event.document.uri.toString(), event.document.version);
    quiet(client.notify('textDocument/didChange', {textDocument: {...documentId(event.document), version: event.document.version}, contentChanges: event.contentChanges.map(change => ({range: span(change.range), text: change.text}))}));
  }));
  register(vscode.workspace.onDidCloseTextDocument(document => {const uri = document.uri.toString(); if (!client?.documents.delete(uri)) return; quiet(client.notify('textDocument/didClose', {textDocument: {uri}})); diagnostics.delete(document.uri);}));
  register(vscode.workspace.onDidSaveTextDocument(document => {if (document.languageId === 'arya' && client) quiet(client.notify('textDocument/didSave', {textDocument: documentId(document)}));}));
  register(vscode.workspace.onDidChangeWorkspaceFolders(event => {if (client) quiet(client.notify('workspace/didChangeWorkspaceFolders', {event: {added: event.added.map(folder => ({uri:folder.uri.toString(),name:folder.name})), removed: event.removed.map(folder => ({uri:folder.uri.toString(),name:folder.name}))}}));}));
  register(vscode.workspace.onDidChangeConfiguration(event => {if (event.affectsConfiguration('arya.compilerPath')) {client?.dispose(); client = null; diagnostics.clear(); for (const document of vscode.workspace.textDocuments) if (document.languageId === 'arya') quiet(get().open(document));}}));
  register(vscode.languages.registerCompletionItemProvider(selectors, {async provideCompletionItems(document, at) {return (await query(document,'textDocument/completion',{position:point(at)},[])).map(value => {const item = new vscode.CompletionItem(value.label, value.kind == null ? vscode.CompletionItemKind.Text : value.kind - 1); item.detail=value.detail; return item;});}}, '.'));
  register(vscode.languages.registerHoverProvider(selectors, {async provideHover(document, at) {const value=await query(document,'textDocument/hover',{position:point(at)}); if (!value) return null; const contents=new vscode.MarkdownString(typeof value.contents==='string'?value.contents:value.contents.value); contents.isTrusted=false; return new vscode.Hover(contents,value.range?range(value.range):undefined);}}));
  register(vscode.languages.registerDefinitionProvider(selectors, {async provideDefinition(document,at) {const value=await query(document,'textDocument/definition',{position:point(at)});return value?(Array.isArray(value)?value.map(location):location(value)):null;}}));
  register(vscode.languages.registerReferenceProvider(selectors, {async provideReferences(document,at,options) {return (await query(document,'textDocument/references',{position:point(at),context:options},[])).map(location);}}));
  register(vscode.languages.registerRenameProvider(selectors, {async prepareRename(document,at) {const value=await get().query(document,'textDocument/prepareRename',{position:point(at)});return value?{range:range(value.range),placeholder:value.placeholder}:null;}, async provideRenameEdits(document,at,newName) {return workspaceEdit(await get().query(document,'textDocument/rename',{position:point(at),newName}));}}));
  register(vscode.languages.registerDocumentSymbolProvider(selectors, {async provideDocumentSymbols(document) {return (await query(document,'textDocument/documentSymbol',{},[])).map(value=>new vscode.SymbolInformation(value.name,value.kind-1,'',location(value.location)));}}));
  register(vscode.languages.registerDocumentFormattingEditProvider(selectors, {async provideDocumentFormattingEdits(document,options) {return (await query(document,'textDocument/formatting',{options},[])).map(value=>vscode.TextEdit.replace(range(value.range),value.newText));}}));
  register(vscode.languages.registerSignatureHelpProvider(selectors, {async provideSignatureHelp(document,at) {const value=await query(document,'textDocument/signatureHelp',{position:point(at)});if(!value)return null;const result=new vscode.SignatureHelp();result.activeSignature=value.activeSignature;result.activeParameter=value.activeParameter;result.signatures=value.signatures.map(item=>{const signature=new vscode.SignatureInformation(item.label,item.documentation);signature.parameters=(item.parameters??[]).map(parameter=>new vscode.ParameterInformation(parameter.label,parameter.documentation));return signature;});return result;}}, '(', ','));
  const legend=new vscode.SemanticTokensLegend(['namespace','function','variable','parameter','property','method','class'],['declaration','readonly','defaultLibrary','modification']);
  register(vscode.languages.registerDocumentSemanticTokensProvider(selectors, {async provideDocumentSemanticTokens(document) {const value=await query(document,'textDocument/semanticTokens/full',{}, {data:[]});return new vscode.SemanticTokens(new Uint32Array(value.data));}}, legend));
  register(vscode.languages.registerCodeActionsProvider(selectors, {async provideCodeActions(document,selected,options) {const values=await query(document,'textDocument/codeAction',{range:span(selected),context:{diagnostics:options.diagnostics.map(value=>({range:span(value.range),message:value.message,code:value.code?.value??value.code,source:value.source}))}},[]);return values.map(value=>{const action=new vscode.CodeAction(value.title,vscode.CodeActionKind.QuickFix);if(value.edit)action.edit=workspaceEdit(value.edit);return action;});}}, {providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}));
  const running = new Map(); const starting = new Set();
  function source(uri) {const value=uri??vscode.window.activeTextEditor?.document.uri;if(value?.scheme!=='file'||!value.fsPath.endsWith('.arya'))throw new Error('Open a saved .arya file first.');return value;}
  for (const action of ['run','check']) register(vscode.commands.registerCommand(`aryaLanguage.${action}`, async uri=>{
    try {
      if(!vscode.workspace.isTrusted)throw new Error('Trust this workspace before running native tools.');
      const selected=source(uri),key=selected.toString();if(starting.has(key)||running.has(key))return;starting.add(key);
      try {
        const document=vscode.workspace.textDocuments.find(value=>value.uri.toString()===key);if(document?.isDirty&&!await document.save())throw new Error('Save this file first.');
        if(!vscode.workspace.isTrusted)throw new Error('Workspace trust changed.');
        const folder=vscode.workspace.getWorkspaceFolder(selected),python=setting('pythonPath','');
        const task=new vscode.Task({type:'arya-native',path:key},folder??vscode.TaskScope.Global,`${action==='run'?'Run':'Check'} ${vscode.workspace.asRelativePath(selected)}`,'Arya',new vscode.ProcessExecution(compilerExecutable(),[action,selected.fsPath],{cwd:folder?.uri.fsPath??dirname(selected.fsPath),...(python?{env:{ARYA_PYTHON:python}}:{})}),[]);
        task.presentationOptions={reveal:vscode.TaskRevealKind.Always,panel:vscode.TaskPanelKind.Dedicated,clear:true};const execution=await vscode.tasks.executeTask(task);if(vscode.tasks.taskExecutions.includes(execution))running.set(key,execution);
      } finally {starting.delete(key);}
    } catch(error) {vscode.window.showErrorMessage(error.message);}
  }));
  register(vscode.commands.registerCommand('aryaLanguage.stop',uri=>{try{running.get(source(uri).toString())?.terminate();}catch(error){vscode.window.showErrorMessage(error.message);}}));
  register(vscode.tasks.onDidEndTask(event=>{if(event.execution.task.definition.type==='arya-native')running.delete(event.execution.task.definition.path);}));
  register(vscode.commands.registerCommand('aryaLanguage.enableFileIcons',()=>vscode.workspace.getConfiguration('workbench').update('iconTheme','arya-file-icons',vscode.ConfigurationTarget.Global)));
  register(vscode.commands.registerCommand('aryaLanguage.chooseTheme',()=>vscode.commands.executeCommand('workbench.action.selectTheme')));
  register(vscode.commands.registerCommand('aryaLanguage.gettingStarted',()=>vscode.commands.executeCommand('workbench.action.openWalkthrough','aryacode.arya-language#aryaLanguage.gettingStarted',false)));
  register(vscode.commands.registerCommand('aryaLanguage.openExample',async()=>vscode.window.showTextDocument(await vscode.workspace.openTextDocument({language:'arya',content:await readFile(join(context.extensionPath,'examples/editor-tour.arya'),'utf8')}))));
  for(const document of vscode.workspace.textDocuments)if(document.languageId==='arya')quiet(get().open(document));
}
module.exports={activate,NativeClient};
