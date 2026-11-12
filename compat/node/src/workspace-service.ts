import { standardCompletionDetail } from './standard-completions.js';
import { analyze, type Analysis } from './language-service.js';
import { tokenize } from './compiler.js';
import { typeText, type Type } from './types.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export interface SourceDocument {
  uri: string;
  source: string;
  moduleTypes?: Readonly<Record<string, Type>>;
}

/** Resolve filesystem names as paths, including literal #, %, spaces and Unicode. */
export function moduleUri(from: string, specifier: string): string | undefined {
  try {
    return from.startsWith('file:')
      ? pathToFileURL(resolve(dirname(fileURLToPath(from)), specifier)).href
      : new URL(specifier, from).href;
  } catch {
    return undefined;
  }
}

export function analyzeWorkspace(documents: SourceDocument[]): Map<string, Analysis> {
  return createWorkspaceAnalysisCache().analyze(documents);
}

interface CachedDocument {
  source: string;
  external: string;
  moduleTypes: Readonly<Record<string, Type>>;
  initial: Analysis;
  result: Analysis;
  dependencies: string;
}
/** Only changed source and importers whose dependency contracts changed are reparsed. */
export function createWorkspaceAnalysisCache(parse: typeof analyze = analyze) {
  const entries = new Map<string, CachedDocument>();
  let results = new Map<string, Analysis>(),
    wasComplete = false;
  return {
    analyze(
      documents: SourceDocument[],
      options: { complete?: boolean } = {},
    ): Map<string, Analysis> {
      const complete = options.complete ?? false;
      let changed = documents.length !== entries.size || wasComplete !== complete;
      if (!changed)
        for (const document of documents) {
          const previous = entries.get(document.uri);
          if (
            !previous ||
            previous.source !== document.source ||
            previous.external !== (document.moduleTypes ? JSON.stringify(document.moduleTypes) : '')
          ) {
            changed = true;
            break;
          }
        }
      if (!changed) return results;
      wasComplete = complete;
      const next = new Map(documents.map((document) => [document.uri, document]));
      for (const [uri, document] of next) {
        const { source } = document,
          external = document.moduleTypes ? JSON.stringify(document.moduleTypes) : '';
        const previous = entries.get(uri);
        if (!previous || previous.source !== source || previous.external !== external) {
          const baseline = parse(source, uri),
            moduleTypes = baseline.typing.enabled ? (document.moduleTypes ?? {}) : {};
          const initial = Object.keys(moduleTypes).length
            ? parse(source, uri, { moduleTypes })
            : baseline;
          entries.set(uri, {
            source,
            external,
            moduleTypes,
            initial,
            result: initial,
            dependencies: '\0',
          });
          changed = true;
        }
      }
      if (!changed) return results;
      for (const uri of entries.keys()) if (!next.has(uri)) entries.delete(uri);
      const updated = new Map<string, Analysis>(),
        active = new Set<string>();
      const visit = (uri: string): Analysis => {
        const found = updated.get(uri);
        if (found) return found;
        const entry = entries.get(uri)!;
        if (active.has(uri)) return entry.initial;
        active.add(uri);
        const moduleTypes: Record<string, Type> = { ...entry.moduleTypes };
        const dependencies: unknown[] = [];
        for (const imported of entry.initial.imports) {
          const target = moduleUri(uri, imported.specifier);
          if (!target || !entries.has(target) || active.has(target)) continue;
          const dependency = visit(target);
          dependencies.push([
            imported.specifier,
            dependency.exports.map((t) => t.text),
            dependency.typing.enabled,
            dependency.typing.exports,
          ]);
          if (dependency.typing.enabled)
            moduleTypes[imported.specifier] = {
              kind: 'record',
              fields: Object.fromEntries(
                Object.entries(dependency.typing.exports).map(([name, type]) => [
                  name,
                  { type, optional: false },
                ]),
              ),
            };
        }
        const signature = JSON.stringify([complete, dependencies]);
        if (entry.dependencies !== signature) {
          entry.result = Object.keys(moduleTypes).length
            ? parse(entry.source, uri, { moduleTypes })
            : entry.initial;
          entry.dependencies = signature;
          // Missing members are checked for unannotated modules too.
          const extra: Analysis['diagnostics'] = [];
          if (complete)
            for (const imported of entry.result.imports)
              if (!entries.has(moduleUri(uri, imported.specifier) ?? ''))
                extra.push({
                  code: 'ARYA_MODULE_NOT_FOUND',
                  token: imported.token,
                  message: `Cannot find Arya module '${imported.specifier}'.`,
                });
          for (const member of entry.result.moduleMembers) {
            const imported = entry.result.imports.find(
              (i) => i.alias === member.reference.binding?.token,
            );
            const target = imported && moduleUri(uri, imported.specifier),
              dependency = target && updated.get(target);
            if (dependency && !dependency.exports.some((t) => t.text === member.token.text))
              extra.push({
                code: 'ARYA_MODULE_EXPORT',
                token: member.token,
                message: `Arya module '${imported!.specifier}' does not export '${member.token.text}'.`,
              });
          }
          if (extra.length)
            entry.result = {
              ...entry.result,
              diagnostics: [...entry.result.diagnostics, ...extra].sort(
                (a, b) => a.token.start - b.token.start,
              ),
            };
        }
        active.delete(uri);
        updated.set(uri, entry.result);
        return entry.result;
      };
      for (const uri of next.keys()) visit(uri);
      results = updated;
      return results;
    },
    clear() {
      entries.clear();
      results = new Map();
    },
  };
}
export interface SourceLocation {
  uri: string;
  start: number;
  end: number;
  quoted?: boolean;
}

