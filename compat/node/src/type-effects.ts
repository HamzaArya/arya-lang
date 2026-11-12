import type { Block, Expression, Statement } from './ast.js';
import type { LexicalBinding } from './resolver.js';

interface Visitor {
  statement?: (node: Statement) => void;
  expression?: (node: Expression) => boolean | void;
}

/** Walk source structure only; lexical bindings contain non-tree references. */
function visit(body: Block, visitor: Visitor): void {
  const expression = (node: Expression): void => {
    if (visitor.expression?.(node) === false) return;
    switch (node.kind) {
      case 'function':
        node.defaults.forEach(expression);
        visit(node.body, visitor);
        break;
      case 'object':
        node.fields.forEach((field) => expression(field.value));
        break;
      case 'list':
        node.items.forEach(expression);
        break;
      case 'unary':
      case 'spread':
        expression(node.value);
        break;
      case 'binary':
        expression(node.left);
        expression(node.right);
        break;
      case 'member':
        expression(node.object);
        expression(node.key);
        break;
      case 'call':
      case 'new':
        expression(node.callee);
        node.arguments.forEach(expression);
        break;
      case 'pipe':
        expression(node.value);
        expression(node.callee);
        node.arguments.forEach(expression);
        break;
      case 'chain':
        expression(node.base);
        node.steps.forEach((step) =>
          step.kind === 'member' ? expression(step.key) : step.arguments.forEach(expression),
        );
        break;
      case 'view':
        node.expressions.forEach(expression);
        break;
    }
  };
  for (const node of body.statements) {
    visitor.statement?.(node);
    switch (node.kind) {
      case 'function':
      case 'declaration':
      case 'expression':
      case 'throw':
        expression(node.value);
        break;
      case 'return':
        if (node.value) expression(node.value);
        break;
      case 'assignment':
        expression(node.target);
        expression(node.value);
        break;
      case 'if':
        expression(node.condition);
        visit(node.body, visitor);
        if (node.otherwise) visit(node.otherwise, visitor);
        break;
      case 'while':
        expression(node.condition);
        visit(node.body, visitor);
        break;
      case 'for':
        expression(node.iterable);
        visit(node.body, visitor);
        break;
      case 'try':
        visit(node.body, visitor);
        if (node.handler) visit(node.handler, visitor);
        if (node.finalizer) visit(node.finalizer, visitor);
        break;
    }
  }
}

/** Captured variables can be reassigned by a callback, including through aliases. */
export function capturedAssignments(body: Block): Set<LexicalBinding> {
  const captured = new Set<LexicalBinding>();
  const inspect = (
    body: Block,
    parameters = new Set<LexicalBinding>(),
    functionScope?: number,
  ): void =>
    visit(body, {
      statement(node) {
        if (node.kind !== 'assignment' || node.target.kind !== 'name') return;
        const binding = node.target.reference.binding;
        if (
          binding &&
          functionScope !== undefined &&
          binding.scopeId < functionScope &&
          !parameters.has(binding)
        )
          captured.add(binding);
      },
      expression(node) {
        if (node.kind !== 'function') return;
        const parameters = new Set(node.parameters.map((token) => token.start));
        const locals = new Set<LexicalBinding>();
        // Parameters are aliases from the separate initializer scope.
        visit(node.body, {
          expression(value) {
            if (
              value.kind === 'name' &&
              value.reference.binding &&
              parameters.has(value.reference.binding.token?.start ?? -1)
            )
              locals.add(value.reference.binding);
          },
        });
        inspect({
          scopeId: node.body.scopeId,
          statements: node.defaults.map((value) => ({
            kind: 'expression',
            token: value.token,
            value,
          })),
        });
        inspect(node.body, locals, node.body.scopeId);
        return false;
      },
    });
  inspect(body);
  return captured;
}

/** Writes on any iteration/exception path invalidate a prior narrowing. */
export function assignedBindings(
  body: Block,
  captured: ReadonlySet<LexicalBinding>,
): Set<LexicalBinding> {
  const writes = new Set<LexicalBinding>();
  visit(body, {
    statement(node) {
      if (
        node.kind === 'assignment' &&
        node.target.kind === 'name' &&
        node.target.reference.binding
      )
        writes.add(node.target.reference.binding);
    },
    expression(node) {
      if (node.kind === 'function') return false;
      if (
        node.kind === 'call' ||
        node.kind === 'new' ||
        node.kind === 'pipe' ||
        node.kind === 'chain' ||
        (node.kind === 'unary' && node.operator === 'await')
      )
        for (const binding of captured) writes.add(binding);
    },
  });
  return writes;
}
