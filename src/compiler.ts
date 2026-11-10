import type * as Ast from './ast.js';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { javascriptRuntime, pythonRuntime } from './runtime.js';
import { origin, finalize } from './source-map.js';
import { parseView, webRuntime } from './web.js';
import { standardLibraries, standardRuntime } from './standard.js';
import { syntaxDiagnostic } from './diagnostics.js';
export { formatDiagnostics, diagnosticFixes } from './diagnostics.js';
export type { DiagnosticFix } from './diagnostics.js';
import { LexicalScopes, type AryaDiagnostic, type BindingKind, type LexicalBinding, type LexicalReference, type Resolution, type ScopeKind } from './resolver.js';
export type { AryaDiagnostic, BindingKind, LexicalBinding, LexicalReference } from './resolver.js';

export const ARYA_VERSION = '1.2.0-alpha.4';
export interface Token { kind: 'word' | 'number' | 'string' | 'symbol' | 'newline' | 'eof'; text: string; start: number; end: number; line: number; column: number }
export interface AryaSymbol { name: string; kind: 'function' | 'variable' | 'module'; token: Token }
export interface AryaImport { specifier: string; token: Token; alias: Token }
export interface ModuleMember { reference: LexicalReference; token: Token }
export class AryaError extends Error {
  readonly diagnostics: AryaDiagnostic[];
  constructor(message: string, readonly token: Token, diagnostics?: AryaDiagnostic[]) {
    super(message); this.name = 'AryaError';
    this.diagnostics = diagnostics ?? [syntaxDiagnostic(message, token)];
  }
}
export const keywords = ['let', 'const', 'fn', 'async', 'await', 'return', 'if', 'else', 'for', 'in', 'while', 'break', 'continue', 'and', 'or', 'not', 'true', 'false', 'null', 'use', 'as', 'export', 'new', 'try', 'catch', 'throw', 'keep', 'task', 'when', 'otherwise', 'each', 'give'];
export const builtins: Record<string, string> = {
  print: 'print(...values) — write values to the terminal.',
  say: 'say(...values) — write values to the terminal (Arya spelling of print).',
  len: 'len(value) — length of a string or list.',
  range: 'range(end) or range(start, end, step = 1) — a list of integers; end is excluded.',
  str: 'str(value) — convert a value to text.',
  number: 'number(value) — convert a value to a number.',
  args: 'args — program arguments as a list of strings.',
};
const reserved = new Set([...keywords, 'class', 'function', 'var', 'import', 'extends', 'super', 'this', 'delete', 'typeof', 'void', 'instanceof', 'switch', 'case', 'default', 'do', 'finally', 'yield', 'with', 'debugger', 'enum', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'static', 'arguments', 'eval']);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0, line = 0, column = 0;
  const point = (): Token => ({ kind: 'eof', text: '', start: offset, end: offset, line, column });
  if (source.length > 256 * 1024) throw new AryaError('Arya source files currently support up to 256 KiB.', point());
  const advance = () => { const char = source[offset++]!; if (char === '\n') { line++; column = 0; } else column++; return char; };
  while (offset < source.length) {
    const char = source[offset]!;
    if (char === ' ' || char === '\t' || char === '\r' || char === '\uFEFF') { advance(); continue; }
    if (char === '#' || source.startsWith('//', offset)) { while (offset < source.length && source[offset] !== '\n') advance(); continue; }
    const token = point();
    if (char === '\n') { advance(); token.kind = 'newline'; token.text = '\n'; }
    else if (/[A-Za-z_]/.test(char)) {
      token.kind = 'word'; while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset]!)) advance();
      token.text = source.slice(token.start, offset);
      if (token.text.startsWith('__arya')) throw new AryaError('Names starting with __arya are reserved for the compiler.', token);
    } else if (/[0-9]/.test(char)) {
      token.kind = 'number';
      const match = /^(?:\d+(?:\.\d+)?)(?:[eE][+-]?\d+)?/.exec(source.slice(offset))![0];
      for (const _ of match) advance(); token.text = match;
      if (!Number.isFinite(Number(match))) throw new AryaError('Number is outside the supported range.', token);
    } else if ((char === '"' || char === "'") && source.startsWith(char.repeat(3), offset)) {
      token.kind = 'string';
      const delimiter = char.repeat(3);
      advance(); advance(); advance();
      const start = offset;
      while (offset < source.length && !source.startsWith(delimiter, offset)) advance();
      if (offset === source.length) throw new AryaError('Unclosed multiline string. Close it with ' + delimiter + '.', token);
      token.text = source.slice(start, offset);
      advance(); advance(); advance();
    } else if (char === '"' || char === "'") {
      token.kind = 'string'; const quote = advance(); let value = '', closed = false;
      while (offset < source.length) {
        const next = advance();
        if (next === quote) { closed = true; break; }
        if (next === '\n') throw new AryaError('Close the string before the end of the line. Use \\n for a newline.', token);
        if (next === '\\') {
          const escaped = advance();
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          if (!(escaped in escapes)) throw new AryaError(`Unsupported escape \\${escaped}.`, token);
          value += escapes[escaped];
        } else value += next;
      }
      if (!closed) throw new AryaError('Unclosed string.', token);
      token.text = value;
    } else {
      token.kind = 'symbol';
      const pair = source.slice(offset, offset + 2);
      if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '**', '??', '?.'].includes(pair)) { advance(); advance(); token.text = pair; }
      else if ('+-*/%<>=!(){}[],:;.'.includes(char)) token.text = advance();
      else throw new AryaError(`Unexpected character ${JSON.stringify(char)}.`, token);
    }
    token.end = offset; tokens.push(token);
    if (tokens.length > 50_000) throw new AryaError('This source file has too many tokens. Split it into smaller files.', token);
  }
  tokens.push(point()); return tokens;
}

