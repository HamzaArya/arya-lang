import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../src/compiler.js';
import { analyze, standardCompletions } from '../src/language-service.js';

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya-testing-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  return root;
}
async function run(t: { after(fn: () => Promise<unknown>): void }, source: string) {
  const root = await fixture(t), file = join(root, 'example.test.arya');
  await writeFile(file, 'use std "testing" as t\n' + source);
  const result = spawnSync(process.execPath, [resolve('dist/cli.cjs'),'test',file], {encoding:'utf8',timeout:20000});
  assert.ifError(result.error);
  return result;
}

test('testing assertions use strict comparisons, error matchers, and Node mocks', async t => {
  const root = await fixture(t), output = join(root, 'main.mjs');
  await writeFile(output, compile('use std "testing" as testing\nexport const tools = testing').code);
  const {tools} = await import(pathToFileURL(output).href);
  tools.assert(true); tools.equal(2,2); tools.notEqual(2,'2');
  tools.equal(undefined,undefined); tools.deepEqual(undefined,undefined);
  assert.throws(()=>tools.equal(1,2,undefined),{code:'ERR_ASSERTION'});
  assert.throws(()=>tools.equal(1,2,'custom comparison'),(error: any)=>error.code==='ERR_ASSERTION'&&error.message.includes('custom comparison'));
  assert.throws(()=>tools.fail(),{code:'ERR_ASSERTION'});
  tools.deepEqual({a:[1,{b:true}]},{a:[1,{b:true}]}); tools.notDeepEqual([1],['1']);
  for (const operation of [() => tools.assert(false), () => tools.equal(2,'2'), () => tools.notEqual(2,2), () => tools.deepEqual([1],['1']), () => tools.notDeepEqual([1],[1]), () => tools.fail('expected failure')]) assert.throws(operation, {code:'ERR_ASSERTION'});
  const broken = () => { throw Object.assign(new Error('broken'), {code:'EXAMPLE'}); };
  tools.throws(broken, {code:'EXAMPLE'});
  tools.throws(broken, {message:'broken'});
  assert.throws(() => tools.throws(() => {}), {code:'ERR_ASSERTION'});
  assert.throws(() => tools.throws(broken, {code:'OTHER'}), {code:'ERR_ASSERTION'});
  assert.throws(() => tools.throws(broken,'broken'), /error matcher/);
  await tools.rejects(async () => broken(), {code:'EXAMPLE'});
  await assert.rejects(tools.rejects(async () => 1), {code:'ERR_ASSERTION'});
  const receiver = {value:3, fn:tools.mock(function(this: {value:number}, amount: number) { return this.value + amount; })};
  assert.equal(receiver.fn(2),5);
  assert.equal(receiver.fn.mock.callCount(),1);
  assert.deepEqual(receiver.fn.mock.calls[0].arguments,[2]);
  assert.equal(receiver.fn.mock.calls[0].this,receiver);
  assert.equal(receiver.fn.mock.calls[0].result,5);
  receiver.fn.mock.resetCalls();
  assert.equal(receiver.fn.mock.callCount(),0);
  assert.equal(tools.mock()(),undefined);
  assert.ok(Object.isFrozen(tools));
  for (const options of [null,[],{timeoutMs:0},{timeoutMs:Infinity},{concurrency:0},{concurrency:true},{skip:1},{todo:{}},{typo:true}]) assert.throws(() => tools.test('invalid', () => {}, options), TypeError);
  assert.throws(() => tools.test('', () => {}), /nonempty/);
  assert.throws(() => tools.suite('invalid', null), /functions/);
  assert.throws(() => tools.before(42), /functions/);
  assert.throws(() => tools.mock(42), /functions/);
});

