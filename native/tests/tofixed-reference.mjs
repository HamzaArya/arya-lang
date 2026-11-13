// Independent Node binary64 oracle; no decimal strings used to construct inputs.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const work=process.env.ARYA_FIXED_TEST_DIR??mkdtempSync(join(tmpdir(),'arya-fixed-'));
const lib=process.env.ARYA_NATIVE_LIBDIR??join(root,'.build/independent/lib');
const source=join(work,'fixed.c'), binary=join(work,'fixed');
writeFileSync(source,`#include "${join(root,'native/runtime/core.c')}"
#include <fenv.h>
#include <locale.h>
int main(void){
  unsigned long long bits;int places,mode;AV key=astr("toFixed");ARoot root;aroot(&root,&key,1);
  /* Use an installed comma-decimal locale if available. */
  if(!setlocale(LC_NUMERIC,"de_DE.UTF-8"))setlocale(LC_NUMERIC,"fr_FR.UTF-8");
  while(scanf("%llx %d %d",&bits,&places,&mode)==3){double value;memcpy(&value,&bits,8);
    fesetround(mode==1?FE_UPWARD:mode==2?FE_DOWNWARD:mode==3?FE_TOWARDZERO:FE_TONEAREST);
    AV method=aget(an(value),key);ARoot mr;aroot(&mr,&method,1);AV arg=an(places);
    AV result=acall(method,1,&arg);aunroot(&mr);if(afailed)return areport();
    char *text=autf8(result);puts(text);free(text);
  }
  aunroot(&root);return 0;
}
`);
const cc=process.env.CC??'cc';
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:64*1024*1024,timeout:180000,...options});assert.equal(r.status,0,r.error?.message??r.stderr);return r;}
run(cc,['-std=c11','-O2','-ffp-contract=off','-I',join(root,'native/vendor/ryu'),'-I',lib,source,join(lib,'libmpdec.a'),'-lm','-pthread','-o',binary]);
const view=new DataView(new ArrayBuffer(8));
const bitsOf=n=>{view.setFloat64(0,n);return view.getBigUint64(0);};
const numberOf=bits=>{view.setBigUint64(0,BigInt.asUintN(64,bits));return view.getFloat64(0);};
let seed=0x41525941;
const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
const rows=[];
function add(n,p,mode=0){rows.push({bits:bitsOf(n).toString(16),p,mode,expected:n.toFixed(p)});}
const values=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,NaN,Infinity,-Infinity,
  1.005,1.015,2.675,0.125,-0.125,0.5,-0.5,-0.00001,1e-100,1e-20,1e20,1e21,-1e21,
  9007199254740991,9007199254740992,1000000000000000128,18446744073709551616];
for(const n of values)for(const p of [0,1,2,3,6,18,19,20,50,99,100])for(let mode=0;mode<4;mode++)add(n,p,mode);
// Adjacent representable values at decimal and power-of-two boundaries.
for(let p=0;p<=100;p++){
  for(const n of [0.5*10**(-p),1.5*10**(-p),2**(p-50),1e21,2**-1022]){
    const b=bitsOf(n);for(const delta of [-1n,0n,1n]){const x=numberOf(b+delta);add(x,p);add(-x,p);}
  }
}
for(let i=0;i<30000;i++){
  const bits=(BigInt(next())<<32n)|BigInt(next());
  const n=numberOf(bits),p=next()%101;add(n,p);
  if(i<10000){const x=(next()-0x80000000)/1000;add(x,2);}
}
// Sweep cents, including both sides of every half-cent near zero.
for(let i=-500;i<=500;i++){const b=bitsOf(i/100+0.005);for(const delta of [-1n,0n,1n])add(numberOf(b+delta),2);}
writeFileSync(join(work,'cases.json'),JSON.stringify(rows)+'\n');
const input=rows.map(r=>`${r.bits} ${r.p} ${r.mode}\n`).join('');
function verify(result,cases,label){const actual=result.stdout.trimEnd().split('\n');assert.equal(actual.length,cases.length,label);for(let i=0;i<cases.length;i++)assert.equal(actual[i],cases[i].expected,`${label} ${JSON.stringify(cases[i])}`);}
verify(run(binary,[],{input}),rows,'release');
run(cc,['-std=c11','-O1','-g','-ffp-contract=off','-fsanitize=address,undefined','-fno-omit-frame-pointer','-I',join(root,'native/vendor/ryu'),'-I',lib,source,join(lib,'libmpdec.a'),'-lm','-pthread','-o',binary+'-sanitized']);
verify(run(binary+'-sanitized',[],{input,env:{...process.env,ASAN_OPTIONS:'detect_leaks=0',UBSAN_OPTIONS:'halt_on_error=1'}}),rows,'sanitized');
const stress=rows.filter((_,i)=>i%127===0);
verify(run(binary+'-sanitized',[],{input:stress.map(r=>`${r.bits} ${r.p} ${r.mode}\n`).join(''),env:{...process.env,ARYA_GC_STRESS:'1',ASAN_OPTIONS:'detect_leaks=0',UBSAN_OPTIONS:'halt_on_error=1'}}),stress,'sanitized GC stress');
const evidence={seed:'0x41525941',cases:rows.length,stressCases:stress.length,roundingModes:4,work,passed:true};
writeFileSync(join(work,'result.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
