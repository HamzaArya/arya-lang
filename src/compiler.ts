import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { javascriptRuntime, pythonRuntime } from './runtime.js';
import { origin, finalize } from './source-map.js';
import { LexicalScopes, type AryaDiagnostic, type BindingKind, type LexicalBinding, type LexicalReference, type Resolution, type ScopeKind } from './resolver.js';
export type { AryaDiagnostic, BindingKind, LexicalBinding, LexicalReference } from './resolver.js';

export const ARYA_VERSION = '0.2.0-alpha.3';
export interface Token { kind: 'word' | 'number' | 'string' | 'symbol' | 'newline' | 'eof'; text: string; start: number; end: number; line: number; column: number }
export interface AryaSymbol { name: string; kind: 'function' | 'variable' | 'module'; token: Token }
export interface AryaImport { specifier: string; token: Token; alias: Token }
export interface ModuleMember { reference: LexicalReference; token: Token }
export class AryaError extends Error {
  readonly diagnostics: AryaDiagnostic[];
  constructor(message: string, readonly token: Token, diagnostics?: AryaDiagnostic[]) {
    super(message); this.name = 'AryaError';
    this.diagnostics = diagnostics ?? [{ code: 'ARYA_SYNTAX', message, token }];
  }
}
export const keywords = ['let', 'const', 'fn', 'async', 'await', 'return', 'if', 'else', 'for', 'in', 'while', 'break', 'continue', 'and', 'or', 'not', 'true', 'false', 'null', 'use', 'as', 'export', 'new', 'try', 'catch', 'throw'];
export const builtins: Record<string, string> = {
  print: 'print(...values) — write values to the terminal.',
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
      if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '**'].includes(pair)) { advance(); advance(); token.text = pair; }
      else if ('+-*/%<>=!(){}[],:;.'.includes(char)) token.text = advance();
      else throw new AryaError(`Unexpected character ${JSON.stringify(char)}.`, token);
    }
    token.end = offset; tokens.push(token);
    if (tokens.length > 50_000) throw new AryaError('This source file has too many tokens. Split it into smaller files.', token);
  }
  tokens.push(point()); return tokens;
}

