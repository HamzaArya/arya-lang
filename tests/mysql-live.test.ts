import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../src/compiler.js';

test('live MySQL prepares values, preserves large numbers, commits, rolls back, and closes', {
  skip: !process.env.ARYA_MYSQL_TEST_CONFIG && 'Set ARYA_MYSQL_TEST_CONFIG to a disposable MySQL connection options JSON object.',
}, async t => {
  const config = JSON.parse(process.env.ARYA_MYSQL_TEST_CONFIG!);
  const parent = resolve('fixtures/examples/mysql/.arya');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'live-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'main.mjs');
  const source = `use std "mysql" as mysql
export const connect = mysql.connect
`;
  await writeFile(output, compile(source, join(root, 'main.arya')).code);
  const { connect } = await import(pathToFileURL(output).href);
  const db = await connect({ ...config, connectionLimit: 1 });
  t.after(() => db.close());
  assert.equal(await db.ping(), true);
  await db.execute('CREATE TEMPORARY TABLE arya_live (id BIGINT PRIMARY KEY, title VARCHAR(200)) ENGINE=InnoDB');
  const title = "O'Reilly'); DROP TABLE arya_live; --";
  await db.execute('INSERT INTO arya_live (id, title) VALUES (?, ?)', ['9007199254740993', title]);
  assert.deepEqual(await db.one('SELECT id, title FROM arya_live'), { id: '9007199254740993', title });
  assert.equal(await db.one('SELECT * FROM arya_live WHERE id = ?', [1]), null);
  assert.equal(await db.scalar('SELECT CAST(12.34 AS DECIMAL(10,2)) AS amount'), '12.34');
  await db.transaction(async (tx: any) => {
    await tx.execute('INSERT INTO arya_live VALUES (?, ?)', [2, 'committed']);
    assert.equal(await tx.scalar('SELECT COUNT(*) FROM arya_live'), '2');
  });
  const original = new Error('roll back');
  await assert.rejects(db.transaction(async (tx: any) => {
    await tx.execute('INSERT INTO arya_live VALUES (?, ?)', [3, 'rolled back']);
    throw original;
  }), error => error === original);
  await assert.rejects(db.transaction(async (tx: any) => {
    await tx.execute('INSERT INTO arya_live VALUES (?, ?)', [4, 'also rolled back']);
    await tx.execute('INSERT INTO arya_live VALUES (?, ?)', [2, 'duplicate']);
  }), (error: any) => error.code === 'ARYA_MYSQL_QUERY' && error.driverCode === 'ER_DUP_ENTRY');
  assert.equal(await db.scalar('SELECT COUNT(*) FROM arya_live'), '2');
  assert.equal(await db.ping(), true, 'a failed transaction must leave the pool usable');
  await db.close();
  await assert.rejects(db.execute('SELECT 1'), (error: any) => error.code === 'ARYA_MYSQL_CLOSED');
});

test('the documented MySQL API example compiles without connecting or installing the driver', async () => {
  const filename = resolve('fixtures/examples/mysql/main.arya');
  assert.doesNotThrow(() => compile('', filename));
  compile(await readFile(filename, 'utf8'), filename);
});
