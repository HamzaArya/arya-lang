import {parseProgram, type Token, type LexicalBinding} from './compiler.js';
import type {Block, Expression} from './ast.js';

export const semanticTokenTypes = ['namespace', 'function', 'variable', 'parameter', 'property', 'method', 'class'] as const;
export const semanticTokenModifiers = ['declaration', 'readonly', 'defaultLibrary', 'modification'] as const;
export interface AryaSemanticToken {start: number; length: number; line: number; character: number; type: typeof semanticTokenTypes[number]; modifiers: typeof semanticTokenModifiers[number][]}

/** Syntactic roles plus real lexical binding identity; never import or execute user code. */
export function semanticTokens(source: string, filename = 'document.arya'): AryaSemanticToken[] {
  try {
    const parsed = parseProgram(source, filename);
    const functions = new Set<LexicalBinding>();
    const tokens = new Map<number, AryaSemanticToken>();
    const put = (token: Token, type: AryaSemanticToken['type'], modifiers: AryaSemanticToken['modifiers'] = []) => {
      if (token.kind !== 'word') return;
      tokens.set(token.start, {start: token.start, length: token.end - token.start, line: token.line, character: token.column, type, modifiers});
    };
    const member = (value: Expression, type: 'property' | 'method' | 'class') => {
      if (value.kind === 'member' && value.key.kind === 'literal') put(value.key.token, type);
      else if (value.kind === 'chain') {
        const last = value.steps.at(-1);
        if (last?.kind === 'member' && last.key.kind === 'literal') put(last.key.token, type);
      }
    };
    const expression = (value: Expression): void => {
      switch (value.kind) {
        case 'function': value.defaults.forEach(expression); block(value.body); break;
        case 'call': expression(value.callee); member(value.callee, 'method'); value.arguments.forEach(expression); break;
        case 'pipe': expression(value.value); expression(value.callee); member(value.callee, 'method'); value.arguments.forEach(expression); break;
        case 'new': expression(value.callee); member(value.callee, 'class'); value.arguments.forEach(expression); break;
        case 'member': expression(value.object); expression(value.key); if (value.key.kind === 'literal') put(value.key.token, 'property'); break;
        case 'chain':
          expression(value.base);
          value.steps.forEach((step, index) => {
            if (step.kind === 'member') { expression(step.key); if (step.key.kind === 'literal') put(step.key.token, value.steps[index + 1]?.kind === 'call' ? 'method' : 'property'); }
            else step.arguments.forEach(expression);
          }); break;
        case 'unary': case 'spread': expression(value.value); break;
        case 'binary': expression(value.left); expression(value.right); break;
        case 'list': value.items.forEach(expression); break;
        case 'object': value.fields.forEach(field => expression(field.value)); break;
        case 'view': value.expressions.forEach(expression); break;
      }
    };
    const block = (value: Block): void => {
      for (const statement of value.statements) {
        switch (statement.kind) {
          case 'declaration': if (statement.binding.kind === 'const' && statement.value.kind === 'function') functions.add(statement.binding); expression(statement.value); break;
          case 'function': functions.add(statement.binding); expression(statement.value); break;
          case 'expression': case 'throw': expression(statement.value); break;
          case 'assignment': expression(statement.target); expression(statement.value); break;
          case 'return': if (statement.value) expression(statement.value); break;
          case 'if': expression(statement.condition); block(statement.body); if (statement.otherwise) block(statement.otherwise); break;
          case 'while': expression(statement.condition); block(statement.body); break;
          case 'for': expression(statement.iterable); block(statement.body); break;
          case 'try': block(statement.body); if (statement.handler) block(statement.handler); if (statement.finalizer) block(statement.finalizer); break;
        }
      }
    };
    block(parsed.ast);
    const classify = (binding: LexicalBinding): AryaSemanticToken['type'] => binding.kind === 'import' ? 'namespace' : binding.kind === 'parameter' ? 'parameter' : functions.has(binding) || binding.kind === 'builtin' && binding.name !== 'args' ? 'function' : 'variable';
    const modifiers = (binding: LexicalBinding): AryaSemanticToken['modifiers'] => [
      ...(['const', 'import', 'builtin'].includes(binding.kind) ? ['readonly' as const] : []),
      ...(['builtin', 'host'].includes(binding.kind) ? ['defaultLibrary' as const] : []),
    ];
    for (const binding of parsed.bindings) if (binding.token) put(binding.token, classify(binding), ['declaration', ...modifiers(binding)]);
    for (const reference of parsed.references) if (reference.binding) put(reference.token, classify(reference.binding), [...modifiers(reference.binding), ...(reference.access !== 'read' ? ['modification' as const] : [])]);
    return [...tokens.values()].sort((left, right) => left.start - right.start);
  } catch { return []; } // TextMate remains available while a document is syntactically incomplete.
}

/** LSP's UTF-16, delta-encoded full-token format. */
export function encodeSemanticTokens(tokens: readonly AryaSemanticToken[]): number[] {
  let line = 0, character = 0;
  return tokens.flatMap(token => {
    const result = [token.line - line, token.line === line ? token.character - character : token.character, token.length, semanticTokenTypes.indexOf(token.type), token.modifiers.reduce((mask, modifier) => mask | 1 << semanticTokenModifiers.indexOf(modifier), 0)];
    line = token.line; character = token.character;
    return result;
  });
}
