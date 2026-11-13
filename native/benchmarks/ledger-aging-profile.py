"""Build phase timers and separate instrumented attribution for frozen Ledger rules.
Instrumented CPU totals overlap (inclusive call costs); never use them as speed timings.
"""
import argparse,hashlib,json,os,re,subprocess,pathlib,statistics
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--compiler',required=True);p.add_argument('--ledger',required=True);p.add_argument('--out',required=True);p.add_argument('--node',action='store_true')
a=p.parse_args();out=pathlib.Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
compiler=pathlib.Path(a.compiler).resolve();ledger=pathlib.Path(a.ledger).resolve()
def run(cmd,**kwargs):
 r=subprocess.run(list(map(str,cmd)),capture_output=True,text=True,timeout=180,**kwargs)
 if r.returncode:raise RuntimeError(str(cmd)+'\n'+r.stdout[-1000:]+r.stderr[-3000:])
 return r
(out/'aging-settlement.arya').write_bytes((ledger/'backend/src/arya/aging-settlement.arya').read_bytes())
source=out/'phases.arya'
source.write_text('''use std "io" as io
use std "json" as json
use std "runtime" as runtime
use std "list" as list
use arya "'''+'./aging-settlement.arya'+'''" as aging
fn calculate(task, p) {
  if task == "aging-settle" { return aging.settle(p.rows, p.allocations) }
  if task == "allocation-index" { return aging.allocationIndex(p.events) }
  if task == "rounding" { let total = 0; for value in p.values { total += Number(value.toFixed(2)) }; return total }
  if task == "rounding-detached" { let total = 0; for value in p.values { const fixed = value.toFixed; total += Number(fixed(2)) }; return total }
  if task == "properties" { let total = 0; for row in p.rows { total += row.debit + row.credit + row.days + len(row.currencyCode) }; return total }
  if task == "updates" { const result: any = {}; for event in p.events { result[event.key] = event.amount }; return result }
  if task == "descriptors" { const result: any = {}; for event in p.events { Object.defineProperty(result, event.key, {value: event.amount, enumerable: true, configurable: true, writable: true}) }; return result }
  if task == "sorting" { return list.sortBy(p.rows, fn(row) => String(row.metadata.date)) }
  if task == "allocation" { const result = []; for value in p.values { result.push({amount: value, debit: 0, credit: 0}) }; return result }
  return p
}
while true {
  const text = io.readLine()
  if text == null { break }
  const a = runtime.clock()
  const request: any = json.parse(text)
  const b = runtime.clock()
  const result = calculate(request.task, request.payload)
  const c = runtime.clock()
  const encoded = json.stringify(result)
  const d = runtime.clock()
  print(json.stringify({encoded: encoded, parseCpuMs: (b - a) * 1000, calculateCpuMs: (c - b) * 1000, stringifyCpuMs: (d - c) * 1000}))
}
''')
binary=out/'phases'
r=run([compiler,'build',source,'-o',binary,'--release','--force']);(out/'build.log').write_text(r.stdout+r.stderr)
# Instrument a different executable: every wrapped helper keeps its own inclusive
# CPU total. Allocation costs include allocator calls, not just object counts.
counted=out/'counted';run([compiler,'build',source,'-o',counted,'--release','--runtime-counters','--force'])
code=pathlib.Path(str(counted)+'.c').read_text()
names=['anumber_method' if 'static AV anumber_invoke(' not in code else 'anumber_invoke','akey_find','aset','aobject_function','alist_standard','amemory','aresize','aglobal']
header='\n#include <sys/resource.h>\nstatic double adalloc_cpu;static size_t adalloc_calls[4],adalloc_bytes;\nstatic double aprofile_cpu['+str(len(names))+'];\nstatic size_t aprofile_calls['+str(len(names))+'];\n'
code=code.replace('#include <time.h>','#include <time.h>'+header,1)
mpd_wrappers=r"""
static void *aprofile_mpd_malloc(size_t size){clock_t a=clock();void *p=malloc(size);adalloc_cpu+=(double)(clock()-a)*1000/CLOCKS_PER_SEC;adalloc_calls[0]++;adalloc_bytes+=size;return p;}
static void *aprofile_mpd_calloc(size_t n,size_t size){clock_t a=clock();void *p=calloc(n,size);adalloc_cpu+=(double)(clock()-a)*1000/CLOCKS_PER_SEC;adalloc_calls[1]++;adalloc_bytes+=n*size;return p;}
static void *aprofile_mpd_realloc(void *old,size_t size){clock_t a=clock();void *p=realloc(old,size);adalloc_cpu+=(double)(clock()-a)*1000/CLOCKS_PER_SEC;adalloc_calls[2]++;adalloc_bytes+=size;return p;}
static void aprofile_mpd_free(void *p){clock_t a=clock();free(p);adalloc_cpu+=(double)(clock()-a)*1000/CLOCKS_PER_SEC;adalloc_calls[3]++;}
static void aprofile_mpd_init(void){mpd_mallocfunc=aprofile_mpd_malloc;mpd_callocfunc=aprofile_mpd_calloc;mpd_reallocfunc=aprofile_mpd_realloc;mpd_free=aprofile_mpd_free;}
"""
code=code.replace('#include <mpdecimal.h>','#include <mpdecimal.h>\n'+mpd_wrappers,1)
code=code.replace('int main(int argc,char **argv){','int main(int argc,char **argv){aprofile_mpd_init();',1)

