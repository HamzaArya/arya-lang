import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyze} from '../src/language-service.js';
import {createWorkspaceAnalysisCache,definitionInWorkspace,referencesInWorkspace,renameInWorkspace,typedCompletions,signatureAt} from '../src/workspace-service.js';
import {createWorkspaceIndex} from '../src/workspace-index.js';
import {declarationModuleType} from '../src/declarations.js';
import {buildProject} from '../src/project.js';
import {compile,analyzeSource} from '../src/compiler.js';

const library={uri:'file:///workspace/lib.arya',source:'export fn total(n: number): number => n + 1'};
const main={uri:'file:///workspace/main.arya',source:'use arya "./lib.arya" as lib\nexport const value = lib.total(2)'};

test('incremental analysis reparses changed modules and contract dependents only',()=>{
  const calls:string[]=[];
  const cache=createWorkspaceAnalysisCache((source,uri,options)=>{calls.push(uri);return analyze(source,uri,options);});
  const documents=[library,main,...Array.from({length:100},(_,i)=>({uri:`file:///workspace/unrelated${i}.arya`,source:`const value = ${i}`}))];
  const first=cache.analyze(documents); calls.length=0;
  assert.equal(cache.analyze([...documents].reverse()),first);assert.equal(calls.length,0);
  const edited=[{...library,source:library.source.replace('+ 1','+ 2')},...documents.slice(1)];
  const second=cache.analyze(edited);
  assert.deepEqual(calls,[library.uri]);assert.equal(second.get(main.uri),first.get(main.uri));
  assert.equal(second.get(documents[2]!.uri),first.get(documents[2]!.uri));
  calls.length=0;
  const third=cache.analyze([{...library,source:'export fn total(n: string): string => n'},...documents.slice(1)]);
  assert.deepEqual(calls,[library.uri,main.uri]);assert.equal(third.get(main.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
  assert.equal(cache.analyze([main],{complete:true}).get(main.uri)!.diagnostics[0]?.code,'ARYA_MODULE_NOT_FOUND');
});

test('namespace navigation and rename cover static computed members and reject dynamic namespace escapes',()=>{
  const caller={...main,uri:'file:///workspace/caller.arya',source:'use arya "./lib.arya" as lib\nprint(lib["total"](2), lib?.total(3))'};
  const documents=[library,main,caller],cache=createWorkspaceAnalysisCache(),analyses=cache.analyze(documents);
  const definition=definitionInWorkspace(documents,main.uri,main.source.indexOf('total'),analyses)!;
  assert.equal(definition.uri,library.uri);
  const references=referencesInWorkspace(documents,library.uri,library.source.indexOf('total'),analyses);
  assert.equal(references.length,4);
  const edits=renameInWorkspace(documents,library.uri,library.source.indexOf('total'),'sum',{analyses});
  assert.equal(edits.filter(e=>e.uri===caller.uri).length,2);
  assert.ok(edits.some(e=>e.replacement==='"sum"'));
  const broken={uri:'file:///workspace/broken.arya',source:'use arya "./lib.arya" as lib\nconst = lib.total(1)'};
  assert.throws(()=>renameInWorkspace([library,broken],library.uri,library.source.indexOf('total'),'sum'),/syntax errors/);
  for(const use of ['const key = "total"\nlib[key](2)','const alias = lib\nalias.total(2)','Object.keys(lib)']) {
    const dynamic={...caller,source:'use arya "./lib.arya" as lib\n'+use};
    assert.throws(()=>renameInWorkspace([library,dynamic],library.uri,library.source.indexOf('total'),'sum'),/dynamic namespace/);
  }
});

test('workspace discovery overlays buffers, follows disk lifecycle, and excludes generated files',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-workspace-'));const index=createWorkspaceIndex();
  t.after(async()=>{index.dispose();await rm(root,{recursive:true,force:true});});
  const uri=(name:string)=>pathToFileURL(join(root,name)).href;
  await writeFile(join(root,'lib.arya'),library.source);await writeFile(join(root,'main.arya'),main.source);
  await mkdir(join(root,'.arya'));await writeFile(join(root,'.arya','generated.arya'),'const = broken');
  index.configure([pathToFileURL(root).href]);
  const open={uri:uri('main.arya'),source:'use arya "./lib.arya" as lib\nlib.total("bad")'};
  let state=await index.refresh([open]);assert.equal(state.complete,true);assert.equal(state.documents.length,2);
  const cache=createWorkspaceAnalysisCache();assert.equal(cache.analyze(state.documents).get(open.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
  const offset=open.source.indexOf('total');assert.equal(definitionInWorkspace(state.documents,open.uri,offset)!.uri,uri('lib.arya'));
  const completion={...open,source:'use arya "./lib.arya" as lib\nlib.'};
  const analyses=cache.analyze([...state.documents.filter(d=>d.uri!==open.uri),completion]);
  assert.ok(typedCompletions(completion.source,completion.source.length,analyses.get(open.uri),{uri:open.uri,analyses}).some(c=>c.label==='total'));
  const unfinished='use arya "./lib.arya" as lib\nlib.total(';
  assert.match(signatureAt(unfinished,unfinished.length,undefined,{uri:open.uri,analyses})!.label,/number/);
  await writeFile(join(root,'lib.arya'),'export fn total(n: string): string => n');index.invalidate();
  state=await index.refresh([open]);assert.deepEqual(cache.analyze(state.documents).get(open.uri)!.diagnostics,[]);
  assert.equal((await index.refresh([])).documents.find(d=>d.uri===uri('main.arya'))!.source,main.source);
  await rm(join(root,'lib.arya'));index.invalidate();state=await index.refresh([open]);
  assert.equal(cache.analyze(state.documents,{complete:state.complete}).get(open.uri)!.diagnostics[0]?.code,'ARYA_MODULE_NOT_FOUND');
  await writeFile(join(root,'oversized.arya'),' '.repeat(256*1024+1));index.invalidate();state=await index.refresh([open]);
  assert.equal(state.complete,false);assert.match(state.issues.join('\n'),/256 KiB/);
});

test('bounded declaration imports check npm and local contracts without running package code',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-declarations-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const pkg=join(root,'node_modules','typed-library');await mkdir(pkg,{recursive:true});
  const contract='export type Row = {name: string; amount: number};\nexport declare function total(row: Row, scale?: number): number;';
  assert.equal(declarationModuleType(contract)?.kind,'record');
  for(const unsupported of ['export class Row {}','export function identity<T>(value:T):T;'])assert.equal(declarationModuleType(unsupported),undefined);
  await writeFile(join(pkg,'package.json'),JSON.stringify({name:'typed-library',type:'module',exports:{'.':{types:'./index.d.ts',default:'./index.js'}}}));
  await writeFile(join(pkg,'index.d.ts'),contract);await writeFile(join(pkg,'index.js'),'throw new Error("MUST NOT EXECUTE")');
  const file=join(root,'main.arya');
  await writeFile(file,'use js "typed-library" as lib\nexport const value: number = lib.total({name: "Arya", amount: 2})');
  assert.match((await buildProject(file)).modules[0]!.compilation.typing.declarations,/value: number/);
  await writeFile(file,'use js "typed-library" as lib\nexport const value: number = lib.total({name: "Arya", amount: "bad"})');
  await assert.rejects(buildProject(file),/Expected.*number/);
  await writeFile(join(root,'local.d.ts'),'export declare const size: number;');
  await writeFile(file,'use js "./local.js" as local\nexport const value: number = local.size');
  assert.match((await buildProject(file)).modules[0]!.compilation.typing.declarations,/value: number/);
});

test('library contracts reject incorrect arguments and preserve list pipeline element types',async()=>{
  for(const source of [
    'use std "list" as list\nconst values: number[] = list.take([1], "2")',
    'use std "list" as list\nconst values: number[] = list.filter([1], 0)',
    'use std "web" as web\nconst result: unknown = web.response("200", "ok")',
    'use std "mysql" as mysql\nconst pool: unknown = await mysql.connect({port: "3306"})',
    'use std "mysql" as mysql\nconst pool = await mysql.connect()\nconst rows: unknown = await pool.rows(2)',
    'use std "python" as python\nconst result: unknown = await python.call(null, "bad")',
    'use std "env" as env\nconst port: number = env.int(123)',
  ]) assert.equal(analyzeSource(source).diagnostics[0]?.code,'ARYA_TYPE',source);
  const source='use std "list" as list\nexport const values: number[] = [1,2,3] |> list.filter(fn(n: number) => n > 1) |> list.take(1)\nexport const names: string[] = list.map([{name: "Arya"}], "name")';
  const output=compile(source);const module=await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64'));
  assert.deepEqual(module.values,[2]);assert.deepEqual(module.names,['Arya']);assert.match(output.typing.declarations,/values: \(number\)\[\]/);
});

test('portable LSP navigates and renames unopened callers and refreshes disk contracts', {timeout:15000}, async t=>{
  const {spawn}=await import('node:child_process');
  const {resolve}=await import('node:path');
  const {createProtocolConnection,StreamMessageReader,StreamMessageWriter}=await import('vscode-languageserver-protocol/node.js');
  const root=await mkdtemp(join(tmpdir(),'arya-project-lsp-'));
  await writeFile(join(root,'lib.arya'),library.source);
  await writeFile(join(root,'caller.arya'),'use arya "./lib.arya" as lib\nprint(lib.total(3))');
  const source='use arya "./lib.arya" as lib\nprint(lib.total(2))';
  const uri=pathToFileURL(join(root,'main.arya')).href,libUri=pathToFileURL(join(root,'lib.arya')).href,callerUri=pathToFileURL(join(root,'caller.arya')).href;
  await writeFile(join(root,'main.arya'),source);
  const child=spawn(process.execPath,[resolve('dist/lsp.cjs')],{stdio:['pipe','pipe','pipe']});
  const closed=new Promise<void>(ok=>child.once('close',()=>ok()));
  const connection=createProtocolConnection(new StreamMessageReader(child.stdout),new StreamMessageWriter(child.stdin));
  t.after(async()=>{connection.dispose();child.kill();await closed;await rm(root,{recursive:true,force:true});});
  connection.listen();
  const diagnostics=()=>new Promise<{code?:string|number}[]>(ok=>{
    const subscription=connection.onNotification('textDocument/publishDiagnostics',(value:{uri:string;diagnostics:{code?:string|number}[]})=>{if(value.uri===uri){subscription.dispose();ok(value.diagnostics);}});
  });
  await connection.sendRequest('initialize',{processId:null,rootUri:pathToFileURL(root).href,capabilities:{}});
  await connection.sendNotification('initialized',{});
  let next=diagnostics();await connection.sendNotification('textDocument/didOpen',{textDocument:{uri,languageId:'arya',version:1,text:source}});assert.deepEqual(await next,[]);
  const point={textDocument:{uri},position:{line:1,character:11}};
  const definition=await connection.sendRequest<{uri:string}>('textDocument/definition',point);assert.equal(definition.uri,libUri);
  const references=await connection.sendRequest<{uri:string}[]>('textDocument/references',{...point,context:{includeDeclaration:true}});
  assert.deepEqual(references.map(r=>r.uri).sort(),[uri,libUri,callerUri].sort());
  const usages=await connection.sendRequest<{uri:string}[]>('textDocument/references',{...point,context:{includeDeclaration:false}});assert.equal(usages.length,2);
  const edits=await connection.sendRequest<{changes:Record<string,{newText:string}[]>}>('textDocument/rename',{...point,newName:'sum'});
  assert.deepEqual(Object.keys(edits.changes).sort(),[uri,libUri,callerUri].sort());assert.ok(Object.values(edits.changes).flat().every(edit=>edit.newText==='sum'));
  next=diagnostics();await writeFile(join(root,'lib.arya'),'export fn total(n: string): string => n');
  await connection.sendNotification('workspace/didChangeWatchedFiles',{changes:[{uri:libUri,type:2}]});
  assert.equal((await next)[0]?.code,'ARYA_TYPE');
  await connection.sendRequest('shutdown');await connection.sendNotification('exit');
});

test('a 1024-module dependency chain stays bounded and invalidates only changed contracts',()=>{
  const documents=Array.from({length:1024},(_,i)=>({uri:`file:///large/module${i}.arya`,source:i===1023 ? 'export fn value(n: number): number => n' : `use arya "./module${i+1}.arya" as next\nexport fn value(n: number): number => next.value(n)`}));
  let reparsed=0;
  const cache=createWorkspaceAnalysisCache((...args)=>{reparsed++;return analyze(...args);});
  const first=cache.analyze(documents);assert.equal(first.size,1024);assert.deepEqual(first.get(documents[0]!.uri)!.diagnostics,[]);
  reparsed=0;documents[1023]={...documents[1023]!,source:'export fn value(n: number): number => n + 1'};
  const second=cache.analyze(documents);assert.equal(reparsed,1);assert.equal(second.get(documents[0]!.uri),first.get(documents[0]!.uri));
});
