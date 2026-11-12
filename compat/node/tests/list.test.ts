import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../src/compiler.js';
import {standardCompletions} from '../src/language-service.js';

async function tools(t: {after(fn: () => Promise<unknown>): void}) {
  const root = await mkdtemp(join(tmpdir(), 'arya list '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const path = join(root, 'list.mjs');
  await writeFile(path, compile('use std "list" as list\nexport const tools = list').code);
  return (await import(pathToFileURL(path).href)).tools;
}

test('list selectors compose transformations, preserve input, and keep stable sort order', async t => {
  const list = await tools(t);
  const rows = Object.freeze([{name: 'A', active: true, score: 2}, {name: 'B', active: false, score: 1}, {name: 'C', active: true, score: 2}]);
  assert.deepEqual(list.map(list.filter(rows, 'active'), 'name'), ['A', 'C']);
  assert.deepEqual(list.map(list.sortBy(rows, 'score'), 'name'), ['B', 'A', 'C']);
  assert.deepEqual(list.map(list.sortBy(rows, 'score', 'desc'), 'name'), ['A', 'C', 'B']);
  assert.deepEqual(rows.map(row => row.name), ['A', 'B', 'C']);
  assert.deepEqual(list.take(rows, 1), [rows[0]]);
  assert.equal(list.find(rows, (row: {name: string}) => row.name === 'B'), rows[1]);
  assert.equal(list.find(rows, () => false), null);
  assert.equal(list.find([undefined], () => true), undefined);
  assert.deepEqual(list.flatMap([1, 2], (value: number) => [value, value * 2]), [1, 2, 2, 4]);
  assert.equal(list.reduce([1, 2, 3], (sum: number, value: number) => sum + value, 0), 6);
  assert.equal(list.sum(rows, 'score'), 5);
});

test('grouping handles prototype-looking keys safely and unique preserves first values', async t => {
  const list = await tools(t);
  const rows = [{key: '__proto__', id: 1}, {key: 'constructor', id: 2}, {key: '__proto__', id: 1}];
  const grouped = list.groupBy(rows, 'key');
  assert.equal(Object.getPrototypeOf(grouped), null);
  assert.deepEqual(grouped.__proto__, [rows[0], rows[2]]);
  assert.deepEqual(grouped.constructor, [rows[1]]);
  assert.equal(JSON.parse(JSON.stringify(grouped)).__proto__.length, 2);
  assert.deepEqual(list.unique(rows, 'id'), [rows[0], rows[1]]);
  assert.deepEqual(list.unique([NaN, NaN, 1, 1]), [NaN, 1]);
  assert.equal(list.sum([]), 0);
});

test('list helpers reject invalid input, ambiguous sort keys, and accidental async predicates', async t => {
  const list = await tools(t);
  const code = (value: string) => (error: any) => error.code === value;
  assert.throws(() => list.map({}, 'name'), code('ARYA_LIST_INPUT'));
  assert.throws(() => list.filter([], 42), code('ARYA_LIST_CALLBACK'));
  assert.throws(() => list.reduce([], () => 0), code('ARYA_LIST_CALLBACK'));
  assert.throws(() => list.take([], -1), code('ARYA_LIST_COUNT'));
  assert.throws(() => list.sortBy([1], undefined, 'up'), code('ARYA_LIST_ORDER'));
  assert.throws(() => list.sortBy([1, '2']), code('ARYA_LIST_KEY'));
  assert.throws(() => list.groupBy([1], (value: number) => value), code('ARYA_LIST_KEY'));
  assert.throws(() => list.sum([1, '2']), code('ARYA_LIST_NUMBER'));
  assert.throws(() => list.sum([Number.MAX_VALUE, Number.MAX_VALUE]), code('ARYA_LIST_NUMBER'));
  assert.throws(() => list.flatMap([1], () => 1), code('ARYA_LIST_CALLBACK'));
  for (const method of ['filter', 'find', 'flatMap', 'groupBy', 'unique', 'sum']) assert.throws(() => list[method]([1], async () => true), code('ARYA_LIST_ASYNC'));
  assert.throws(() => list.filter([1], async () => { throw new Error('rejected callback'); }), code('ARYA_LIST_ASYNC'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(await Promise.all(list.map([1, 2], async (value: number) => value * 2)), [2, 4]);
  const prefix = 'use std "list" as list\nlist.';
  assert.deepEqual(standardCompletions(prefix, prefix.length).map(item => item.label).sort(), Object.keys(list).sort());
});

test('list pipelines run as ordinary emitted Arya programs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya list flow '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const path = join(root, 'report.mjs');
  const source = `use std "list" as list
const rows = [{name: "A", active: true, score: 2}, {name: "B", active: false, score: 1}, {name: "C", active: true, score: 5}]
export const names = rows
  |> list.filter("active")
  |> list.sortBy("score", "desc")
  |> list.map("name")
export const total = rows |> list.sum("score")
export const doubled = [1, 2] |> list.map(async fn(value) => value * 2) |> await Promise.all
`;
  await writeFile(path, compile(source).code);
  const result = await import(pathToFileURL(path).href);
  assert.deepEqual(result.names, ['C', 'A']);
  assert.equal(result.total, 8);
  assert.deepEqual(result.doubled, [2, 4]);
});