for i,name in enumerate(names):
 pattern=r'static\s+(AV|size_t|void\s*\*|void)\s*'+name+r'\(([^)]*)\)\s*\{'
 m=re.search(pattern,code)
 if not m:raise RuntimeError('No body for '+name)
 typ,args=m.group(1,2);params=','.join(re.search(r'(\w+)\s*$',arg.strip()).group(1) for arg in args.split(','))
 decl=f'static {typ} {name}_profile_body({args});\n'
 ret='' if typ=='void' else typ+' aprofile_result='
 end='' if typ=='void' else 'return aprofile_result;'
 wrap=f'static {typ} {name}({args}){{clock_t start=clock();{ret}{name}_profile_body({params});aprofile_cpu[{i}]+=(double)(clock()-start)*1000/CLOCKS_PER_SEC;aprofile_calls[{i}]++;{end}}}\n'
 code=code[:m.start()]+decl+wrap+f'static {typ} {name}_profile_body({args})'+'{'+code[m.end():]
report=''.join('fprintf(stderr,"ARYA_HELPER {\\"name\\":\\"'+name+'\\",\\"calls\\":%zu,\\"inclusiveCpuMs\\":%.6f}\\n",aprofile_calls['+str(i)+'],aprofile_cpu['+str(i)+']);' for i,name in enumerate(names))
report+='fprintf(stderr,'+json.dumps('ARYA_DECIMAL_ALLOCATIONS {"mallocCalls":%zu,"callocCalls":%zu,"reallocCalls":%zu,"freeCalls":%zu,"requestedBytes":%zu,"allocatorCpuMs":%.6f}\n')+',adalloc_calls[0],adalloc_calls[1],adalloc_calls[2],adalloc_calls[3],adalloc_bytes,adalloc_cpu);'
code=code.replace('static void acounters_report(void) {','static void acounters_report(void) {'+report,1)
phase='''if(id==30){double now=(double)clock()/CLOCKS_PER_SEC;struct rusage usage;getrusage(RUSAGE_SELF,&usage);fprintf(stderr,"ARYA_PHASE {\\"cpuMs\\":%.6f,\\"gcCpuMs\\":%.6f,\\"allocatorCpuMs\\":%.6f,\\"objects\\":%zu,\\"requestedBytes\\":%zu,\\"managedBytes\\":%zu,\\"maxRssPlatformUnits\\":%ld}\\n",now*1000,acounters.gc_cpu_ms,aprofile_cpu[5]+aprofile_cpu[6],acounters.heap_objects,acounters.requested_bytes,aallocated,usage.ru_maxrss);return an(now);}'''
# Positions 5 and 6 are amemory and aresize in the fixed names above.
phase=phase.replace('aprofile_cpu[5]+aprofile_cpu[6]','aprofile_cpu[5]+aprofile_cpu[6]')
assert 'if(id==30) return an((double)clock()/CLOCKS_PER_SEC);' in code
decimal_phase='fprintf(stderr,'+json.dumps('ARYA_DECIMAL_PHASE {"allocatorCpuMs":%.6f,"requestedBytes":%zu}\n')+',adalloc_cpu,adalloc_bytes);'
phase=phase.replace('return an(now);',decimal_phase+'return an(now);')
code=code.replace('if(id==30) return an((double)clock()/CLOCKS_PER_SEC);',phase)
instrumented=out/'instrumented';instrumented_source=out/'instrumented.c';instrumented_source.write_text(code)
lib=compiler.parent/'lib'
cc=['cc','-std=c11','-O2','-ffp-contract=off','-I',lib,instrumented_source,lib/'libmpdec.a','-lm','-pthread','-o',instrumented]
r=run(cc);(out/'instrumented-build.log').write_text(r.stdout+r.stderr)
rows=[dict(rowKey=f'invoice:{i}',currencyCode='USD' if i%3 else 'AFN',debit=i%100+1 if i%5 else 0,credit=0 if i%5 else 20,days=i%150-10,metadata=dict(kind='sale',sourceType='invoice',sourceId=i,reference=f'I-{i}',typeLabel='Invoice',date=f'2026-10-{i%28+1:02}'))for i in range(1000)]
events=[dict(side='debit' if i%3 else 'credit',key=f'document:{i%9000}',amount=(i%100+1)/100,replace=i%23==0)for i in range(10000)]
values=[(i%20000-10000)/1000 for i in range(10000)]
cases=[('aging-settle',dict(rows=rows,allocations=dict(debit={'invoice:1':1.25},credit={}))),('allocation-index',dict(events=events)),('rounding',dict(values=values)),('rounding-detached',dict(values=values)),('properties',dict(rows=rows*3)),('updates',dict(events=events)),('descriptors',dict(events=events)),('sorting',dict(rows=rows*3)),('allocation',dict(values=values))]
raw=[];diagnostics=[]
for task,payload in cases:
 text=json.dumps(dict(task=task,payload=payload),separators=(',',':'))+'\n'
 result=run([binary],input=text*12);samples=[json.loads(line) for line in result.stdout.splitlines()]
 for i,sample in enumerate(samples):
  encoded=sample.pop('encoded');json.loads(encoded)
  if i>=3:raw.append(dict(task=task,sample=i-3,**sample))
 counted_result=run([counted],input=text)
 (out/(task+'-counted.stderr')).write_text(counted_result.stderr)
 r=run([instrumented],input=text)
 (out/(task+'.stderr')).write_text(r.stderr)
 phases=[json.loads(line.split(' ',1)[1]) for line in r.stderr.splitlines() if line.startswith('ARYA_PHASE ')]
 decimal_phases=[json.loads(line.split(' ',1)[1]) for line in r.stderr.splitlines() if line.startswith('ARYA_DECIMAL_PHASE ')]
 assert len(phases)==len(decimal_phases)==4
 for phase,decimal in zip(phases,decimal_phases):phase['decimalAllocatorCpuMs']=decimal['allocatorCpuMs'];phase['decimalRequestedBytes']=decimal['requestedBytes']
 parts=[]
 for name,x,y in zip(['parse','calculation','serialization'],phases,phases[1:]):parts.append(dict(phase=name,**{key:y[key]-x[key] for key in ['cpuMs','gcCpuMs','allocatorCpuMs','decimalAllocatorCpuMs','decimalRequestedBytes','objects','requestedBytes','managedBytes']}))
 diagnostics.append(dict(task=task,parts=parts,stderr=r.stderr,countersOnlyStderr=counted_result.stderr))
 print(task,flush=True)
