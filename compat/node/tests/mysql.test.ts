import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../src/compiler.js';

interface Session {
  execute(sql: unknown, parameters?: unknown): Promise<any>;
  rows(sql: unknown, parameters?: unknown): Promise<any[]>;
  one(sql: string, parameters?: unknown[]): Promise<any>;
  scalar(sql: string, parameters?: unknown[]): Promise<any>;
}
interface Database extends Session {
  transaction<T>(callback: (transaction: Session) => T | Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<unknown>;
}
interface State {
  events: [string, ...any[]][];
  options: Record<string, any>;
  fail: string | null;
  resume?: () => void;
}

const fakeDriver = `
export const state = {events: [], fail: null};
const step = (name, ...args) => {
  state.events.push([name, ...args]);
  if (state.fail === name) throw Object.assign(new Error('secret SQL and password'), {code: 'ER_TEST', sqlState: 'HY000'});
};
const execute = async (target, sql, parameters) => {
  step('execute', target, sql, parameters);
  if (sql === 'WAIT') await new Promise(resolve => {state.resume = resolve;});
  if (sql === 'FAIL') throw Object.assign(new Error('secret SQL and password'), {code: 'ER_TEST', sqlState: 'HY000'});
  const result = sql === 'EMPTY' ? [] : sql === 'WRITE' ? {affectedRows: 1, insertId: 42} : [{value: parameters[0] ?? 42}];
  return [result, []];
};
export default {createPool(options) {
  state.options = options;
  step('pool');
  return {
    execute: (sql, parameters) => execute('pool', sql, parameters),
    getConnection: async () => {
      step('acquire');
      return {
        execute: (sql, parameters) => execute('connection', sql, parameters),
        beginTransaction: async () => step('begin'),
        commit: async () => step('commit'),
        rollback: async () => step('rollback'),
        ping: async () => step('ping'),
        release: () => step('release'),
        destroy: () => step('destroy')
      };
    },
    end: async () => {step('end'); return 'closed';}
  };
}};
`;

async function fixture(t: { after(fn: () => Promise<unknown>): void }, driver = true) {
  const root = await mkdtemp(join(tmpdir(), 'arya mysql '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const driverRoot = join(root, 'node_modules/mysql2');
  let state: State | undefined;
  if (driver) {
    await mkdir(driverRoot, { recursive: true });
    await writeFile(join(driverRoot, 'package.json'), JSON.stringify({ name: 'mysql2', type: 'module', exports: { './promise': './promise.mjs' } }));
    await writeFile(join(driverRoot, 'promise.mjs'), fakeDriver);
    state = (await import(pathToFileURL(join(driverRoot, 'promise.mjs')).href)).state;
  }
  const filename = join(root, 'main.arya');
  await writeFile(join(root, 'main.mjs'), compile("use std \"mysql\" as mysql\nexport const connect = mysql.connect", filename).code);
  const module = await import(pathToFileURL(join(root, 'main.mjs')).href);
  return { root, state: state!, connect: module.connect as (options?: unknown) => Promise<Database> };
}

const code = (expected: string) => (error: any) => error?.code === expected;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test('MySQL connect verifies the pool, applies bounded defaults, and retains driver options', async t => {
  const { state, connect } = await fixture(t);
  const ssl = { ca: 'certificate' };
  const db = await connect({ host: 'localhost', ssl, connectionLimit: 4 });
  assert.deepEqual(state.events.map(item => item[0]), ['pool', 'acquire', 'release']);
  assert.deepEqual(state.options.ssl, ssl);
  assert.equal(state.options.connectionLimit, 4);
  assert.equal(state.options.queueLimit, 100);
  assert.equal(state.options.connectTimeout, 10000);
  assert.equal(state.options.bigNumberStrings, true);
  assert.equal(state.options.multipleStatements, false);
  assert.equal(await db.ping(), true);
  assert.equal(await db.close(), 'closed');
});

test('MySQL result helpers preserve parameters, nulls, and write metadata', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  const text = "O'Reilly'); DROP TABLE users; --";
  assert.deepEqual(await db.rows('SELECT ? AS value', [text]), [{ value: text }]);
  assert.deepEqual(await db.one('SELECT 42'), { value: 42 });
  assert.equal(await db.scalar('SELECT 42'), 42);
  assert.equal(await db.one('EMPTY'), null);
  assert.equal(await db.scalar('EMPTY'), null);
  assert.deepEqual(await db.execute('WRITE'), { affectedRows: 1, insertId: 42 });
  await assert.rejects(db.rows('WRITE'), code('ARYA_MYSQL_RESULT'));
  assert.equal(state.events.find(item => item[0] === 'execute')![3][0], text);
  await db.close();
});

test('MySQL rejects invalid config and parameters before driver activity', async t => {
  const { state, connect } = await fixture(t);
  for (const options of [null, [], 'mysql://localhost', { host: '' }, { port: 0 }, { port: 65536 }, { connectionLimit: 0 }, { queueLimit: -1 }, { password: 42 }, { connectTimeout: Infinity }, { multipleStatements: true }, { namedPlaceholders: true }]) {
    await assert.rejects(connect(options), code('ARYA_MYSQL_CONFIG'));
  }
  assert.deepEqual(state.events, []);
  const db = await connect();
  for (const [sql, parameters] of [['', []], [42, []], ['SELECT ?', {}], ['SELECT ?', [undefined]], ['SELECT ?', [NaN]], ['SELECT ?', [{}]], ['SELECT ?', [[]]], ['SELECT ?', [new Date(NaN)]], ['SELECT ?', Array(1)]]) {
    await assert.rejects(db.execute(sql, parameters), code('ARYA_MYSQL_ARGUMENTS'));
  }
  assert.ok(!state.events.some(item => item[0] === 'execute'));
  await db.execute('SELECT ?', [null, false, 0, 1n, new Date(), Buffer.from('a')]);
  await db.close();
});

test('MySQL dependency and connection failures have actionable codes and release failed pools', async t => {
  const missing = await fixture(t, false);
  await assert.rejects(missing.connect(), (error: any) => code('ARYA_MYSQL_DRIVER')(error) && /npm install mysql2/.test(error.message));
  const { state, connect } = await fixture(t);
  state.fail = 'acquire';
  await assert.rejects(connect(), (error: any) => code('ARYA_MYSQL_CONNECT')(error) && error.driverCode === 'ER_TEST' && !error.message.includes('secret'));
  assert.equal(state.events.at(-1)![0], 'end');
});

test('MySQL query errors retain driver details without placing SQL or credentials in the message', async t => {
  const { connect } = await fixture(t);
  const db = await connect();
  await assert.rejects(db.rows('FAIL'), (error: any) => code('ARYA_MYSQL_QUERY')(error) && error.driverCode === 'ER_TEST' && error.sqlState === 'HY000' && error.cause.message.includes('secret') && !error.message.includes('secret'));
  await db.close();
});

test('MySQL transactions use one dedicated connection, return values, and invalidate escaped handles', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  let escaped: Session | undefined;
  const result = await db.transaction(async transaction => {
    escaped = transaction;
    await transaction.execute('WRITE');
    return transaction.scalar('SELECT 42');
  });
  assert.equal(result, 42);
  assert.deepEqual(state.events.slice(3).map(item => item[0]), ['acquire', 'begin', 'execute', 'execute', 'commit', 'release']);
  assert.ok(state.events.filter(item => item[0] === 'execute').every(item => item[1] === 'connection'));
  await assert.rejects(escaped!.execute('WRITE'), code('ARYA_MYSQL_TRANSACTION_CLOSED'));
  await db.close();
});

test('MySQL transactions roll back callback failures and preserve the original thrown value', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  for (const original of [new Error('application failure'), null]) {
    try {
      await db.transaction(async transaction => { await transaction.execute('WRITE'); throw original; });
      assert.fail('The transaction must fail');
    } catch (error) { assert.equal(error, original); }
    assert.deepEqual(state.events.slice(-2).map(item => item[0]), ['rollback', 'release']);
  }
  assert.ok(!state.events.some(item => item[0] === 'commit'));
  await db.close();
});

