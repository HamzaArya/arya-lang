import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { envRuntime } from '../src/std/env.js';
import { compile } from '../src/compiler.js';
import { analyze } from '../src/language-service.js';

const environment = (values: Record<string, string> = {}) => runInNewContext(envRuntime + '\n__arya_env;', { process: { env: values } });

test('environment helpers preserve empty values and validate required configuration without revealing values', () => {
  const env = environment({ SECRET: 'private-value', EMPTY: '', BLANK: '  ' });
  assert.equal(env.get('MISSING'), null);
  assert.equal(env.get('constructor', 'fallback'), 'fallback');
  assert.equal(env.get('MISSING', 'fallback'), 'fallback');
  assert.equal(env.get('EMPTY', 'fallback'), '');
  assert.equal(env.require('SECRET'), 'private-value');
  for (const name of ['MISSING', 'EMPTY', 'BLANK']) assert.throws(() => env.require(name), (error: any) => error.code === 'ARYA_ENV_REQUIRED' && error.message.includes(name) && !error.message.includes('private-value'));
  for (const name of ['', 'BAD-NAME', 'A=B', 42]) assert.throws(() => env.get(name), (error: any) => error.code === 'ARYA_ENV_NAME');
});

test('environment integers and booleans are strict, retain zero/false, and validate defaults', () => {
  const env = environment({ PORT: '3000', ZERO: '0', ENABLED: 'TRUE', DISABLED: 'false', BAD: 'secret-value', FRACTION: '1.2', LARGE: '9007199254740992', BLANK: '' });
  assert.equal(env.int('PORT'), 3000);
  assert.equal(env.int('ZERO', 100), 0);
  assert.equal(env.int('MISSING', 8080), 8080);
  assert.equal(env.bool('ENABLED'), true);
  assert.equal(env.bool('DISABLED', true), false);
  assert.equal(env.bool('ZERO'), false);
  assert.equal(env.bool('MISSING', false), false);
  for (const name of ['MISSING', 'BAD', 'FRACTION', 'LARGE', 'BLANK']) assert.throws(() => env.int(name), (error: any) => error.code === 'ARYA_ENV_VALUE' && !error.message.includes('secret-value'));
  assert.throws(() => env.bool('BAD'), (error: any) => error.code === 'ARYA_ENV_VALUE');
  assert.throws(() => env.int('MISSING', true));
  assert.throws(() => env.bool('MISSING', 2));
});

test('environment imports remain passive', () => {
  const source = 'use std "env" as env\nkeep secret = env.require("ARYA_MISSING_CHECK_ONLY")';
  assert.doesNotThrow(() => compile(source));
  assert.deepEqual(analyze(source, 'file:///main.arya').diagnostics, []);
  assert.doesNotThrow(() => compile(source + '\nuse python "math" as math\nsay(math.sqrt(4))'));
});