node_profiles=[]
if a.node:
 for task,payload in cases[:2]:
  text=json.dumps(dict(id=1,task=task,payload=payload),separators=(',',':'))+'\n'
  script=pathlib.Path(__file__).with_name('ledger-aging.mjs')
  r=run(['node','--trace-gc-nvp',script,'--node-worker',ledger,'--profile'],input=text*12)
  (out/(task+'-node.stdout')).write_text(r.stdout)
  (out/(task+'-node.stderr')).write_text(r.stderr)
  measurements=[json.loads(line) for line in r.stderr.splitlines() if line.startswith('{')]
  assert len(measurements)==12
  node_profiles.append(dict(task=task,raw=measurements[3:],gcTrace=[line for line in r.stdout.splitlines() if not line.startswith('{')],median={field:statistics.median(row[field]for row in measurements[3:])for field in ['parseCpuMs','calculateCpuMs','stringifyCpuMs']}))

summary=[dict(task=task,**{field:statistics.median(row[field]for row in raw if row['task']==task) for field in ['parseCpuMs','calculateCpuMs','stringifyCpuMs']}) for task,_ in cases]
manifest={'compilerSha256':hashlib.sha256(compiler.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'phaseBinarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'instrumentedBinarySha256':hashlib.sha256(instrumented.read_bytes()).hexdigest(),'method':'Uninstrumented phase CPU, 3 discarded warmups and 9 retained samples in one persistent process per microkernel. Separate per-helper instrumented builds; inclusive helper totals overlap and incur clock overhead. amemory/aresize timings cover runtime allocator calls; libmpdec allocator hooks are measured separately from runtime allocation. Requested runtime bytes count amemory allocations, not every realloc. Managed bytes are live+uncollected, not RSS. macOS maxRSS is bytes, Linux KiB. Phase instrumentation itself perturbs CPU; use phase binary for timing.', 'summary':summary,'raw':raw,'diagnostics':diagnostics,'nodeProfiles':node_profiles}
(out/'profile.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(summary,indent=2))
