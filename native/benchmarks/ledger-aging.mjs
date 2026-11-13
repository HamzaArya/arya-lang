// Database-free qualification of unchanged Ledger aging/allocation rules.
// Run against frozen source trees. No production worker routing is changed.
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {cpus,platform,arch,loadavg,totalmem} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
const self=fileURLToPath(import.meta.url);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function rulesAt(ledger){return createRequire(join(ledger,'package.json'))(join(ledger,'backend/src/arya/generated/aging-settlement.cjs'));}
function calculate(rules,task,p){return task==='aging-settle'?rules.settle(p.rows,p.allocations):rules.allocationIndex(p.events);}
class Peer{
  constructor(exe,args){
    this.child=spawn(exe,args,{env:{PATH:process.env.PATH,TZ:'Asia/Kabul',NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});this.stderr='';
    this.child.stderr.on('data',x=>this.stderr+=x);this.sequence=0;
    createInterface({input:this.child.stdout}).on('line',line=>{try{assert.ok(this.pending);const value=JSON.parse(line);assert.equal(value.id,this.pending.id);if(value.error)throw Error(JSON.stringify(value.error));clearTimeout(this.pending.timer);this.pending.resolve(value);this.pending=null;}catch(e){this.fail(e);}});
    this.child.on('error',e=>this.fail(e));this.child.stdin.on('error',e=>this.fail(e));
    this.exited=new Promise(done=>this.child.once('close',code=>{this.closed=true;if(this.pending)this.fail(Error(`worker exited ${code}: ${this.stderr}`));done(code);}));
  }
  fail(e){this.failure=e;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(e);this.pending=null;}this.child.kill();}
  request(task,payload){assert.ok(!this.pending);if(this.failure)throw this.failure;return new Promise((ok,bad)=>{const id=++this.sequence;this.pending={id,resolve:ok,reject:bad,timer:setTimeout(()=>this.fail(Error('worker timeout')),60000)};this.child.stdin.write(JSON.stringify({id,task,payload})+'\n');});}
  async close(){if(!this.closed)this.child.stdin.end();const t=setTimeout(()=>this.child.kill(),3000);try{assert.equal(await this.exited,0,this.stderr);}finally{clearTimeout(t);}}
}

