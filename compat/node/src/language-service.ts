import type { Type } from './types.js';
import { fileURLToPath } from 'node:url';
import {
  AryaError,
  parseSource,
  builtins,
  keywords,
  type SourceAnalysis,
  type AryaDiagnostic,
  type Token,
} from './compiler.js';
export { standardCompletions } from './standard-completions.js';
export { diagnosticFixes } from './diagnostics.js';
export {
  semanticTokens,
  encodeSemanticTokens,
  semanticTokenTypes,
  semanticTokenModifiers,
} from './semantic-tokens.js';

export interface Analysis extends SourceAnalysis {
  error?: AryaDiagnostic;
}
const syntaxHelp: Record<string, string> = {
  fn: 'fn name(value = default, ...remaining) => expression — return an expression, or use a block for statements.',
  guard:
    'guard condition else { return ... } — exit early when a condition is false; the fallback must terminate.',
  for: 'for value at index in values { ... } — iterate values, optionally with a zero-based position.',
  finally:
    'try { ... } finally { ... } — run cleanup after success, return, throw, or loop control.',
  const: 'const name = value — declare an immutable binding; object contents can still be changed.',
};
export function analyze(
  source: string,
  uri: string,
  options: { target?: 'js'; moduleTypes?: Readonly<Record<string, Type>> } = {},
): Analysis {
  let filename = 'document.arya';
  try {
    if (uri.startsWith('file:')) filename = fileURLToPath(uri);
  } catch {
    /* Unsaved documents do not need a filesystem path. */
  }
  try {
    const parsed = parseSource(source, filename, options.moduleTypes);
    const { ast: _ast, usesPython: _python, usesViews: _views, ...analysis } = parsed;
    if (options.target !== undefined && options.target !== 'js')
      analysis.diagnostics.unshift({
        code: 'ARYA_UNSUPPORTED_TARGET',
        token: {
          kind: 'eof',
          text: '',
          start: 0,
          end: Math.min(1, source.length),
          line: 0,
          column: 0,
        },
        message: 'Arya supports the Node.js runtime only. Remove the retired target option.',
      });
    const error = analysis.diagnostics[0];
    return error ? { ...analysis, error } : analysis;
  } catch (error) {
    if (error instanceof AryaError)
      return {
        symbols: [],
        bindings: [],
        references: [],
        imports: [],
        exports: [],
        moduleMembers: [],
        typing: { enabled: false, exports: {}, declarations: '', bindings: [] },
        diagnostics: error.diagnostics,
        error: error.diagnostics[0]!,
      };
    throw error;
  }
}

/** Same-file lexical navigation; properties and host/builtin names have no target. */
export function definitionAt(analysis: Analysis, offset: number): Token | undefined {
  const contains = (token: Token) => token.start <= offset && offset < token.end;
  const reference = analysis.references.find((item) => contains(item.token));
  if (reference) return reference.binding?.token;
  return analysis.bindings.find((binding) => binding.token && contains(binding.token))?.token;
}

export function completions(
  analysis: Analysis,
): { label: string; kind: 'keyword' | 'function' | 'variable' | 'module'; detail?: string }[] {
  return [
    ...keywords.map((label) => ({
      label,
      kind: 'keyword' as const,
      ...(syntaxHelp[label] ? { detail: syntaxHelp[label] } : {}),
    })),
    {
      label: 'view',
      kind: 'keyword' as const,
      detail: 'view { ... } — build escaped HTML using Arya elements.',
    },
    ...Object.entries(builtins).map(([label, detail]) => ({
      label,
      detail,
      kind: label === 'args' ? ('variable' as const) : ('function' as const),
    })),
    ...analysis.symbols.map((symbol) => ({ label: symbol.name, kind: symbol.kind })),
  ];
}

export function hoverAt(
  source: string,
  offset: number,
): { text: string; start: number; end: number } | undefined {
  // Ignore string/comment content while preserving hover on incomplete source.
  const before = source.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? '';
  const after = source.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0] ?? '';
  const word = before + after,
    text = builtins[word] ?? syntaxHelp[word];
  if (!text) return undefined;
  const start = offset - before.length,
    end = offset + after.length;
  let quote = '',
    comment = false,
    escaped = false;
  for (let i = 0; i < start; i++) {
    const char = source[i]!;
    if (quote.length === 3) {
      if (source.startsWith(quote, i)) {
        i += 2;
        quote = '';
      }
      continue;
    }
    if (char === '\n') {
      comment = false;
      quote = '';
      escaped = false;
      continue;
    }
    if (comment) continue;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '#' || source.startsWith('//', i)) comment = true;
    else if (char === '"' || char === "'") {
      quote = source.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
      if (quote.length === 3) i += 2;
    }
  }
  if (quote || comment || source[start - 1] === '.' || /^\s*:/.test(source.slice(end)))
    return undefined;
  return { text, start, end };
}

export {
  definitionInWorkspace,
  analyzeWorkspace,
  referencesInWorkspace,
  renameInWorkspace,
  signatureAt,
  typedCompletions,
} from './workspace-service.js';
export type { SourceDocument, SourceLocation } from './workspace-service.js';
