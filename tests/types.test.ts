import {analyzeWorkspace} from '../src/language-service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSource, compile} from '../src/compiler.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProject} from '../src/project.js';
const errors=(source:string)=>analyzeSource(source).diagnostics;
test('optional types catch fields, arguments, nullable reads and incompatible returns',()=>{
  assert.equal(errors('fn total(n: number): number { return n + 1 }\ntotal("2")')[0]?.code,'ARYA_TYPE');
  assert.match(errors('const invoice: {amount: number} = {amount: 2}\nprint(invoice.amunt)')[0]!.message,/amunt/);
  assert.match(errors('fn read(row: {amount: number} | null): number { return row.amount }')[0]!.message,/null/);
  assert.equal(errors('fn read(row: {amount: number} | null): number { if row == null { return 0 }; return row.amount }').length,0);
  assert.equal(errors('fn read(row: {amount: number} | null): number { guard row != null else { return 0 }; return row.amount }').length,0);
  assert.equal(errors('fn read(): {amount: number} { return {amunt: 2} }')[0]?.code,'ARYA_TYPE');
  assert.equal(errors('const payload: unknown = 2\nprint(payload.amount)')[0]?.code,'ARYA_TYPE_UNKNOWN');
  assert.equal(errors('use js "unexecuted" as api: {calculate: fn(number): number}\nconst n: number = api.calculate(2)').length,0);
  assert.equal(errors('use js "unexecuted" as api\nconst n: number = api.calculate(2)')[0]?.code,'ARYA_TYPE_UNKNOWN');
  assert.equal(errors('async fn load(value: number): number { return value }\nconst n: number = await load(2)').length,0);
  assert.match(compile('export fn total(n: number): number => n + 1').typing.declarations,/arg0: number/);
});
test('project checks imported Arya function contracts without executing dependencies',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-types-')); t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'lib.arya'),'export fn total(n: number): number => n + 1');
  await writeFile(join(root,'main.arya'),'use arya "./lib.arya" as lib\nlib.total("bad")');
  await assert.rejects(buildProject(join(root,'main.arya')),/Expected number/);
  await writeFile(join(root,'main.arya'),'use arya "./lib.arya" as lib\nexport const result = lib.total(2)');
  const project=await buildProject(join(root,'main.arya'));
  assert.match(project.modules.at(-1)!.compilation.typing.declarations,/result: number/);
});

test('strict null guards do not eliminate undefined and synchronous promises retain their type',()=>{
  assert.ok(errors('fn read(row: {amount: number} | null | undefined): number { if row != null { return row.amount }; return 0 }').length);
  assert.ok(errors('async fn load(n: number): number => n\nfn read(n: number): number => load(n)').length);
});

test('parameter defaults are checked and explicit undefined selects an optional default',()=>{
  assert.equal(errors('fn f(n: number = "bad"): number => n')[0]?.code,'ARYA_TYPE');
  assert.equal(errors('fn f(n: number = 2): number => n\nf(undefined)').length,0);
});

test('open-document editor diagnostics check the same imported contracts as CLI',()=>{
  const documents=[{uri:'file:///types/lib.arya',source:'export fn total(n: number): number => n'}, {uri:'file:///types/main.arya',source:'use arya "./lib.arya" as lib\nlib.total("bad")'}];
  assert.equal(analyzeWorkspace(documents).get(documents[1]!.uri)!.diagnostics[0]?.code,'ARYA_TYPE');
});

test('anonymous function return annotations activate checking',()=>{
  assert.equal(errors('const f = fn(): number => "bad"')[0]?.code,'ARYA_TYPE');
});

test('rest parameters are arrays and checked declarations cannot publish scalar rest types',()=>{
  assert.equal(errors('export fn f(...values: number): number => values + 1')[0]?.code,'ARYA_TYPE');
  assert.match(compile('export fn f(...values: number[]): number => values.length').typing.declarations,/\.\.\.arg0: \(number\)\[\]/);
  assert.match(compile('export fn f(...values): number => values.length').typing.declarations,/\.\.\.arg0: \(any\)\[\]/);
});
