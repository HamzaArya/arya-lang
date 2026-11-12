import { AryaError, parseSource } from './compiler.js';
import type { LexicalBinding, ParsedSource, Token } from './compiler.js';
import type { Block, Expression, Statement } from './ast.js';
import type { Type } from './types.js';
import type { IRExpr, IRFunction, IRProgram, IRScalarType, IRSpan, IRStmt } from './native-ir.js';

/** A valid Arya construct outside this deliberately bounded native preview. */
export class NativeCompileError extends Error {
  readonly code = 'ARYA_NATIVE_UNSUPPORTED';
  constructor(
    message: string,
    readonly token: Token,
  ) {
    super(message);
    this.name = 'NativeCompileError';
  }
}

interface Local {
  id: number;
  type: IRScalarType;
  mutable: boolean;
}
interface Context {
  locals: Map<LexicalBinding, Local>;
  returnType?: IRScalarType | 'void';
}
interface FunctionPlan {
  node: Statement & { kind: 'function' };
  ir: IRFunction;
  context: Context;
}
const span = (token: Token): IRSpan => ({
  start: token.start,
  end: token.end,
  line: token.line,
  column: token.column,
});
function unsupported(message: string, token: Token): never {
  throw new NativeCompileError(message, token);
}
function scalar(annotation: Type | undefined, token: Token, label: string): IRScalarType {
  if (annotation?.kind === 'number' || annotation?.kind === 'boolean') return annotation.kind;
  return unsupported(
    `${label} requires an explicit number or boolean type in the native preview.`,
    token,
  );
}
function scalarValue(value: IRExpr, token: Token): IRScalarType {
  if (value.type === 'number' || value.type === 'boolean') return value.type;
  return unsupported(
    'Only number and boolean values can be stored in native preview bindings.',
    token,
  );
}

class Lowerer {
  private nextBinding = 0;
  private readonly functions = new Map<LexicalBinding, FunctionPlan>();
  private readonly parameters = new Map<number, LexicalBinding>();

  constructor(private readonly parsed: ParsedSource) {
    for (const binding of parsed.bindings)
      if (binding.kind === 'parameter' && binding.token)
        this.parameters.set(binding.token.start, binding);
  }

  program(filename: string): IRProgram {
    // Function declarations are hoisted in the JS backend. Register signatures
    // before lowering any body so forward calls and recursion keep that behavior.
    for (const node of this.parsed.ast.statements) {
      if (node.kind !== 'function') continue;
      if (node.exported)
        unsupported('Native preview executables do not expose module exports.', node.token);
      const value = node.value;
      if (value.async || value.rest || value.defaults.length || value.optionalParameters?.length)
        unsupported(
          'Native preview functions cannot be async or use default/rest parameters.',
          node.token,
        );
      const returnType =
        value.returnType?.kind === 'void'
          ? 'void'
          : scalar(value.returnType, node.binding.token ?? node.token, 'Function return');
      const context: Context = { locals: new Map(), returnType };
      const parameters = value.parameters.map((token) => {
        const binding = this.parameters.get(token.start);
        if (!binding) unsupported('Cannot resolve this function parameter.', token);
        const type = scalar(binding.annotation, token, 'Function parameter');
        const id = this.nextBinding++;
        context.locals.set(binding, { id, type, mutable: true });
        return { id, name: token.text, type, span: span(token) };
      });
      const ir: IRFunction = {
        id: this.functions.size,
        name: node.binding.name,
        parameters,
        returnType,
        body: [],
        span: span(node.token),
      };
      this.functions.set(node.binding, { node, ir, context });
    }
    for (const plan of this.functions.values())
      plan.ir.body = this.block(plan.node.value.body, plan.context);
    const body: IRStmt[] = [];
    const context: Context = { locals: new Map() };
    for (const node of this.parsed.ast.statements)
      if (node.kind !== 'function') body.push(this.statement(node, context));
    return {
      version: 1,
      filename,
      functions: [...this.functions.values()].map((plan) => plan.ir),
      body,
    };
  }

  private block(block: Block, outer: Context): IRStmt[] {
    const context: Context = { ...outer, locals: new Map(outer.locals) };
    return block.statements.map((node) => this.statement(node, context));
  }

