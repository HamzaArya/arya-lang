import test from 'node:test';
import assert from 'node:assert/strict';
import { standardCompletions } from '../src/language-service.js';

function complete(source: string, target: 'js' = 'js') {
  const offset = source.indexOf('|');
  return standardCompletions(source.replace('|', ''), offset, target);
}

test('standard completion works after a dot, with aliases and partial member names', () => {
  const source = 'use std "mysql" as database\ndatabase.co|';
  assert.deepEqual(complete(source).map(item => item.label), ['connect']);
  assert.match(complete(source)[0]!.detail, /managed pool/);
  assert.deepEqual(complete('use std "env" as settings\nsettings.|').map(item => item.label), ['get', 'require', 'int', 'bool']);
  assert.ok(complete('use std "web" as web\nweb.|').some(item => item.label === 'serve'));
});

test('MySQL pool and transaction completions follow lexical bindings', () => {
  const source = 'use std "mysql" as mysql\nkeep db = await mysql.connect({})\n';
  assert.deepEqual(complete(source + 'db.|').map(item => item.label), ['rows', 'one', 'scalar', 'execute', 'transaction', 'ping', 'close']);
  assert.deepEqual(complete(source + 'await db.transaction(async fn(tx) {\n  tx.|\n})').map(item => item.label), ['rows', 'one', 'scalar', 'execute']);
  assert.deepEqual(complete(source + 'fn work(db) { db.| }'), []);
  assert.deepEqual(complete(source + 'fn work() { keep copy = db\ncopy.| }').map(item => item.label), ['rows', 'one', 'scalar', 'execute', 'transaction', 'ping', 'close']);
  assert.deepEqual(complete('use std "mysql" as mysql\nlet db = await mysql.connect({})\ndb.|'), [], 'mutable values are not inferred');
});

test('standard completion excludes comments, strings, unknown objects', () => {
  const prefix = 'use std "mysql" as mysql\n';
  for (const source of [prefix + '# mysql.|', prefix + '// mysql.|', prefix + 'say("mysql.|")', prefix + 'say("""mysql.|""")', prefix + 'keep other = {}\nother.|', prefix + 'keep object = {mysql: {}}\nobject.mysql.|']) assert.deepEqual(complete(source), [], source);
  assert.deepEqual(complete(prefix + 'mysql|'), []);
});

test('validation, operational web helpers, and logger instances have documented completions', () => {
  assert.ok(complete('use std "validate" as rules\nrules.|').some(item => item.label === 'object'));
  const web = complete('use std "web" as web\nweb.|').map(item => item.label);
  for (const label of ['route', 'error', 'health', 'shutdown']) assert.ok(web.includes(label));
  const prefix = 'use std "log" as log\nkeep logger = log.create({name: "api"})\n';
  assert.ok(complete(prefix + 'logger.|').some(item => item.label === 'info'));
  assert.ok(complete(prefix + 'keep child = logger.child({requestId: "42"})\nchild.|').some(item => item.label === 'error'));
  assert.deepEqual(complete(prefix + 'fn work(logger) { logger.| }'), []);
});

test('async Python completion documents namespace and managed client methods', () => {
  const source = 'use std "python" as python\n';
  assert.deepEqual(complete(source + 'python.|').map(item => item.label), ['call', 'map', 'bind', 'info', 'close', 'stats', 'client']);
  const labels = complete(source + 'keep py = python.client({maxConcurrency: 2})\npy.|').map(item => item.label);
  assert.deepEqual(labels, ['call', 'map', 'bind', 'info', 'close', 'stats']);
  assert.deepEqual(complete(source + 'fn example(python) { python.| }'), []);
});

test('debug helpers and optional member completion remain available without executing code', () => {
  assert.deepEqual(complete('use std "debug" as debug\ndebug?.|').map(item => item.label), ['assert', 'inspect', 'trace']);
});
