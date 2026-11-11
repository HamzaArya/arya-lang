import {createWorkspaceAnalysisCache} from '../../../src/workspace-service.js';
import {formatSource} from '../../../src/tooling.js';
import * as vscode from 'vscode';
import { referencesInWorkspace, renameInWorkspace, signatureAt, typedCompletions, analyze, completions, standardCompletions, definitionAt, hoverAt, diagnosticFixes } from '../../../src/language-service.js';
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
  const snapshots = () => vscode.workspace.textDocuments.filter(d => d.languageId === 'arya' && !d.isClosed).map(d => ({uri:d.uri.toString(), source:d.getText()}));
  let pending: ReturnType<typeof setTimeout> | undefined;
  const validate = (document: vscode.TextDocument) => {
    if (document.languageId !== 'arya') { diagnostics.delete(document.uri); return; }
    diagnostics.set(document.uri, (cache.analyze(snapshots()).get(document.uri.toString()) ?? analyze(document.getText(),document.uri.toString())).diagnostics.map(error => {
      const start = document.positionAt(error.token.start), end = document.positionAt(Math.max(error.token.start + 1, error.token.end));
      const diagnostic = new vscode.Diagnostic(new vscode.Range(start, end), error.message + (error.hint ? '\nHelp: ' + error.hint : ''), vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Arya'; diagnostic.code = error.code; return diagnostic;
    }));
  };
  const validateAll = () => {
    for (const document of vscode.workspace.textDocuments) if (!document.isClosed && document.languageId === 'arya') validate(document);
  };
  const selector: vscode.DocumentSelector = { language: 'arya' };
  context.subscriptions.push(diagnostics,
    vscode.workspace.onDidOpenTextDocument(document => { if (document.languageId === 'arya') validateAll(); }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'arya') return;
      clearTimeout(pending);
      pending = setTimeout(() => { pending = undefined; validateAll(); }, 180);
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      if (document.languageId !== 'arya') return;
      clearTimeout(pending); pending = undefined; diagnostics.delete(document.uri);
      validateAll();
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document, position) {
        const kinds = { keyword: vscode.CompletionItemKind.Keyword, function: vscode.CompletionItemKind.Function, variable: vscode.CompletionItemKind.Variable, module: vscode.CompletionItemKind.Module };
        const source = document.getText(), offset = document.offsetAt(position);
        const items = /\.[A-Za-z0-9_]*$/.test(source.slice(0, offset)) ? [...standardCompletions(source, offset),...typedCompletions(source,offset)] : completions(analyze(source, document.uri.toString()));
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
      provideDefinition(document, position) {
        const token = definitionAt(analyze(document.getText(), document.uri.toString()), document.offsetAt(position));
        return token ? new vscode.Location(document.uri, new vscode.Range(document.positionAt(token.start), document.positionAt(token.end))) : undefined;
      },
    }),
    vscode.languages.registerReferenceProvider(selector, {
      provideReferences(document,position) {
        const snapshots=vscode.workspace.textDocuments.filter(d=>d.languageId==='arya').map(d=>({uri:d.uri.toString(),source:d.getText()}));
        return referencesInWorkspace(snapshots,document.uri.toString(),document.offsetAt(position)).map(ref=>{
          const target=vscode.workspace.textDocuments.find(d=>d.uri.toString()===ref.uri)!;
          return new vscode.Location(target.uri,new vscode.Range(target.positionAt(ref.start),target.positionAt(ref.end)));
        });
      }
    }),
    vscode.languages.registerRenameProvider(selector, {
      provideRenameEdits(document,position,newName) {
        const snapshots=vscode.workspace.textDocuments.filter(d=>d.languageId==='arya').map(d=>({uri:d.uri.toString(),source:d.getText()}));
        const result=new vscode.WorkspaceEdit();
        for(const edit of renameInWorkspace(snapshots,document.uri.toString(),document.offsetAt(position),newName,{openDocumentsOnly:true})) {
          const target=vscode.workspace.textDocuments.find(d=>d.uri.toString()===edit.uri)!;
          result.replace(target.uri,new vscode.Range(target.positionAt(edit.start),target.positionAt(edit.end)),newName);
        }
        return result;
      }
    }),
    vscode.languages.registerSignatureHelpProvider(selector, {
      provideSignatureHelp(document,position) {
        const signature=signatureAt(document.getText(),document.offsetAt(position));if(!signature)return undefined;
        const result=new vscode.SignatureHelp();result.signatures=[new vscode.SignatureInformation(signature.label)];result.activeSignature=0;result.activeParameter=signature.activeParameter;return result;
      }
    },'(',','),
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        try{return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),formatSource(document.getText()))];}catch{return [];}
      }
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
    { dispose() { clearTimeout(pending); cache.clear(); } },
  );
  validateAll();
}
