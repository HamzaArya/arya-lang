import { assignedBindings, capturedAssignments } from './type-effects.js';
import { standardModuleType } from './standard-signatures.js';
import type { Block, Expression, Statement } from './ast.js';
import type { LexicalBinding, AryaDiagnostic } from './resolver.js';
import type { Token } from './compiler.js';

export { type, typeText, assignable, type Type } from './type-model.js';
import {
  type,
  typeText,
  assignable,
  assignedType,
  union,
  nullable,
  present,
  type Type,
} from './type-model.js';
export interface TypeAnalysis {
  enabled: boolean;
  exports: Record<string, Type>;
  declarations: string;
  bindings: { binding: LexicalBinding; type: Type }[];
}
export function checkTypes(
  ast: Block,
  bindings: LexicalBinding[],
  diagnostics: AryaDiagnostic[],
  moduleTypes: Readonly<Record<string, Type>> = {},
  annotated = false,
): TypeAnalysis {
  const hasReturn = (body: Block): boolean =>
    body.statements.some(
      (s) => s.kind === 'function' && (!!s.value.returnType || hasReturn(s.value.body)),
    );
  const enabled =
    annotated ||
    bindings.some((b) => b.annotation) ||
    hasReturn(ast) ||
    Object.keys(moduleTypes).length > 0;
  const env = new Map<LexicalBinding, Type>();
  const declared = new Map<LexicalBinding, Type>();
  const captured = capturedAssignments(ast);
  const invalidate = (scope: Map<LexicalBinding, Type>, writes: ReadonlySet<LexicalBinding>) => {
    for (const binding of writes) {
      const value = declared.get(binding);
      if (value && scope.has(binding)) scope.set(binding, value);
    }
  };
  const joinScopes = (target: Map<LexicalBinding, Type>, paths: Map<LexicalBinding, Type>[]) => {
    if (paths.length)
      for (const binding of target.keys()) {
        const values = paths.map((path) => path.get(binding) ?? target.get(binding)!);
        target.set(
          binding,
          values.every((value) => value === values[0]) ? values[0]! : union(values),
        );
      }
  };
  const byToken = new Map(bindings.filter((b) => b.token).map((b) => [b.token!, b]));
  const report = (token: Token, message: string, code: AryaDiagnostic['code'] = 'ARYA_TYPE') => {
    if (enabled && !diagnostics.some((d) => d.token.start === token.start && d.code === code))
      diagnostics.push({ code, token, message });
  };
  const check = (actual: Type, expected: Type, token: Token, invariant = false) => {
    if (!assignable(actual, expected, invariant))
      report(token, `Expected ${typeText(expected)}, received ${typeText(actual)}.`);
  };
  const fresh = (expr: Expression): boolean =>
    expr.kind === 'object'
      ? expr.fields.every((field) => fresh(field.value))
      : expr.kind === 'list'
        ? expr.items.every(fresh)
        : expr.kind === 'literal' || expr.kind === 'function';
  const fnType = (expr: Expression & { kind: 'function' }): Type => {
    const parameters = expr.parameters.map((p) => {
      const annotation = byToken.get(p)?.annotation ?? type('any');
      if (p !== expr.rest) return annotation;
      if (annotation.kind === 'array') return annotation;
      if (!['any', 'unknown'].includes(annotation.kind))
        report(p, 'Rest parameter type must be an array, any or unknown.');
      return {
        kind: 'array',
        value: ['any', 'unknown'].includes(annotation.kind) ? annotation : type('any'),
      } as Type;
    });
    return {
      kind: 'function',
      parameters,
      optional: expr.parameters.map((p) => expr.optionalParameters?.includes(p.start) ?? false),
      result: expr.async
        ? { kind: 'promise', value: expr.returnType ?? type('any') }
        : (expr.returnType ?? type('any')),
      ...(expr.rest ? { rest: parameters.at(-1)! } : {}),
    };
  };
  const refine = (
    condition: Expression,
    truth: boolean,
    scope: Map<LexicalBinding, Type>,
  ): void => {
    if (condition.kind === 'unary' && ['!', 'not'].includes(condition.operator))
      return refine(condition.value, !truth, scope);
    if (
      condition.kind === 'binary' &&
      ((condition.operator === 'and' && truth) || (condition.operator === 'or' && !truth))
    ) {
      refine(condition.left, truth, scope);
      invalidate(
        scope,
        assignedBindings(
          {
            scopeId: -1,
            statements: [
              { kind: 'expression', token: condition.right.token, value: condition.right },
            ],
          },
          captured,
        ),
      );
      refine(condition.right, truth, scope);
      return;
    }
    let candidate: Expression | undefined,
      nullishKind: 'null' | 'undefined' | undefined,
      exclude = true;
    if (condition.kind === 'name' && truth) candidate = condition;
    if (condition.kind === 'binary' && ['==', '!='].includes(condition.operator)) {
      const nullish = (v: Expression) =>
        (v.kind === 'literal' && v.value === null) ||
        (v.kind === 'name' &&
          v.reference.binding?.kind === 'host' &&
          v.reference.token.text === 'undefined');
      if (nullish(condition.right)) {
        candidate = condition.left;
        nullishKind = condition.right.kind === 'literal' ? 'null' : 'undefined';
      }
      if (nullish(condition.left)) {
        candidate = condition.right;
        nullishKind = condition.left.kind === 'literal' ? 'null' : 'undefined';
      }
      exclude = (condition.operator === '!=') === truth;
    }
    if (candidate?.kind === 'name' && candidate.reference.binding) {
      const value = scope.get(candidate.reference.binding) ?? type('any');
      if (value.kind === 'any' || value.kind === 'unknown') return;
      const values = value.kind === 'union' ? value.values : [value];
      scope.set(
        candidate.reference.binding,
        nullishKind
          ? union(values.filter((t) => (exclude ? t.kind !== nullishKind : t.kind === nullishKind)))
          : present(value),
      );
    }
  };
  const member = (base: Type, key: Expression, token: Token): Type => {
    if (base.kind === 'any') return base;
    if (nullable(base)) {
      report(token, 'Handle null or undefined before reading this value.');
      return type('any');
    }
    if (base.kind === 'unknown') {
      report(
        token,
        'Unknown external value: validate it or supply an explicit trusted boundary declaration.',
        'ARYA_TYPE_UNKNOWN',
      );
      return type('any');
    }
    if (base.kind === 'union') return union(base.values.map((t) => member(t, key, token)));
    if (key.kind === 'literal' && typeof key.value === 'string') {
      if (base.kind === 'record') {
        const field = base.fields[key.value];
        if (!field) {
          report(token, `Record has no field '${key.value}'.`);
          return type('any');
        }
        return field.optional ? union([field.type, type('undefined')]) : field.type;
      }
      if ((base.kind === 'array' || base.kind === 'string') && key.value === 'length')
        return type('number');
      if (
        base.kind === 'string' &&
        ['trim', 'toUpperCase', 'toLowerCase', 'replace', 'slice', 'substring'].includes(key.value)
      )
        return { kind: 'function', parameters: [], optional: [], result: type('string') };
      if (base.kind === 'string' && key.value === 'split')
        return {
          kind: 'function',
          parameters: [],
          optional: [],
          result: { kind: 'array', value: type('string') },
        };
    }
    if (base.kind === 'array') return union([base.value, type('undefined')]);
    report(
      token,
      `Cannot statically read this member of ${typeText(base)}; declare its boundary shape.`,
    );
    return type('any');
  };
  const spreadElement = (value: Type, token: Token): Type => {
    if (value.kind === 'array') return value.value;
    if (value.kind === 'string' || value.kind === 'any' || value.kind === 'never') return value;
    if (value.kind === 'union') return union(value.values.map((v) => spreadElement(v, token)));
    report(token, `Cannot spread ${typeText(value)}; expected an array or string.`);
    return type('any');
  };
  const call = (
    callee: Type,
    args: Expression[],
    scope: Map<LexicalBinding, Type>,
    token: Token,
  ): Type => {
    // Literal lists have a known length. Other spreads may contribute zero items.
    const expand = (items: Expression[]): Expression[] =>
      items.flatMap((a) =>
        a.kind === 'spread' && a.value.kind === 'list' ? expand(a.value.items) : [a],
      );
    const expanded = expand(args);
    const actual = expanded.map((a) => ({ expr: a, value: expression(a, scope) }));
    invalidate(scope, captured);
    if (callee.kind === 'any') return callee;
    if (callee.kind === 'overload') {
      const matches = callee.signatures.filter((signature) => {
        const minimum = signature.parameters.reduce(
          (n, _, i) =>
            !signature.optional[i] && !(signature.rest && i === signature.parameters.length - 1)
              ? i + 1
              : n,
          0,
        );
        if (
          expanded.some((a) => a.kind === 'spread') ||
          actual.length < minimum ||
          (!signature.rest && actual.length > signature.parameters.length)
        )
          return false;
        return actual.every(({ expr, value }, i) => {
          const expected =
            signature.rest && i >= signature.parameters.length - 1
              ? signature.rest.kind === 'array'
                ? signature.rest.value
                : signature.rest
              : signature.parameters[i];
          return (
            expected &&
            assignable(
              value,
              signature.optional[i] ? union([expected, type('undefined')]) : expected,
              !fresh(expr),
            )
          );
        });
      });
      if (!matches.length) {
        report(token, 'No declared overload accepts these arguments.');
        return type('unknown');
      }
      return matches[0]!.result;
    }
    if (callee.kind !== 'function') {
      report(
        token,
        `Value of type ${typeText(callee)} is not a known callable.`,
        callee.kind === 'unknown' ? 'ARYA_TYPE_UNKNOWN' : 'ARYA_TYPE',
      );
      return type('any');
    }
    const minimum = callee.parameters.reduce(
      (n, _, i) =>
        !callee.optional[i] && !(callee.rest && i === callee.parameters.length - 1) ? i + 1 : n,
      0,
    );
    const guaranteed = expanded.filter((a) => a.kind !== 'spread').length;
    if (guaranteed < minimum)
      report(
        token,
        `Expected at least ${minimum} arguments, received ${guaranteed} guaranteed arguments.`,
      );
    const expectedAt = (i: number): Type | undefined => {
      if (callee.rest && i >= callee.parameters.length - 1)
        return callee.rest.kind === 'array' ? callee.rest.value : callee.rest;
      const value = callee.parameters[i];
      return value && callee.optional[i] ? union([value, type('undefined')]) : value;
    };
    let position = 0,
      uncertain = false;
    for (const { expr, value } of actual) {
      if (expr.kind === 'spread') uncertain = true;
      const end = uncertain ? Math.max(position, callee.parameters.length - 1) : position;
      for (let i = position; i <= end; i++) {
        const expected = expectedAt(i);
        if (expected) check(value, expected, expr.token, !fresh(expr));
      }
      if (expr.kind !== 'spread') position++;
    }
    if (callee.builtin?.startsWith('list.') && actual[0]?.value.kind === 'array') {
      const input = actual[0].value,
        method = callee.builtin.slice(5),
        selector = actual[1];
      if (['filter', 'sortBy', 'take', 'unique'].includes(method)) return input;
      if (method === 'find') return union([input.value, type('null')]);
      if (method === 'reduce') return actual[2]?.value ?? type('unknown');
      let selected = selector?.value.kind === 'function' ? selector.value.result : type('unknown');
      if (selector?.expr.kind === 'literal' && typeof selector.expr.value === 'string')
        selected = member(input.value, selector.expr, token);
      if (method === 'flatMap')
        selected = selected.kind === 'array' ? selected.value : type('unknown');
      return { kind: 'array', value: selected };
    }
    return callee.result;
  };
  const expression = (expr: Expression, scope: Map<LexicalBinding, Type>): Type => {
    switch (expr.kind) {
      case 'literal':
        return type(
          expr.value === null ? 'null' : (typeof expr.value as 'string' | 'number' | 'boolean'),
        );
      case 'name':
        return expr.reference.binding
          ? (scope.get(expr.reference.binding) ?? type('any'))
          : type('any');
      case 'object':
        return {
          kind: 'record',
          fields: Object.fromEntries(
            expr.fields.map((f) => [f.key, { type: expression(f.value, scope), optional: false }]),
          ),
        };
      case 'list':
        return { kind: 'array', value: union(expr.items.map((e) => expression(e, scope))) };
      case 'spread':
        return spreadElement(expression(expr.value, scope), expr.token);
      case 'function': {
        const signature = fnType(expr) as Type & { kind: 'function' },
          local = new Map(scope);
        for (const [binding, value] of local)
          if (['let', 'parameter', 'loop', 'catch'].includes(binding.kind))
            local.set(binding, declared.get(binding) ?? value);
        for (const [i, p] of expr.parameters.entries()) {
          const b = byToken.get(p);
          if (b) {
            local.set(b, signature.parameters[i]!);
            declared.set(b, signature.parameters[i]!);
          }
        }
        for (const [index, defaultValue] of expr.defaults.entries()) {
          const parameter = expr.parameters.findIndex(
            (p) => p.start === expr.optionalParameters?.[index],
          );
          if (parameter >= 0)
            check(
              expression(defaultValue, local),
              signature.parameters[parameter]!,
              defaultValue.token,
            );
        }
        const flow = block(expr.body, local, expr.async);
        const inferred = union([
          ...flow.returns.map((r) => r.value),
          ...(flow.normal ? [type('undefined')] : []),
        ]);
        if (expr.returnType)
          for (const result of flow.returns)
            check(result.value, expr.returnType, result.token, !result.fresh);
        if (expr.returnType && expr.returnType.kind !== 'void' && flow.normal)
          check(type('undefined'), expr.returnType, expr.token);
        if (!expr.returnType)
          signature.result = expr.async ? { kind: 'promise', value: inferred } : inferred;
        return signature;
      }
      case 'member': {
        const base = expression(expr.object, scope);
        expression(expr.key, scope);
        return member(base, expr.key, expr.token);
      }
      case 'call':
        return call(expression(expr.callee, scope), expr.arguments, scope, expr.token);
      case 'new':
        expression(expr.callee, scope);
        expr.arguments.forEach((a) => expression(a, scope));
        invalidate(scope, captured);
        return type('any');
      case 'chain': {
        let current = expression(expr.base, scope),
          optional = false;
        for (const step of expr.steps) {
          if (step.optional) {
            optional = true;
            current = present(current);
          }
          current =
            step.kind === 'member'
              ? member(current, step.key, step.token)
              : call(current, step.arguments, scope, step.token);
        }
        return optional ? union([current, type('undefined')]) : current;
      }
      case 'unary': {
        const value = expression(expr.value, scope);
        if (expr.operator === 'await') {
          invalidate(scope, captured);
          return value.kind === 'promise' ? value.value : value;
        }
        if (['not', '!'].includes(expr.operator)) return type('boolean');
        check(value, type('number'), expr.token);
        return type('number');
      }
      case 'binary': {
        const left = expression(expr.left, scope);
        let right: Type;
        if (['and', 'or', '??'].includes(expr.operator)) {
          const rightScope = new Map(scope);
          if (expr.operator !== '??') refine(expr.left, expr.operator === 'and', rightScope);
          right = expression(expr.right, rightScope);
          joinScopes(scope, [scope, rightScope]);
        } else right = expression(expr.right, scope);
        if (['==', '!=', '<', '>', '<=', '>='].includes(expr.operator)) return type('boolean');
        if (expr.operator === '??') return union([present(left), right]);
        if (['and', 'or'].includes(expr.operator)) return union([left, right]);
        if (expr.operator === '+' && left.kind === 'string' && right.kind === 'string')
          return type('string');
        check(left, type('number'), expr.left.token);
        check(right, type('number'), expr.right.token);
        return type('number');
      }
      case 'pipe': {
        const result = call(
          expression(expr.callee, scope),
          [expr.value, ...expr.arguments],
          scope,
          expr.token,
        );
        return expr.awaited && result.kind === 'promise' ? result.value : result;
      }
      case 'view':
        expr.expressions.forEach((e) => expression(e, scope));
        return type('string');
    }
  };
  interface Flow {
    normal: boolean;
    returns: { value: Type; token: Token; fresh: boolean }[];
    throws: boolean;
    breaks: boolean;
    continues: boolean;
  }
  const flow = (normal = true): Flow => ({
    normal,
    returns: [],
    throws: false,
    breaks: false,
    continues: false,
  });
  const merge = (a: Flow, b: Flow): Flow => ({
    normal: a.normal || b.normal,
    returns: [...a.returns, ...b.returns],
    throws: a.throws || b.throws,
    breaks: a.breaks || b.breaks,
    continues: a.continues || b.continues,
  });
  const block = (body: Block, scope: Map<LexicalBinding, Type>, unwrap = false): Flow => {
    for (const statement of body.statements) {
      if (statement.kind === 'function') scope.set(statement.binding, fnType(statement.value));
      if (statement.kind === 'declaration')
        scope.set(statement.binding, statement.binding.annotation ?? type('any'));
      if (statement.kind === 'import')
        scope.set(
          statement.binding,
          statement.binding.annotation ??
            moduleTypes[statement.specifier] ??
            (statement.bridge === 'std'
              ? standardModuleType(statement.specifier)
              : type(statement.bridge === 'arya' ? 'any' : 'unknown')),
        );
      if (
        statement.kind === 'function' ||
        statement.kind === 'declaration' ||
        statement.kind === 'import'
      )
        declared.set(statement.binding, scope.get(statement.binding)!);
    }
    let result = flow();
    for (const s of body.statements) {
      // Diagnose dead code using a disposable state; it cannot change live exports.
      const current = result.normal ? scope : new Map(scope);
      let next = flow();
      switch (s.kind) {
        case 'declaration': {
          const actual = expression(s.value, current),
            contract = s.binding.annotation ?? actual;
          if (s.binding.annotation) check(actual, contract, s.value.token, !fresh(s.value));
          declared.set(s.binding, contract);
          current.set(s.binding, contract);
          break;
        }
        case 'function': {
          const value = expression(s.value, current);
          current.set(s.binding, value);
          declared.set(s.binding, value);
          break;
        }
        case 'import':
          break;
        case 'return': {
          let value = s.value ? expression(s.value, current) : type('undefined');
          if (unwrap && value.kind === 'promise') value = value.value;
          next.normal = false;
          next.returns.push({ value, token: s.token, fresh: !s.value || fresh(s.value) });
          break;
        }
        case 'expression':
          expression(s.value, current);
          break;
        case 'assignment': {
          let previous: Type, target: Type;
          if (s.target.kind === 'member') {
            const base = expression(s.target.object, current);
            expression(s.target.key, current);
            previous = member(base, s.target.key, s.target.token);
            target =
              base.kind === 'array' &&
              !(s.target.key.kind === 'literal' && s.target.key.value === 'length')
                ? base.value
                : previous;
          } else {
            previous = expression(s.target, current);
            target =
              s.target.kind === 'name' && s.target.reference.binding
                ? (declared.get(s.target.reference.binding) ?? previous)
                : previous;
          }
          let value = expression(s.value, current);
          if (s.operator !== '=') {
            if (s.operator !== '+=' || previous.kind !== 'string' || value.kind !== 'string') {
              check(previous, type('number'), s.target.token);
              check(value, type('number'), s.value.token);
              value = type('number');
            }
          }
          check(value, target, s.value.token, !fresh(s.value));
          if (s.target.kind === 'name' && s.target.reference.binding)
            current.set(s.target.reference.binding, assignedType(value, target));
          break;
        }
        case 'throw':
          expression(s.value, current);
          next.normal = false;
          next.throws = true;
          break;
        case 'break':
          next.normal = false;
          next.breaks = true;
          break;
        case 'continue':
          next.normal = false;
          next.continues = true;
          break;
        case 'if': {
          expression(s.condition, current);
          const yes = new Map(current),
            no = new Map(current);
          refine(s.condition, true, yes);
          refine(s.condition, false, no);
          const yesFlow = block(s.body, yes, unwrap),
            noFlow = s.otherwise ? block(s.otherwise, no, unwrap) : flow();
          next = merge(yesFlow, noFlow);
          joinScopes(current, [...(yesFlow.normal ? [yes] : []), ...(noFlow.normal ? [no] : [])]);
          break;
        }
        case 'while': {
          const writes = assignedBindings(
              {
                scopeId: -1,
                statements: [
                  { kind: 'expression', token: s.condition.token, value: s.condition },
                  ...s.body.statements,
                ],
              },
              captured,
            ),
            loop = new Map(current);
          invalidate(loop, writes);
          expression(s.condition, loop);
          refine(s.condition, true, loop);
          const bodyFlow = block(s.body, loop, unwrap);
          const always = s.condition.kind === 'literal' && s.condition.value === true;
          const never = s.condition.kind === 'literal' && s.condition.value === false;
          next = never
            ? flow()
            : { ...bodyFlow, normal: !always || bodyFlow.breaks, breaks: false, continues: false };
          if (!never) {
            invalidate(current, writes);
            if (!bodyFlow.breaks) refine(s.condition, false, current);
          }
          break;
        }
        case 'for': {
          const values = expression(s.iterable, current),
            local = new Map(current),
            writes = assignedBindings(s.body, captured);
          invalidate(local, writes);
          local.set(s.binding, values.kind === 'array' ? values.value : type('any'));
          declared.set(s.binding, local.get(s.binding)!);
          if (s.indexBinding) {
            local.set(s.indexBinding, type('number'));
            declared.set(s.indexBinding, type('number'));
          }
          next = { ...block(s.body, local, unwrap), normal: true, breaks: false, continues: false };
          invalidate(current, writes);
          break;
        }
        case 'try': {
          const writes = assignedBindings(s.body, captured),
            success = new Map(current);
          next = block(s.body, success, unwrap);
          const paths = next.normal ? [success] : [];
          if (s.handler) {
            const handler = new Map(current);
            invalidate(handler, writes);
            if (s.binding) {
              handler.set(s.binding, type('unknown'));
              declared.set(s.binding, type('unknown'));
            }
            const caught = block(s.handler, handler, unwrap);
            if (caught.normal) paths.push(handler);
            next = merge({ ...next, throws: false }, caught);
          }
          joinScopes(current, paths);
          if (s.finalizer) {
            const finalScope = new Map(current);
            // Finally also runs during returns, throws, break and continue.
            invalidate(finalScope, writes);
            if (s.handler) invalidate(finalScope, assignedBindings(s.handler, captured));
            const finalizer = block(s.finalizer, finalScope, unwrap);
            next = finalizer.normal ? merge(next, { ...finalizer, normal: false }) : finalizer;
            joinScopes(current, [finalScope]);
          }
          break;
        }
      }
      if (result.normal) result = merge({ ...result, normal: false }, next);
    }
    return result;
  };
  for (const binding of bindings) {
    if (binding.kind === 'host')
      env.set(binding, type(binding.name === 'undefined' ? 'undefined' : 'any'));
    if (binding.kind === 'builtin') env.set(binding, type(binding.name === 'args' ? 'any' : 'any'));
  }
  block(ast, env);
  const exports: Record<string, Type> = Object.create(null);
  for (const s of ast.statements)
    if ((s.kind === 'declaration' || s.kind === 'function') && s.exported)
      exports[s.binding.name] = declared.get(s.binding) ?? env.get(s.binding) ?? type('unknown');
  const declarations =
    Object.entries(exports)
      .map(([name, t]) => `export declare const ${name}: ${typeText(t)};`)
      .join('\n') + '\n';
  return {
    enabled,
    exports,
    declarations,
    bindings: [...env].map(([binding, type]) => ({ binding, type })),
  };
}