  private local(binding: LexicalBinding | undefined, context: Context, token: Token): Local {
    const found = binding && context.locals.get(binding);
    if (!found)
      unsupported(
        'Native preview names must refer to an initialized local binding; closures, global captures and host values are unsupported.',
        token,
      );
    return found;
  }

  private expression(node: Expression, context: Context): IRExpr {
    const location = span(node.token);
    switch (node.kind) {
      case 'literal': {
        if (typeof node.value !== 'number' && typeof node.value !== 'boolean')
          return unsupported(
            'Strings are supported only as direct print literals; null is unsupported in the native preview.',
            node.token,
          );
        return {
          kind: 'literal',
          type: typeof node.value as IRScalarType,
          value: node.value,
          span: location,
        };
      }
      case 'name': {
        const local = this.local(node.reference.binding, context, node.token);
        return { kind: 'load', binding: local.id, type: local.type, span: location };
      }
      case 'unary': {
        const value = this.expression(node.value, context);
        const numeric = ['+', '-'].includes(node.operator) && value.type === 'number';
        const logical = ['not', '!'].includes(node.operator) && value.type === 'boolean';
        if (!numeric && !logical)
          return unsupported(
            'Native unary operations require +/- on numbers or not/! on booleans.',
            node.token,
          );
        return {
          kind: 'unary',
          operator: node.operator,
          value,
          type: numeric ? 'number' : 'boolean',
          span: location,
        };
      }
      case 'binary':
        return this.binary(
          node.operator,
          this.expression(node.left, context),
          this.expression(node.right, context),
          node.token,
        );
      case 'call': {
        if (node.callee.kind !== 'name')
          return unsupported(
            'Native preview calls must name a top-level function directly.',
            node.token,
          );
        const binding = node.callee.reference.binding;
        const plan = binding && this.functions.get(binding);
        if (!plan)
          return unsupported(
            'Native preview calls must name a declared top-level function; print is supported only as a statement.',
            node.token,
          );
        if (node.arguments.length !== plan.ir.parameters.length)
          return unsupported(
            `Native call '${plan.ir.name}' requires exactly ${plan.ir.parameters.length} arguments.`,
            node.token,
          );
        const args = node.arguments.map((arg) => this.expression(arg, context));
        for (let i = 0; i < args.length; i++)
          if (args[i]!.type !== plan.ir.parameters[i]!.type)
            unsupported(
              `Argument ${i + 1} to '${plan.ir.name}' must be ${plan.ir.parameters[i]!.type}.`,
              node.arguments[i]!.token,
            );
        return {
          kind: 'call',
          function: plan.ir.id,
          arguments: args,
          type: plan.ir.returnType,
          span: location,
        };
      }
      default:
        return unsupported(
          `Expression '${node.kind}' is outside the native preview subset.`,
          node.token,
        );
    }
  }

  private binary(operator: string, left: IRExpr, right: IRExpr, token: Token): IRExpr {
    let type: IRScalarType;
    if (
      left.type === 'number' &&
      right.type === 'number' &&
      ['+', '-', '*', '/', '%'].includes(operator)
    )
      type = 'number';
    else if (
      left.type === 'number' &&
      right.type === 'number' &&
      ['==', '!=', '<', '<=', '>', '>='].includes(operator)
    )
      type = 'boolean';
    else if (
      left.type === 'boolean' &&
      right.type === 'boolean' &&
      ['and', 'or', '==', '!='].includes(operator)
    )
      type = 'boolean';
    else
      return unsupported(
        `Operator '${operator}' on ${left.type}/${right.type} is outside the native preview subset.`,
        token,
      );
    return { kind: 'binary', operator, left, right, type, span: span(token) };
  }

  private condition(node: Expression, context: Context): IRExpr {
    const value = this.expression(node, context);
    if (value.type !== 'boolean')
      unsupported('Native preview conditions require a boolean expression.', node.token);
    return value;
  }

