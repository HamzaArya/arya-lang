import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Block, Expression, Statement, ViewNode } from './ast.js';
import type { LexicalBinding, Resolution } from './resolver.js';
import type { Token } from './compiler.js';
import { hostGlobals } from './host-globals.js';
import { origin } from './source-map.js';

/** JavaScript emission is a separate phase; passive analysis never calls it. */
export function emitProgram(
  ast: Block,
  resolution: Resolution,
  filename: string,
  imports: Readonly<Record<string, string>> = {},
): string {
  const renamed = new Map<LexicalBinding, string>();
  for (const binding of resolution.bindings) {
    if (
      binding.scopeId === 0 &&
      binding.token &&
      hostGlobals.includes(binding.name as (typeof hostGlobals)[number])
    )
      renamed.set(binding, `__arya_user${renamed.size}`);
  }
  const name = (binding: LexicalBinding) =>
    origin(binding.token!, renamed.get(binding) ?? binding.name);
  let importIndex = 0,
    temporary = 0;
  const block = (body: Block): string => `{\n${body.statements.map(statement).join('\n')}\n}`;
  const parameters = (value: Expression & { kind: 'function' }): string => {
    let nextDefault = 0;
    return (
      '(' +
      value.parameters
        .map((token) => {
          const initial = value.optionalParameters?.includes(token.start)
            ? ' = ' + expression(value.defaults[nextDefault++]!)
            : '';
          return (value.rest === token ? '...' : '') + origin(token, token.text) + initial;
        })
        .join(', ') +
      ') ' +
      block(value.body)
    );
  };
  const memberSuffix = (
    key: Expression,
    token: Token,
    optional: boolean,
    computed = false,
  ): string => {
    if (!computed && key.kind === 'literal' && typeof key.value === 'string')
      return origin(token, optional ? '?.' : '.') + origin(token, key.value);
    return (optional ? origin(token, '?.') : '') + origin(key.token, '[') + expression(key) + ']';
  };
  const view = (node: ViewNode): string => {
    if (node.kind === 'text') return `__arya_text(${expression(node.value)})`;
    const attributes =
      '[' +
      node.attributes.map((a) => `[${JSON.stringify(a.name)}, ${expression(a.value)}]`).join(', ') +
      ']';
    return node.raw === undefined
      ? `__arya_element(${JSON.stringify(node.tag)}, ${attributes}, [${node.children.map(view).join(', ')}])`
      : `__arya_rawElement(${JSON.stringify(node.tag)}, ${attributes}, ${JSON.stringify(node.raw)})`;
  };
  const expression = (node: Expression): string => {
    const value = expressionBody(node);
    return node.grouped ? `(${value})` : value;
  };
  const expressionBody = (node: Expression): string => {
    switch (node.kind) {
      case 'literal':
        return typeof node.value === 'number'
          ? `(${origin(node.token, String(node.value))})`
          : origin(node.token, JSON.stringify(node.value));
      case 'name':
        return origin(
          node.token,
          (node.reference.binding && renamed.get(node.reference.binding)) || node.token.text,
        );
      case 'list':
        return `[${node.items.map(expression).join(', ')}]`;
      case 'object':
        return `({${node.fields.map((f) => `[${JSON.stringify(f.key)}]: ${expression(f.value)}`).join(', ')}})`;
      case 'spread':
        return origin(node.token, '...') + expression(node.value);
      case 'unary':
        return `(${origin(node.token, node.operator === 'not' ? '!' : node.operator)} ${expression(node.value)})`;
      case 'binary': {
        const operator =
          ({ and: '&&', or: '||', '==': '===', '!=': '!==' } as Record<string, string>)[
            node.operator
          ] ?? node.operator;
        return `(${expression(node.left)} ${origin(node.token, operator)} ${expression(node.right)})`;
      }
      case 'function':
        return `(${node.async ? 'async ' : ''}function${parameters(node)})`;
      case 'member':
        return expression(node.object) + memberSuffix(node.key, node.token, false, node.computed);
      case 'call':
        return `${expression(node.callee)}(${node.arguments.map(expression).join(', ')})`;
      case 'new':
        return `new ${expression(node.callee)}(${node.arguments.map(expression).join(', ')})`;
      case 'chain':
        return (
          expression(node.base) +
          node.steps
            .map((step) =>
              step.kind === 'member'
                ? memberSuffix(step.key, step.token, step.optional, step.computed)
                : `${step.optional ? origin(step.token, '?.') : ''}${origin(step.token, '(')}${step.arguments.map(expression).join(', ')})`,
            )
            .join('')
        );
      case 'pipe': {
        const reference =
          node.callee.kind === 'member'
            ? `__arya_pipeMember(${expression(node.callee.object)}, ${expression(node.callee.key)})`
            : `{ fn: ${expression(node.callee)}, receiver: void 0 }`;
        const call = `${origin(node.token, '__arya_pipe')}(${expression(node.value)}, ${reference}, [${node.arguments.map(expression).join(', ')}])`;
        return node.awaited ? `(await ${call})` : call;
      }
      case 'view':
        return origin(
          node.token,
          `(${node.html ? '"<!doctype html>" + ' : ''}[${node.children.map(view).join(', ')}].join(""))`,
        );
    }
  };
  const statement = (node: Statement): string => origin(node.token, statementBody(node));
  const statementBody = (node: Statement): string => {
    switch (node.kind) {
      case 'declaration':
        return `${node.exported && !renamed.has(node.binding) ? 'export ' : ''}${node.binding.kind} ${name(node.binding)} = ${expression(node.value)};`;
      case 'function':
        return `${node.exported && !renamed.has(node.binding) ? 'export ' : ''}${node.value.async ? 'async ' : ''}function ${name(node.binding)}${parameters(node.value)}`;
      case 'import': {
        if (node.bridge === 'arya')
          return `import * as ${name(node.binding)} from ${JSON.stringify(imports[node.specifier] ?? node.specifier.split('/').map(encodeURIComponent).join('/') + '.mjs')};`;
        if (node.bridge === 'std')
          return `const ${name(node.binding)} = __arya_standard(${JSON.stringify(node.specifier)}${['web', 'python'].includes(node.specifier) ? ', ' + JSON.stringify(dirname(resolve(filename))) : ''});`;
        if (node.bridge === 'python')
          return `const ${name(node.binding)} = __arya_python(${JSON.stringify(node.specifier.endsWith('.py') ? resolve(dirname(filename), node.specifier) : node.specifier)});`;
        const specifier =
          node.specifier.startsWith('.') || isAbsolute(node.specifier)
            ? pathToFileURL(resolve(dirname(filename), node.specifier)).href
            : node.specifier;
        const internal = `__arya_import${importIndex++}`;
        return `import * as ${internal} from ${JSON.stringify(specifier)};\nconst ${name(node.binding)} = ${internal}.default ?? ${internal};`;
      }
      case 'if':
        return `if (${expression(node.condition)}) ${block(node.body)}${node.otherwise ? ' else ' + block(node.otherwise) : ''}`;
      case 'while':
        return `while (${expression(node.condition)}) ${block(node.body)}`;
      case 'for': {
        if (!node.indexBinding)
          return `for (let ${name(node.binding)} of ${expression(node.iterable)}) ${block(node.body)}`;
        const counter = `__arya_index${temporary++}`;
        return `{ let ${counter} = 0; for (let ${name(node.binding)} of ${expression(node.iterable)}) { let ${name(node.indexBinding)} = ${counter}++; ${node.body.statements.map(statement).join('\n')} } }`;
      }
      case 'return':
        return `return${node.value ? ' ' + expression(node.value) : ''};`;
      case 'break':
      case 'continue':
        return node.kind + ';';
      case 'try':
        return `try ${block(node.body)}${node.handler ? ` catch (${name(node.binding!)}) ${block(node.handler)}` : ''}${node.finalizer ? ' finally ' + block(node.finalizer) : ''}`;
      case 'throw':
        return `throw ${expression(node.value)};`;
      case 'assignment':
        return `${expression(node.target)} ${origin(node.operatorToken ?? node.token, node.operator)} ${expression(node.value)};`;
      case 'expression':
        return expression(node.value) + ';';
    }
  };
  const body = ast.statements.map(statement).join('\n');
  const exports = ast.statements.flatMap((s) =>
    (s.kind === 'declaration' || s.kind === 'function') && s.exported && renamed.has(s.binding)
      ? [`export { ${renamed.get(s.binding)} as ${s.binding.name} };`]
      : [],
  );
  return [body, ...exports].join('\n');
}
