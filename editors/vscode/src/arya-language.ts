import * as vscode from 'vscode';
import { analyze, completions, hoverAt } from '../../../src/language-service.js';

/** Editor services only parse text; imports and Python calls execute through Run. */
export function registerAryaLanguage(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('arya');
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const validate = (document: vscode.TextDocument) => {
    if (document.languageId !== 'arya') { diagnostics.delete(document.uri); return; }
    const error = analyze(document.getText(), document.uri.toString()).error;
    if (error) {
      const start = document.positionAt(error.token.start), end = document.positionAt(Math.max(error.token.start + 1, error.token.end));
      const diagnostic = new vscode.Diagnostic(new vscode.Range(start, end), error.message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Arya'; diagnostics.set(document.uri, [diagnostic]);
    } else diagnostics.set(document.uri, []);
  };
  const selector: vscode.DocumentSelector = { language: 'arya' };
  context.subscriptions.push(diagnostics,
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'arya') return;
      const key = event.document.uri.toString(); clearTimeout(pending.get(key));
      pending.set(key, setTimeout(() => { pending.delete(key); if (!event.document.isClosed) validate(event.document); }, 180));
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString(); clearTimeout(pending.get(key)); pending.delete(key); diagnostics.delete(document.uri);
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document) {
        const kinds = { keyword: vscode.CompletionItemKind.Keyword, function: vscode.CompletionItemKind.Function, variable: vscode.CompletionItemKind.Variable, module: vscode.CompletionItemKind.Module };
        return completions(analyze(document.getText(), document.uri.toString())).map(value => {
          const item = new vscode.CompletionItem(value.label, kinds[value.kind]); if (value.detail) item.detail = value.detail; return item;
        });
      },
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const hover = hoverAt(document.getText(), document.offsetAt(position));
        return hover ? new vscode.Hover(hover.text, new vscode.Range(document.positionAt(hover.start), document.positionAt(hover.end))) : undefined;
      },
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        try {
          return analyze(document.getText(), document.uri.toString()).symbols.map(symbol => {
            const range = new vscode.Range(document.positionAt(symbol.token.start), document.positionAt(symbol.token.end));
            return new vscode.DocumentSymbol(symbol.name, symbol.kind, symbol.kind === 'function' ? vscode.SymbolKind.Function : symbol.kind === 'module' ? vscode.SymbolKind.Module : vscode.SymbolKind.Variable, range, range);
          });
        } catch { return []; }
      },
    }),
    { dispose() { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); } },
  );
  for (const document of vscode.workspace.textDocuments) validate(document);
}
