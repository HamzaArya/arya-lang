import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../src/compiler.js';
test('async streaming bounds read-ahead, preserves request context and closes on failure/cancel',async t=>{
  const root=await mkdtemp(join(tmpdir(),'arya-async-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'main.mjs');await writeFile(file,compile('use std "async" as work\nexport const jobs = work').code);
  const {jobs}=await import(pathToFileURL(file).href);
  const storage=new AsyncLocalStorage<string>(); let active=0, peak=0, consumed=0, closed=false;
  async function* source(){try{for(let i=0;i<10000;i++){consumed++;yield i;}}finally{closed=true;}}
  const output=jobs.map(source(),async (value:number)=>{assert.equal(storage.getStore(),'tenant-a');active++;peak=Math.max(peak,active);await new Promise(ok=>setTimeout(ok,1));active--;return value*2;},{concurrency:3});
  await storage.run('tenant-a',async()=>{let count=0;for await(const value of output){assert.equal(value,count*2);if(++count===5)break;}});
  assert.equal(closed,true);assert.ok(consumed<=8);assert.ok(peak<=3);assert.equal(active,0);
  const abort=new AbortController();closed=false;
  await assert.rejects(storage.run('tenant-a',()=>jobs.each(source(),async()=>{abort.abort();},{signal:abort.signal,concurrency:2})),/abort/i);
  assert.equal(closed,true);
  await assert.rejects(jobs.each([1,2,3],async()=>{throw new Error('worker failure');}),/worker failure/);
});
