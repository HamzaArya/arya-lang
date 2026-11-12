import {createWorkspaceIndex} from '../../../src/workspace-index.js';
import {TextDocument} from 'vscode-languageserver-textdocument';
import {createWorkspaceAnalysisCache} from '../../../src/workspace-service.js';
import {formatSource} from '../../../src/tooling.js';
import * as vscode from 'vscode';
import { referencesInWorkspace, renameInWorkspace, signatureAt, typedCompletions, analyze, completions, standardCompletions, definitionInWorkspace, hoverAt, diagnosticFixes } from '../../../src/language-service.js';
import {semanticTokens, semanticTokenTypes, semanticTokenModifiers} from '../../../src/semantic-tokens.js';

/** Also used by the companion extension when AryaCode owns the other language providers. */
export function registerAryaSemanticHighlighting(context: vscode.ExtensionContext): void {
  const legend = new vscode.SemanticTokensLegend([...semanticTokenTypes], [...semanticTokenModifiers]);
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({language: 'arya'}, {
    provideDocumentSemanticTokens(document, cancellation) {
      const builder = new vscode.SemanticTokensBuilder(legend);
      for (const token of semanticTokens(document.getText(), document.uri.toString())) {
        if (cancellation.isCancellationRequested) break;
        builder.push(new vscode.Range(token.line, token.character, token.line, token.character + token.length), token.type, token.modifiers);
      }
      return builder.build();
    }
  }, legend));
}