interface Expression { node: Ast.Expression; code: string; assignable?: boolean; target?: LexicalReference; chain?: Ast.Expression & { kind: 'chain' } }
export interface SourceAnalysis extends Resolution { symbols: AryaSymbol[]; imports: AryaImport[]; exports: Token[]; moduleMembers: ModuleMember[] }
export interface Compilation extends SourceAnalysis { code: string; map: string; mapFilename: string; usesPython: boolean }
export interface CompileOptions { filename: string; outputFilename: string; aryaImports?: Readonly<Record<string, string>> }
const precedence: Record<string, number> = { '??': 0, or: 1, and: 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7 };
class Parser {
  private index = 0;
  private depth = 0;
  private functionDepth = 0;
  private asyncAllowed = true;
  private loopDepth = 0;
  private imports = 0;
  readonly scopes = new LexicalScopes(Object.keys(builtins));
  readonly symbols: AryaSymbol[] = [];
  readonly aryaImports: AryaImport[] = [];
  readonly exports: Token[] = [];
  readonly moduleMembers: ModuleMember[] = [];
  readonly ast: Ast.Block = { scopeId: 0, statements: [] };
  private blockAst = this.ast;
  usesPython = false;
  usesViews = false;
  constructor(private readonly tokens: Token[], private readonly filename: string, private readonly resolvedImports?: Readonly<Record<string, string>>) {}
  private get current() { return this.tokens[this.index]!; }
  private is(text: string) { return this.current.kind !== 'string' && this.current.text === text; }
  private take() { return this.tokens[this.index++]!; }
  private match(text: string) { if (this.is(text)) { this.take(); return true; } return false; }
  private expect(text: string) { if (!this.match(text)) throw new AryaError(`Expected '${text}'.`, this.current); }
  private lines() { while (this.current.kind === 'newline') this.take(); }
  private separators() { while (this.current.kind === 'newline' || this.is(';')) this.take(); }
  private identifier(): Token {
    const token = this.current;
    if (token.kind !== 'word' || reserved.has(token.text)) throw new AryaError('Expected a name (letters, digits, and underscores; no keywords).', token);
    return this.take();
  }
  private declare(token: Token, kind: BindingKind): LexicalBinding {
    const binding = this.scopes.declare(token, kind);
    if (!binding) throw new AryaError(`'${token.text}' is already defined in this scope.`, token);
    if (this.scopes.isModule) this.symbols.push({ name: token.text, kind: kind === 'function' ? 'function' : kind === 'import' ? 'module' : 'variable', token });
    return binding;
  }
  private end() {
    if (this.current.kind === 'eof' || this.is('}')) return;
    if (this.current.kind !== 'newline' && !this.is(';')) throw new AryaError('Put the next statement on a new line or separate it with a semicolon.', this.current);
    this.separators();
  }
  private nested<T>(action: () => T): T {
    if (++this.depth > 100) throw new AryaError('Code is nested too deeply. Split this expression or block into a function.', this.current);
    try { return action(); } finally { this.depth--; }
  }
  parse(): string {
    const statements: string[] = []; this.separators();
    while (this.current.kind !== 'eof') { statements.push(this.statement()); this.separators(); }
    return statements.join('\n');
  }
  private block(kind: ScopeKind = 'block', parameters: { token: Token; kind: BindingKind }[] = [], aliases: LexicalBinding[] = []): { code: string; node: Ast.Block; parameters: LexicalBinding[] } {
    return this.nested(() => {
      this.lines(); this.expect('{'); this.scopes.enter(kind, aliases);
      const bindings = parameters.map(parameter => this.declare(parameter.token, parameter.kind));
      const previous = this.blockAst;
      const node: Ast.Block = { scopeId: this.scopes.scopeId, statements: [] }; this.blockAst = node;
      const statements: string[] = []; this.separators();
      while (!this.is('}')) {
        if (this.current.kind === 'eof') throw new AryaError("Expected '}' to close the block.", this.current);
        statements.push(this.statement()); this.separators();
      }
      this.expect('}'); this.scopes.leave(); this.blockAst = previous;
      return { code: `{\n${statements.join('\n')}\n}`, node, parameters: bindings };
    });
  }
  private functionBody(async: boolean, token: Token): { code: string; node: Ast.Expression & { kind: 'function' } } {
    this.expect('('); this.lines(); const parameters: Token[] = [];
    if (!this.is(')')) do { this.lines(); if (this.is(')')) break; parameters.push(this.identifier()); this.lines(); } while (this.match(','));
    this.expect(')');
    const previousLoop = this.loopDepth, previousAsync = this.asyncAllowed;
    this.loopDepth = 0; this.functionDepth++; this.asyncAllowed = async;
    const body = this.block('function', parameters.map(token => ({ token, kind: 'parameter' })));
    this.functionDepth--; this.loopDepth = previousLoop; this.asyncAllowed = previousAsync;
    return { code: `(${parameters.map(token => token.text).join(', ')}) ${body.code}`, node: { kind: 'function', async, token, parameters, body: body.node } };
  }
  private record(node: Ast.Statement, code: string): string { this.blockAst.statements.push(node); return code; }
  private statement(): string { const token = this.current; return origin(token, this.statementBody()); }
  private statementBody(): string {
    const token = this.current, exported = this.match('export');
    if (exported && (!this.scopes.isModule || !['let', 'const', 'fn', 'async', 'keep', 'task'].some(word => this.is(word)))) throw new AryaError('Export a top-level variable or function.', token);
    const prefix = exported ? 'export ' : '';
    if (this.is('let') || this.is('const') || this.is('keep')) {
      const keyword = this.take().text === 'let' ? 'let' : 'const', name = this.identifier(), binding = this.declare(name, keyword);
      if (exported) this.exports.push(name);
      this.expect('='); this.lines(); const value = this.expression(); this.end();
      return this.record({ kind: 'declaration', token, binding, value: value.node, exported }, `${prefix}${keyword} ${origin(name, name.text)} = ${value.code};`);
    }
    if (this.is('fn') || this.is('async') || this.is('task')) {
      const async = this.match('async'); if (!this.match('task')) this.expect('fn'); const name = this.identifier(), binding = this.declare(name, 'function');
      if (exported) this.exports.push(name);
      const value = this.functionBody(async, token);
      return this.record({ kind: 'function', token, binding, value: value.node, exported }, `${prefix}${async ? 'async ' : ''}function ${origin(name, name.text)}${value.code}`);
    }
    if (this.match('use')) {
      if (!this.scopes.isModule) throw new AryaError('Put library imports at the top level.', token);
      const bridge = this.take(); if (!['js', 'python', 'arya', 'std'].includes(bridge.text) || bridge.kind !== 'word') throw new AryaError("Choose 'use js', 'use python', 'use arya', or 'use std'.", bridge);
      const module = this.take(); if (module.kind !== 'string' || !module.text || module.text.includes('\0')) throw new AryaError('Expected a library name in quotes.', module);
      this.expect('as'); const name = this.identifier(), binding = this.declare(name, 'import'); this.end();
      this.record({ kind: 'import', token, bridge: bridge.text, specifier: module.text, binding }, '');
      if (bridge.text === 'arya') {
        if ((!module.text.startsWith('./') && !module.text.startsWith('../')) || !module.text.endsWith('.arya') || module.text.includes('\\')) throw new AryaError('Use a relative Arya module path with / separators and an explicit .arya extension.', module);
        this.aryaImports.push({ specifier: module.text, token: module, alias: name });
        const specifier = this.resolvedImports?.[module.text] ?? module.text.split('/').map(encodeURIComponent).join('/') + '.mjs';
        return `import * as ${origin(name, name.text)} from ${JSON.stringify(specifier)};`;
      }
      if (bridge.text === 'std') return `const ${name.text} = __arya_standard(${JSON.stringify(module.text)}, ${JSON.stringify(dirname(resolve(this.filename)))});`;
      if (bridge.text === 'python') {
        this.usesPython = true;
        const specifier = module.text.endsWith('.py') ? resolve(dirname(this.filename), module.text) : module.text;
        return `const ${name.text} = __arya_python(${JSON.stringify(specifier)});`;
      }
      const specifier = module.text.startsWith('.') || isAbsolute(module.text) ? pathToFileURL(resolve(dirname(this.filename), module.text)).href : module.text;
      const internal = `__arya_import${this.imports++}`;
      return `import * as ${internal} from ${JSON.stringify(specifier)};\nconst ${name.text} = ${internal}.default ?? ${internal};`;
    }
    if (this.match('if') || this.match('when')) {
      const condition = this.expression(), body = this.block();
      const saved = this.index; this.lines();
      if (this.match('else') || this.match('otherwise')) {
        this.lines(); let other: { code: string; node: Ast.Block };
        if (this.is('if') || this.is('when')) {
          const previous = this.blockAst, node: Ast.Block = { scopeId: -1, statements: [] }; this.blockAst = node;
          const code = this.statement(); this.blockAst = previous; other = { code, node };
        } else other = this.block();
        return this.record({ kind: 'if', token, condition: condition.node, body: body.node, otherwise: other.node }, `if (${condition.code}) ${body.code} else ${other.code}`);
      }
      this.index = saved; return this.record({ kind: 'if', token, condition: condition.node, body: body.node }, `if (${condition.code}) ${body.code}`);
    }
    if (this.match('while')) {
      const condition = this.expression(); this.loopDepth++; const body = this.block(); this.loopDepth--;
      return this.record({ kind: 'while', token, condition: condition.node, body: body.node }, `while (${condition.code}) ${body.code}`);
    }
    if (this.match('for') || this.match('each')) {
      const name = this.identifier(); this.scopes.enter('loop'); const binding = this.declare(name, 'loop');
      this.expect('in'); const iterable = this.expression(); this.loopDepth++; const body = this.block('block', [], [binding]); this.loopDepth--; this.scopes.leave();
      return this.record({ kind: 'for', token, binding, iterable: iterable.node, body: body.node }, `for (let ${origin(name, name.text)} of ${iterable.code}) ${body.code}`);
    }
    if (this.match('return') || this.match('give')) {
      if (!this.functionDepth) throw new AryaError('Use return inside a function.', token);
      const empty = this.current.kind === 'newline' || this.current.kind === 'eof' || this.is(';') || this.is('}');
      const value = empty ? undefined : this.expression(); this.end();
      return this.record({ kind: 'return', token, ...(value ? { value: value.node } : {}) }, `return${value ? ` ${value.code}` : ''};`);
    }
    if (this.match('break') || this.match('continue')) {
      if (!this.loopDepth) throw new AryaError(`Use ${token.text} inside a loop.`, token);
      this.end(); return this.record({ kind: token.text as 'break' | 'continue', token }, `${token.text};`);
    }
    if (this.match('try')) {
      const body = this.block(); this.lines(); this.expect('catch'); const name = this.identifier(), handler = this.block('catch', [{ token: name, kind: 'catch' }]);
      return this.record({ kind: 'try', token, body: body.node, binding: handler.parameters[0]!, handler: handler.node }, `try ${body.code} catch (${name.text}) ${handler.code}`);
    }
    if (this.match('throw')) { const value = this.expression(); this.end(); return this.record({ kind: 'throw', token, value: value.node }, `throw ${value.code};`); }
    const expression = this.expression();
    if (['=', '+=', '-=', '*=', '/='].some(operator => this.is(operator))) {
      if (!expression.assignable) throw new AryaError(expression.chain ? 'Optional chains cannot be assignment targets. Check the object before assigning.' : 'Assign to a variable, property, or list item.', token);
      const operator = this.take(); if (expression.target) expression.target.access = operator.text === '=' ? 'write' : 'readwrite';
      this.lines(); const value = this.expression(); this.end();
      return this.record({ kind: 'assignment', token, target: expression.node, operator: operator.text, value: value.node }, `${expression.code} ${origin(operator, operator.text)} ${value.code};`);
    }
    this.end(); return this.record({ kind: 'expression', token, value: expression.node }, `${expression.code};`);
  }
  private expression(minimum = 0): Expression {
    return this.nested(() => {
      let left = this.unary();
      while (this.current.kind !== 'string' && (precedence[this.current.text] ?? -1) >= minimum) {
        const token = this.take(), operator = token.text, rank = precedence[operator]!; this.lines();
        const right = this.expression(operator === '**' ? rank : rank + 1);
        const js = ({ and: '&&', or: '||', '==': '===', '!=': '!==' } as Record<string, string>)[operator] ?? operator;
        left = { code: `(${left.code} ${origin(token, js)} ${right.code})`, node: { kind: 'binary', token, operator, left: left.node, right: right.node } };
      }
      return left;
    });
  }
  private unary(): Expression {
    if (['not', '!', '-', '+', 'await'].some(word => this.is(word))) {
      const operator = this.take(); if (operator.text === 'await' && !this.asyncAllowed) throw new AryaError('Use await at the top level or inside an async fn.', operator);
      const value = this.nested(() => this.unary());
      return { code: `(${origin(operator, operator.text === 'not' ? '!' : operator.text)} ${value.code})`, node: { kind: 'unary', token: operator, operator: operator.text, value: value.node } };
    }
    if (this.match('new')) {
      const token = this.identifier(), reference = this.scopes.reference(token); let name = origin(token, token.text), first = true;
      let node: Ast.Expression = { kind: 'name', token, reference };
      while (this.match('.')) {
        if (this.current.kind !== 'word') throw new AryaError('Expected a constructor name.', this.current);
        const member = this.take(); if (first) this.moduleMembers.push({ reference, token: member }); first = false; name += '.' + origin(member, member.text);
        node = { kind: 'member', token: member, object: node, key: { kind: 'literal', token: member, value: member.text } };
      }
      this.expect('('); const args = this.arguments(')');
      return this.postfix({ code: `new ${name}(${args.code})`, node: { kind: 'new', token, callee: node, arguments: args.nodes } });
    }
    return this.postfix(this.primary());
  }
  private arguments(close: string): { code: string; nodes: Ast.Expression[] } {
    const values: Expression[] = []; this.lines();
    if (!this.is(close)) do { this.lines(); if (this.is(close)) break; values.push(this.expression()); this.lines(); } while (this.match(','));
    this.expect(close); return { code: values.map(value => value.code).join(', '), nodes: values.map(value => value.node) };
  }
  private postfix(initial: Expression): Expression {
    let value = initial;
    const append = (step: Ast.ChainStep, suffix: string) => {
      if (step.optional || value.chain) {
        const chain: Ast.Expression & { kind: 'chain' } = value.chain ?? { kind: 'chain', token: step.token, base: value.node, steps: [] };
        chain.steps.push(step);
        value = { code: value.code + suffix, node: chain, chain };
      } else if (step.kind === 'call') {
        value = { code: value.code + suffix, node: { kind: 'call', token: value.node.token, callee: value.node, arguments: step.arguments } };
      } else {
        value = { code: value.code + suffix, assignable: true, node: { kind: 'member', token: step.token, object: value.node, key: step.key } };
      }
    };
    while (true) {
      if (this.current.kind === 'newline') {
        let next = this.index;
        while (this.tokens[next]?.kind === 'newline') next++;
        if (this.tokens[next]?.kind === 'symbol' && ['.', '?.'].includes(this.tokens[next]!.text)) this.index = next;
        else break;
      }
      const token = this.current;
      const optional = this.match('?.');
      if (this.match('(')) {
        const args = this.arguments(')');
        append({ kind: 'call', token, optional, arguments: args.nodes }, `${optional ? origin(token, '?.') : ''}${value.chain ? origin(token, '(') : '('}${args.code})`);
      } else if (!optional && this.match('.')) {
        if (this.current.kind !== 'word') throw new AryaError('Expected a property name after the dot.', this.current);
        const member = this.take(); if (value.target) this.moduleMembers.push({ reference: value.target, token: member });
        append({ kind: 'member', token: member, optional: false, key: { kind: 'literal', token: member, value: member.text } }, `${origin(member, '.')}${origin(member, member.text)}`);
      } else if (this.match('[')) {
        this.lines(); const index = this.expression(); this.lines(); this.expect(']');
        append({ kind: 'member', token: index.node.token, optional, key: index.node }, `${optional ? origin(token, '?.') : ''}${origin(index.node.token, '[')}${index.code}]`);
      } else if (optional) {
        if (this.current.kind !== 'word') throw new AryaError("Expected a property name, '[' or '(' after '?.'.", this.current);
        const member = this.take(); if (value.target) this.moduleMembers.push({ reference: value.target, token: member });
        append({ kind: 'member', token: member, optional: true, key: { kind: 'literal', token: member, value: member.text } }, `${origin(token, '?.')}${origin(member, member.text)}`);
      } else break;
    }
    return value;
  }
  private primary(): Expression {
    const token = this.current;
    if (this.is('view') && this.tokens[this.index + 1]?.text === '{' && this.tokens[this.index + 1]?.kind === 'symbol') {
      this.take(); this.usesViews = true;
      const parser = this;
      const result = parseView({
        get current() { return parser.current; },
        take: () => this.take(), is: text => this.is(text), match: text => this.match(text),
        expect: text => this.expect(text), separators: () => this.separators(),
        expression: () => this.expression(),
        fail: (message, point) => { throw new AryaError(message, point); }
      });
      return { code: origin(token, result.code), node: { kind: 'view', token, expressions: result.expressions } };
    }
    if (this.match('(')) {
      this.lines(); const { chain: _chain, ...value } = this.expression(); this.lines(); this.expect(')');
      return { ...value, code: `(${value.code})` };
    }
    if (this.match('[')) { const args = this.arguments(']'); return { code: `[${args.code}]`, node: { kind: 'list', token, items: args.nodes } }; }
    if (this.match('{')) {
      const fields: string[] = [], nodes: { key: string; value: Ast.Expression }[] = []; this.lines();
      if (!this.is('}')) do {
        this.lines(); if (this.is('}')) break;
        const key = this.take(); if (key.kind !== 'word' && key.kind !== 'string') throw new AryaError('Expected a property name or quoted key.', key);
        this.expect(':'); this.lines(); const value = this.expression(); fields.push(`[${JSON.stringify(key.text)}]: ${value.code}`); nodes.push({ key: key.text, value: value.node }); this.lines();
      } while (this.match(','));
      this.expect('}'); return { code: `({${fields.join(', ')}})`, node: { kind: 'object', token, fields: nodes } };
    }
    if (this.is('fn') || this.is('async') || this.is('task')) { const async = this.match('async'); if (!this.match('task')) this.expect('fn'); const body = this.functionBody(async, token); return { code: `(${async ? 'async ' : ''}function${body.code})`, node: body.node }; }
    if (token.kind === 'string') { this.take(); return { code: origin(token, JSON.stringify(token.text)), node: { kind: 'literal', token, value: token.text } }; }
    if (token.kind === 'number') { this.take(); return { code: `(${origin(token, String(Number(token.text)))})`, node: { kind: 'literal', token, value: Number(token.text) } }; }
    if (['true', 'false', 'null'].some(word => this.is(word))) { this.take(); return { code: origin(token, token.text), node: { kind: 'literal', token, value: token.text === 'null' ? null : token.text === 'true' } }; }
    if (token.kind === 'word' && !reserved.has(token.text)) {
      this.take(); const reference = this.scopes.reference(token);
      return { code: origin(token, token.text), assignable: true, target: reference, node: { kind: 'name', token, reference } };
    }
    throw new AryaError('Expected a value, name, or function call.', token);
  }
}
export function parseProgram(source: string, filename: string, aryaImports?: Readonly<Record<string, string>>): SourceAnalysis & { ast: Ast.Block; body: string; usesPython: boolean; usesViews: boolean } {
  const parser = new Parser(tokenize(source), filename, aryaImports);
  const body = parser.parse();
  return { ast: parser.ast, body, usesPython: parser.usesPython, usesViews: parser.usesViews, symbols: parser.symbols, imports: parser.aryaImports, exports: parser.exports, moduleMembers: parser.moduleMembers, ...parser.scopes.resolve() };
}