interface Expression { code: string; assignable?: boolean; target?: LexicalReference }
export interface SourceAnalysis extends Resolution { symbols: AryaSymbol[]; imports: AryaImport[]; exports: Token[]; moduleMembers: ModuleMember[] }
export interface Compilation extends SourceAnalysis { code: string; map: string; mapFilename: string; usesPython: boolean }
export interface CompileOptions { filename: string; outputFilename: string; aryaImports?: Readonly<Record<string, string>> }
const precedence: Record<string, number> = { or: 1, and: 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7 };
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
  usesPython = false;
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
  private block(kind: ScopeKind = 'block', parameters: { token: Token; kind: BindingKind }[] = [], aliases: LexicalBinding[] = []): string {
    return this.nested(() => {
      this.lines(); this.expect('{'); this.scopes.enter(kind, aliases);
      for (const parameter of parameters) this.declare(parameter.token, parameter.kind);
      const statements: string[] = []; this.separators();
      while (!this.is('}')) {
        if (this.current.kind === 'eof') throw new AryaError("Expected '}' to close the block.", this.current);
        statements.push(this.statement()); this.separators();
      }
      this.expect('}'); this.scopes.leave(); return `{\n${statements.join('\n')}\n}`;
    });
  }
  private functionBody(async: boolean): string {
    this.expect('('); this.lines(); const parameters: Token[] = [];
    if (!this.is(')')) do { this.lines(); if (this.is(')')) break; parameters.push(this.identifier()); this.lines(); } while (this.match(','));
    this.expect(')');
    const previousLoop = this.loopDepth, previousAsync = this.asyncAllowed;
    this.loopDepth = 0; this.functionDepth++; this.asyncAllowed = async;
    const body = this.block('function', parameters.map(token => ({ token, kind: 'parameter' })));
    this.functionDepth--; this.loopDepth = previousLoop; this.asyncAllowed = previousAsync;
    return `(${parameters.map(token => token.text).join(', ')}) ${body}`;
  }
  private statement(): string {
    const token = this.current;
    return origin(token, this.statementBody());
  }
  private statementBody(): string {
    const token = this.current;
    const exported = this.match('export');
    if (exported && (!this.scopes.isModule || !['let', 'const', 'fn', 'async'].some(word => this.is(word)))) throw new AryaError('Export a top-level variable or function.', token);
    const prefix = exported ? 'export ' : '';
    if (this.is('let') || this.is('const')) {
      const keyword = this.take().text as 'let' | 'const', name = this.identifier(); this.declare(name, keyword);
      if (exported) this.exports.push(name);
      this.expect('='); this.lines(); const value = this.expression().code; this.end(); return `${prefix}${keyword} ${origin(name, name.text)} = ${value};`;
    }
    if (this.is('fn') || this.is('async')) {
      const async = this.match('async'); this.expect('fn'); const name = this.identifier(); this.declare(name, 'function');
      if (exported) this.exports.push(name);
      return `${prefix}${async ? 'async ' : ''}function ${origin(name, name.text)}${this.functionBody(async)}`;
    }
    if (this.match('use')) {
      if (!this.scopes.isModule) throw new AryaError('Put library imports at the top level.', token);
      const bridge = this.take(); if (!['js', 'python', 'arya'].includes(bridge.text) || bridge.kind !== 'word') throw new AryaError("Choose 'use js', 'use python', or 'use arya'.", bridge);
      const module = this.take(); if (module.kind !== 'string' || !module.text || module.text.includes('\0')) throw new AryaError('Expected a library name in quotes.', module);
      this.expect('as'); const name = this.identifier(); this.declare(name, 'import'); this.end();
      if (bridge.text === 'arya') {
        if ((!module.text.startsWith('./') && !module.text.startsWith('../')) || !module.text.endsWith('.arya') || module.text.includes('\\')) throw new AryaError('Use a relative Arya module path with / separators and an explicit .arya extension.', module);
        this.aryaImports.push({ specifier: module.text, token: module, alias: name });
        const specifier = this.resolvedImports?.[module.text] ?? module.text.split('/').map(encodeURIComponent).join('/') + '.mjs';
        return `import * as ${origin(name, name.text)} from ${JSON.stringify(specifier)};`;
      }
      if (bridge.text === 'python') {
        this.usesPython = true;
        const specifier = module.text.endsWith('.py') ? resolve(dirname(this.filename), module.text) : module.text;
        return `const ${name.text} = __arya_python(${JSON.stringify(specifier)});`;
      }
      const specifier = module.text.startsWith('.') || isAbsolute(module.text) ? pathToFileURL(resolve(dirname(this.filename), module.text)).href : module.text;
      const internal = `__arya_import${this.imports++}`;
      return `import * as ${internal} from ${JSON.stringify(specifier)};\nconst ${name.text} = ${internal}.default ?? ${internal};`;
    }
    if (this.match('if')) {
      const condition = this.expression().code, body = this.block();
      // A newline before else belongs to this conditional, but preserve it otherwise.
      const saved = this.index; this.lines();
      if (this.match('else')) { this.lines(); return `if (${condition}) ${body} else ${this.is('if') ? this.statement() : this.block()}`; }
      this.index = saved; return `if (${condition}) ${body}`;
    }
    if (this.match('while')) {
      const condition = this.expression().code; this.loopDepth++; const body = this.block(); this.loopDepth--;
      return `while (${condition}) ${body}`;
    }
    if (this.match('for')) {
      const name = this.identifier(); this.scopes.enter('loop');
      const binding = this.declare(name, 'loop');
      this.expect('in'); const iterable = this.expression().code;
      // The header binding has TDZ in its iterable; body declarations do not.
      // Seed the body's name table to retain Arya's duplicate-loop-name rule.
      this.loopDepth++; const body = this.block('block', [], [binding]); this.loopDepth--;
      this.scopes.leave();
      return `for (let ${origin(name, name.text)} of ${iterable}) ${body}`;
    }
    if (this.match('return')) {
      if (!this.functionDepth) throw new AryaError('Use return inside a function.', token);
      const empty = this.current.kind === 'newline' || this.current.kind === 'eof' || this.is(';') || this.is('}');
      const value = empty ? '' : ` ${this.expression().code}`; this.end(); return `return${value};`;
    }
    if (this.match('break') || this.match('continue')) {
      if (!this.loopDepth) throw new AryaError(`Use ${token.text} inside a loop.`, token);
      this.end(); return `${token.text};`;
    }
    if (this.match('try')) {
      const body = this.block(); this.lines(); this.expect('catch'); const name = this.identifier();
      return `try ${body} catch (${name.text}) ${this.block('catch', [{ token: name, kind: 'catch' }])}`;
    }
    if (this.match('throw')) { const value = this.expression().code; this.end(); return `throw ${value};`; }
    const expression = this.expression();
    if (['=', '+=', '-=', '*=', '/='].some(operator => this.is(operator))) {
      if (!expression.assignable) throw new AryaError('Assign to a variable, property, or list item.', token);
      const operator = this.take();
      if (expression.target) expression.target.access = operator.text === '=' ? 'write' : 'readwrite';
      this.lines(); const value = this.expression().code; this.end(); return `${expression.code} ${origin(operator, operator.text)} ${value};`;
    }
    this.end(); return `${expression.code};`;
  }
  private expression(minimum = 0): Expression {
    return this.nested(() => {
      let left = this.unary();
      while (this.current.kind !== 'string' && (precedence[this.current.text] ?? -1) >= minimum) {
        const token = this.take(), operator = token.text, rank = precedence[operator]!; this.lines();
        const right = this.expression(operator === '**' ? rank : rank + 1);
        const js = ({ and: '&&', or: '||', '==': '===', '!=': '!==' } as Record<string, string>)[operator] ?? operator;
        left = { code: `(${left.code} ${origin(token, js)} ${right.code})` };
      }
      return left;
    });
  }
  private unary(): Expression {
    if (['not', '!', '-', '+', 'await'].some(word => this.is(word))) {
      const operator = this.take();
      if (operator.text === 'await' && !this.asyncAllowed) throw new AryaError('Use await at the top level or inside an async fn.', operator);
      const value = this.nested(() => this.unary()); return { code: `(${origin(operator, operator.text === 'not' ? '!' : operator.text)} ${value.code})` };
    }
    if (this.match('new')) {
      const token = this.identifier(); let name = origin(token, token.text);
      const reference = this.scopes.reference(token); let first = true;
      while (this.match('.')) { if (this.current.kind !== 'word') throw new AryaError('Expected a constructor name.', this.current); const member = this.take(); if (first) this.moduleMembers.push({ reference, token: member }); first = false; name += '.' + origin(member, member.text); }
      this.expect('('); return this.postfix({ code: `new ${name}(${this.arguments(')')})` });
    }
    return this.postfix(this.primary());
  }
  private arguments(close: string): string {
    const values: string[] = []; this.lines();
    if (!this.is(close)) do { this.lines(); if (this.is(close)) break; values.push(this.expression().code); this.lines(); } while (this.match(','));
    this.expect(close); return values.join(', ');
  }
  private postfix(initial: Expression): Expression {
    let value = initial;
    while (true) {
      if (this.match('(')) value = { code: `${value.code}(${this.arguments(')')})` };
      else if (this.match('.')) {
        if (this.current.kind !== 'word') throw new AryaError('Expected a property name after the dot.', this.current);
        const member = this.take();
        if (value.target) this.moduleMembers.push({ reference: value.target, token: member });
        value = { code: `${value.code}.${origin(member, member.text)}`, assignable: true };
      } else if (this.match('[')) { this.lines(); const index = this.expression().code; this.lines(); this.expect(']'); value = { code: `${value.code}[${index}]`, assignable: true }; }
      else break;
    }
    return value;
  }
  private primary(): Expression {
    const token = this.current;
    if (this.match('(')) { this.lines(); const value = this.expression(); this.lines(); this.expect(')'); return { ...value, code: `(${value.code})` }; }
    if (this.match('[')) return { code: `[${this.arguments(']')}]` };
    if (this.match('{')) {
      const fields: string[] = []; this.lines();
      if (!this.is('}')) do {
        this.lines(); if (this.is('}')) break;
        const key = this.take(); if (key.kind !== 'word' && key.kind !== 'string') throw new AryaError('Expected a property name or quoted key.', key);
        this.expect(':'); this.lines(); fields.push(`[${JSON.stringify(key.text)}]: ${this.expression().code}`); this.lines();
      } while (this.match(','));
      this.expect('}'); return { code: `({${fields.join(', ')}})` };
    }
    if (this.is('fn') || this.is('async')) {
      const async = this.match('async'); this.expect('fn'); return { code: `(${async ? 'async ' : ''}function${this.functionBody(async)})` };
    }
    if (token.kind === 'string') { this.take(); return { code: origin(token, JSON.stringify(token.text)) }; }
    if (token.kind === 'number') { this.take(); return { code: `(${origin(token, String(Number(token.text)))})` }; }
    if (['true', 'false', 'null'].some(word => this.is(word))) { this.take(); return { code: origin(token, token.text) }; }
    if (token.kind === 'word' && !reserved.has(token.text)) { this.take(); return { code: origin(token, token.text), assignable: true, target: this.scopes.reference(token) }; }
    throw new AryaError('Expected a value, name, or function call.', token);
  }
}

