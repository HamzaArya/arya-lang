// Reuse the unchanged Ledger fixture set prepared by benchmarks/ledger.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(process.argv[2] || join(root, '.build/performance-2026-11-12'));
const compiler = process.env.ARYA_NATIVE_BIN || join(root, '.build/independent/arya');
const { cases } = await import(pathToFileURL(join(out, 'ledger-cases.mjs')));
const selected = cases.filter(x => ['invoice-exact','budget-line','bank-score','schedule-production'].includes(x.task));
const dir = mkdtempSync(join(root, '.build/ledger-finance.'));
try {
  writeFileSync(join(dir, 'main.arya'), `use std "finance" as finance
use std "io" as io
use std "json" as json
const options = {currency: "USD", scale: 2, rounding: "half-up"}
fn calculate(task, payload) {
  if task == "invoice-exact" { return finance.invoiceTotals(payload.lines, payload.discount, payload.fxRate, options) }
  if task == "budget-line" { return finance.budgetVariance([{budget: payload.budget, actual: payload.actual, revenue: payload.revenue}], options)[0] }
  if task == "bank-score" { return finance.amountScores([{left: payload.left, right: payload.right}])[0] }
  return finance.production(payload.amount, payload.units, payload.totalUnits, options)
}
while true { const line = io.readLine(); if line == null { break }; const request: any = json.parse(line)
  print(json.stringify({id: request.id, result: calculate(request.task, request.payload)}))
}\n`);
  const build = spawnSync(compiler, ['build', join(dir,'main.arya'), '-o', join(dir,'program'), '--debug','--sanitize'], {encoding:'utf8',timeout:120000});
  assert.equal(build.status,0,build.stderr||build.stdout);
  const result = spawnSync(join(dir,'program'),[],{input:selected.map(({id,task,payload})=>JSON.stringify({id,task,payload})).join('\n')+'\n',
    encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,env:{PATH:'/nonexistent',ARYA_GC_STRESS:'1',ASAN_OPTIONS:'detect_leaks=0',UBSAN_OPTIONS:'halt_on_error=1'}});
  assert.equal(result.status,0,result.stderr);
  const actual=result.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(actual.length,selected.length);
  for(let i=0;i<actual.length;i++)assert.deepEqual(actual[i],{id:selected[i].id,result:selected[i].expected},`${selected[i].task}: ${i}`);
  console.log(`New finance APIs: ${selected.length} unchanged Ledger cases passed with ASan/UBSan and GC stress`);
}finally{rmSync(dir,{recursive:true,force:true});}