export function definitionInWorkspace(
  documents: SourceDocument[],
  uri: string,
  offset: number,
  parsed = analyzeWorkspace(documents),
): SourceLocation | undefined {
  const current = parsed.get(uri);
  if (!current) return undefined;
  const contains = (t: { start: number; end: number }) => t.start <= offset && offset < t.end;
  const member = current.moduleMembers.find((m) => contains(m.token));
  if (member) {
    const imported = current.imports.find((i) => i.alias === member.reference.binding?.token);
    const target = imported && moduleUri(uri, imported.specifier),
      token = target && parsed.get(target)?.exports.find((t) => t.text === member.token.text);
    return token ? { uri: target as string, start: token.start, end: token.end } : undefined;
  }
  const token =
    current.references.find((r) => contains(r.token))?.binding?.token ??
    current.bindings.find((b) => b.token && contains(b.token))?.token;
  return token ? { uri, start: token.start, end: token.end } : undefined;
}
/** Navigation shares the editor's cached analysis and never executes dependencies. */
export function referencesInWorkspace(
  documents: SourceDocument[],
  uri: string,
  offset: number,
  parsed = analyzeWorkspace(documents),
): SourceLocation[] {
  const target = definitionInWorkspace(documents, uri, offset, parsed);
  if (!target) return [];
  const declaration = parsed.get(target.uri)!,
    binding = declaration.bindings.find((b) => b.token?.start === target.start);
  const result: SourceLocation[] = [target];
  for (const reference of declaration.references)
    if (reference.binding === binding)
      result.push({ uri: target.uri, start: reference.token.start, end: reference.token.end });
  if (declaration.exports.some((t) => t.start === target.start)) {
    for (const [from, analysis] of parsed)
      for (const member of analysis.moduleMembers) {
        const imported = analysis.imports.find((i) => i.alias === member.reference.binding?.token);
        if (
          imported &&
          moduleUri(from, imported.specifier) === target.uri &&
          member.token.text === binding?.name
        )
          result.push({
            uri: from,
            start: member.token.start,
            end: member.token.end,
            ...(member.token.kind === 'string' ? { quoted: true } : {}),
          });
      }
  }
  return [...new Map(result.map((r) => [`${r.uri}:${r.start}`, r])).values()];
}
export function renameInWorkspace(
  documents: SourceDocument[],
  uri: string,
  offset: number,
  name: string,
  options: { openDocumentsOnly?: boolean; analyses?: Map<string, Analysis> } = {},
): { uri: string; start: number; end: number; replacement: string }[] {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
    analyze('const ' + name + ' = 0', 'untitled:rename').diagnostics.length
  )
    throw new Error('Choose a valid non-reserved Arya name.');
  const references = referencesInWorkspace(documents, uri, offset, options.analyses),
    edits = references.map((r) => ({ ...r, replacement: r.quoted ? JSON.stringify(name) : name }));
  // A caller without complete discovery must never perform a partial public rename.
  if (options.openDocumentsOnly && references.length) {
    const target = references[0]!;
    const document = documents.find((document) => document.uri === target.uri)!;
    if (
      analyze(document.source, document.uri).exports.some((token) => token.start === target.start)
    ) {
      throw new Error(
        'Cannot safely rename an exported symbol: unopened files may reference it. Workspace discovery is incomplete.',
      );
    }
  }
  const beforeAnalyses = options.analyses ?? analyzeWorkspace(documents);
  const target = references[0],
    declaration = target && beforeAnalyses.get(target.uri);
  if (target && declaration?.exports.some((t) => t.start === target.start)) {
    if (
      [...beforeAnalyses.values()].some((a) => a.diagnostics.some((d) => d.code === 'ARYA_SYNTAX'))
    )
      throw new Error(
        'Cannot safely rename an exported symbol while workspace syntax errors may hide callers.',
      );
    for (const [from, analysis] of beforeAnalyses)
      for (const imported of analysis.imports) {
        if (moduleUri(from, imported.specifier) !== target.uri) continue;
        for (const reference of analysis.references)
          if (
            reference.binding?.token === imported.alias &&
            !analysis.moduleMembers.some((m) => m.reference === reference)
          )
            throw new Error(
              'Cannot safely rename an exported symbol used through a dynamic namespace or namespace alias.',
            );
      }
  }
  const updated = documents.map((document) => {
    let source = document.source;
    for (const edit of edits
      .filter((e) => e.uri === document.uri)
      .sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    return { ...document, source };
  });
  const afterAnalyses = analyzeWorkspace(updated);
  for (const document of documents) {
    const local = edits.filter((e) => e.uri === document.uri);
    if (!local.length) continue;
    const before = beforeAnalyses.get(document.uri)!,
      after = afterAnalyses.get(document.uri)!;
    if (after.diagnostics.length)
      throw new Error(
        'Rename creates a conflict or the affected document has unresolved diagnostics.',
      );
    const remap = (position: number) =>
      position +
      local
        .filter((e) => e.end <= position)
        .reduce((sum, e) => sum + e.replacement.length - (e.end - e.start), 0);
    for (const reference of before.references) {
      const changed = after.references.find((r) => r.token.start === remap(reference.token.start));
      const original = reference.binding,
        actual = changed?.binding;
      if (
        original?.token
          ? actual?.token?.start !== remap(original.token.start)
          : original?.kind !== actual?.kind || original?.name !== actual?.name
      )
        throw new Error('Rename would capture or change an existing lexical reference.');
    }
  }
  return edits;
}
interface WorkspaceContext {
  uri: string;
  analyses: Map<string, Analysis>;
}
function analyzeWithDependencies(source: string, context?: WorkspaceContext): Analysis {
  const uri = context?.uri ?? 'untitled:completion',
    initial = analyze(source, uri);
  if (!context) return initial;
  const moduleTypes: Record<string, Type> = Object.create(null);
  for (const imported of initial.imports) {
    const target = moduleUri(uri, imported.specifier),
      dependency = target ? context.analyses.get(target) : undefined;
    if (dependency?.typing.enabled)
      moduleTypes[imported.specifier] = {
        kind: 'record',
        fields: Object.fromEntries(
          Object.entries(dependency.typing.exports).map(([name, type]) => [
            name,
            { type, optional: false },
          ]),
        ),
      };
  }
  return Object.keys(moduleTypes).length ? analyze(source, uri, { moduleTypes }) : initial;
}
export function signatureAt(
  source: string,
  offset: number,
  cached?: Analysis,
  context?: WorkspaceContext,
): { label: string; activeParameter: number } | undefined {
  let tokens;
  try {
    tokens = tokenize(source).filter((t) => t.start < offset && t.kind !== 'newline');
  } catch {
    return undefined;
  }
  let depth = 0,
    commas = 0,
    open = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.kind !== 'symbol') continue;
    if ([')', ']', '}'].includes(t.text)) depth++;
    else if (['(', '[', '{'].includes(t.text)) {
      if (depth === 0 && t.text === '(') {
        open = i;
        break;
      }
      depth--;
    } else if (t.text === ',' && depth === 0) commas++;
  }
  if (open < 1) return undefined;
  const token = tokens[open - 1]!;
  let analysis = cached ?? analyzeWithDependencies(source, context);
  // Only repair an unfinished call at EOF. Do not discard or rewrite unrelated source.
  if (analysis.diagnostics.some((d) => d.code === 'ARYA_SYNTAX') && !source.slice(offset).trim()) {
    const stack: string[] = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    for (const item of tokens) {
      if (item.kind !== 'symbol') continue;
      if (pairs[item.text]) stack.push(pairs[item.text]!);
      else if ([')', ']', '}'].includes(item.text) && stack.pop() !== item.text) return undefined;
      if (stack.length > 32) return undefined;
    }
    if (stack.length) {
      const last = tokens.at(-1);
      const placeholder = last?.kind === 'symbol' && ['(', ','].includes(last.text) ? 'null' : '';
      analysis = analyzeWithDependencies(
        source.slice(0, offset) + placeholder + stack.reverse().join(''),
        context,
      );
    }
  }
  const reference = analysis.references.find((r) => r.token.start === token.start);
  let value = analysis.typing.bindings.find((b) => b.binding === reference?.binding)?.type;
  if (!value && tokens[open - 2]?.text === '.') {
    const object = tokens[open - 3],
      ref = analysis.references.find((r) => r.token.start === object?.start),
      record = analysis.typing.bindings.find((b) => b.binding === ref?.binding)?.type;
    if (record?.kind === 'record') value = record.fields[token.text]?.type;
  }
  return value?.kind === 'function' || value?.kind === 'overload'
    ? { label: token.text + typeText(value), activeParameter: commas }
    : undefined;
}
export function typedCompletions(
  source: string,
  offset: number,
  cached?: Analysis,
  context?: WorkspaceContext,
): { label: string; kind: 'variable' | 'function'; detail: string }[] {
  const prefix = source.slice(0, offset).match(/([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z0-9_]*$/);
  if (!prefix) return [];
  const start = offset - prefix[0].length;
  const end = offset + (source.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0].length ?? 0);
  // Repair only this member, preserving receiver offsets and lexical scope.
  const analysis =
    cached && !cached.diagnostics.some((d) => d.code === 'ARYA_SYNTAX')
      ? cached
      : analyzeWithDependencies(
          source.slice(0, start) + prefix[1] + '.aryaCompletion' + source.slice(end),
          context,
        );
  const ref = analysis.references.find((r) => r.token.start === start),
    value = analysis.typing.bindings.find((b) => b.binding === ref?.binding)?.type;
  return value?.kind === 'record'
    ? Object.entries(value.fields).map(([label, field]) => ({
        label,
        kind:
          field.type.kind === 'function' || field.type.kind === 'overload'
            ? 'function'
            : 'variable',
        detail:
          typeText(field.type) +
          (field.type.kind === 'function' &&
          field.type.builtin &&
          standardCompletionDetail(field.type.builtin)
            ? ' — ' + standardCompletionDetail(field.type.builtin)
            : ''),
      }))
    : [];
}
