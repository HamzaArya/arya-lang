import {
  createConnection, TextDocuments, TextDocumentSyncKind, CompletionItemKind, DiagnosticSeverity, SymbolKind, MarkupKind,
  type Diagnostic, type Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ARYA_VERSION } from './compiler.js';
import { analyze, completions, hoverAt, type Analysis } from './language-service.js';

// stdio is the portable transport. stdout contains protocol frames only.
const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);
const cache = new Map<string, { version: number; analysis: Analysis }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const analysisFor = (document: TextDocument) => {
  const previous = cache.get(document.uri);
  if (previous?.version === document.version) return previous.analysis;
  const analysis = analyze(document.getText(), document.uri);
  cache.set(document.uri, { version: document.version, analysis }); return analysis;
};
const range = (document: TextDocument, start: number, end: number): Range => ({ start: document.positionAt(start), end: document.positionAt(end) });
connection.onInitialize(() => ({
  serverInfo: { name: 'Arya Language Server', version: ARYA_VERSION },
  capabilities: {
    positionEncoding: 'utf-16', textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { resolveProvider: false }, hoverProvider: true, documentSymbolProvider: true,
  },
}));

function validate(document: TextDocument) {
  const diagnostics: Diagnostic[] = [];
  const error = analysisFor(document).error;
  if (error) diagnostics.push({ severity: DiagnosticSeverity.Error, source: 'Arya', message: error.message, range: range(document, error.token.start, Math.max(error.token.start + 1, error.token.end)) });
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
connection.onCompletion(({ textDocument }) => {
  const document = documents.get(textDocument.uri); if (!document) return [];
  const kinds = { keyword: CompletionItemKind.Keyword, function: CompletionItemKind.Function, variable: CompletionItemKind.Variable, module: CompletionItemKind.Module };
  return completions(analysisFor(document)).map(item => ({ ...item, kind: kinds[item.kind] }));
});
connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri); if (!document) return null;
  const hover = hoverAt(document.getText(), document.offsetAt(position));
  return hover ? { contents: { kind: MarkupKind.PlainText, value: hover.text }, range: range(document, hover.start, hover.end) } : null;
});
connection.onDocumentSymbol(({ textDocument }) => {
  const document = documents.get(textDocument.uri); if (!document) return [];
  return analysisFor(document).symbols.map(symbol => {
    const location = range(document, symbol.token.start, symbol.token.end);
    return { name: symbol.name, detail: symbol.kind, kind: symbol.kind === 'function' ? SymbolKind.Function : symbol.kind === 'module' ? SymbolKind.Module : SymbolKind.Variable, range: location, selectionRange: location };
  });
});
connection.onShutdown(() => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); cache.clear(); });
documents.listen(connection);
connection.listen();
