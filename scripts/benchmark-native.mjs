import { mkdtemp,writeFile,readFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{checkNativeProject,writeNativeProject}=require('../dist/native.cjs');
const root=await mkdtemp(join(tmpdir(),'arya benchmark '));
const source='fn sum(n) { let total = 0; let i = 0; while i < n { total += i; i += 1 } return total }\nprint(sum(number(args[0])))\n';
const filename=join(root,'sum.arya');await writeFile(filename,source);
const start=performance.now(),project=await checkNativeProject(filename),built=await writeNativeProject(project),buildMs=performance.now()-start;
const c=join(root,'sum.c'),native=join(root,'sum-c');
await writeFile(c,'#include <stdio.h>\n#include <stdlib.h>\nint main(int argc,char **argv){double n=argc>1?strtod(argv[1],0):0,total=0;for(double i=0;i<n;i++)total+=i;printf("%.0f\\n",total);return 0;}\n');
const compiler=process.env.ARYA_CC??process.env.CC??'cc';execFileSync(compiler,['-O2','-ffp-contract=off',c,'-o',native]);
const js=join(root,'sum.js');await writeFile(js,'let n=Number(process.argv[2]),total=0;for(let i=0;i<n;i++)total+=i;console.log(total);\n');
const n='20000000',expected='199999990000000\n';
function measure(exe,args){let samples=[];for(let i=0;i<7;i++){const t=performance.now();const actual=execFileSync(exe,args,{encoding:'utf8'});if(actual!==expected)throw new Error('Incorrect benchmark result: '+actual);samples.push(performance.now()-t);}return {samplesMs:samples,medianMs:[...samples].sort((a,b)=>a-b)[3]};}
const arya=measure(built.executable,[n]),baseline=measure(native,[n]),javascript=measure(process.execPath,[js,n]);
if(!project.specializedFunctions)throw new Error('Numeric specialization was not emitted.');
const report={platform:process.platform,arch:process.arch,node:process.version,compiler:execFileSync(compiler,['--version'],{encoding:'utf8'}).split('\n')[0],iterations:Number(n),result:expected.trim(),buildMs,executableBytes:(await readFile(built.executable)).length,specializedFunctions:project.specializedFunctions,arya,optimizedC:baseline,js:javascript,nativeToCRatio:arya.medianMs/baseline.medianMs,includesProcessStartup:true,notes:'One numeric-loop microbenchmark, not a general language speed claim. No fast-math; input is supplied at runtime.'};
await mkdir('artifacts/evidence',{recursive:true});await writeFile(resolve('artifacts/evidence/native-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
// A generous regression guard catches accidental per-operation dynamic dispatch.
if(report.nativeToCRatio>4)throw new Error('Numeric loop exceeded the recorded 4x native-C regression budget; inspect environment and generated code.');
