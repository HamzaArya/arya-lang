import test from 'node:test';
import assert from 'node:assert/strict';
import { loggingRuntime } from '../src/std/log.js';
import { compile } from '../src/compiler.js';

const log = new Function(loggingRuntime + '\nreturn __arya_log;')();

test('structured logs filter levels, retain child fields, and protect record metadata', () => {
  const lines: string[] = [];
  const logger = log.create({ name: 'orders', level: 'info', sink: (line: string) => lines.push(line) });
  logger.debug('hidden');
  logger.child({ requestId: 'r-1', service: 'orders' }).info('created', { id: 42, level: 'fatal', name: 'spoof', message: 'spoof', timestamp: 'spoof' });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.split('\n').length, 2);
  const record = JSON.parse(lines[0]!);
  assert.equal(record.name, 'orders');
  assert.equal(record.level, 'info');
  assert.equal(record.message, 'created');
  assert.equal(record.requestId, 'r-1');
  assert.equal(record.id, 42);
  assert.ok(Number.isFinite(Date.parse(record.timestamp)));
  assert.ok(Object.isFrozen(logger));
  log.create({ level: 'silent', sink: () => assert.fail('Silent logger wrote a record') }).fatal('hidden');
});

test('logs redact nested credentials and custom names without modifying application data', () => {
  const lines: string[] = [];
  const logger = log.create({ redact: ['customerEmail'], sink: (line: string) => lines.push(line) });
  const input = { password: 'private-password', nested: { Authorization: 'Bearer private', api_key: 'private-key' }, customers: [{ customerEmail: 'private@email.test' }] };
  logger.info('request', input);
  assert.equal(input.password, 'private-password');
  assert.ok(!lines[0]!.includes('private'));
  assert.equal(JSON.parse(lines[0]!).customers[0].customerEmail, '[Redacted]');
});

test('log serialization bounds cyclic data and does not run accessors, toJSON, or expose error causes', () => {
  const lines: string[] = [];
  const logger = log.create({ sink: (line: string) => lines.push(line) });
  let accessed = false;
  const value: any = { bigint: 9007199254740993n, toJSON() { throw new Error('Must not run'); }, get data() { accessed = true; throw new Error('Must not run'); } };
  value.self = value;
  const error = Object.assign(new Error('Query failed', { cause: new Error('secret driver details') }), { code: 'ARYA_MYSQL_QUERY' });
  logger.error('failure', { value, error, large: 'x'.repeat(20000) });
  const record = JSON.parse(lines[0]!);
  assert.equal(record.value.bigint, '9007199254740993');
  assert.equal(record.value.self, '[Circular]');
  assert.equal(record.value.data, '[Accessor]');
  assert.equal(accessed, false);
  assert.equal(record.error.code, 'ARYA_MYSQL_QUERY');
  assert.ok(!lines[0]!.includes('secret driver details'));
  assert.ok(record.large.length < 9000);
});

test('logger config errors are explicit and importing the library during checking does not write output', () => {
  for (const options of [null, [], { name: '' }, { level: 'verbose' }, { sink: true }, { redact: 'password' }, { levle: 'debug' }]) assert.throws(() => log.create(options), (error: any) => error.code === 'ARYA_LOG_CONFIG');
  const logger = log.create({ sink() {} });
  assert.throws(() => logger.info({}), (error: any) => error.code === 'ARYA_LOG_CONFIG');
  assert.throws(() => logger.info('text', []), (error: any) => error.code === 'ARYA_LOG_CONFIG');
  assert.doesNotThrow(() => compile("use std \"log\" as log\nconst logger = log.create()\nlogger.info(\"not executed\")"));
});
