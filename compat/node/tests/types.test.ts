import {analyzeWorkspace} from '../src/language-service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSource, compile} from '../src/compiler.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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

test('checked decimal and datetime imports enforce documented string contracts and explicit rounding',()=>{
  for(const source of [
    'use std "decimal" as d\nconst amount: string = d.add(0.1, "0.2")',
    'use std "decimal" as d\nconst amount: string = d.divide("1", "3", 2)',
    'use std "decimal" as d\nconst amount: string = d.quantize("1.23", "2", "half-up")',
    'use std "decimal" as d\nconst amount: number = d.multiply("2", "3")',
    'use std "decimal" as d\nconst amount: string = d.ad("1", "2")',
    'use std "datetime" as t\nconst date: string = t.date(20260101)',
    'use std "datetime" as t\nconst date: string = t.dateAt("2026-01-01T00:00:00Z")',
    'use std "datetime" as t\nconst date: string = t.zoned("2026-01-01T00:00:00Z", "UTC").zone',
  ]) assert.equal(errors(source)[0]?.code,'ARYA_TYPE',source);

  assert.equal(errors('use std "decimal" as d\nconst amount: string = d.quantize(d.add("0.1", "0.2"), 2, "half-even")\nconst n: number = d.toNumber(amount)').length,0);
  assert.equal(errors('use std "datetime" as t\nconst date: string = t.zoned(t.atOffset("2026-01-01", "00:00:00", "+04:30"), "Asia/Kabul").date').length,0);
  assert.equal(errors('use std "datetime" as t\nconst date: string = t.fromDate(t.toDate("2026-01-01T00:00:00Z"))').length,0);
  // Existing unannotated programs continue to rely on runtime validation.
  assert.equal(errors('use std "decimal" as d\nprint(d.add(1, 2))').length,0);
});

