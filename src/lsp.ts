import {
  createConnection, TextDocuments, TextDocumentSyncKind, CompletionItemKind, DiagnosticSeverity, SymbolKind, MarkupKind, CodeActionKind,
  type Diagnostic, type Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ARYA_VERSION } from './compiler.js';
import { analyze, completions, standardCompletions, definitionAt, hoverAt, diagnosticFixes, type Analysis } from './language-service.js';
import {semanticTokens, encodeSemanticTokens, semanticTokenTypes, semanticTokenModifiers} from './semantic-tokens.js';

// stdio is the portable transport. stdout contains protocol frames only.
const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);
const cache = new Map<string, { version: number; analysis: Analysis }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let target: 'js' | 'native' = 'js';
const analysisFor = (document: TextDocument) => {
  const previous = cache.get(document.uri);
  if (previous?.version === document.version) return previous.analysis;
  const analysis = analyze(document.getText(), document.uri, { target });
  cache.set(document.uri, { version: document.version, analysis }); return analysis;
};
const range = (document: TextDocument, start: number, end: number): Range => ({ start: document.positionAt(start), end: document.positionAt(end) });
connection.onInitialize(params => {
  if(params.initializationOptions?.target==='native') target='native';
  return ({
  serverInfo: { name: 'Arya Language Server', version: ARYA_VERSION },
  capabilities: {
    positionEncoding: 'utf-16', textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { resolveProvider: false, triggerCharacters: ['.'] }, hoverProvider: true, documentSymbolProvider: true, definitionProvider: true,
    codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
    semanticTokensProvider: {legend: {tokenTypes: [...semanticTokenTypes], tokenModifiers: [...semanticTokenModifiers]}, full: true},
  },
}); });
connection.onDidChangeConfiguration(params => {
  target=params.settings?.arya?.target==='native'?'native':'js'; cache.clear();
  for(const document of documents.all()) validate(document);
});

function validate(document: TextDocument) {
  const diagnostics: Diagnostic[] = [];
  for (const error of analysisFor(document).diagnostics) diagnostics.push({ severity: DiagnosticSeverity.Error, source: 'Arya', code: error.code, message: error.message + (error.hint ? '\nHelp: ' + error.hint : ''), range: range(document, error.token.start, Math.max(error.token.start + 1, error.token.end)) });
  void connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics });
}
documents.onDidChangeContent(({ document }) => {
  clearTimeout(timers.get(document.uri));
  timers.set(document.uri, setTimeout(() => { timers.delete(document.uri); validate(document); }, 100));
});
documents.onDidClose(({ document }) => {
  clearTimeout(timers.get(document.uri)); timers.delete(document.uri); cache.delete(document.uri);
  void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});
connection.onCompletion(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri); if (!document) return [];
  const kinds = { keyword: CompletionItemKind.Keyword, function: CompletionItemKind.Function, variable: CompletionItemKind.Variable, module: CompletionItemKind.Module };
  const source = document.getText(), offset = document.offsetAt(position);
  const items = /\.[A-Za-z0-9_]*$/.test(source.slice(0, offset)) ? standardCompletions(source, offset, target) : completions(analysisFor(document));
  return items.map(item => ({ ...item, kind: kinds[item.kind] }));
});
connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri); if (!document) return null;
  const hover = hoverAt(document.getText(), document.offsetAt(position));
  return hover ? { contents: { kind: MarkupKind.PlainText, value: hover.text }, range: range(document, hover.start, hover.end) } : null;
});
connection.onDefinition(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri); if (!document) return null;
  const token = definitionAt(analysisFor(document), document.offsetAt(position));
  return token ? { uri: document.uri, range: range(document, token.start, token.end) } : null;
});
connection.onDocumentSymbol(({ textDocument }) => {
  const document = documents.get(textDocument.uri); if (!document) return [];
  return analysisFor(document).symbols.map(symbol => {
    const location = range(document, symbol.token.start, symbol.token.end);
    return { name: symbol.name, detail: symbol.kind, kind: symbol.kind === 'function' ? SymbolKind.Function : symbol.kind === 'module' ? SymbolKind.Module : SymbolKind.Variable, range: location, selectionRange: location };
  });
});
connection.onCodeAction(({ textDocument, range: requested, context }) => {
  const document = documents.get(textDocument.uri); if (!document) return [];
  if (context.only && !context.only.some(kind => CodeActionKind.QuickFix.startsWith(kind))) return [];
  return diagnosticFixes(document.getText(), analysisFor(document).diagnostics, document.offsetAt(requested.start), document.offsetAt(requested.end)).map(fix => ({
    title: fix.title, kind: CodeActionKind.QuickFix, isPreferred: true,
    edit: { documentChanges: [{ textDocument: { uri: document.uri, version: document.version }, edits: [{ range: range(document, fix.start, fix.end), newText: fix.replacement }] }] }
  }));
});
connection.onShutdown(() => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); cache.clear(); });
connection.languages.semanticTokens.on(({textDocument}) => {
  const document = documents.get(textDocument.uri);
  return {data: document ? encodeSemanticTokens(semanticTokens(document.getText(), document.uri)) : []};
});
documents.listen(connection);
connection.listen();
