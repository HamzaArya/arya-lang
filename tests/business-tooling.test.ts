import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {compile,formatSource,lintSource,AryaError} from '../src/compiler.js';
import {createProjectBuilder,writeProject} from '../src/project.js';
import {aryaPlugin} from '../src/esbuild.js';
import {referencesInWorkspace,renameInWorkspace,signatureAt} from '../src/language-service.js';
test('formatter preserves comments, raw strings and tokens and is idempotent',()=>{
  const source='fn f() {   # comment\nconst x = """first\n    second\nend"""\nreturn x  // tail\n}\n';
  const formatted=formatSource(source);assert.equal(formatSource(formatted),formatted);
  assert.match(formatted,/# comment/);assert.match(formatted,/\n    second\nend/);
  assert.equal(new Function(compile(source).code+'\nreturn f()')(),new Function(compile(formatted).code+'\nreturn f()')());
  assert.throws(()=>formatSource('const = 1'));
  assert.deepEqual(lintSource('fn f() { return 1; print(2) }\nconst unused = 1').map(d=>d.code),['ARYA_UNUSED','ARYA_UNUSED','ARYA_UNREACHABLE']);
});
test('parser recovers independent top-level errors without entering broken functions',()=>{
  assert.throws(()=>compile('const x = )\nconst y = )\n'),(e:unknown)=>e instanceof AryaError&&e.diagnostics.length===2&&e.diagnostics[1]!.token.line===1);
  assert.throws(()=>compile('fn broken() {\nconst x = )\n}\nconst y = )\n'),(e:unknown)=>e instanceof AryaError&&e.diagnostics.length===2);
});
test('lexical and namespace references, rename and typed signatures use source snapshots',()=>{
  const lib={uri:'file:///test/lib.arya',source:'export fn total(n: number): number => n + 1'};
  const main={uri:'file:///test/main.arya',source:'use arya "./lib.arya" as lib\nprint(lib.total(2))'};
  assert.equal(referencesInWorkspace([lib,main],main.uri,main.source.indexOf('total')).length,2);
  assert.equal(renameInWorkspace([lib,main],lib.uri,lib.source.indexOf('total'),'sum').length,2);
  const captured={uri:'file:///test/capture.arya',source:'const x = 1; fn f() { const y = 2; return x + y }'};
  assert.throws(()=>renameInWorkspace([captured],captured.uri,captured.source.indexOf('x'),'y'),/capture/);
  const source='fn total(n: number): number => n + 1\ntotal(2)';
  assert.match(signatureAt(source,source.lastIndexOf('2'))!.label,/number/);
});
test('incremental graph invalidation, declarations and esbuild CJS integration',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const entry=join(root,'main.arya'),dependency=join(root,'lib.arya');
  await writeFile(dependency,'export fn total(n: number): number => n + 1');
  await writeFile(entry,'use arya "./lib.arya" as lib\nexport const value = lib.total(2)');
  const builder=createProjectBuilder(),first=await builder.build(entry);await writeProject(first);
  assert.match(await readFile(first.entryOutput.slice(0,-4)+'.d.mts','utf8'),/value: number/);
  const second=await builder.build(entry);assert.equal(first.modules[0]!.compilation,second.modules[0]!.compilation);
  await writeFile(dependency,'export fn total(n: string): string => n');
  await assert.rejects(builder.build(entry),/Expected string/);
  await writeFile(dependency,'export fn total(n: number): number => n + 2');
  const third=await builder.build(entry);assert.notEqual(third.modules[0]!.compilation,first.modules[0]!.compilation);
  await build({entryPoints:[entry],outfile:join(root,'bundle.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[aryaPlugin({projectRoot:root})]});
  const result=spawnSync(process.execPath,['-e','console.log(require(process.argv[1]).value)',join(root,'bundle.cjs')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'4\n');
});

test('formatter preserves whitespace-only raw-string lines and lint reports known ignored promises',()=>{
  const source='const x = """a\n   \nb"""\n';
  assert.equal(formatSource(source),source);
  assert.ok(lintSource('async fn load(): number => 1\nload()').some(d=>d.code==='ARYA_UNHANDLED_PROMISE'));
});

test('CLI formatter checks, async Node tests and original-source failures have real exit status',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-cli-tools-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'main.test.arya'),cli=join(process.cwd(),'dist','cli.cjs');
  const run=(...args:string[])=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
  await writeFile(file,'use js "node:test" as test\nuse js "node:assert/strict" as assert\ntest("async", async fn() {\nassert.equal(await Promise.resolve(2),2)\n})\n');
  assert.equal(run('fmt',file,'--check').status,1);assert.equal(run('fmt',file).status,0);assert.equal(run('fmt',file,'--check').status,0);
  assert.equal(run('test',file).status,0);
  await writeFile(file,'use js "node:test" as test\nuse js "node:assert/strict" as assert\ntest("failure", async fn() { assert.equal(await Promise.resolve(2),3) })');
  const failed=run('test',file);assert.notEqual(failed.status,0);assert.match(failed.stdout+failed.stderr,/main\.test\.arya:3/);
  await writeFile(file,'const unused = 1');assert.equal(run('lint',file).status,1);
});

test('non-path standard imports do not embed an unused checkout directory',()=>{
  const result=compile('use std "decimal" as decimal\nuse std "datetime" as time\nprint(decimal.add("0.1","0.2"))',{filename:'/private/business-checkout/main.arya',outputFilename:'/private/business-checkout/out.mjs'});
  assert.match(result.code,/__arya_standard\("decimal"\)/);assert.match(result.code,/__arya_standard\("datetime"\)/);
});