test('MySQL rolls back caught or unawaited query failures and drains outstanding work before cleanup', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  await assert.rejects(db.transaction(async transaction => {
    try { await transaction.execute('FAIL'); } catch { /* A failed statement still aborts this transaction. */ }
  }), code('ARYA_MYSQL_QUERY'));
  await assert.rejects(db.transaction(transaction => { void transaction.execute('FAIL'); }), code('ARYA_MYSQL_QUERY'));
  const active = db.transaction(transaction => { void transaction.execute('WAIT'); return 'complete'; });
  await turn();
  assert.equal(state.events.at(-1)![0], 'execute');
  state.resume!();
  assert.equal(await active, 'complete');
  assert.deepEqual(state.events.slice(-2).map(item => item[0]), ['commit', 'release']);
  await db.close();
});

test('MySQL begin and commit failures roll back; rollback failures discard the connection', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  for (const stage of ['begin', 'commit']) {
    state.fail = stage;
    await assert.rejects(db.transaction(() => 42), code('ARYA_MYSQL_TRANSACTION'));
    assert.deepEqual(state.events.slice(-2).map(item => item[0]), ['rollback', 'release']);
  }
  state.fail = 'rollback';
  const original = new Error('application failure');
  await assert.rejects(db.transaction(() => { throw original; }), error => error === original);
  assert.equal(state.events.at(-1)![0], 'destroy');
  state.fail = null;
  await db.close();
});

