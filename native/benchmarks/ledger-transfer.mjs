// Transfer-only control: raw ASCII frames, no application JSON parsing or rules.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';
const options=Object.fromEntries(process.argv.slice(2).reduce((rows,key,i,a)=>i%2?rows:[...rows,[key.slice(2),resolve(a[i+1])]],[]));
assert.ok(options.baseline&&options.candidate&&options.out);
mkdirSync(options.out,{recursive:true});
const source=join(options.out,'echo.arya');
writeFileSync(source,`use std "io" as io
use std "runtime" as runtime
use std "json" as json
use std "process" as process
let sequence = 0
while true {
  const start = runtime.clock()
  const text = io.readLine()
  const read = runtime.clock()
  if text == null { break }
  print(text)
  const written = runtime.clock()
  sequence += 1
  process.error(json.stringify({sequence: sequence, readCpuMs: (read - start) * 1000, writeCpuMs: (written - read) * 1000}))
}
`);
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const identities={};
for(const name of ['baseline','candidate']){
 const binary=join(options.out,name),r=spawnSync(options[name],['build',source,'-o',binary,'--release','--force'],{encoding:'utf8',timeout:180000});
 writeFileSync(binary+'.build.log',r.stdout+r.stderr);assert.equal(r.status,0,r.error?.message??r.stderr);
 identities[name]={compilerSha256:digest(options[name]),binarySha256:digest(binary),generatedCSha256:digest(binary+'.c')};
}
class Peer{
 constructor(name){this.name=name;this.queue=[];this.meta=[];this.sequence=0;
  this.child=spawn(name==='node'?process.execPath:join(options.out,name),name==='node'?['-e',`require('node:readline').createInterface({input:process.stdin}).on('line',text=>process.stdout.write(text+'\\n'))`]:[],{env:{TZ:'Asia/Kabul',PATH:process.env.PATH}});
  createInterface({input:this.child.stdout}).on('line',text=>{assert.ok(this.pending);this.pending.wallMs=performance.now()-this.pending.start;assert.equal(text,this.pending.text);this.pending.received=true;this.finish();});
  createInterface({input:this.child.stderr}).on('line',text=>{this.meta.push(JSON.parse(text));this.finish();});
  this.exited=new Promise((ok,bad)=>{this.child.on('error',bad);this.child.on('close',code=>code?bad(Error(`echo exited ${code}`)):ok());});
 }
 finish(){if(!this.pending?.received||(this.name!=='node'&&!this.meta.length))return;const p=this.pending;this.pending=null;clearTimeout(p.timer);p.done({wallMs:p.wallMs,...(this.name==='node'?{}:this.meta.shift())});}
 request(text){return new Promise(done=>{assert.ok(!this.pending);this.pending={text,done,start:performance.now(),timer:setTimeout(()=>{this.child.kill();throw Error('transfer timeout');},30000)};this.child.stdin.write(text+'\n');});}
 async close(){this.child.stdin.end();await this.exited;}
}
const raw=[];
for(let session=0;session<2;session++){
 const peers=Object.fromEntries(['node','baseline','candidate'].map(name=>[name,new Peer(name)]));
 try{for(const bytes of [1024,262144,900000]){const text='x'.repeat(bytes);for(let sample=-5;sample<20;sample++)for(const backend of (sample+session)%2?['candidate','baseline','node']:['node','baseline','candidate']){const timing=await peers[backend].request(text);if(sample>=0)raw.push({session,sample,bytes,backend,...timing});}}}
 finally{for(const peer of Object.values(peers))await peer.close();}
}
const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1];
const summary=[];
for(const bytes of [1024,262144,900000])for(const backend of ['node','baseline','candidate']){const rows=raw.filter(x=>x.bytes===bytes&&x.backend===backend);summary.push({bytes,backend,samples:rows.length,medianMs:percentile(rows.map(x=>x.wallMs),.5),p95Ms:percentile(rows.map(x=>x.wallMs),.95),...(backend==='node'?{}:{medianReadCpuMs:percentile(rows.map(x=>x.readCpuMs),.5),medianWriteCpuMs:percentile(rows.map(x=>x.writeCpuMs),.5)})});}
writeFileSync(join(options.out,'results.json'),JSON.stringify({identities,sourceSha256:digest(source),controllerSha256:digest(import.meta.filename),method:'Transfer diagnostic, with CPU clock probes in native peers. No JSON parse/serialization of payloads and no calculations. ASCII frame echoed at identical input/output byte sizes. Two fresh persistent-worker sessions, five discarded warmups, twenty samples/session/backend, alternating order. Native CPU isolates input framing/UTF-8 decode and output UTF-8 encode/write. Metadata serialization is outside those CPU intervals; wall time ends on echo receipt. This is a control, not the production protocol or a subtractable estimate for unequal Ledger input/output sizes.',summary,raw},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
