/** Versioned, structured typed IR for the opt-in native scalar preview. */
export interface IRSpan {
  start: number;
  end: number;
  line: number;
  column: number;
}
export type IRScalarType = 'number' | 'boolean';
export type IRType = IRScalarType | 'string' | 'void';
export type IRExpr = { type: IRType; span: IRSpan } & (
  | { kind: 'literal'; value: number | boolean | string }
  | { kind: 'load'; binding: number }
  | { kind: 'unary'; operator: string; value: IRExpr }
  | { kind: 'binary'; operator: string; left: IRExpr; right: IRExpr }
  | { kind: 'call'; function: number; arguments: IRExpr[] }
);
export type IRStmt = { span: IRSpan } & (
  | { kind: 'declare'; binding: number; type: IRScalarType; mutable: boolean; value: IRExpr }
  | { kind: 'assign'; binding: number; value: IRExpr }
  | { kind: 'expression'; value: IRExpr }
  | { kind: 'print'; values: IRExpr[] }
  | { kind: 'if'; condition: IRExpr; body: IRStmt[]; otherwise: IRStmt[] }
  | { kind: 'while'; condition: IRExpr; body: IRStmt[] }
  | { kind: 'return'; value?: IRExpr }
);
export interface IRFunction {
  id: number;
  name: string;
  span: IRSpan;
  parameters: { id: number; name: string; type: IRScalarType; span: IRSpan }[];
  returnType: IRScalarType | 'void';
  body: IRStmt[];
}
export interface IRProgram {
  version: 1;
  filename: string;
  functions: IRFunction[];
  body: IRStmt[];
}

export class NativeIRError extends Error {
  readonly code = 'ARYA_NATIVE_IR';
  constructor(message: string) {
    super(message);
    this.name = 'NativeIRError';
  }
}
function fail(message: string): never {
  throw new NativeIRError(message);
}
const scalar = (value: unknown): value is IRScalarType => value === 'number' || value === 'boolean';
const id = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
interface Binding {
  type: IRScalarType;
  mutable: boolean;
}

