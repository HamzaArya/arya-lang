import type { AryaDiagnostic, Token } from './compiler.js';

/** Shared, side-effect-free help for parser diagnostics and CLI/editor consumers. */
export function syntaxDiagnostic(message: string, token: Token): AryaDiagnostic {
  const diagnostic: AryaDiagnostic = { code: 'ARYA_SYNTAX', message, token };
  if (message.includes("Expected '}'")) diagnostic.hint = "Close the current block or object with '}'.";
  else if (message === "Expected ')'.") diagnostic.hint = 'Check matching parentheses and separate parameters or arguments with commas.';
  else if (message === "Expected ']'.") diagnostic.hint = "Close the list or index with ']' and separate list items with commas.";
  else if (message === "Expected '{'.") diagnostic.hint = "Start the body with '{' and close it with '}'.";
  else if (message === "Expected '='.") diagnostic.hint = "Initialize a binding with '=' followed by a value.";
  else if (message.startsWith('Put the next statement')) diagnostic.hint = 'Use a new line or semicolon between statements; leading-dot chains may span lines.';
  else if (message.includes('Optional chains cannot')) diagnostic.hint = 'Use if to check the object, then assign through an ordinary property access.';
  else if (message.startsWith('Unclosed string')) diagnostic.hint = 'Close the string with its opening quote, or use triple quotes for multiline text.';
  else if (message.startsWith('A guard fallback')) diagnostic.hint = 'Use return/throw to leave the function, or break/continue to leave the current loop iteration.';
  else if (message.startsWith('Pipe into')) diagnostic.hint = 'Use a function name or call. Input becomes the first argument; use |> await for an asynchronous stage.';
  else if (message.startsWith('Put the rest parameter')) diagnostic.hint = 'Declare fn work(first, ...remaining) with no parameters or comma after the rest parameter.';
  else if (message.startsWith('Use catch or finally')) diagnostic.hint = 'Add catch error { ... }, finally { ... }, or both after the try body.';
  return diagnostic;
}

export interface DiagnosticFix { title: string; code: AryaDiagnostic['code']; start: number; end: number; replacement: string }

/** Only propose edits supported by the current lexical analysis and exact source text. */
export function diagnosticFixes(source: string, diagnostics: readonly AryaDiagnostic[], start = 0, end = source.length): DiagnosticFix[] {
  return diagnostics.flatMap(diagnostic => {
    const token = diagnostic.token;
    if (diagnostic.code !== 'ARYA_UNKNOWN_NAME' || !diagnostic.suggestion || token.end < start || token.start > end || source.slice(token.start, token.end) !== token.text) return [];
    return [{ title: `Change '${token.text}' to '${diagnostic.suggestion}'`, code: diagnostic.code, start: token.start, end: token.end, replacement: diagnostic.suggestion }];
  });
}

/** Preserve UTF-16 locations in data; expand tabs and escape controls in terminal excerpts. */
export function formatDiagnostics(filename: string, source: string | undefined, diagnostics: readonly AryaDiagnostic[]): string {
  const lines = source?.split(/\r?\n/);
  const display = (text: string) => {
    let result = '';
    for (const character of text) {
      if (character === '\t') result += ' '.repeat(4 - result.length % 4);
      else if (/[\x00-\x1f\x7f]/.test(character)) result += '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
      else result += character;
    }
    return result;
  };
  return diagnostics.map(diagnostic => {
    const { token } = diagnostic;
    const output = [`${filename}:${token.line + 1}:${token.column + 1}: ${diagnostic.message} [${diagnostic.code}]`];
    const line = lines?.[token.line];
    if (line !== undefined) {
      const column = Math.min(token.column, line.length);
      const before = display(line.slice(0, column));
      const rendered = display(line);
      const offset = Math.max(0, before.length - 60);
      const left = offset ? '…' : '';
      const excerpt = rendered.slice(offset, offset + 140);
      const gutter = String(token.line + 1);
      const length = Math.max(1, Math.min(40, display(line.slice(column, column + Math.max(1, token.end - token.start))).length));
      output.push(`  ${gutter} | ${left}${excerpt}${rendered.length > offset + 140 ? '…' : ''}`);
      output.push(`  ${' '.repeat(gutter.length)} | ${' '.repeat(before.length - offset + left.length)}${'^'.repeat(length)}`);
    }
    const hint = diagnostic.hint ?? (diagnostic.suggestion ? `Replace '${token.text}' with '${diagnostic.suggestion}', or declare the intended name.` : undefined);
    if (hint) output.push('  help: ' + hint);
    return output.join('\n');
  }).join('\n\n');
}