/** Parse and resolve without generating maps, resolving imports, or running code.
 * Syntax errors throw AryaError; a complete parse returns all lexical diagnostics.
 */
export function analyzeSource(source: string, filename = 'main.arya'): SourceAnalysis {
  const { ast: _ast, body: _body, usesPython: _usesPython, usesViews: _usesViews, ...analysis } = parseProgram(source, filename);
  return analysis;
}

/** Compile only: no imports, project code, or Python processes execute here. */
export function compile(source: string, filenameOrOptions: string | CompileOptions = 'main.arya'): Compilation {
  const filename = typeof filenameOrOptions === 'string' ? filenameOrOptions : filenameOrOptions.filename;
  const outputFilename = typeof filenameOrOptions === 'string' ? resolve(filename) + '.mjs' : filenameOrOptions.outputFilename;
  const { ast, body, usesPython, usesViews, ...analysis } = parseProgram(source, filename, typeof filenameOrOptions === 'string' ? undefined : filenameOrOptions.aryaImports);
  const stdImports = ast.statements.filter(statement => statement.kind === 'import' && statement.bridge === 'std');
  for (const statement of stdImports) if (statement.kind === 'import' && !(standardLibraries as readonly string[]).includes(statement.specifier)) throw new AryaError(`Standard library '${statement.specifier}' is unavailable in the JavaScript profile; use --target native for native libraries.`, statement.token);
  const first = analysis.diagnostics[0];
  if (first) throw new AryaError(first.message, first.token, analysis.diagnostics);
  const annotated = `// Generated by Arya ${ARYA_VERSION} from ${JSON.stringify(filename)}\n${javascriptRuntime}\n${stdImports.length ? standardRuntime : ''}\n${usesViews ? webRuntime : ''}\n${usesPython ? `const __arya_source = ${JSON.stringify(pathToFileURL(resolve(filename)).href)};\n${pythonRuntime}` : ''}\n${body}\n`;
  return { ...finalize(annotated, source, filename, outputFilename), ...analysis, usesPython };
}