test('arya test runs suites, async hooks, assertions, context cleanup, skips, todos, and scoped mocks', async t => {
  const result = await run(t, `
use std "security" as security
let setups = 0
let cleanups = 0
t.suite("account helpers", fn() {
  t.before(async fn() { await Promise.resolve(); t.equal(setups, 0) })
  t.beforeEach(async fn() { await Promise.resolve(); setups += 1 })
  t.afterEach(fn() { cleanups += 1 })
  t.after(fn() { t.equal(setups, 3); t.equal(cleanups, 3) })
  t.test("nested values", fn() { t.deepEqual({roles: ["reader"]}, {roles: ["reader"]}) })
  t.test("async errors", async fn(context) {
    context.after(fn() { t.assert(true) })
    await t.rejects(async fn() { throw {code: "EXPECTED"} }, {code: "EXPECTED"})
    t.throws(fn() { security.encrypt("bad-key", "secret") }, {code: "ARYA_SECURITY_KEY"})
  }, {timeoutMs: 5000})
  t.test("mock calls", fn(context) {
    const service = {read: fn() => "real"}
    context.mock.method(service, "read", fn() => "fake")
    t.equal(service.read(), "fake")
    t.equal(service.read.mock.callCount(), 1)
    const doubled = t.mock(fn(value) => value * 2)
    t.equal(doubled(3), 6)
    t.deepEqual(doubled.mock.calls[0].arguments, [3])
  })
})
t.skip("network integration", "needs credentials")
t.todo("add audit export")
t.test("options skip", fn() { t.fail("must not run") }, {skip: "offline"})
`);
  assert.equal(result.status,0,result.stdout + result.stderr);
  for (const name of ['account helpers','nested values','async errors','mock calls','network integration','add audit export']) assert.ok(result.stdout.includes(name),result.stdout);
  assert.match(result.stdout,/skipped 2/); assert.match(result.stdout,/TODO/);
});

test('arya test reports assertion diffs and original Arya call sites with a failing exit status', async t => {
  const result = await run(t, 't.test("price mismatch", fn() { t.equal(19, 20, "check invoice total") })');
  assert.equal(result.status,1,result.stdout + result.stderr);
  assert.match(result.stdout,/price mismatch/);
  assert.match(result.stdout,/check invoice total/);
  assert.match(result.stdout,/example\.test\.arya:2:/);
  assert.match(result.stdout,/expected: 20/); assert.match(result.stdout,/actual: 19/);
});

test('testing maps timeoutMs to the runner and reports rejected async bodies', async t => {
  const result = await run(t, `t.test("bounded wait", async fn() { await new Promise(fn(resolve) { setTimeout(resolve, 100) }) }, {timeoutMs: 5})
t.test("rejected body", async fn() { throw new Error("async failure") })`);
  assert.equal(result.status,1,result.stdout + result.stderr);
  assert.match(result.stdout,/timed out/); assert.match(result.stdout,/async failure/);
});

test('testing imports stay passive during checking, have static types, and include member hints', () => {
  const source = 'use std "testing" as t\nt.test("passive", async fn(context) { throw new Error("must not run") })\nconst done: boolean = true';
  assert.deepEqual(analyze(source, 'file:///example.test.arya').diagnostics, []);
  assert.doesNotThrow(() => compile(source));
  assert.throws(() => compile('use std "testing" as t\nconst value: boolean = true\nt.test("wrong", 42)'), /Expected/);
  assert.throws(() => compile('use std "testing" as t\nconst value: boolean = true\nt.test("wrong", fn() {}, {timeoutMs: "fast"})'), /Expected/);
  const prefix = 'use std "testing" as checks\nchecks.';
  const labels = standardCompletions(prefix,prefix.length).map(item => item.label);
  for (const method of ['test','suite','equal','deepEqual','throws','rejects','beforeEach','afterEach','mock']) assert.ok(labels.includes(method));
  const code = compile(source).code;
  assert.match(code,/node:test/); assert.match(code,/node:assert\/strict/);
  assert.doesNotMatch(code,/__arya_security|node:crypto/);
});

test('documented testing example checks and executes imported Arya modules', () => {
  const file = resolve('fixtures/examples/testing/main.test.arya'), cli = resolve('dist/cli.cjs');
  for (const command of ['check','test']) {
    const result = spawnSync(process.execPath, [cli,command,file], {encoding:'utf8',timeout:20000});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stdout + result.stderr);
    if (command === 'test') assert.match(result.stdout,/pass 5/);
  }
});