test('business standard-library signatures propagate to declarations and project import checks',async t=>{
  const source='use std "decimal" as d\nexport fn amount(value: string) => d.add(value, "0.2")';
  assert.match(compile(source).typing.declarations,/arg0: string\) => string/);
  const root=await mkdtemp(join(tmpdir(),'arya-standard-types-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'lib.arya'),source);
  await writeFile(join(root,'main.arya'),'use arya "./lib.arya" as lib\nconst result: number = lib.amount("0.1")');
  await assert.rejects(buildProject(join(root,'main.arya')),/Expected number, received string/);
});

test('inferred returns include fallthrough and exclude unreachable or overridden returns',()=>{
  assert.match(errors('fn maybe(flag: boolean) { if flag { return 1 } }\nconst value: number = maybe(false)')[0]!.message,/undefined/);
  assert.match(compile('export fn maybe(flag: boolean) { if flag { return 1 } }').typing.declarations,/=> number \| undefined/);
  assert.match(compile('export async fn maybe(flag: boolean) { if flag { return 1 } }').typing.declarations,/Promise<number \| undefined>/);
  assert.match(compile('export fn f() { return 1; return "unreachable" }').typing.declarations,/=> number;/);
  assert.match(compile('export fn f() { try { return 1 } finally { return "final" } }').typing.declarations,/=> string;/);
  assert.match(compile('export fn f() { throw "failure" }').typing.declarations,/=> never;/);
});

test('completion analysis handles try, catch, finally, and loop exits',()=>{
  for(const source of [
    'fn f(): number { try { return 1 } catch err { return 2 } }',
    'fn f(): number { try { return 1 } finally { const x = 2 } }',
    'fn f(): number { try { throw "failure" } finally { return 2 } }',
    'fn f(): number { while true { return 1 } }',
    'fn f(): number { while true { continue; return "unreachable" } }',
  ])assert.equal(errors(source).length,0,source);
  for(const source of [
    'fn f(): number { try { return 1 } catch err { const x = 2 } }',
    'fn f(flag: boolean): number { try { if flag { return 1 } } finally { const x = 2 } }',
    'fn f(): number { while true { break; return 1 } }',
    'fn f(): number { while true { try { return 1 } finally { break } } }',
    'fn f(flag: boolean): number { while flag { continue; return 1 } }',
  ])assert.match(errors(source)[0]!.message,/undefined/,source);
  assert.match(compile('export fn f(flag: boolean) { try { return 1 } finally { if flag { return "final" } } }').typing.declarations,/=> number \| string;/);
});

test('defaults before required parameters preserve positional arity and valid declarations',()=>{
  assert.match(errors('fn f(a: number = 1, b: number): number => b\nconst n: number = f(2)')[0]!.message,/at least 2/);
  assert.equal(errors('fn f(a: number = 1, b: number): number => b\nconst n: number = f(undefined, 2)').length,0);
  assert.match(compile('export fn f(a: number = 1, b: number): number => b').typing.declarations,/arg0: number \| undefined, arg1: number/);
});

test('spreads flatten arrays and check possible argument positions and guaranteed arity',()=>{
  for(const source of [
    'const values: number[] = [1]\nconst copy: number[] = [...values]',
    'fn f(...values: number[]): number => values.length\nconst values: number[] = [1]\nf(...values)',
    'fn f(a: number, b: number): number => a + b\nf(...[1, 2])',
    'fn f(a: number, ...values: number[]): number => a\nconst values: number[] = [1]\nf(1, ...values)',
    'const characters: string[] = [..."ab"]',
  ])assert.equal(errors(source).length,0,source);
  for(const source of [
    'const values: number[] = [1]\nconst copy: string[] = [...values]',
    'fn f(...values: number[]): number => values.length\nconst values: string[] = ["x"]\nf(...values)',
    'fn f(a: number): number => a\nconst values: number[] = []\nf(...values)',
    'fn f(a: number, b: string = "x"): number => a\nconst values: number[] = [1]\nf(1, ...values)',
    'const copy: number[] = [...1]',
    'const values: unknown = [1]\nconst copy: number[] = [...values]',
  ])assert.equal(errors(source)[0]?.code,'ARYA_TYPE',source);
  assert.match(compile('const values: number[] = [1]\nexport const copy = [...values]').typing.declarations,/copy: \(number\)\[\]/);
});

test('inferred return and spread declarations agree with compiled runtime behavior',async()=>{
  const source=`
export fn maybe(flag: boolean) { if flag { return 1 } }
export fn caught(): number { try { throw "failure" } catch err { return 2 } }
export fn overridden() { try { return 1 } finally { return "final" } }
export fn defaulted(a: number = 1, b: number): number => a + b
fn count(...values: number[]): number => values.length
const values: number[] = [1, 2]
export const copy: number[] = [...values, 3]
export const size: number = count(...values)
`;
  const output=compile(source);
  const module=await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64'));
  assert.equal(module.maybe(false),undefined);
  assert.equal(module.maybe(true),1);
  assert.equal(module.caught(),2);
  assert.equal(module.overridden(),'final');
  assert.equal(module.defaulted(undefined,2),3);
  assert.deepEqual(module.copy,[1,2,3]);
  assert.equal(module.size,2);
  assert.match(output.typing.declarations,/maybe: .*number \| undefined/);
  assert.match(output.typing.declarations,/overridden: .*string/);
});


test('function union declarations preserve callback precedence and default semantics',async t=>{
  const output=compile('export fn f(cb: fn(number): number = fn(x: number): number => x, n: number): number => cb(n)');
  assert.match(output.typing.declarations,/arg0: \(\(arg0: number\) => number\) \| undefined, arg1: number/);
  const maybe=compile('export fn maybe(flag: boolean) { if flag { return fn(x: number): number => x } }');
  assert.match(maybe.typing.declarations,/=> \(\(arg0: number\) => number\) \| undefined/);
  const root=await mkdtemp(join(tmpdir(),'arya-function-union-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'contract.ts'),output.typing.declarations+maybe.typing.declarations+`
const defaultResult: number = f(undefined, 2);
const callbackResult: number = f(n => n + 1, 2);
// @ts-expect-error A callback must return number, not undefined.
f(n => undefined, 2);
const optionalCallback: ((n: number) => number) | undefined = maybe(false);
`);
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],lib:['es2022']},files:['contract.ts']}));
  const checked=spawnSync(process.execPath,[join(process.cwd(),'node_modules/typescript/bin/tsc'),'-p',join(root,'tsconfig.json')],{encoding:'utf8',timeout:30000});
  assert.ifError(checked.error);
  assert.equal(checked.status,0,checked.stdout+checked.stderr);
  const module=await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64'));
  assert.equal(module.f(undefined,2),2);
  assert.equal(module.f((n:number)=>n+1,2),3);
});