if(process.argv[2]==='--node-worker'){
  const rules=rulesAt(resolve(process.argv[3])),profile=process.argv.includes('--profile');
  createInterface({input:process.stdin}).on('line',text=>{
    let request;
    try{
      const a=profile?process.cpuUsage():null;
      request=JSON.parse(text);
      const b=profile?process.cpuUsage():null;
      const result=calculate(rules,request.task,request.payload);
      const c=profile?process.cpuUsage():null;
      const encoded=JSON.stringify({id:request.id,result});
      if(profile){const d=process.cpuUsage(),ms=(x,y)=>(y.user+y.system-x.user-x.system)/1000;
        process.stderr.write(JSON.stringify({parseCpuMs:ms(a,b),calculateCpuMs:ms(b,c),stringifyCpuMs:ms(c,d),memory:process.memoryUsage(),resources:process.resourceUsage()})+'\n');}
      process.stdout.write(encoded+'\n');
    }catch(e){process.stdout.write(JSON.stringify({id:request?.id??null,error:{name:e.name,message:e.message}})+'\n');}
  });
}else{
  const options={samples:20,sessions:2,warmups:5};
  for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].slice(2),v=process.argv[i+1];assert.ok(v&&['ledger','baseline','candidate','out','samples','sessions','warmups','prepare-only','measure-only'].includes(key));options[key]=['samples','sessions','warmups'].includes(key)?Number(v):['prepare-only','measure-only'].includes(key)?v==='true':resolve(v);}
  assert.ok(options.ledger&&options.baseline&&options.out,'--ledger FROZEN_LEDGER --baseline COMPILER --candidate COMPILER --out NEW_DIRECTORY');
  assert.ok(options.samples>=20&&options.sessions>=2&&options.warmups>=3);
  mkdirSync(options.out,{recursive:true});
  assert.ok(!existsSync(join(options.out,'results.json')),'Choose a new output directory');
  const identities=options['measure-only']?JSON.parse(readFileSync(join(options.out,'identities.json'),'utf8')):{};
  if(!options['measure-only']){
  for(const name of ['baseline','candidate'].filter(n=>options[n])){
    const compiler=options[name],binary=join(options.out,name);
    const r=spawnSync(compiler,['build',join(options.ledger,'backend/src/arya/native-worker.arya'),'-o',binary,'--release','--force'],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    writeFileSync(join(options.out,name+'-build.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.error?.message??r.stderr);
    identities[name]={compiler,compilerSha256:hash(compiler),binary,binarySha256:hash(binary),generatedCSha256:hash(binary+'.c')};
  }
  // Rebuild the compatibility bundles from the same frozen .arya inputs.
  const build=spawnSync(process.execPath,['scripts/build-arya.mjs'],{cwd:options.ledger,encoding:'utf8',timeout:120000});
  writeFileSync(join(options.out,'node-build.log'),build.stdout+build.stderr);assert.equal(build.status,0,build.error?.message??build.stderr);
  writeFileSync(join(options.out,'identities.json'),JSON.stringify(identities,null,2)+'\n');
  }
  for(const [name,id]of Object.entries(identities)){assert.equal(hash(options[name]),id.compilerSha256);assert.equal(hash(id.binary),id.binarySha256);}
  if(options['prepare-only']){console.log('Frozen worker binaries and Node bundles prepared');process.exit(0);}
  const rules=rulesAt(options.ledger),sourceHashes={};
  for(const file of ['aging-settlement.arya','native-worker.arya','generated/aging-settlement.cjs'])sourceHashes[file]=hash(join(options.ledger,'backend/src/arya',file));
  const cases=workloads();
  const raw=[],memory=[],firstCalls=[],conditions=[];
  const workloadHashes=cases.map(item=>{const text=JSON.stringify(item.payload);return{name:item.name,inputBytes:Buffer.byteLength(text),payloadSha256:createHash('sha256').update(text).digest('hex')};});
  for(let session=0;session<options.sessions;session++){
    conditions.push({session,at:new Date().toISOString(),load:loadavg(),processes:execFileSync('ps',['-axo','pcpu,rss,comm'],{encoding:'utf8'}).trim().split('\n').slice(1).map(line=>{const fields=line.trim().split(/\s+/);return{cpu:Number(fields[0]),rssKiB:Number(fields[1]),name:fields.slice(2).join(' ').split('/').at(-1)};}).filter(row=>row.cpu>=10)});
    const peers=Object.fromEntries(['node',...Object.keys(identities)].map(name=>[name,new Peer(name==='node'?process.execPath:identities[name].binary,name==='node'?[self,'--node-worker',options.ledger]:[])]));
    try{
      for(const item of cases){
        const expected=JSON.parse(JSON.stringify(calculate(rules,item.task,item.payload)));
        const backends=['node-direct',...Object.keys(peers)];
        for(let sample=-options.warmups;sample<options.samples;sample++){
          for(const backend of (sample+session)%2?[...backends].reverse():backends){
            const hostStart=process.cpuUsage(),start=performance.now();
            const result=backend==='node-direct'?calculate(rules,item.task,item.payload):(await peers[backend].request(item.task,item.payload)).result;
            const wallMs=performance.now()-start,cpu=process.cpuUsage(hostStart),hostCpuMs=(cpu.user+cpu.system)/1000;
            assert.deepEqual(JSON.parse(JSON.stringify(result)),expected,`${item.name} ${backend}`);
            const row={session,sample,backend,name:item.name,n:item.n,wallMs,hostCpuMs};
            if(sample>=0)raw.push(row);else if(sample===-options.warmups)firstCalls.push(row);
          }
        }
        memory.push({session,name:item.name,host:process.memoryUsage(),peers:Object.fromEntries(Object.entries(peers).map(([name,p])=>[name,{pid:p.child.pid,rssKiB:Number(execFileSync('ps',['-o','rss=','-p',String(p.child.pid)],{encoding:'utf8'}).trim())}]))});
        process.stderr.write(`session ${session+1}: ${item.name} parity passed\n`);
      }
    }finally{for(const peer of Object.values(peers))await peer.close();}
  }
  const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1];
  const summary=[];
  for(const item of cases){const row={name:item.name,n:item.n};for(const backend of ['node-direct','node',...Object.keys(identities)]){const rows=raw.filter(x=>x.name===item.name&&x.backend===backend);row[backend]={samples:rows.length,medianMs:percentile(rows.map(x=>x.wallMs),.5),p95Ms:percentile(rows.map(x=>x.wallMs),.95),sessions:Array.from({length:options.sessions},(_,s)=>({session:s,medianMs:percentile(rows.filter(x=>x.session===s).map(x=>x.wallMs),.5),p95Ms:percentile(rows.filter(x=>x.session===s).map(x=>x.wallMs),.95)}))};}if(row.candidate)row.speedup=row.baseline.medianMs/row.candidate.medianMs;summary.push(row);}
  for(const [file,digest]of Object.entries(sourceHashes))assert.equal(hash(join(options.ledger,'backend/src/arya',file)),digest);
  const report={measuredAt:new Date().toISOString(),host:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0].model,memoryBytes:totalmem(),load:loadavg(),timezone:process.env.TZ},options,identities,sourceHashes,workloadHashes,conditions,cCompilerVersion:execFileSync('cc',['--version'],{encoding:'utf8'}).trim(),method:'Uninstrumented C11 -O2 -ffp-contract=off; unchanged Ledger rules. Fresh persistent workers per session. Five discarded warmups, alternating backend order, 20 samples per backend per session. Wall includes controller JSON encode, pipes and decode for all worker backends; node-direct excludes transfer. CPU column is controller CPU only. Parity and RSS probes outside timing. Nearest-rank median/p95. No database or production routing changes.',summary,memory,firstCalls,raw};
  writeFileSync(join(options.out,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary,null,2));
}
export function workloads(){
  const cases=[];
  for(const n of [0,10,1000,3000]){
    const rows=Array.from({length:n},(_,i)=>({rowKey:`invoice:${i}`,currencyCode:i%3?'USD':'AFN',debit:i%5?i%100+1:0,credit:i%5?0:20,days:i%150-10,metadata:{kind:'sale',sourceType:'invoice',sourceId:i,reference:`I-${i}`,typeLabel:'Invoice',date:`2026-10-${String(i%28+1).padStart(2,'0')}`}}));
    cases.push({name:`aging-${n}`,n,task:'aging-settle',payload:{rows,allocations:{debit:{'invoice:1':1.25},credit:{}}}});
  }
  for(const n of [0,10,1000,10000]){
    const events=Array.from({length:n},(_,i)=>({side:i%3?'debit':'credit',key:`document:${i%9000}`,amount:(i%100+1)/100,replace:i%23===0}));
    cases.push({name:`allocation-${n}`,n,task:'allocation-index',payload:{events}});
  }
  return cases;
}