  private statement(node: Statement, context: Context): IRStmt {
    const location = span(node.token);
    switch (node.kind) {
      case 'declaration': {
        if (node.exported)
          unsupported('Native preview executables do not expose module exports.', node.token);
        const value = this.expression(node.value, context);
        const type = scalarValue(value, node.value.token);
        if (
          node.binding.annotation &&
          scalar(node.binding.annotation, node.binding.token ?? node.token, 'Binding') !== type
        )
          unsupported('A native binding initializer must match its declared type.', node.token);
        const binding = this.nextBinding++;
        const mutable = node.binding.kind === 'let';
        context.locals.set(node.binding, { id: binding, type, mutable });
        return { kind: 'declare', binding, type, mutable, value, span: location };
      }
      case 'assignment': {
        if (node.target.kind !== 'name')
          unsupported(
            'Native preview assignment requires a local variable name.',
            node.target.token,
          );
        const local = this.local(node.target.reference.binding, context, node.target.token);
        if (!local.mutable)
          unsupported('Cannot assign to a native const binding.', node.target.token);
        let value = this.expression(node.value, context);
        if (node.operator !== '=') {
          if (!['+=', '-=', '*=', '/='].includes(node.operator))
            unsupported(
              `Assignment '${node.operator}' is outside the native preview subset.`,
              node.token,
            );
          value = this.binary(
            node.operator.slice(0, -1),
            { kind: 'load', binding: local.id, type: local.type, span: span(node.target.token) },
            value,
            node.operatorToken ?? node.token,
          );
        }
        if (value.type !== local.type)
          unsupported('Native assignment must preserve the binding type.', node.value.token);
        return { kind: 'assign', binding: local.id, value, span: location };
      }
      case 'expression': {
        const value = node.value;
        if (
          value.kind === 'call' &&
          value.callee.kind === 'name' &&
          value.callee.reference.binding?.kind === 'builtin' &&
          value.callee.reference.binding.name === 'print'
        ) {
          if (
            value.arguments.length > 1 &&
            value.arguments[0]?.kind === 'literal' &&
            typeof value.arguments[0].value === 'string' &&
            value.arguments[0].value.includes('%')
          )
            unsupported(
              'Native preview print does not support console formatting placeholders in a multiargument call.',
              value.arguments[0].token,
            );
          const values = value.arguments.map((arg): IRExpr =>
            arg.kind === 'literal' && typeof arg.value === 'string'
              ? { kind: 'literal', type: 'string', value: arg.value, span: span(arg.token) }
              : this.expression(arg, context),
          );
          for (let i = 0; i < values.length; i++)
            if (values[i]!.type === 'void')
              unsupported(
                'Native preview print cannot print a void result.',
                value.arguments[i]!.token,
              );
          return { kind: 'print', values, span: location };
        }
        return { kind: 'expression', value: this.expression(value, context), span: location };
      }
      case 'if':
        return {
          kind: 'if',
          condition: this.condition(node.condition, context),
          body: this.block(node.body, context),
          otherwise: node.otherwise ? this.block(node.otherwise, context) : [],
          span: location,
        };
      case 'while':
        return {
          kind: 'while',
          condition: this.condition(node.condition, context),
          body: this.block(node.body, context),
          span: location,
        };
      case 'return': {
        if (context.returnType === undefined)
          unsupported('Native return requires a function body.', node.token);
        if (node.value) {
          const value = this.expression(node.value, context);
          if (value.type === 'void' || value.type !== context.returnType)
            unsupported(
              'Native return value must match the function return annotation.',
              node.value.token,
            );
          return { kind: 'return', value, span: location };
        }
        if (context.returnType !== 'void')
          unsupported('This native function must return a value.', node.token);
        return { kind: 'return', span: location };
      }
      default:
        return unsupported(
          `Statement '${node.kind}' is outside the native preview subset.`,
          node.token,
        );
    }
  }
}

/** Shared frontend lowering only: no filesystem reads, imports or program execution. */
export function lowerNative(source: string, filename = 'main.arya'): IRProgram {
  const parsed = parseSource(source, filename);
  const diagnostic = parsed.diagnostics[0];
  if (diagnostic) throw new AryaError(diagnostic.message, diagnostic.token, parsed.diagnostics);
  return new Lowerer(parsed).program(filename);
}
