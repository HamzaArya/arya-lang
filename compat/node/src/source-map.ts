import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GenMapping, addMapping, setSourceContent, toEncodedMap } from '@jridgewell/gen-mapping';

/** Internal origin annotations compose with the parser's generated fragments.
 * Source literals/paths are JSON-escaped, so they cannot inject raw NUL markers.
 * Markers never reach an output artifact: finalize() consumes them in one pass.
 */
export function origin(token: { line: number; column: number }, text: string): string {
  return `\0${token.line}:${token.column}\0${text}`;
}

export function finalize(annotated: string, source: string, filename: string, outputFilename: string): { code: string; map: string; mapFilename: string } {
  const mapFilename = `${basename(outputFilename)}.map`;
  const path = relative(dirname(resolve(outputFilename)), resolve(filename));
  const sourcePath = isAbsolute(path) ? pathToFileURL(resolve(filename)).href : path.split(sep).map(encodeURIComponent).join('/');
  const map = new GenMapping({ file: basename(outputFilename) });
  setSourceContent(map, sourcePath, source);
  let line = 1, column = 0, previous = 0;
  const parts: string[] = [];
  const append = (text: string) => {
    parts.push(text);
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') { line++; column = 0; } else column++;
    }
  };
  // Origins are recorded during parsing, not recovered by searching identifiers.
  for (const marker of annotated.matchAll(/\0(\d+):(\d+)\0/g)) {
    append(annotated.slice(previous, marker.index));
    addMapping(map, { generated: { line, column }, source: sourcePath, original: { line: Number(marker[1]) + 1, column: Number(marker[2]) } });
    previous = marker.index + marker[0].length;
  }
  append(annotated.slice(previous));
  return { code: parts.join('') + `//# sourceMappingURL=${encodeURIComponent(mapFilename)}\n`, map: JSON.stringify(toEncodedMap(map)) + '\n', mapFilename };
}