/** Reject malformed types, references, scopes, effects and control flow before any backend executes. */
export function verifyNativeIR(program: IRProgram): void {
  let nodes = 0;
  let dataNodes = 0;
  let textUnits = 0;
  function text(length: number): void {
    textUnits += length;
    if (textUnits > 4 * 1024 * 1024) fail('Native IR exceeds text limits.');
  }
  const active = new Set<object>();
  function data(value: unknown, depth: number): void {
    if (++dataNodes > 200000 || depth > 256) fail('Native IR exceeds data limits.');
    if (typeof value === 'string') {
      text(value.length);
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('Native IR numeric data must be finite.');
      return;
    }
    if (value === undefined || typeof value === 'boolean') return;
    if (!value || typeof value !== 'object' || active.has(value))
      fail('Native IR must be acyclic plain data.');
    const array = Array.isArray(value);
    if (
      array
        ? Object.getPrototypeOf(value) !== Array.prototype
        : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      fail('Native IR must use plain objects and ordinary arrays.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string'))
      fail('Native IR symbol fields are not permitted.');
    if (array) {
      if (value.length > 100000 || keys.length !== value.length + 1)
        fail('Native IR arrays must be bounded and dense.');
      for (let index = 0; index < value.length; index++)
        if (!Object.hasOwn(descriptors, String(index))) fail('Native IR arrays must be dense.');
    }
    active.add(value);
    for (const key of keys) {
      text((key as string).length);
      const descriptor = descriptors[key as keyof typeof descriptors]!;
      if (!('value' in descriptor)) fail('Native IR accessors are not permitted.');
      if (!descriptor.enumerable && !(array && key === 'length'))
        fail('Native IR fields must be enumerable for serialization.');
      data(descriptor.value, depth + 1);
    }
    active.delete(value);
  }
  data(program, 0);
  function visit(value: unknown, depth: number): void {
    if (++nodes > 100000 || depth > 128) fail('Native IR exceeds structural limits.');
    if (!object(value) || !object(value.span)) fail('Native IR node requires a source span.');
    const s = value.span as unknown as IRSpan;
    for (const n of [s.start, s.end, s.line, s.column])
      if (!Number.isSafeInteger(n) || n < 0) fail('Invalid native IR source span.');
    if (s.end < s.start) fail('Reversed native IR source span.');
  }
  if (
    !object(program) ||
    program.version !== 1 ||
    typeof program.filename !== 'string' ||
    program.filename.length > 4096 ||
    !Array.isArray(program.functions) ||
    !Array.isArray(program.body) ||
    program.functions.length > 1000
  )
    fail('Invalid native IR program/version.');
  const functions = new Map<number, IRFunction>(),
    declared = new Set<number>();
  for (const fn of program.functions) {
    visit(fn, 0);
    if (
      !id(fn.id) ||
      functions.has(fn.id) ||
      typeof fn.name !== 'string' ||
      !Array.isArray(fn.parameters) ||
      fn.parameters.length > 64 ||
      !(scalar(fn.returnType) || fn.returnType === 'void')
    )
      fail('Invalid native function signature.');
    functions.set(fn.id, fn);
    for (const p of fn.parameters) {
      visit(p, 1);
      if (!id(p.id) || typeof p.name !== 'string' || !scalar(p.type))
        fail('Invalid native parameter.');
    }
  }
  function expr(e: IRExpr, scope: Map<number, Binding>, depth: number): IRType {
    visit(e, depth);
    let type: IRType;
    switch (e.kind) {
      case 'literal':
        if (!['number', 'boolean', 'string'].includes(typeof e.value))
          fail('Invalid native literal.');
        if (typeof e.value === 'number' && !Number.isFinite(e.value))
          fail('Nonfinite native literals are not serializable.');
        type = typeof e.value as IRType;
        break;
      case 'load': {
        const binding = scope.get(e.binding);
        if (!binding || !id(e.binding)) fail('Native load refers to an unavailable binding.');
        type = binding.type;
        break;
      }
      case 'unary': {
        const input = expr(e.value, scope, depth + 1);
        if (['+', '-'].includes(e.operator) && input === 'number') type = 'number';
        else if (['not', '!'].includes(e.operator) && input === 'boolean') type = 'boolean';
        else return fail('Invalid native unary operator/type.');
        break;
      }
      case 'binary': {
        const left = expr(e.left, scope, depth + 1),
          right = expr(e.right, scope, depth + 1);
        if (left !== right) fail('Native binary operands have different types.');
        if (left === 'number' && ['+', '-', '*', '/', '%'].includes(e.operator)) type = 'number';
        else if (left === 'number' && ['<', '<=', '>', '>=', '==', '!='].includes(e.operator))
          type = 'boolean';
        else if (left === 'boolean' && ['and', 'or', '==', '!='].includes(e.operator))
          type = 'boolean';
        else return fail('Invalid native binary operator/type.');
        break;
      }
      case 'call': {
        const fn = functions.get(e.function);
        if (
          !fn ||
          !id(e.function) ||
          !Array.isArray(e.arguments) ||
          e.arguments.length !== fn.parameters.length
        )
          fail('Invalid native call target/arity.');
        for (const [i, argument] of e.arguments.entries())
          if (expr(argument, scope, depth + 1) !== fn.parameters[i]!.type)
            fail('Native call argument type mismatch.');
        type = fn.returnType;
        break;
      }
      default:
        return fail('Unknown native expression.');
    }
    if (e.type !== type) fail('Native expression result type mismatch.');
    return type;
  }
  function bind(
    scope: Map<number, Binding>,
    key: number,
    type: IRScalarType,
    mutable: boolean,
  ): void {
    if (!id(key) || declared.has(key) || !scalar(type) || typeof mutable !== 'boolean')
      fail('Invalid/duplicate native binding.');
    declared.add(key);
    scope.set(key, { type, mutable });
  }
  function block(
    body: IRStmt[],
    inherited: Map<number, Binding>,
    result: IRScalarType | 'void' | null,
    depth: number,
  ): boolean {
    if (!Array.isArray(body) || body.length > 100000) fail('Invalid native statement block.');
    const scope = new Map(inherited);
    let returns = false;
    for (const s of body) {
      visit(s, depth);
      switch (s.kind) {
        case 'declare':
          if (!scalar(s.type) || expr(s.value, scope, depth + 1) !== s.type)
            fail('Native declaration type mismatch.');
          bind(scope, s.binding, s.type, s.mutable);
          break;
        case 'assign': {
          const binding = scope.get(s.binding);
          if (!binding?.mutable || !id(s.binding))
            fail('Native assignment requires an available mutable binding.');
          if (expr(s.value, scope, depth + 1) !== binding.type)
            fail('Native assignment type mismatch.');
          break;
        }
        case 'expression':
          if (expr(s.value, scope, depth + 1) === 'string')
            fail('String expressions are only supported by print.');
          break;
        case 'print':
          if (!Array.isArray(s.values) || s.values.length > 64)
            fail('Invalid native print arguments.');
          for (const value of s.values) {
            const type = expr(value, scope, depth + 1);
            if (type === 'void' || (type === 'string' && value.kind !== 'literal'))
              fail('Unsupported native print value.');
          }
          if (
            s.values.length > 1 &&
            s.values[0]!.kind === 'literal' &&
            typeof s.values[0]!.value === 'string' &&
            s.values[0]!.value.includes('%')
          )
            fail('Native preview does not support formatted print arguments.');
          break;
        case 'if': {
          if (expr(s.condition, scope, depth + 1) !== 'boolean')
            fail('Native conditions must be boolean.');
          const a = block(s.body, scope, result, depth + 1),
            b = block(s.otherwise, scope, result, depth + 1);
          returns ||= a && b;
          break;
        }
        case 'while':
          if (expr(s.condition, scope, depth + 1) !== 'boolean')
            fail('Native conditions must be boolean.');
          block(s.body, scope, result, depth + 1);
          break;
        case 'return':
          if (result === null) fail('Native entry body cannot return.');
          if ((s.value === undefined ? 'void' : expr(s.value, scope, depth + 1)) !== result)
            fail('Native return type mismatch.');
          returns = true;
          break;
        default:
          fail('Unknown native statement.');
      }
    }
    return returns;
  }
  for (const fn of program.functions) {
    const scope = new Map<number, Binding>();
    for (const p of fn.parameters) bind(scope, p.id, p.type, true);
    if (!block(fn.body, scope, fn.returnType, 0) && fn.returnType !== 'void')
      fail('Native value functions must return on all paths.');
  }
  block(program.body, new Map(), null, 0);
}

/** Stable JSON text, including a distinct representation for negative-zero literals. */
export function serializeNativeIR(program: IRProgram): string {
  verifyNativeIR(program);
  function canonical(value: unknown): unknown {
    if (typeof value === 'number' && Object.is(value, -0)) return { $number: '-0' };
    if (Array.isArray(value)) return value.map(canonical);
    if (object(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    return value;
  }
  return JSON.stringify(canonical(program), null, 2) + '\n';
}
