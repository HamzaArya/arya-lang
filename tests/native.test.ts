import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, copyFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkNativeProject, writeNativeProject, emitNative } from '../src/native.js';
import { analyze } from '../src/language-service.js';
import { compile } from '../src/compiler.js';
const supported=process.platform!=='win32';
async function project(source:string,extras:Record<string,string>={},sanitize=false) {
  const root=await mkdtemp(join(tmpdir(),'arya native '));
  await writeFile(join(root,'main.arya'),source);
  for(const [name,text] of Object.entries(extras))await writeFile(join(root,name),text);
  const p=await checkNativeProject(join(root,'main.arya'));
  const build=await writeNativeProject(p,{sanitize});
  const run=(args:string[]=[],extraEnv:NodeJS.ProcessEnv={})=>spawnSync(build.executable,args,{encoding:'utf8',env:{...process.env,...extraEnv},timeout:10000});
  return {root,p,build,run,async close(){await rm(root,{recursive:true,force:true});}};
}
test('native calculator runs as a machine-code executable with literal arguments and interactive stdin',{skip:!supported},async()=>{
  const p=await project(await readFile('fixtures/native/calculator.arya','utf8'));
  try{ const r=p.run(['12','+','8']);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'20\n');const interactive=spawnSync(p.build.executable,[],{input:'12\n*\n3\n',encoding:'utf8'});assert.match(interactive.stdout,/36\n$/);assert.equal(p.run(['12','/','0']).stdout,'Cannot divide by zero\n');const copied=join(p.root,'copied');await copyFile(p.build.executable,copied);const moved=spawnSync(copied,['9','-','4'],{encoding:'utf8',env:{PATH:'/nonexistent'}});assert.equal(moved.stdout,'5\n');}finally{await p.close();}
});
test('native closures, hoisting, fresh loop captures, mutation and recursion',{skip:!supported},async()=>{
  const p=await project(`print(factorial(6))
fn factorial(n) { if n <= 1 { return 1 } return n * factorial(n - 1) }
fn counter() { let value = 0; return fn() { value += 1; return value } }
let c = counter()
print(c(), c())
let callbacks = []
for i in range(3) { callbacks.push(fn() { return i }) }
print(callbacks[0](), callbacks[1](), callbacks[2]())
const record = {value: 2}
record.value += 5
print(record.value)
`);
  try{for(const stress of ['','1']){const r=p.run([],{ARYA_GC_STRESS:stress,ARYA_GC_STATS:'1'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'720\n1 2\n0 1 2\n7\n');assert.match(r.stderr,/live=0/);}}finally{await p.close();}
});
test('native number, short-circuit, UTF-16 and code-point semantics',{skip:!supported},async()=>{
  const p=await project(`print(-2 ** 2, 2 ** 3 ** 2, 1 / 0, 0 / 0)
print("2" == 2, null == undefined, -0 == 0)
print("" or "fallback", 0 and missing())
fn missing() { throw "must not run" }
print(len("🌉"), "🌉"[0] == "🌉"[1])
let count = 0
for c in "a🌉b" { count += 1 }
print(count)
print(str(0.1), str(1e-7), str(1e20))
let values = [1, 2, 3]
values[4] = 5
print(len(values), values[3] == undefined, values.slice(1, 3).join("-"))
`);
  try{const r=p.run([],{ARYA_GC_STRESS:'1'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'4 512 Infinity NaN\nfalse false true\nfallback 0\n2 false\n3\n0.1 1e-7 100000000000000000000\n5 true 2-3\n');}finally{await p.close();}
});
test('native catches runtime faults, preserves TDZ, and reports original source columns',{skip:!supported},async()=>{
  const p=await project(`try { print(later); let later = 2 } catch error { print(error.name) }
try { null.value } catch error { print(error.name) }
fn explode() { return null.property }
explode()
`);
  try{const r=p.run([],{ARYA_GC_STRESS:'1'});assert.equal(r.status,1);assert.equal(r.stdout,'ReferenceError\nTypeError\n');assert.match(r.stderr,/main\.arya:3:28/);assert.match(r.stderr,/main\.arya:4:1/);}finally{await p.close();}
});
test('native multi-file exports are live and module initialization is deterministic',{skip:!supported},async()=>{
  const p=await project('use arya "./helper.arya" as helper\nprint(helper.count)\nhelper.increment()\nprint(helper.count)\n',{'helper.arya':'export let count = 0\nexport fn increment() { count += 1 }\n'});
  try{const r=p.run([],{ARYA_GC_STRESS:'1'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'0\n1\n');}finally{await p.close();}
});
test('native numeric specialization has no dynamic arithmetic in proven numeric functions',{skip:!supported},async()=>{
  const p=await project('fn sum(n) { let total = 0; let i = 0; while i < n { total += i; i += 1 } return total }\nprint(sum(number(args[0])))\n');
  try{assert.equal(p.p.specializedFunctions,1);assert.match(p.p.code,/static double afn\d+_numeric/);const r=p.run(['10000']);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'49995000\n');}finally{await p.close();}
});
test('native check and editor reject unsupported features without a toolchain or source execution',async()=>{
  const root=await mkdtemp(join(tmpdir(),'arya native check '));
  try{const file=join(root,'main.arya'),source='use js "./evil.mjs" as evil\nasync fn task() { return await fetch("invalid") }\n';await writeFile(file,source);await writeFile(join(root,'evil.mjs'),'throw new Error("must not execute")');await assert.rejects(checkNativeProject(file),/use js/);const a=analyze(source,'file://'+file,{target:'native'});assert.ok(a.diagnostics.some(d=>d.code==='ARYA_NATIVE_UNSUPPORTED'));assert.ok(a.diagnostics.some(d=>d.message.includes('async')));assert.throws(()=>emitNative([{filename:file,source}]),/use js/);}finally{await rm(root,{recursive:true,force:true});}
});
test('native filesystem/std math APIs work without npm or Python',{skip:!supported},async()=>{
  const p=await project(`use std "fs" as fs
use std "math" as math
fs.writeText(args[0], "hello")
fs.appendText(args[0], " world")
print(fs.exists(args[0]), fs.readText(args[0]), math.sqrt(81), math.floor(2.9))
`);
  try{const r=p.run([join(p.root,'text file.txt')],{ARYA_GC_STRESS:'1'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'true hello world 9 2\n');}finally{await p.close();}
});
test('native failed compilation and cancellation preserve the previous executable',{skip:!supported},async()=>{
  const p=await project('print(123)');
  try{const before=await readFile(p.build.executable);await assert.rejects(writeNativeProject(p.p,{compiler:'/nonexistent/arya-cc'}),/Cannot start C compiler/);assert.deepEqual(await readFile(p.build.executable),before);const controller=new AbortController();controller.abort();await assert.rejects(writeNativeProject(p.p,{signal:controller.signal}));assert.deepEqual(await readFile(p.build.executable),before);}finally{await p.close();}
});
test('native build rejects symlink escapes and graph cycles before compilation',{skip:!supported},async()=>{
  const root=await mkdtemp(join(tmpdir(),'arya native guard ')),outside=await mkdtemp(join(tmpdir(),'arya native outside '));
  try{await writeFile(join(root,'main.arya'),'print(1)');await symlink(outside,join(root,'escape'));await assert.rejects(checkNativeProject(join(root,'main.arya'),{outputDirectory:join(root,'escape','out')}),/outside/);await writeFile(join(root,'main.arya'),'use arya "./main.arya" as self');await assert.rejects(checkNativeProject(join(root,'main.arya')),/cycle/);}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('native runtime survives optimized GC and address/undefined-behavior sanitizers',{skip:!supported},async()=>{
  const p=await project('let items = []\nfor i in range(2000) { let record = {value: i}; record.self = record; items.push(fn() { return record.value }) }\nprint(items[1999]())\n',{},true);
  try{const r=p.run([],{ARYA_GC_STRESS:'1',ARYA_GC_STATS:'1',ASAN_OPTIONS:'detect_leaks=0'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'1999\n');assert.match(r.stderr,/live=0/);}finally{await p.close();}
});
test('existing JS compilation stays separate from native-only standard libraries',()=>{
  assert.throws(()=>compile('use std "io" as io'),/use std requires --target native/);
  assert.ok(compile('print(1 + 2)').code.includes('Generated by Arya'));
});
test('native specialization preserves boolean identity, NaN truthiness, and numeric fallback',{skip:!supported},async()=>{
  const p=await project(`fn choose(n) { if (n < 2) == 0 { return 1 } return 0 }
fn truth(n) { if not n { return 1 } return 0 }
fn mixed(n) { let x = 1; x = n < 2; return x }
print(choose(3), truth(NaN), mixed(1), truth(0), truth(4))
`);
  try{const r=p.run();assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'0 1 true 1 0\n');}finally{await p.close();}
});
test('native output ownership protects user files and explicit-output failures roll back builds',{skip:!supported},async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'arya native owned ')));
  try{const file=join(root,'main.arya');await writeFile(file,'print(1)');const dir=join(root,'personal');await (await import('node:fs/promises')).mkdir(dir);await writeFile(join(dir,'notes'),'keep');const p=await checkNativeProject(file,{outputDirectory:dir});await assert.rejects(writeNativeProject(p),/not owned/);assert.equal(await readFile(join(dir,'notes'),'utf8'),'keep');}finally{await rm(root,{recursive:true,force:true});}
});
test('native numeric conversions and NUL-containing text preserve checked semantics',{skip:!supported},async()=>{
  const p=await project('use std "fs" as fs\nprint(number("0x10"), number("0b11"), number("0o10"), number(".5"), number("1bad"))\nfs.writeText(args[0], "a\0b")\nprint(len(fs.readText(args[0])))\n');
  try{const r=p.run([join(p.root,'data.txt')],{ARYA_GC_STRESS:'1'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'16 3 8 0.5 NaN\n3\n');}finally{await p.close();}
});
test('native process invocation preserves literal arguments and path/file APIs',{skip:!supported},async()=>{
  const p=await project('use std "process" as process\nuse std "path" as path\nuse std "fs" as fs\nprint(process.env("ARYA_TEST_ABSENT_ENV") == null)\nfs.makeDirectory(path.join(args[0], "folder"))\nlet file = path.join(args[0], "folder", "item")\nfs.writeText(file, "ok")\nfs.rename(file, file + "2")\nprint(path.basename(path.realPath(file + "2")), fs.readText(file + "2"))\nfs.remove(file + "2")\nprint(process.run(["/usr/bin/printf", "%s", "literal; $(no-shell)"]))\n');
  try{const r=p.run([p.root]);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'true\nitem2 ok\nliteral; $(no-shell)0\n');}finally{await p.close();}
});
test('native explicit outputs support repeated builds with an owned internal staging tree',{skip:!supported},async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'arya native explicit ')));
  try{const file=join(root,'main.arya'),output=join(root,'custom');await writeFile(file,'print(1)');const p=await checkNativeProject(file,{output});await writeNativeProject(p);await writeNativeProject(p);assert.equal(spawnSync(output,[],{encoding:'utf8'}).stdout,'1\n');}finally{await rm(root,{recursive:true,force:true});}
});
