import test from 'node:test';
import assert from 'node:assert/strict';
import { validationRuntime } from '../src/std/validate.js';
import { compile } from '../src/compiler.js';
import { analyze } from '../src/language-service.js';

const validate = new Function(validationRuntime + '\nreturn __arya_validate;')();
const code = (expected: string) => (error: any) => error.code === expected;

test('schemas validate and normalize nested input with defaults, arrays, enums, and nullable fields', () => {
  const schema = validate.object({
    title: validate.string({ trim: true, min: 1, max: 50 }),
    count: validate.integer({ min: 0, max: 10 }),
    active: validate.optional(validate.boolean(), false),
    tags: validate.array(validate.enum(['work', 'personal']), { max: 3 }),
    note: validate.nullable(validate.string()),
    extra: validate.optional(validate.string()),
  });
  assert.deepEqual(validate.parse(schema, { title: ' Task ', count: 0, tags: ['work'], note: null }), {
    title: 'Task', count: 0, active: false, tags: ['work'], note: null,
  });
  assert.ok(Object.isFrozen(schema));
  assert.deepEqual(validate.check(validate.boolean(), true), { ok: true, value: true });
});

test('validation reports bounded field paths and never includes rejected values', () => {
  const schema = validate.object({ items: validate.array(validate.object({ title: validate.string({ min: 1 }) })) });
  const result = validate.check(schema, { items: [{ title: 123 }], unexpected: 'private-value' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue: any) => issue.path), [['unexpected'], ['items', 0, 'title']]);
  assert.ok(!JSON.stringify(result).includes('private-value'));
  assert.throws(() => validate.parse(schema, {}), (error: any) => code('ARYA_VALIDATION')(error) && error.aryaHttpStatus === 400 && error.issues[0].path[0] === 'items');
  const many = validate.check(validate.array(validate.integer()), Array(1000).fill('bad'));
  assert.equal(many.issues.length, 32);
  let nested = validate.string();
  for (let index = 0; index < 100; index++) nested = validate.optional(nested);
  assert.equal(validate.check(nested, 'value').issues[0].code, 'depth');
});

test('validation coercion is explicit and rejects numeric surprises', () => {
  const integer = validate.integer({ coerce: true, min: 1 });
  assert.equal(validate.parse(integer, '42'), 42);
  for (const value of ['', ' ', '12px', '0x10', 'Infinity', '1.5', '9007199254740993', true, null]) assert.equal(validate.check(integer, value).ok, false, String(value));
  assert.equal(validate.check(validate.number(), '42').ok, false);
  assert.equal(validate.check(validate.number(), NaN).ok, false);
  assert.equal(validate.parse(validate.boolean({ coerce: true }), 'false'), false);
  assert.equal(validate.check(validate.boolean({ coerce: true }), 'yes').ok, false);
  assert.equal(validate.check(validate.string({ min: 1, trim: true }), '  ').ok, false);
});

test('validation copies default data and strips unknown fields only when explicitly configured', () => {
  const original = { tags: ['work'] };
  const inner = validate.object({ tags: validate.array(validate.string()) });
  const optional = validate.optional(inner, original);
  original.tags.push('changed');
  const first = validate.parse(optional, undefined);
  first.tags.push('also changed');
  assert.deepEqual(validate.parse(optional, undefined), { tags: ['work'] });
  assert.deepEqual(validate.parse(validate.object({ title: validate.string() }, { strict: false }), { title: 'ok', unknown: 'discard' }), { title: 'ok' });
});

test('validation handles special property names safely and does not invoke field accessors', () => {
  const fields = { ['__proto__']: validate.string(), constructor: validate.string() };
  const result = validate.parse(validate.object(fields), JSON.parse('{"__proto__":"safe","constructor":"data"}'));
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__')!.value, 'safe');
  let accessed = false;
  const input = { get title() { accessed = true; return 'value'; } };
  assert.equal(validate.check(validate.object({ title: validate.string() }), input).ok, false);
  assert.equal(accessed, false);
});

test('bad schema configuration fails immediately, while compiler/editor checking stays passive', () => {
  for (const action of [
    () => validate.string({ min: -1 }), () => validate.string({ min: 5, max: 2 }),
    () => validate.string({ typo: true }), () => validate.number({ min: Infinity }),
    () => validate.boolean({ coerce: 1 }), () => validate.integer(null),
    () => validate.array(validate.string(), { max: 10001 }), () => validate.enum([]),
    () => validate.object({ field: {} }), () => validate.parse({}, 1),
    () => validate.optional(validate.integer(), 'invalid'),
  ]) assert.throws(action, code('ARYA_VALIDATION_SCHEMA'));
  const source = 'use std "validate" as validate\nkeep body = validate.parse(validate.integer(), "invalid")';
  assert.doesNotThrow(() => compile(source));
  assert.deepEqual(analyze(source, 'file:///main.arya').diagnostics, []);
  assert.ok(analyze(source, 'file:///main.arya', { target: 'native' }).diagnostics.length);
});
