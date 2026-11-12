// Real Ledger pool/host boundary, with explicit binaries and no application edits.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
const root=resolve(import.meta.dirname,'../..'),out=resolve(process.argv[2]||join(root,'.build/performance-2026-11-12'));
const ledger=resolve(process.argv[3]||join(root,'../accounting-database'));
const require=createRequire(import.meta.url);
const poolFile=join(ledger,'backend/src/services/aryaWorkerPool.js');
const {AryaWorkerPool}=require(poolFile);
const oracle=require(join(ledger,'backend/src/arya/generated/report-preparation.cjs'));
const types=['asset','liability','equity','revenue','cogs','expense','otherIncome','otherExpense'];
const finalLabel=process.env.ARYA_BENCH_CANDIDATE||'candidate';
const labels=['baseline',finalLabel,'node'],raw=[],firstRequest=[];
// The unchanged adapter verifies a manifest beside each benchmark binary.
// Generate that review metadata here, never in Ledger's generated directory.
const sourceIdentity=JSON.parse(readFileSync(join(out,'ledger-source.json'),'utf8'));
for(const name of labels.filter(n=>n!=='node')){
 const binary=join(out,name,'worker'),artifact=JSON.parse(readFileSync(join(out,name,'artifacts.json'),'utf8'));
 const version=artifact.version||JSON.parse(readFileSync(join(out,'candidate/artifacts.json'),'utf8')).version;
 writeFileSync(join(out,name,'manifest.json'),JSON.stringify({compiler:version,platform:process.platform,arch:process.arch,
  binarySha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),productionTasks:['report-groups'],sources:sourceIdentity.sources},null,2)+'\n');
}
async function measure(pool,payload){const start=performance.now();const probe=new Promise(done=>setTimeout(()=>done(Math.max(0,performance.now()-start-10)),10));const result=await pool.run('report-groups',payload);const wallMs=performance.now()-start;return{result,wallMs,timerDelayMs:await probe};}
for(let session=0;session<2;session++){
 const pools=Object.fromEntries(labels.map(name=>[name,new AryaWorkerPool({size:1,nativeExecutable:name==='node'?null:join(out,name,'worker')})]));
 try{
  for(const count of [1000,10000]){
   const payload={types,rows:Array.from({length:count},(_,index)=>({index,type:types[index%types.length],balance:index%5?'100.005':'-20.035'}))};
   const expected=oracle.groupByType(payload.rows,payload.types);
   for(let i=-3;i<9;i++)for(const name of ((i+session)%2?[...labels].reverse():labels)){
    const {result,...sample}=await measure(pools[name],payload);assert.deepEqual(result,expected);
    if(i===-3)firstRequest.push({session,rows:count,name,...sample});
    if(i>=0)raw.push({session,rows:count,sample:i,name,...sample});
   }
  }
 }finally{await Promise.all(Object.values(pools).map(pool=>pool.close()));}
}
const p=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
const summary=[];for(const rows of [1000,10000])for(const name of labels){const values=raw.filter(x=>x.rows===rows&&x.name===name);summary.push({rows,name,medianMs:p(values.map(x=>x.wallMs),.5),p95Ms:p(values.map(x=>x.wallMs),.95),medianTimerDelayMs:p(values.map(x=>x.timerDelayMs),.5)});}
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(join(out,finalLabel==='candidate'?'ledger-pool.json':`ledger-pool-${finalLabel}.json`),JSON.stringify({boundary:'Unchanged Ledger AryaWorkerPool.run: v8 size check, structured clone/admission, worker or JSON-lines transfer, pure report, result delivery. One persistent slot/backend. Three warmups, nine alternating samples/session, two sessions. Event-loop probe follows the original application performance script.',node:process.version,
 sources:Object.fromEntries([poolFile,join(ledger,'backend/src/services/aryaNativeWorker.js'),join(ledger,'backend/src/workers/aryaCalculation.worker.cjs')].map(file=>[file,hash(file)])),binaries:Object.fromEntries(labels.filter(n=>n!=='node').map(n=>[n,hash(join(out,n,'worker'))])),raw,firstRequest,summary},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
