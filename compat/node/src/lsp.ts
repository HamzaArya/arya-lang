import {
  createConnection,
  TextDocuments,
  TextDocumentSyncKind,
  CompletionItemKind,
  DiagnosticSeverity,
  SymbolKind,
  MarkupKind,
  CodeActionKind,
  type Diagnostic,
  type Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createWorkspaceIndex } from './workspace-index.js';
import { createWorkspaceAnalysisCache } from './workspace-service.js';
import { ARYA_VERSION } from './compiler.js';
import {
  referencesInWorkspace,
  renameInWorkspace,
  signatureAt,
  typedCompletions,
  completions,
  standardCompletions,
  definitionInWorkspace,
  hoverAt,
  diagnosticFixes,
} from './language-service.js';
import {
  semanticTokens,
  encodeSemanticTokens,
  semanticTokenTypes,
  semanticTokenModifiers,
} from './semantic-tokens.js';

// stdio is the portable transport. stdout contains protocol frames only.
const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);
const cache = createWorkspaceAnalysisCache();
let validationTimer: ReturnType<typeof setTimeout> | undefined;
const index = createWorkspaceIndex(() => scheduleValidation());
let rootUris: string[] = [];
const snapshots = () => documents.all().map((d) => ({ uri: d.uri, source: d.getText() }));
const workspace = async () => {
  const state = await index.refresh(snapshots());
  return {
    ...state,
    analyses: cache.analyze(state.documents, { complete: state.complete }),
    texts: new Map(
      state.documents.map((d) => [
        d.uri,
        documents.get(d.uri) ?? TextDocument.create(d.uri, 'arya', 0, d.source),
      ]),
    ),
  };
};
const range = (document: TextDocument, start: number, end: number): Range => ({
  start: document.positionAt(start),
  end: document.positionAt(end),
});
connection.onInitialize((params) => {
  rootUris =
    params.workspaceFolders?.map((folder) => folder.uri) ??
    (params.rootUri ? [params.rootUri] : []);
  index.configure(rootUris);
  return {
    serverInfo: { name: 'Arya Language Server', version: ARYA_VERSION },
    capabilities: {
      workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
      positionEncoding: 'utf-16',
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: ['.'] },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', ','] },
      documentFormattingProvider: true,
      codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
      semanticTokensProvider: {
        legend: {
          tokenTypes: [...semanticTokenTypes],
          tokenModifiers: [...semanticTokenModifiers],
        },
        full: true,
      },
    },
  };
});
connection.onDidChangeConfiguration(() => {
  cache.clear();
  index.invalidate();
});
connection.onDidChangeWatchedFiles(() => index.invalidate());
connection.onNotification(
  'workspace/didChangeWorkspaceFolders',
  (params: { event: { added: { uri: string }[]; removed: { uri: string }[] } }) => {
    rootUris = [
      ...rootUris.filter((uri) => !params.event.removed.some((f) => f.uri === uri)),
      ...params.event.added.map((f) => f.uri),
    ];
    index.configure(rootUris);
    scheduleValidation();
  },
);
async function validateAll() {
  const state = await workspace();
  for (const document of documents.all()) {
    const analysis = state.analyses.get(document.uri),
      snapshot = state.documents.find((d) => d.uri === document.uri);
    if (!analysis || snapshot?.source !== document.getText()) continue;
    const diagnostics: Diagnostic[] = analysis.diagnostics.map((error) => ({
      severity: DiagnosticSeverity.Error,
      source: 'Arya',
      code: error.code,
      message: error.message + (error.hint ? '\nHelp: ' + error.hint : ''),
      range: range(document, error.token.start, Math.max(error.token.start + 1, error.token.end)),
    }));
    void connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics });
  }
}
function scheduleValidation() {
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => {
    validationTimer = undefined;
    void validateAll();
  }, 100);
}
documents.onDidChangeContent(scheduleValidation);
documents.onDidClose(({ document }) => {
  clearTimeout(validationTimer);
  validationTimer = undefined;
  void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  void validateAll();
});
connection.onCompletion(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  const kinds = {
    keyword: CompletionItemKind.Keyword,
    function: CompletionItemKind.Function,
    variable: CompletionItemKind.Variable,
    module: CompletionItemKind.Module,
  };
  const state = await workspace();
  const source = document.getText(),
    offset = document.offsetAt(position);
  const member = /\.[A-Za-z0-9_]*$/.test(source.slice(0, offset));
  const typed = member
    ? typedCompletions(source, offset, state.analyses.get(document.uri), {
        uri: document.uri,
        analyses: state.analyses,
      })
    : [];
  const items = member
    ? typed.length
      ? typed
      : standardCompletions(source, offset)
    : completions(state.analyses.get(document.uri)!);
  return items.map((item) => ({ ...item, kind: kinds[item.kind] }));
});
connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  const hover = hoverAt(document.getText(), document.offsetAt(position));
  return hover
    ? {
        contents: { kind: MarkupKind.PlainText, value: hover.text },
        range: range(document, hover.start, hover.end),
      }
    : null;
});
connection.onDefinition(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  const state = await workspace();
  const target = definitionInWorkspace(
    state.documents,
    document.uri,
    document.offsetAt(position),
    state.analyses,
  );
  return target
    ? { uri: target.uri, range: range(state.texts.get(target.uri)!, target.start, target.end) }
    : null;
});
connection.onReferences(async ({ textDocument, position, context }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  const state = await workspace();
  const references = referencesInWorkspace(
    state.documents,
    document.uri,
    document.offsetAt(position),
    state.analyses,
  );
  return references
    .slice(context.includeDeclaration ? 0 : 1)
    .map((ref) => ({ uri: ref.uri, range: range(state.texts.get(ref.uri)!, ref.start, ref.end) }));
});
connection.onRenameRequest(async ({ textDocument, position, newName }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  const state = await workspace();
  const changes: Record<string, { range: Range; newText: string }[]> = {};
  for (const edit of renameInWorkspace(
    state.documents,
    document.uri,
    document.offsetAt(position),
    newName,
    { openDocumentsOnly: !state.complete, analyses: state.analyses },
  )) {
    (changes[edit.uri] ??= []).push({
      range: range(state.texts.get(edit.uri)!, edit.start, edit.end),
      newText: edit.replacement,
    });
  }
  return { changes };
});
connection.onSignatureHelp(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  const state = await workspace();
  const signature = signatureAt(
    document.getText(),
    document.offsetAt(position),
    state.analyses.get(document.uri),
    { uri: document.uri, analyses: state.analyses },
  );
  return signature
    ? {
        signatures: [{ label: signature.label }],
        activeSignature: 0,
        activeParameter: signature.activeParameter,
      }
    : null;
});
connection.onDocumentFormatting(async ({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  const { formatSource } = await import('./tooling.js');
  try {
    return [
      {
        range: range(document, 0, document.getText().length),
        newText: formatSource(document.getText()),
      },
    ];
  } catch {
    return [];
  }
});
connection.onDocumentSymbol(async ({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  const state = await workspace();
  return state.analyses.get(document.uri)!.symbols.map((symbol) => {
    const location = range(document, symbol.token.start, symbol.token.end);
    return {
      name: symbol.name,
      detail: symbol.kind,
      kind:
        symbol.kind === 'function'
          ? SymbolKind.Function
          : symbol.kind === 'module'
            ? SymbolKind.Module
            : SymbolKind.Variable,
      range: location,
      selectionRange: location,
    };
  });
});
connection.onCodeAction(async ({ textDocument, range: requested, context }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  if (context.only && !context.only.some((kind) => CodeActionKind.QuickFix.startsWith(kind)))
    return [];
  const state = await workspace();
  return diagnosticFixes(
    document.getText(),
    state.analyses.get(document.uri)!.diagnostics,
    document.offsetAt(requested.start),
    document.offsetAt(requested.end),
  ).map((fix) => ({
    title: fix.title,
    kind: CodeActionKind.QuickFix,
    isPreferred: true,
    edit: {
      documentChanges: [
        {
          textDocument: { uri: document.uri, version: document.version },
          edits: [{ range: range(document, fix.start, fix.end), newText: fix.replacement }],
        },
      ],
    },
  }));
});
connection.onShutdown(() => {
  clearTimeout(validationTimer);
  cache.clear();
  index.dispose();
});
connection.languages.semanticTokens.on(({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  return {
    data: document ? encodeSemanticTokens(semanticTokens(document.getText(), document.uri)) : [],
  };
});
documents.listen(connection);
connection.listen();
