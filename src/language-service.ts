import { fileURLToPath } from 'node:url';
import { AryaError, analyzeSource, builtins, keywords, type SourceAnalysis, type AryaDiagnostic, type Token } from './compiler.js';

export interface Analysis extends SourceAnalysis { error?: AryaDiagnostic }
export function analyze(source: string, uri: string): Analysis {
  let filename = 'document.arya';
  try { if (uri.startsWith('file:')) filename = fileURLToPath(uri); } catch { /* Unsaved documents do not need a filesystem path. */ }
  try {
    const analysis = analyzeSource(source, filename), error = analysis.diagnostics[0];
    return error ? { ...analysis, error } : analysis;
  }
  catch (error) {
    if (error instanceof AryaError) return { symbols: [], bindings: [], references: [], imports: [], exports: [], moduleMembers: [], diagnostics: error.diagnostics, error: error.diagnostics[0]! };
    throw error;
  }
}

/** Same-file lexical navigation; properties and host/builtin names have no target. */
export function definitionAt(analysis: Analysis, offset: number): Token | undefined {
  const contains = (token: Token) => token.start <= offset && offset < token.end;
  const reference = analysis.references.find(item => contains(item.token));
  if (reference) return reference.binding?.token;
  return analysis.bindings.find(binding => binding.token && contains(binding.token))?.token;
}

export function completions(analysis: Analysis): { label: string; kind: 'keyword' | 'function' | 'variable' | 'module'; detail?: string }[] {
  return [
    ...keywords.map(label => ({ label, kind: 'keyword' as const })),
    ...Object.entries(builtins).map(([label, detail]) => ({ label, detail, kind: label === 'args' ? 'variable' as const : 'function' as const })),
    ...analysis.symbols.map(symbol => ({ label: symbol.name, kind: symbol.kind })),
  ];
}

export function hoverAt(source: string, offset: number): { text: string; start: number; end: number } | undefined {
  // Ignore string/comment content while preserving hover on incomplete source.
  const before = source.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? '';
  const after = source.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0] ?? '';
  const word = before + after, text = builtins[word];
  if (!text) return undefined;
  const start = offset - before.length, end = offset + after.length;
  let quote = '', comment = false, escaped = false;
  for (let i = 0; i < start; i++) {
    const char = source[i]!;
    if (char === '\n') { comment = false; quote = ''; escaped = false; continue; }
    if (comment) continue;
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; }
    else if (char === '#' || source.startsWith('//', i)) comment = true;
    else if (char === '"' || char === "'") quote = char;
  }
  if (quote || comment || source[start - 1] === '.') return undefined;
  return { text, start, end };
}
