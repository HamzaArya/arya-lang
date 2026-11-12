import test from 'node:test';
import assert from 'node:assert/strict';
import {AryaError,compile,analyzeSource,parseSource} from '../src/compiler.js';
import {analyze} from '../src/language-service.js';
import {formatSource} from '../src/tooling.js';

const random = (seed:number) => () => {seed = (Math.imul(seed,1664525)+1013904223)>>>0;return seed;};

test('seeded expression programs agree with JavaScript values and emitted declarations',async()=>{
  const next=random(0x41525941),expected:number[]=[];
  const expression=(depth:number):string=>{
    if(!depth || next()%4===0)return String(next()%9+1);
    const left=expression(depth-1),right=expression(depth-1),operator=['+','-','*','%'][next()%4]!;
    return `(${left} ${operator} ${right})`;
  };
  const statements=Array.from({length:120},(_,i)=>{
    const value=expression(3);expected.push(new Function('return '+value)());return `export const value${i}: number = ${value}`;
  });
  const source=statements.join('\n'),output=compile(source),module=await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64'));
  for(const [i,value] of expected.entries())assert.equal(module['value'+i],value,`seed 0x41525941, expression ${i}`);
  assert.equal((output.typing.declarations.match(/: number;/g)??[]).length,expected.length);
  assert.equal(compile(formatSource(source)).typing.declarations,output.typing.declarations);
});

test('seeded malformed source returns bounded diagnostics without internal errors',()=>{
  const next=random(0x46555a5a),base='fn total(n: number): number { if n > 0 { return n + 1 }; return 0 }\nprint(total(2))';
  const fragments=[')','}','[','"','...','?.','=>','\nconst = ','# comment\n','\u0000',' |> await ',' : Promise<'];
  for(let i=0;i<500;i++){
    const start=next()%base.length,end=Math.min(base.length,start+next()%8),fragment=fragments[next()%fragments.length]!;
    const source=base.slice(0,start)+fragment+base.slice(end);
    try {analyzeSource(source);compile(source);}
    catch(error){assert.ok(error instanceof AryaError,`seed 0x46555a5a, case ${i}: ${String(error)}`);assert.ok(error.diagnostics.length>0&&error.diagnostics.length<=20);}
    assert.ok(analyze(source,'untitled:fuzz').diagnostics.length<=20);
  }
});

test('large flat files and extreme expression structures respect documented resource limits',()=>{
  const source=Array.from({length:1000},(_,i)=>`const value${i} = ${i}`).join('\n');
  assert.equal(parseSource(source,'large.arya').symbols.length,1000);
  for(const source of [
    'print('+Array(2000).fill('1').join(' + ')+')',
    'const value = {}\nprint(value'+'.item'.repeat(2000)+')',
    'print('+'('.repeat(200)+'1'+')'.repeat(200)+')',
    ' '.repeat(256*1024+1),
    '\n'.repeat(50001),
  ])assert.throws(()=>compile(source),(error:unknown)=>error instanceof AryaError&&/deeply|256 KiB|too many tokens/.test(error.message));
});

test('selected standard runtimes omit unrelated services and deduplicate shared dependencies',async()=>{
  const output=compile('use std "list" as list\nexport const value = list.sum([1,2,3])');
  assert.ok(Buffer.byteLength(output.code)<15000);
  assert.doesNotMatch(output.code,/__arya_asyncPythonWorker|__arya_uiTemplateCatalog|__arya_mysql =/);
  assert.equal((await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64'))).value,6);
  const combined=compile('use std "web" as web\nuse std "mysql" as mysql\nuse std "json" as json\nexport const response = web.response(200, json.stringify({ok:true}))');
  assert.equal((combined.code.match(/import \{AsyncLocalStorage as __arya_AsyncLocalStorage\}/g)??[]).length,1);
  const module=await import('data:text/javascript;base64,'+Buffer.from(combined.code).toString('base64'));
  assert.equal(module.response.status,200);assert.equal(module.response.body,'{"ok":true}');
});
