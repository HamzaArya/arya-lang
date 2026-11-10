import type { Token } from './compiler.js';
import { hostGlobals } from './host-globals.js';

export type BindingKind = 'let' | 'const' | 'function' | 'parameter' | 'loop' | 'catch' | 'import' | 'builtin' | 'host';
export type ScopeKind = 'module' | 'function' | 'block' | 'loop' | 'catch';
export interface LexicalBinding { name: string; kind: BindingKind; scopeId: number; token?: Token }
export interface LexicalReference { token: Token; access: 'read' | 'write' | 'readwrite'; binding?: LexicalBinding }
export interface AryaDiagnostic { code: 'ARYA_SYNTAX' | 'ARYA_UNKNOWN_NAME' | 'ARYA_CONST_ASSIGNMENT' | 'ARYA_MODULE_NOT_FOUND' | 'ARYA_MODULE_CYCLE' | 'ARYA_MODULE_ESCAPE' | 'ARYA_MODULE_EXPORT' | 'ARYA_PROJECT_LIMIT' | 'ARYA_NATIVE_UNSUPPORTED'; message: string; token: Token; suggestion?: string; hint?: string }
export interface Resolution { bindings: LexicalBinding[]; references: LexicalReference[]; diagnostics: AryaDiagnostic[] }
interface Scope { id: number; kind: ScopeKind; parent?: Scope; declarations: Map<string, LexicalBinding> }

/** Parsing records lexical facts; resolution runs only after every scope is complete.
 * No filesystem, host-global introspection, imports, or project execution occurs here.
 */
export class LexicalScopes {
  private nextScope = 1;
  private current: Scope = { id: 0, kind: 'module', declarations: new Map() };
  private readonly hosts = new Map<string, LexicalBinding>(hostGlobals.map(name => [name, { name, kind: 'host', scopeId: -1 }]));
  private readonly bindings: LexicalBinding[] = [];
  private readonly references: { reference: LexicalReference; scope: Scope }[] = [];
  constructor(builtinNames: string[]) {
    for (const name of builtinNames) {
      const binding: LexicalBinding = { name, kind: 'builtin', scopeId: 0 };
      this.current.declarations.set(name, binding); this.bindings.push(binding);
    }
  }
  get isModule(): boolean { return this.current.kind === 'module'; }
  get scopeId(): number { return this.current.id; }
  enter(kind: ScopeKind, aliases: LexicalBinding[] = []): void {
    this.current = { id: this.nextScope++, kind, parent: this.current, declarations: new Map(aliases.map(binding => [binding.name, binding])) };
  }
  leave(): void { this.current = this.current.parent!; }
  declare(token: Token, kind: BindingKind): LexicalBinding | undefined {
    if (this.current.declarations.has(token.text)) return undefined;
    const binding: LexicalBinding = { name: token.text, kind, scopeId: this.current.id, token };
    this.current.declarations.set(token.text, binding); this.bindings.push(binding);
    return binding;
  }
  reference(token: Token): LexicalReference {
    const reference: LexicalReference = { token, access: 'read' };
    this.references.push({ reference, scope: this.current }); return reference;
  }
  resolve(): Resolution {
    const diagnostics: AryaDiagnostic[] = [];
    const suggestions = new Map<string, string | undefined>();
    for (const { reference, scope } of this.references) {
      const { token } = reference;
      let binding: LexicalBinding | undefined;
      for (let enclosing: Scope | undefined = scope; enclosing; enclosing = enclosing.parent) {
        binding = enclosing.declarations.get(token.text); if (binding) break;
      }
      binding ??= this.hosts.get(token.text);
      if (!binding) {
        const key = `${scope.id}:${token.text}`;
        if (!suggestions.has(key)) suggestions.set(key, this.suggest(scope, token.text));
        const suggestion = suggestions.get(key);
        const diagnostic: AryaDiagnostic = { code: 'ARYA_UNKNOWN_NAME', token, message: `Unknown name '${token.text}'.${suggestion ? ` Did you mean '${suggestion}'?` : ''}` };
        if (suggestion) diagnostic.suggestion = suggestion;
        else diagnostic.hint = 'Declare this name in an accessible scope, or add an explicit library import.';
        diagnostics.push(diagnostic);
      } else {
        reference.binding = binding;
        if (reference.access !== 'read' && ['const', 'import', 'builtin'].includes(binding.kind)) {
          diagnostics.push({ code: 'ARYA_CONST_ASSIGNMENT', token, message: `Cannot assign to const '${token.text}'.`, hint: binding.kind === 'const' ? 'Use let for a binding that must be reassigned, or change the assignment.' : 'Create a separate let binding; imports and built-ins cannot be reassigned.' });
        }
      }
    }
    diagnostics.sort((left, right) => left.token.start - right.token.start);
    return { bindings: [...this.hosts.values(), ...this.bindings], references: this.references.map(item => item.reference), diagnostics };
  }
  private suggest(scope: Scope, name: string): string | undefined {
    // A unique, single-edit neighbor (including a transposition) is conservative.
    // Bound optional suggestion work on unusually large scopes/identifiers.
    if (name.length < 3 || name.length > 64) return undefined;
    const visible = new Set<string>(this.hosts.keys());
    for (let enclosing: Scope | undefined = scope; enclosing; enclosing = enclosing.parent) {
      for (const candidate of enclosing.declarations.keys()) {
        visible.add(candidate);
        if (visible.size > 512) return undefined;
      }
    }
    let result: string | undefined;
    for (const candidate of visible) {
      if (!oneEditApart(name, candidate)) continue;
      if (result) return undefined; // Equally close names are ambiguous.
      result = candidate;
    }
    return result;
  }
}

function oneEditApart(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1 || right.length > 64) return false;
  let index = 0;
  while (index < Math.min(left.length, right.length) && left[index] === right[index]) index++;
  if (left.length === right.length) {
    return left.slice(index + 1) === right.slice(index + 1) ||
      (left[index] === right[index + 1] && left[index + 1] === right[index] && left.slice(index + 2) === right.slice(index + 2));
  }
  return left.length > right.length ? left.slice(index + 1) === right.slice(index) : left.slice(index) === right.slice(index + 1);
}