function parseSource(source: string, filename: string, aryaImports?: Readonly<Record<string, string>>): SourceAnalysis & { body: string; usesPython: boolean } {
  const parser = new Parser(tokenize(source), filename, aryaImports);
  const body = parser.parse();
  return { body, usesPython: parser.usesPython, symbols: parser.symbols, imports: parser.aryaImports, exports: parser.exports, moduleMembers: parser.moduleMembers, ...parser.scopes.resolve() };
}

/** Parse and resolve without generating maps, resolving imports, or running code.
 * Syntax errors throw AryaError; a complete parse returns all lexical diagnostics.
 */
export function analyzeSource(source: string, filename = 'main.arya'): SourceAnalysis {
  const { body: _body, usesPython: _usesPython, ...analysis } = parseSource(source, filename);
  return analysis;
}

/** Compile only: no imports, project code, or Python processes execute here. */
export function compile(source: string, filenameOrOptions: string | CompileOptions = 'main.arya'): Compilation {
  const filename = typeof filenameOrOptions === 'string' ? filenameOrOptions : filenameOrOptions.filename;
  const outputFilename = typeof filenameOrOptions === 'string' ? resolve(filename) + '.mjs' : filenameOrOptions.outputFilename;
  const { body, usesPython, ...analysis } = parseSource(source, filename, typeof filenameOrOptions === 'string' ? undefined : filenameOrOptions.aryaImports);
  const first = analysis.diagnostics[0];
  if (first) throw new AryaError(first.message, first.token, analysis.diagnostics);
  const annotated = `// Generated by Arya ${ARYA_VERSION} from ${JSON.stringify(filename)}\n${javascriptRuntime}\n${usesPython ? `const __arya_source = ${JSON.stringify(pathToFileURL(resolve(filename)).href)};\n${pythonRuntime}` : ''}\n${body}\n`;
  return { ...finalize(annotated, source, filename, outputFilename), ...analysis, usesPython };
}
