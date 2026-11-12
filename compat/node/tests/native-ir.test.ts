import test from 'node:test';
import assert from 'node:assert/strict';
import { lowerNative } from '../src/native-lower.js';
import { NativeIRError, serializeNativeIR, verifyNativeIR } from '../src/native-ir.js';
import type { IRExpr, IRProgram, IRStmt } from '../src/native-ir.js';

const location = { start: 0, end: 1, line: 0, column: 0 };
const number = (value = 1): IRExpr => ({ kind: 'literal', type: 'number', value, span: location });
const boolean = (value = true): IRExpr => ({
  kind: 'literal',
  type: 'boolean',
  value,
  span: location,
});
const load = (binding: number): IRExpr => ({
  kind: 'load',
  type: 'number',
  binding,
  span: location,
});
const declaration = (binding: number, mutable = true): IRStmt => ({
  kind: 'declare',
  binding,
  mutable,
  type: 'number',
  value: number(),
  span: location,
});
const program = (body: IRStmt[] = []): IRProgram => ({
  version: 1,
  filename: 'test.arya',
  functions: [],
  body,
});
const invalid = (value: unknown) =>
  assert.throws(() => verifyNativeIR(value as IRProgram), NativeIRError);

test('native IR rejects executable array metadata before invoking custom iterators or getters', () => {
  let invoked = false;
  const source = program();
  Object.defineProperty(source.body, Symbol.iterator, {
    value() {
      invoked = true;
      throw new Error('iterator executed');
    },
  });
  invalid(source);
  assert.equal(invoked, false);
  const accessor = program();
  Object.defineProperty(accessor, 'body', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('getter executed');
    },
  });
  invalid(accessor);
  assert.equal(invoked, false);
  class ExecutableArray extends Array<IRStmt> {
    override [Symbol.iterator](): ArrayIterator<IRStmt> {
      invoked = true;
      return super[Symbol.iterator]();
    }
  }
  invalid(program(new ExecutableArray()));
  assert.equal(invoked, false);
});

test('native IR requires dense bounded arrays and serializable required fields', () => {
  invalid(program(new Array<IRStmt>(1)));
  invalid(program(new Array<IRStmt>(100001)));
  const replacedIndex = program(new Array<IRStmt>(1));
  Object.assign(replacedIndex.body, {
    extra: { kind: 'expression', value: number(), span: location },
  });
  invalid(replacedIndex);
  const invisible = program();
  Object.defineProperty(invisible, 'body', { value: [], enumerable: false });
  invalid(invisible);
  const nullPrototypeArray = program();
  Object.setPrototypeOf(nullPrototypeArray.body, null);
  invalid(nullPrototypeArray);
});

test('native IR cycles and oversized nesting fail with bounded verifier errors', () => {
  const cyclic = program();
  Object.assign(cyclic, { cycle: cyclic });
  invalid(cyclic);
  let expression = number();
  for (let index = 0; index < 150; index++)
    expression = {
      kind: 'unary',
      operator: '+',
      type: 'number',
      value: expression,
      span: location,
    };
  invalid(program([{ kind: 'expression', value: expression, span: location }]));
  invalid({ ...program(), filename: 'x'.repeat(4097) });
  invalid({ ...program(), metadata: 'x'.repeat(4 * 1024 * 1024 + 1) });
  invalid({ ...program(), metadata: Infinity });
});

test('native IR rejects false-like malformed return values instead of treating them as omitted', () => {
  for (const value of [false, 0, '', null]) {
    const source = lowerNative('fn finish(): void { return }\nfinish()');
    Object.assign(source.functions[0]!.body[0]!, { value });
    invalid(source);
  }
  verifyNativeIR(lowerNative('fn finish(): void { return }\nfinish()'));
});

test('native IR blocks lexical leakage, use before declaration and cross-function capture', () => {
  for (const statement of [
    { kind: 'if', condition: boolean(), body: [declaration(1)], otherwise: [], span: location },
    { kind: 'while', condition: boolean(false), body: [declaration(1)], span: location },
  ] as IRStmt[]) {
    invalid(program([statement, { kind: 'print', values: [load(1)], span: location }]));
  }
  invalid(program([{ kind: 'print', values: [load(1)], span: location }, declaration(1)]));
  const captured = program();
  captured.functions = [
    {
      id: 0,
      name: 'first',
      parameters: [{ id: 1, name: 'value', type: 'number', span: location }],
      returnType: 'number',
      body: [{ kind: 'return', value: load(1), span: location }],
      span: location,
    },
    {
      id: 1,
      name: 'second',
      parameters: [],
      returnType: 'number',
      body: [{ kind: 'return', value: load(1), span: location }],
      span: location,
    },
  ];
  invalid(captured);
});

test('native IR checks branch returns without assuming a loop executes', () => {
  const source = program();
  source.functions.push({
    id: 0,
    name: 'value',
    parameters: [],
    returnType: 'number',
    body: [
      {
        kind: 'if',
        condition: boolean(),
        body: [{ kind: 'return', value: number(), span: location }],
        otherwise: [],
        span: location,
      },
    ],
    span: location,
  });
  invalid(source);
  source.functions[0]!.body = [
    {
      kind: 'while',
      condition: boolean(),
      body: [{ kind: 'return', value: number(), span: location }],
      span: location,
    },
  ];
  invalid(source);
  source.functions[0]!.body = [
    {
      kind: 'if',
      condition: boolean(),
      body: [{ kind: 'return', value: number(), span: location }],
      otherwise: [{ kind: 'return', value: number(2), span: location }],
      span: location,
    },
  ];
  verifyNativeIR(source);
  invalid(program([{ kind: 'return', span: location }]));
});

test('native IR independently checks result types, immutable writes and duplicate storage identities', () => {
  const spoofed = number();
  spoofed.type = 'boolean';
  invalid(program([{ kind: 'print', values: [spoofed], span: location }]));
  invalid(
    program([
      declaration(0, false),
      { kind: 'assign', binding: 0, value: number(2), span: location },
    ]),
  );
  invalid(program([declaration(0), declaration(0)]));
  invalid(
    program([declaration(0), { kind: 'assign', binding: 0, value: boolean(), span: location }]),
  );
  const source = lowerNative('fn identity(value: number): number => value\nprint(identity(1))');
  const print = source.body[0]!;
  assert.equal(print.kind, 'print');
  if (print.kind !== 'print') throw new Error('Expected print fixture.');
  const call = print.values[0]!;
  assert.equal(call.kind, 'call');
  if (call.kind !== 'call') throw new Error('Expected call fixture.');
  call.arguments[0] = boolean();
  invalid(source);
});

test('native IR serialization is deterministic and distinguishes negative-zero data', () => {
  const negative = program([{ kind: 'print', values: [number(-0)], span: location }]);
  const positive = program([{ kind: 'print', values: [number(0)], span: location }]);
  assert.notEqual(serializeNativeIR(negative), serializeNativeIR(positive));
  const original = lowerNative('const amount = 2\nprint(amount + 3)');
  const reversed = Object.fromEntries(Object.entries(original).reverse()) as unknown as IRProgram;
  assert.equal(serializeNativeIR(original), serializeNativeIR(reversed));
});
