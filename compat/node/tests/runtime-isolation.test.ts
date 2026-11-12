import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../src/compiler.js';
import { hostGlobals } from '../src/host-globals.js';

test('all supported module host bindings are isolated from runtime and standard initialization', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya-isolation-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const source = `use std "list" as list
export const result = [str(42), number("2"), len([1]), range(3), list.sum([1,2])]
${hostGlobals.map(name => `export const ${name} = "user-${name}"`).join('\n')}
export fn closure() { return String }
export fn nested(String) { return str(String) }
`;
  const output = join(root, 'main.mjs');
  await writeFile(output, compile(source, {filename:join(root, 'main.arya'), outputFilename:output}).code);
  const mod = await import(pathToFileURL(output).href);
  assert.deepEqual(mod.result, ['42',2,1,[0,1,2],3]);
  for (const name of hostGlobals) assert.equal(mod[name], 'user-' + name);
  assert.equal(mod.closure(), 'user-String');
  assert.equal(mod.nested(12), '12');
});

test('import aliases, Python bridge, TDZ and recursion retain lexical behavior', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya-isolation-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  await writeFile(join(root, 'host.cjs'), 'module.exports = {value: 9};');
  const output = join(root,'main.mjs');
  await writeFile(output, compile(`use js "./host.cjs" as process
use python "math" as String
export const result = [process.value, String.sqrt(81), str(42)]
export fn recursion(Number) { if Number == 0 { return 1 }; return Number * recursion(Number - 1) }
export fn temporal() { const read = fn() => Promise; read(); const Promise = 1 }
`, join(root,'main.arya')).code);
  const mod = await import(pathToFileURL(output).href);
  assert.deepEqual(mod.result,[9,9,'42']);
  assert.equal(mod.recursion(5),120);
  assert.throws(() => mod.temporal(),ReferenceError);
});

test('generated async exports retain supplied transaction identity and AsyncLocalStorage',async t=>{
  const {AsyncLocalStorage}=await import('node:async_hooks');const storage=new AsyncLocalStorage<string>();
  const root=await mkdtemp(join(tmpdir(),'arya-tx-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const output=join(root,'main.mjs');await writeFile(output,compile('export async fn invoke(tx, context) { await Promise.resolve(); return await tx.read(context) }').code);
  const {invoke}=await import(pathToFileURL(output).href);
  const tx={read:async function(context:{tenant:string}){assert.equal(this,tx);assert.equal(storage.getStore(),context.tenant);return context;}};
  const a={tenant:'alpha'},b={tenant:'bravo'};
  const results=await Promise.all([storage.run(a.tenant,()=>invoke(tx,a)),storage.run(b.tenant,()=>invoke(tx,b))]);
  assert.equal(results[0],a);assert.equal(results[1],b);
});
