#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
const root=resolve(import.meta.dirname,'../..'), out=resolve(process.argv[2]||join(root,'.build/performance-2026-11-12'));
const dir=join(out,'kernels');mkdirSync(dir,{recursive:true});
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const run=(exe,args,options={})=>{const r=spawnSync(exe,args,{encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.error?.message||r.stderr||r.stdout);return r;};
const measureOnly=process.argv.includes('--measure-only');
const artifacts=measureOnly?JSON.parse(readFileSync(join(dir,'artifacts.json'),'utf8')):{};
if(!measureOnly)for(const name of ['baseline','candidate']){
  let code=readFileSync(join(root,'native/benchmarks/kernels.arya'),'utf8');
  if(name==='candidate')code=code.replace('# PARSED_KERNEL',`fn parsed(n) { const value = decimal.values.parse("123456789012345678901234567890.005"); let result = decimal.values.parse("0"); for i in range(n) { result = decimal.values.add(result, value) }; return decimal.values.format(result) }`).replace('if kind == "strings"','if kind == "parsed" { return parsed(n) }; if kind == "strings"');
  const source=join(dir,name+'.arya');writeFileSync(source,code);
  const compiler=name==='candidate'&&process.env.ARYA_BENCH_COMPILER?resolve(process.env.ARYA_BENCH_COMPILER):join(out,name==='baseline'?'baseline-sdk':'sdk-final','arya');const start=performance.now();
  run(compiler,['build',source,'-o',join(dir,name),'--release','--force']);
  run(compiler,['build',source,'-o',join(dir,name+'-counters'),'--release','--runtime-counters','--force']);
  artifacts[name]={compilerSha256:hash(compiler),sourceSha256:hash(source),binarySha256:hash(join(dir,name)),bytes:statSync(join(dir,name)).size,buildBothMs:performance.now()-start};
}
writeFileSync(join(dir,'artifacts.json'),JSON.stringify(artifacts,null,2)+'\n');
writeFileSync(join(dir,'node.cjs'),`const rl=require('node:readline').createInterface({input:process.stdin});
function fib(n){return n<2?n:fib(n-1)+fib(n-2)}
function work(kind,n){let result=0;if(kind==='sum'){for(let i=0;i<n;i++)result+=i;return result}
if(kind==='mix'){result=1;for(let i=0;i<n;i++)result=(result*1.000001+i%97)%1000003;return result}
if(kind==='fib')return fib(n);if(kind==='records'){let rows=[];for(let i=0;i<n;i++)rows.push({index:i,balance:i*.5,type:i%2});for(const row of rows)if(row.type===1)result+=row.balance;return[rows.length,result]}
if(kind==='map'){let values=new Map;for(let i=0;i<n;i++)values.set('key:'+i,i);for(let i=0;i<n;i++)result+=values.get('key:'+i);return result}
if(kind==='json'){let value={balance:'100.005',type:'asset',items:[1,2,3]};for(let i=0;i<n;i++)result+=JSON.parse(JSON.stringify(value)).items[1];return result}
if(kind==='strings'){for(let i=0;i<n;i++)result+=(' row '+i).trim().toUpperCase().split(' ').join('-').length;return result}
let total=0n;const amount=BigInt('123456789012345678901234567890005');for(let i=0;i<n;i++)total+=amount;let text=total.toString().padStart(4,'0');return(text.slice(0,-3)+'.'+text.slice(-3)).replace(/0+$/,'').replace(/\\.$/,'')}
rl.on('line',line=>{let r=JSON.parse(line),start=process.cpuUsage(),value=work(r.kind,r.n),cpu=process.cpuUsage(start);console.log(JSON.stringify({value,cpuMs:(cpu.user+cpu.system)/1000}))});
`);
if(process.argv.includes('--build-only')){console.log('Kernel binaries prepared');process.exit(0);}
class Peer{
 constructor(name){this.child=spawn(name==='node'?process.execPath:join(dir,name),name==='node'?[join(dir,'node.cjs')]:[]);this.error='';this.child.stderr.on('data',x=>this.error+=x);createInterface({input:this.child.stdout}).on('line',x=>this.pending(JSON.parse(x)));this.exit=new Promise((ok,bad)=>this.child.on('close',code=>code?bad(Error(this.error)):ok()));}
 request(value){return new Promise(resolveResult=>{this.pending=resolveResult;this.child.stdin.write(JSON.stringify(value)+'\n')});}
 async close(){this.child.stdin.end();await this.exit;}
}
const workloads=[['sum',10000000],['mix',2000000],['fib',24],['records',20000],['map',3000],['json',1000],['strings',1000],['decimal',5000],['parsed',5000]];
const raw=[],diagnostics=[];
for(let session=0;session<2;session++){
 const peers=Object.fromEntries(['baseline','candidate','node'].map(name=>[name,new Peer(name)]));
 try{
  for(const [kind,n] of workloads){
   const labels=kind==='parsed'?['candidate','node']:['baseline','candidate','node'];
   for(let i=-3;i<9;i++){
    const request={kind,n:n+((i+3)%2)};let expected;
    for(const name of ((i+session)%2?[...labels].reverse():labels)){
      const result=await peers[name].request(request);
      if(expected===undefined)expected=result.value;else assert.deepEqual(result.value,expected,`${kind} ${name}`);
      if(i>=0)raw.push({session,sample:i,name,...request,...result});
    }
   }
   if(session===0)for(const name of labels.filter(x=>x!=='node')){
    const r=run(join(dir,name+'-counters'),[],{input:JSON.stringify({kind,n})+'\n'});diagnostics.push({name,kind,n,stderr:r.stderr});
   }
  }
 }finally{for(const peer of Object.values(peers))await peer.close();}
}
const summary=[];for(const [kind]of workloads)for(const name of ['baseline','candidate','node']){const values=raw.filter(x=>x.kind===kind&&x.name===name).map(x=>x.cpuMs).sort((a,b)=>a-b);if(values.length)summary.push({kind,name,medianCpuMs:values[Math.ceil(values.length*.5)-1],p95CpuMs:values[Math.ceil(values.length*.95)-1]});}
writeFileSync(join(out,'kernels.json'),JSON.stringify({boundary:'Warmed kernel CPU, process transfer excluded; 3 warmups, 9 samples/session, 2 sessions; alternating n/n+1 and backend order. Decimal Node oracle uses exact fixed-scale BigInt. Parsed API is an opt-in candidate-only workload.',artifacts,raw,summary,diagnostics},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
