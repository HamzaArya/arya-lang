// Hand-written Node oracle. It neither imports nor translates the Arya algorithm.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,a)=>i%2?pairs:[...pairs,[v.slice(2),a[i+1]]],[]));
assert.ok(args.ledger&&args.baseline&&args.candidate,'--ledger FROZEN_LEDGER --baseline WORKER --candidate WORKER [--sanitized WORKER] [--out RESULT]');
const round=v=>Number(Number(v||0).toFixed(2));
const put=(r,k,v)=>Object.defineProperty(r,k,{value:v,enumerable:true,configurable:true,writable:true});
const own=(r,k)=>Object.hasOwn(r,k)?r[k]:0;
function allocations(events){
  const result={debit:{},credit:{}};
  for(const e of events){if(!['debit','credit'].includes(e.side))throw new TypeError('Invalid allocation side');const r=result[e.side];put(r,e.key,e.replace?e.amount:round(Number(own(r,e.key)||0)+e.amount));}
  return result;
}
function settle(rows,allocated){
  const groups={};
  for(const row of rows){
    if(!Object.hasOwn(groups,row.currencyCode))put(groups,row.currencyCode,{debit:{charges:[],settlement:0},credit:{charges:[],settlement:0}});
    for(const [side,charge,credit]of [['debit',row.debit,row.credit],['credit',row.credit,row.debit]]){
      const group=groups[row.currencyCode][side];
      if(charge>0){const applied=Math.min(round(own(allocated[side],row.rowKey)||0),charge),m=row.metadata;
        group.charges.push({rowKey:row.rowKey,currencyCode:row.currencyCode,kind:m.kind,sourceType:m.sourceType,sourceId:m.sourceId,reference:m.reference,typeLabel:m.typeLabel,date:m.date,dueDate:m.dueDate||m.date,amount:round(charge),settled:applied,remaining:round(charge-applied),days:row.days});
        group.settlement=round(group.settlement-applied);
      }
      if(credit>0)group.settlement=round(group.settlement+credit);
    }
  }
  function finish(side){
    const aging={},openItems=[],unappliedByCurrency={};
    for(const [code,both]of Object.entries(groups)){
      const bucket=both[side];let remainder=bucket.settlement;
      const charges=bucket.charges.map((v,i)=>({v,i})).sort((a,b)=>a.v.date<b.v.date?-1:a.v.date>b.v.date?1:a.i-b.i).map(x=>x.v);
      for(const c of charges){if(remainder<=.005)break;const take=Math.min(c.remaining,remainder);if(take<=0)continue;c.remaining=round(c.remaining-take);c.settled=round(c.settled+take);remainder=round(remainder-take);}
      const totals={current:0,days1To30:0,days31To60:0,days61To90:0,days90Plus:0,total:0};
      for(const c of charges){
        if(c.remaining<=.005)continue;
        const bucket=c.days<=0?'current':c.days<=30?'days1To30':c.days<=60?'days31To60':c.days<=90?'days61To90':'days90Plus';
        totals[bucket]=round(totals[bucket]+c.remaining);totals.total=round(totals.total+c.remaining);
        openItems.push({rowKey:c.rowKey,kind:c.kind,sourceType:c.sourceType,sourceId:c.sourceId,reference:c.reference,typeLabel:c.typeLabel,date:c.date,dueDate:c.dueDate,currencyCode:c.currencyCode,amount:c.amount,settled:c.settled,remaining:c.remaining,side:side==='debit'?'receivable':'payable',daysOverdue:Math.max(0,c.days),bucket});
      }
      put(aging,code,totals);if(remainder>.005)put(unappliedByCurrency,code,round(remainder));
    }
    return {aging,openItems:openItems.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0),unappliedByCurrency};
  }
  const receivable=finish('debit'),payable=finish('credit'),byCurrency={};
  for(const code of Object.keys(groups)){
    const r=receivable.aging[code],p=payable.aging[code],side=r.total>.005?'receivable':p.total>.005?'payable':'settled';
    put(byCurrency,code,Object.assign({side},side==='payable'?p:r,{receivable:r,payable:p}));
  }
  return {byCurrency,receivable,payable,openItems:[...receivable.openItems,...payable.openItems].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)};
}
const compat=createRequire(join(resolve(args.ledger),'package.json'))(join(resolve(args.ledger),'backend/src/arya/generated/aging-settlement.cjs'));
const cases=[];const normalize=v=>JSON.parse(JSON.stringify(v));
function add(task,payload){const result=task==='aging-settle'?settle(payload.rows,payload.allocations):allocations(payload.events);const same=task==='aging-settle'?compat.settle(payload.rows,payload.allocations):compat.allocationIndex(payload.events);assert.deepEqual(normalize(same),normalize(result),'independent oracle vs compatibility');cases.push({id:cases.length+1,task,payload,expected:normalize(result)});}
let seed=0x1ed6e2;const next=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const keys=['__proto__','constructor','toString','','0','2','10','same','é','a\0b'];
const codes=['USD','AFN','EUR','__proto__','constructor','toString','2','10'];
const amounts=[-0,0,.004999999999999999,.005,.005000000000000001,-.005,1.005,-1.005,2.675,-2.675,.125,-.125,99.995,1000000000000000128,9007199254740991];
const makeRow=(i,currencyCode='USD',date='2026-10-01')=>({rowKey:`invoice:${i}`,currencyCode,debit:20,credit:0,days:i%101,metadata:{kind:'sale',sourceType:'invoice',sourceId:i,reference:`I-${i}`,typeLabel:'Invoice',date}});
add('aging-settle',{rows:[],allocations:{debit:{},credit:{}}});add('allocation-index',{events:[]});
const ties=[makeRow(0),makeRow(1),{...makeRow(2),debit:0,credit:25}];
add('aging-settle',{rows:ties,allocations:{debit:{},credit:{}}});
assert.deepEqual(cases.at(-1).expected.receivable.openItems.map(x=>[x.rowKey,x.remaining]),[['invoice:1',15]]);
for(const key of keys){const events=[{side:'debit',key,amount:1.005,replace:false},{side:'debit',key,amount:2.675,replace:false},{side:'credit',key,amount:7.125,replace:false},{side:'debit',key,amount:-.125,replace:true},{side:'debit',key,amount:.25,replace:false}];add('allocation-index',{events});}
for(const amount of amounts)add('allocation-index',{events:[{side:'debit',key:'same',amount,replace:true},{side:'debit',key:'same',amount:-amount,replace:false},{side:'debit',key:'same',amount,replace:false}]});
for(let trial=0;trial<350;trial++){
  const events=Array.from({length:next(100)},()=>({side:next(2)?'debit':'credit',key:keys[next(keys.length)],amount:next(4)?(next(100000)-50000)/1000:amounts[next(amounts.length)],replace:next(5)===0}));
  add('allocation-index',{events});
  const index=allocations(events);
  const rows=Array.from({length:next(55)},(_,i)=>({...makeRow(i,codes[next(codes.length)],`2026-10-${String(next(5)+1).padStart(2,'0')}`),rowKey:keys[next(keys.length)],debit:next(4)?(next(50000)-100)/1000:amounts[next(amounts.length)],credit:next(4)?0:next(40000)/1000,days:next(170)-20}));
  add('aging-settle',{rows,allocations:index});
}
// Invalid input parity uses each established implementation as its own seam
// oracle: native baseline results and errors must remain identical after optimization.
const invalid=[{task:'allocation-index',payload:{events:[{side:'other',key:'x',amount:1,replace:false}]}},{task:'allocation-index',payload:{events:[{side:'debit',key:1,amount:1,replace:false}]}},{task:'allocation-index',payload:{events:[{side:'debit',key:'x',amount:'1',replace:false}]}},{task:'aging-settle',payload:{rows:[{...makeRow(0),debit:'20'}],allocations:{debit:{},credit:{}}}},{task:'aging-settle',payload:{rows:null,allocations:{debit:{},credit:{}}}}];
const invalidNode=[];
for(const row of invalid){
  let behavior;try{behavior={result:normalize(row.task==='aging-settle'?compat.settle(row.payload.rows,row.payload.allocations):compat.allocationIndex(row.payload.events))};}catch(error){behavior={error:{name:error.name,message:error.message}};}
  invalidNode.push({id:cases.length+1,...row,behavior});cases.push({id:cases.length+1,...row,invalid:true});
}
if(args.out)writeFileSync(args.out.replace(/\.json$/,'')+'.cases.json',JSON.stringify(cases)+'\n');
const input=cases.map(({id,task,payload})=>JSON.stringify({id,task,payload})).join('\n')+'\n';
const evidence={seed:'0x1ed6e2',cases:cases.length,invalidCases:invalid.length,invalidNode,invalidNative:[],zones:[],passed:false};
for(const zone of ['Asia/Kabul','America/Los_Angeles']){
  let baseline;
  for(const name of ['baseline','candidate','sanitized'].filter(n=>args[n])){
    const selected=name==='sanitized'?cases.filter((_,i)=>i<28||i%47===0||cases[i].invalid):cases;
    const text=name==='sanitized'?selected.map(({id,task,payload})=>JSON.stringify({id,task,payload})).join('\n')+'\n':input;
    const result=spawnSync(resolve(args[name]),[],{cwd:'/',env:{PATH:'/nonexistent',TZ:zone,...(name==='sanitized'?{ARYA_GC_STRESS:'1',ASAN_OPTIONS:'detect_leaks=0',UBSAN_OPTIONS:'halt_on_error=1'}:{})},input:text,encoding:'utf8',maxBuffer:128*1024*1024,timeout:180000});
    assert.equal(result.status,0,result.error?.message??result.stderr);
    const outputs=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(outputs.length,selected.length);
    for(let i=0;i<selected.length;i++){
      const row=selected[i],actual=outputs[i];assert.equal(actual.id,row.id);
      if(row.invalid){if(name!=='baseline')assert.deepEqual(actual,baseline.find(x=>x.id===row.id),'established invalid input behavior');else evidence.invalidNative.push({zone,...actual});}
      else assert.deepEqual(actual,{id:row.id,result:row.expected},`${name} ${zone} case ${row.id}`);
    }
    if(name==='baseline')baseline=outputs;
    evidence.zones.push({zone,backend:name,cases:selected.length});
  }
}
evidence.passed=true;if(args.out)writeFileSync(args.out,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