/** Editor services parse and resolve text; imports/Python execute only through Run. */
export function registerAryaLanguage(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('arya');
  const cache = createWorkspaceAnalysisCache();
  const snapshots = () => vscode.workspace.textDocuments.filter(d => d.languageId === 'arya' && !d.isClosed).map(d => ({uri: d.uri.toString(), source: d.getText()}));
  let pending: ReturnType<typeof setTimeout> | undefined;
  const index = createWorkspaceIndex(() => scheduleValidation());
  const configure = () => index.configure(vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? []);
  configure();
  const workspace = async () => {
    const state = await index.refresh(snapshots());
    return {...state, analyses: cache.analyze(state.documents,{complete: state.complete}), texts: new Map(state.documents.map(d => [d.uri, TextDocument.create(d.uri, 'arya', 0, d.source)]))};
  };
  const locationRange = (text: TextDocument, start: number, end: number) => {
    const a = text.positionAt(start), b = text.positionAt(end);
    return new vscode.Range(a.line, a.character, b.line, b.character);
  };
  const validateAll = async () => {
    const state = await workspace();
    for (const document of vscode.workspace.textDocuments) {
      if (document.isClosed || document.languageId !== 'arya') continue;
      const analysis = state.analyses.get(document.uri.toString());
      if (!analysis || state.texts.get(document.uri.toString())?.getText() !== document.getText()) continue;
      diagnostics.set(document.uri, analysis.diagnostics.map(error => {
        const diagnostic = new vscode.Diagnostic(new vscode.Range(document.positionAt(error.token.start), document.positionAt(Math.max(error.token.start + 1, error.token.end))), error.message + (error.hint ? '\nHelp: ' + error.hint : ''), vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'Arya'; diagnostic.code = error.code; return diagnostic;
      }));
    }
  };
  function scheduleValidation() {
    clearTimeout(pending);
    pending = setTimeout(() => {pending = undefined; void validateAll();}, 180);
  }
  const selector: vscode.DocumentSelector = { language: 'arya' };
  context.subscriptions.push(diagnostics,
    vscode.workspace.onDidOpenTextDocument(document => { if (document.languageId === 'arya') void validateAll(); }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'arya') return;
      scheduleValidation();
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      if (document.languageId !== 'arya') return;
      clearTimeout(pending); pending = undefined; diagnostics.delete(document.uri);
      void validateAll();
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(document, position) {
        const state = await workspace();
        const kinds = { keyword: vscode.CompletionItemKind.Keyword, function: vscode.CompletionItemKind.Function, variable: vscode.CompletionItemKind.Variable, module: vscode.CompletionItemKind.Module };
        const source = document.getText(), offset = document.offsetAt(position);
        const member = /\.[A-Za-z0-9_]*$/.test(source.slice(0,offset));
        const typed = member ? typedCompletions(source,offset,state.analyses.get(document.uri.toString()),{uri:document.uri.toString(),analyses:state.analyses}) : [];
        const items = member ? typed.length ? typed : standardCompletions(source,offset) : completions(state.analyses.get(document.uri.toString())!);
        return items.map(value => {
          const item = new vscode.CompletionItem(value.label, kinds[value.kind]); if (value.detail) item.detail = value.detail; return item;
        });
      },
    }, '.'),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const hover = hoverAt(document.getText(), document.offsetAt(position));
        return hover ? new vscode.Hover(hover.text, new vscode.Range(document.positionAt(hover.start), document.positionAt(hover.end))) : undefined;
      },
    }),
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions(document, range, context) {
        if (context.only && !context.only.contains(vscode.CodeActionKind.QuickFix)) return [];
        const source = document.getText();
        return diagnosticFixes(source, analyze(source, document.uri.toString()).diagnostics, document.offsetAt(range.start), document.offsetAt(range.end)).map(fix => {
          const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
          action.isPreferred = true;
          action.edit = new vscode.WorkspaceEdit();
          action.edit.replace(document.uri, new vscode.Range(document.positionAt(fix.start), document.positionAt(fix.end)), fix.replacement);
          return action;
        });
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const state = await workspace(), target = definitionInWorkspace(state.documents, document.uri.toString(), document.offsetAt(position), state.analyses);
        return target ? new vscode.Location(vscode.Uri.parse(target.uri), locationRange(state.texts.get(target.uri)!, target.start, target.end)) : undefined;
      },
    }),
    vscode.languages.registerReferenceProvider(selector, {
      async provideReferences(document, position, context) {
        const state = await workspace(), refs = referencesInWorkspace(state.documents, document.uri.toString(), document.offsetAt(position), state.analyses);
        return refs.slice(context.includeDeclaration ? 0 : 1).map(ref => new vscode.Location(vscode.Uri.parse(ref.uri), locationRange(state.texts.get(ref.uri)!, ref.start, ref.end)));
      }
    }),
    vscode.languages.registerRenameProvider(selector, {
      async provideRenameEdits(document, position, newName) {
        const state = await workspace(), result = new vscode.WorkspaceEdit();
        for (const edit of renameInWorkspace(state.documents, document.uri.toString(), document.offsetAt(position), newName, {openDocumentsOnly: !state.complete, analyses: state.analyses})) result.replace(vscode.Uri.parse(edit.uri), locationRange(state.texts.get(edit.uri)!, edit.start, edit.end), edit.replacement);
        return result;
      }
    }),
    vscode.languages.registerSignatureHelpProvider(selector, {
      async provideSignatureHelp(document,position) {
        const state = await workspace();
        const signature=signatureAt(document.getText(),document.offsetAt(position),state.analyses.get(document.uri.toString()), {uri: document.uri.toString(), analyses: state.analyses});if(!signature)return undefined;
        const result=new vscode.SignatureHelp();result.signatures=[new vscode.SignatureInformation(signature.label)];result.activeSignature=0;result.activeParameter=signature.activeParameter;return result;
      }
    },'(',','),
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        try{return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),formatSource(document.getText()))];}catch{return [];}
      }
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      async provideDocumentSymbols(document) {
        const state = await workspace();
        try {
          return state.analyses.get(document.uri.toString())!.symbols.map(symbol => {
            const range = new vscode.Range(document.positionAt(symbol.token.start), document.positionAt(symbol.token.end));
            return new vscode.DocumentSymbol(symbol.name, symbol.kind, symbol.kind === 'function' ? vscode.SymbolKind.Function : symbol.kind === 'module' ? vscode.SymbolKind.Module : vscode.SymbolKind.Variable, range, range);
          });
        } catch { return []; }
      },
    }),
    { dispose() { clearTimeout(pending); cache.clear(); index.dispose(); } },
  );
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {configure(); void validateAll();}));
  void validateAll();
}
