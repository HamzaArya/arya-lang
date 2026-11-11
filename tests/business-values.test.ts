import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../src/compiler.js';
async function libraries(t: {after(fn:()=>Promise<unknown>):void}) {
  const root=await mkdtemp(join(tmpdir(),'arya-values-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const output=join(root,'main.mjs'); await writeFile(output,compile('use std "decimal" as decimal\nuse std "datetime" as datetime\nexport const d = decimal\nexport const dt = datetime\n').code);
  return import(pathToFileURL(output).href);
}
test('decimal arithmetic, bounds, explicit rounding and transport',async t=>{
  const {d}=await libraries(t);
  assert.equal(d.add('0.1','0.2'),'0.3');
  assert.equal(d.subtract('-1.20','0.30'),'-1.5');
  assert.equal(d.multiply('9007199254740993','100.01'),'900809997466646709.93');
  assert.equal(d.compare('9007199254740993','9007199254740992'),1);
  assert.equal(d.divide('1','3',3,'half-up'),'0.333');
  assert.equal(d.quantize('2.345',2,'half-up'),'2.35');
  assert.equal(d.quantize('2.345',2,'half-even'),'2.34');
  assert.equal(d.quantize('-2.5',0,'half-up'),'-3');
  assert.equal(d.quantize('1.2345',3,'half-even'),'1.234');
  const first=d.divide('10','3',2,'down'), last=d.subtract('10',d.add(first,first));
  assert.equal(d.add(d.add(first,first),last),'10');
  assert.equal(d.from(JSON.parse(JSON.stringify('9007199254740993.12'))),'9007199254740993.12');
  assert.equal(d.toNumber('0.1'),0.1);
  for(const value of ['NaN','Infinity','','1e2','1,000',1,null,'-01']) assert.throws(()=>d.from(value));
  assert.throws(()=>d.divide('1','0',2,'half-up'),{code:'ARYA_DECIMAL_ZERO'});
  assert.throws(()=>d.divide('1','2',2),{code:'ARYA_DECIMAL_ROUNDING'});
  assert.throws(()=>d.toNumber('9007199254740993'),{code:'ARYA_DECIMAL_PRECISION'});
  assert.throws(()=>d.toNumber('0.10000000000000000001'),{code:'ARYA_DECIMAL_PRECISION'});
  const wide='9'.repeat(500); assert.equal(d.subtract(d.add(wide,'0.1'),wide),'0.1');
});
test('date-only and instants are strict across leap days, offsets and DST',async t=>{
  const {dt}=await libraries(t);
  for(const value of ['2024-02-29','2000-02-29','0001-01-01','9999-12-31']) assert.equal(dt.date(value),value);
  for(const value of ['2023-02-29','1900-02-29','2026-04-31','2026-13-01','0000-01-01']) assert.throws(()=>dt.date(value));
  assert.equal(dt.instant('2026-01-01T00:00:00+04:30'),'2025-12-31T19:30:00.000Z');
  assert.equal(dt.fromDate(dt.toDate('2026-01-01T00:00:00Z')),'2026-01-01T00:00:00.000Z');
  assert.equal(dt.dateAt('2026-01-01T00:00:00Z','America/Los_Angeles'),'2025-12-31');
  assert.equal(dt.zoned('2026-03-08T06:59:59Z','America/New_York').time,'01:59:59');
  assert.equal(dt.zoned('2026-03-08T07:00:00Z','America/New_York').time,'03:00:00');
  for(const value of ['2026-02-30T00:00:00Z','2026-01-01','2026-01-01T24:00:00Z','2026-01-01T00:00:60Z']) assert.throws(()=>dt.instant(value));
  assert.throws(()=>dt.dateAt('2026-01-01T00:00:00Z','bad/zone'));
  assert.throws(()=>dt.dateAt('0001-01-01T00:00:00Z','America/New_York'),/outside years/);
});