test('MySQL prevents pool queries, nested pool transactions, and pool close inside a transaction', async t => {
  const { connect } = await fixture(t);
  const db = await connect();
  await db.transaction(async transaction => {
    await assert.rejects(db.rows('SELECT 42'), code('ARYA_MYSQL_TRANSACTION'));
    await assert.rejects(db.transaction(() => 1), code('ARYA_MYSQL_TRANSACTION'));
    await assert.rejects(db.close(), code('ARYA_MYSQL_TRANSACTION'));
    assert.equal(await transaction.scalar('SELECT 42'), 42);
  });
  await db.close();
});

test('MySQL transaction handles cannot be shared with unrelated concurrent work', async t => {
  const { connect } = await fixture(t);
  const db = await connect();
  let escaped: Session | undefined;
  let announce!: () => void, resume!: () => void;
  const ready = new Promise<void>(resolve => { announce = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  const active = db.transaction(async transaction => {
    escaped = transaction;
    announce();
    await waiting;
    return transaction.scalar('SELECT 42');
  });
  await ready;
  await assert.rejects(escaped!.execute('WRITE'), code('ARYA_MYSQL_TRANSACTION'));
  await db.transaction(async () => {
    await assert.rejects(escaped!.execute('WRITE'), code('ARYA_MYSQL_TRANSACTION'));
  });
  resume();
  assert.equal(await active, 42);
  await db.close();
});

test('MySQL close is idempotent, drains active transactions, and rejects new work', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  const active = db.transaction(transaction => transaction.execute('WAIT'));
  await turn();
  const first = db.close();
  assert.equal(db.close(), first);
  await assert.rejects(db.rows('SELECT 42'), code('ARYA_MYSQL_CLOSED'));
  await assert.rejects(db.ping(), code('ARYA_MYSQL_CLOSED'));
  assert.ok(!state.events.some(item => item[0] === 'end'));
  state.resume!();
  await active;
  assert.equal(await first, 'closed');
  assert.deepEqual(state.events.slice(-3).map(item => item[0]), ['commit', 'release', 'end']);
  assert.equal(state.events.filter(item => item[0] === 'end').length, 1);
});

test('MySQL health-check and close failures are stable and release resources', async t => {
  const { state, connect } = await fixture(t);
  const db = await connect();
  state.fail = 'ping';
  await assert.rejects(db.ping(), code('ARYA_MYSQL_CONNECT'));
  assert.equal(state.events.at(-1)![0], 'release');
  state.fail = 'end';
  await assert.rejects(db.close(), code('ARYA_MYSQL_CLOSE'));
  await assert.rejects(db.close(), code('ARYA_MYSQL_CLOSE'));
  assert.equal(state.events.filter(item => item[0] === 'end').length, 1);
});
