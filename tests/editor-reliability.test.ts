import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createProtocolConnection, StreamMessageReader, StreamMessageWriter} from 'vscode-languageserver-protocol/node.js';
import type {Diagnostic} from 'vscode-languageserver-protocol';
import {createWorkspaceAnalysisCache, renameInWorkspace, signatureAt, typedCompletions} from '../src/workspace-service.js';

const library = {uri:'file:///arya-editor-test/lib.arya', source:'export fn total(n: number): number => n + 1'};
const main = {uri:'file:///arya-editor-test/main.arya', source:'use arya "./lib.arya" as lib\nlib.total("bad")'};

test('workspace cache reuses a snapshot and invalidates on dependency open, edit, close and reopen', () => {
  const cache = createWorkspaceAnalysisCache();
  const alone = cache.analyze([main]);
  assert.deepEqual(alone.get(main.uri)!.diagnostics, []);
  assert.equal(cache.analyze([{...main}]), alone);
  const opened = cache.analyze([main,library]);
  assert.notEqual(opened, alone);
  assert.equal(opened.get(main.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
  assert.equal(cache.analyze([library,main]), opened);
  const edited = {...library, source:'export fn total(n: string): string => n'};
  assert.deepEqual(cache.analyze([main,edited]).get(main.uri)!.diagnostics, []);
  assert.equal(cache.analyze([main,library]).get(main.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
  assert.deepEqual(cache.analyze([main]).get(main.uri)!.diagnostics, []);
  assert.equal(cache.analyze([main,library]).get(main.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
  const previous = cache.analyze([main,library]);
  cache.clear();
  assert.notEqual(cache.analyze([main,library]), previous);
});

test('open-buffer rename refuses public symbols but preserves local rename and explicit snapshot API', () => {
  const caller = {...main, source:main.source.replace('"bad"','2')};
  for (const [document, offset] of [[library,library.source.indexOf('total')],[caller,caller.source.indexOf('total')]] as const) {
    assert.throws(() => renameInWorkspace([library,caller],document.uri,offset,'sum',{openDocumentsOnly:true}), /unopened files/);
  }
  assert.equal(renameInWorkspace([library,caller],library.uri,library.source.indexOf('total'),'sum').length,2);
  const local = {uri:'untitled:local',source:'const amount = 1\nprint(amount)'};
  assert.equal(renameInWorkspace([local],local.uri,local.source.indexOf('amount'),'value',{openDocumentsOnly:true}).length,2);
});

test('typed completion repairs a trailing member without manufacturing bindings in comments or strings', () => {
  const declaration = 'const person: {name: string} = {name: "Arya"}\n';
  for (const tail of ['person.','person.na']) {
    const source = declaration + tail;
    assert.ok(typedCompletions(source,source.length).some(item => item.label === 'name' && item.detail === 'string'));
  }
  for (const tail of ['# person.','"person."','unknown.']) {
    const source = declaration + tail;
    const offset = tail.startsWith('"') ? source.length-1 : source.length;
    assert.deepEqual(typedCompletions(source,offset), []);
  }
  const broken = declaration + 'const = 1\nperson.';
  assert.deepEqual(typedCompletions(broken,broken.length), []);
});

test('signature help repairs bounded unfinished EOF calls and ignores punctuation in string arguments', () => {
  const declaration = 'fn total(n: number, other: number): number => n + other\n';
  for (const [tail, parameter] of [['total(',0],['total(1,',1],['total(1, 2',1]] as const) {
    const source = declaration + tail;
    assert.match(signatureAt(source,source.length)!.label,/number/);
    assert.equal(signatureAt(source,source.length)!.activeParameter,parameter);
  }
  const strings = 'fn join(a: string, b: string): string => a + b\njoin(")", ';
  assert.equal(signatureAt(strings,strings.length)!.activeParameter,1);
  const unrelated = declaration + 'const = 1\ntotal(';
  assert.equal(signatureAt(unrelated,unrelated.length),undefined);
});

test('LSP republishes importer diagnostics on dependency open, edit, close and reopen', {timeout:15_000}, async t => {
  // Use a temporary server file rather than a large -e argument (Windows argv is bounded).
  const directory = await mkdtemp(join(tmpdir(),'arya-editor-lsp-'));
  let stop = async () => {};
  t.after(async () => {
    try { await stop(); } finally { await rm(directory,{recursive:true,force:true}); }
  });
  const result = await build({entryPoints:['src/lsp.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',write:false});
  const server = join(directory,'lsp.cjs');
  await writeFile(server,result.outputFiles[0]!.text);
  const child = spawn(process.execPath,[server],{stdio:['pipe','pipe','pipe']});
  const closed = new Promise<void>(resolve => child.once('close',() => resolve()));
  let dispose = () => {};
  stop = async () => {
    dispose();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  };
  const connection = createProtocolConnection(new StreamMessageReader(child.stdout),new StreamMessageWriter(child.stdin));
  dispose = () => connection.dispose();
  const waiters = new Map<string,(diagnostics:Diagnostic[])=>void>();
  connection.onNotification('textDocument/publishDiagnostics',(params:{uri:string;diagnostics:Diagnostic[]}) => {
    const waiter = waiters.get(params.uri); if(waiter) {waiters.delete(params.uri);waiter(params.diagnostics);}
  });
  connection.listen();
  await connection.sendRequest('initialize',{processId:null,rootUri:null,capabilities:{}});
  await connection.sendNotification('initialized',{});
  const diagnostics = (uri:string) => new Promise<Diagnostic[]>(resolve => waiters.set(uri,resolve));
  const open = (document:typeof main) => connection.sendNotification('textDocument/didOpen',{textDocument:{uri:document.uri,languageId:'arya',version:1,text:document.source}});
  let next = diagnostics(main.uri); await open(main); assert.deepEqual(await next,[]);
  next = diagnostics(main.uri); await open(library); assert.equal((await next)[0]?.code,'ARYA_TYPE');
  next = diagnostics(main.uri);
  await connection.sendNotification('textDocument/didChange',{textDocument:{uri:library.uri,version:2},contentChanges:[{text:'export fn total(n: string): string => n'}]});
  assert.deepEqual(await next,[]);
  next = diagnostics(main.uri);
  await connection.sendNotification('textDocument/didClose',{textDocument:{uri:library.uri}});
  assert.deepEqual(await next,[]);
  next = diagnostics(main.uri); await open(library); assert.equal((await next)[0]?.code,'ARYA_TYPE');
  next = diagnostics(main.uri);
  await connection.sendNotification('textDocument/didClose',{textDocument:{uri:library.uri}});
  assert.deepEqual(await next,[]);
  next = diagnostics(main.uri); await open(library); assert.equal((await next)[0]?.code,'ARYA_TYPE');
  await assert.rejects(connection.sendRequest('textDocument/rename',{textDocument:{uri:library.uri},position:{line:0,character:10},newName:'sum'}),/unopened files/);
  await connection.sendRequest('shutdown');
  await connection.sendNotification('exit');
});

test('VS Code adapter refreshes existing importer diagnostics when dependencies open, change and close', async () => {
  const bundled = await build({entryPoints:['editors/vscode/src/arya-language.ts'],bundle:true,external:['vscode'],platform:'node',format:'cjs',target:'node22',write:false});
  const buffer = (document:typeof main) => ({languageId:'arya',isClosed:false,uri:{toString:()=>document.uri},getText:()=>document.source,positionAt:(offset:number)=>({line:0,character:offset})});
  type Buffer = ReturnType<typeof buffer>;
  type Callback = (document:Buffer)=>void;
  let onOpen:Callback = ()=>{}, onClose:Callback = ()=>{}, onChange:(event:{document:Buffer})=>void = ()=>{};
  const values = new Map<string,{code?:string}[]>();
  const disposable = {dispose(){}};
  const workspace = {
    textDocuments:[buffer(main)],
    onDidOpenTextDocument(callback:Callback) {onOpen=callback;return disposable;},
    onDidCloseTextDocument(callback:Callback) {onClose=callback;return disposable;},
    onDidChangeTextDocument(callback:typeof onChange) {onChange=callback;return disposable;},
  };
  const vscode = {
    workspace,
    languages:new Proxy({createDiagnosticCollection:()=>({
      set(uri:{toString():string},diagnostics:{code?:string}[]) {values.set(uri.toString(),diagnostics);},
      delete(uri:{toString():string}) {values.delete(uri.toString());},
      dispose(){},
    })}, {get(target,key) {return key==='createDiagnosticCollection'?target.createDiagnosticCollection:()=>disposable;}}),
    Diagnostic:class {code?:string; constructor(..._args:unknown[]){}},
    Range:class {constructor(..._args:unknown[]){}},
    DiagnosticSeverity:{Error:1}, CodeActionKind:{QuickFix:'quickfix'},
  };
  const require = createRequire(process.cwd()+'/editor-reliability.cjs');
  const module = {exports:{} as {registerAryaLanguage(context:{subscriptions:{dispose():void}[]}):void}};
  new Function('require','module','exports',bundled.outputFiles[0]!.text)((id:string)=>id==='vscode'?vscode:require(id),module,module.exports);
  const context = {subscriptions:[] as {dispose():void}[]};
  module.exports.registerAryaLanguage(context);
  try {
    assert.deepEqual(values.get(main.uri),[]);
    const dependency=buffer(library); workspace.textDocuments.push(dependency); onOpen(dependency);
    assert.equal(values.get(main.uri)?.[0]?.code,'ARYA_TYPE');
    dependency.getText=()=>'export fn total(n: string): string => n'; onChange({document:dependency});
    await new Promise(resolve=>setTimeout(resolve,230));
    assert.deepEqual(values.get(main.uri),[]);
    dependency.getText=()=>library.source; onChange({document:dependency});
    await new Promise(resolve=>setTimeout(resolve,230));
    assert.equal(values.get(main.uri)?.[0]?.code,'ARYA_TYPE');
    dependency.isClosed=true; workspace.textDocuments=workspace.textDocuments.filter(d=>d!==dependency); onClose(dependency);
    assert.deepEqual(values.get(main.uri),[]);
    assert.equal(values.has(library.uri),false);
  } finally {for(const subscription of context.subscriptions)subscription.dispose();}
});
