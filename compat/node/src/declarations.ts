import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tokenize } from './compiler.js';
import { nullable, type Type } from './type-model.js';

const maximumBytes = 256 * 1024;
const unknown: Type = { kind: 'unknown' };
type Signature = Type & { kind: 'function' };
const failure = () => new Error('Unsupported declaration');

// Alias sharing can expand exponentially during diagnostics/declaration printing.
// Count expanded paths rather than unique objects, before exposing a contract.
function withinTypeBudget(value: Type): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 5000 || depth > 30) return false;
    let children: Type[] = [];
    if (value.kind === 'array' || value.kind === 'promise') children = [value.value];
    if (value.kind === 'record') children = Object.values(value.fields).map((field) => field.type);
    if (value.kind === 'union') children = value.values;
    if (value.kind === 'overload') children = value.signatures;
    if (value.kind === 'function') children = [...value.parameters, value.result];
    for (const child of children) pending.push({ value: child, depth: depth + 1 });
  }
  return true;
}

/** Parse a bounded declaration subset without loading a package or TypeScript. */
class DeclarationReader {
  private index = 0;
  private aliases = new Map<string, Type>();
  private values = new Map<string, Type>();
  private exports = new Map<string, string>();
  private defaultExport: string | undefined;
  private directDefault: Type | undefined;
  constructor(private tokens: string[]) {}

  private take(text: string): boolean {
    if (this.tokens[this.index] !== text) return false;
    this.index++;
    return true;
  }
  private expect(text: string): void {
    if (!this.take(text)) throw failure();
  }
  private identifier(): string {
    const name = this.tokens[this.index++];
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) throw failure();
    return name;
  }
  private parameters(depth: number): Signature {
    this.expect('(');
    const parameters: Type[] = [],
      optional: boolean[] = [];
    let rest: Type | undefined;
    while (!this.take(')')) {
      const variadic = this.take('...');
      this.identifier();
      optional.push(this.take('?'));
      this.expect(':');
      const value = this.readType(depth + 1);
      parameters.push(value);
      if (variadic) {
        if (value.kind !== 'array') throw failure();
        rest = value;
        this.expect(')');
        break;
      }
      if (this.take(')')) break;
      this.expect(',');
    }
    return { kind: 'function', parameters, optional, result: unknown, ...(rest ? { rest } : {}) };
  }
  private readType(depth = 0): Type {
    if (depth > 30) throw failure();
    let value: Type;
    this.take('readonly');
    if (this.take('{')) {
      const fields: Record<string, { type: Type; optional: boolean }> = Object.create(null);
      while (!this.take('}')) {
        this.take('readonly');
        const name = this.identifier(),
          optional = this.take('?');
        let member: Type;
        if (this.tokens[this.index] === '(') {
          const fn = this.parameters(depth);
          this.expect(':');
          fn.result = this.readType(depth + 1);
          member = fn;
        } else {
          this.expect(':');
          member = this.readType(depth + 1);
        }
        if (fields[name]) throw failure();
        fields[name] = { type: member, optional };
        if (!this.take(';') && !this.take(',') && this.tokens[this.index] !== '}') throw failure();
      }
      value = { kind: 'record', fields };
    } else if (this.tokens[this.index] === '(') {
      const saved = this.index;
      try {
        const fn = this.parameters(depth);
        this.expect('=>');
        fn.result = this.readType(depth + 1);
        value = fn;
      } catch {
        this.index = saved;
        this.expect('(');
        value = this.readType(depth + 1);
        this.expect(')');
      }
    } else {
      const name = this.identifier();
      if (['Promise', 'Array', 'ReadonlyArray'].includes(name)) {
        this.expect('<');
        value = { kind: name === 'Promise' ? 'promise' : 'array', value: this.readType(depth + 1) };
        this.expect('>');
      } else if (
        [
          'number',
          'string',
          'boolean',
          'null',
          'undefined',
          'void',
          'unknown',
          'any',
          'never',
        ].includes(name)
      )
        value = { kind: name as 'number' };
      else {
        const alias = this.aliases.get(name);
        if (!alias) throw failure();
        value = alias;
      }
    }
    while (this.take('[')) {
      this.expect(']');
      value = { kind: 'array', value };
    }
    if (this.take('|')) {
      const right = this.readType(depth + 1);
      value = {
        kind: 'union',
        values: [value, ...(right.kind === 'union' ? right.values : [right])],
      };
    }
    return value;
  }
  private addValue(name: string, value: Type, overload = false): void {
    const previous = this.values.get(name);
    if (previous) {
      if (
        !overload ||
        value.kind !== 'function' ||
        !['function', 'overload'].includes(previous.kind)
      )
        throw failure();
      const signatures =
        previous.kind === 'overload'
          ? previous.signatures
          : previous.kind === 'function'
            ? [previous]
            : [];
      if (signatures.length >= 64) throw failure();
      this.values.set(name, { kind: 'overload', signatures: [...signatures, value] });
    } else this.values.set(name, value);
  }
  read(): Type | undefined {
    while (this.index < this.tokens.length) {
      if (this.take(';')) continue;
      const exported = this.take('export');
      if (exported && this.take('=')) {
        if (this.defaultExport || this.directDefault) throw failure();
        this.defaultExport = this.identifier();
        this.take(';');
        continue;
      }
      const isDefault = exported && this.take('default');
      this.take('declare');
      if (exported && this.take('{')) {
        while (!this.take('}')) {
          const local = this.identifier(),
            name = this.take('as') ? this.identifier() : local;
          if (name === 'default') this.defaultExport = local;
          else this.exports.set(name, local);
          if (this.take('}')) break;
          this.expect(',');
        }
        this.take(';');
        continue;
      }
      if (this.take('type')) {
        const name = this.identifier();
        this.expect('=');
        this.aliases.set(name, this.readType());
        this.take(';');
      } else if (this.take('interface')) {
        const name = this.identifier();
        this.aliases.set(name, this.readType());
        this.take(';');
      } else if (this.take('function')) {
        const name = this.tokens[this.index] === '(' ? undefined : this.identifier();
        if (!name && !isDefault) throw failure();
        const fn = this.parameters(0);
        this.expect(':');
        fn.result = this.readType();
        this.take(';');
        if (name) {
          this.addValue(name, fn, true);
          if (isDefault) this.defaultExport = name;
          else if (exported) this.exports.set(name, name);
        } else {
          if (this.directDefault || this.defaultExport) throw failure();
          this.directDefault = fn;
        }
      } else if (this.take('const') || this.take('let') || this.take('var')) {
        if (isDefault) throw failure();
        const name = this.identifier();
        this.expect(':');
        this.addValue(name, this.readType());
        this.take(';');
        if (exported) this.exports.set(name, name);
      } else if (isDefault) {
        this.defaultExport = this.identifier();
        this.take(';');
      } else throw failure();
    }
    const defaultValue =
      this.directDefault ?? (this.defaultExport ? this.values.get(this.defaultExport) : undefined);
    // Arya imports use namespace.default ?? namespace at runtime.
    if (this.directDefault || this.defaultExport) {
      if (!defaultValue || nullable(defaultValue)) return undefined;
      return defaultValue;
    }
    const fields: Record<string, { type: Type; optional: boolean }> = Object.create(null);
    for (const [name, local] of this.exports) {
      const value = this.values.get(local);
      if (!value) throw failure();
      fields[name] = { type: value, optional: false };
    }
    return Object.keys(fields).length ? { kind: 'record', fields } : undefined;
  }
}

/** Unsupported files remain an unknown boundary; partial declarations are discarded. */
export function declarationModuleType(source: string, moduleName?: string): Type | undefined {
  if (Buffer.byteLength(source) > maximumBytes) return undefined;
  const tokens: string[] = [];
  const scanner =
    /\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[A-Za-z_$][\w$]*|\.\.\.|=>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}()[\]:;,?<>|=.]/gy;
  let position = 0;
  while (position < source.length) {
    scanner.lastIndex = position;
    const match = scanner.exec(source);
    if (!match) return undefined;
    position = scanner.lastIndex;
    if (!/^\s|^\/\//.test(match[0]) && !match[0].startsWith('/*')) tokens.push(match[0]);
    if (tokens.length > 50_000) return undefined;
  }
  if (tokens[0] === 'declare' && tokens[1] === 'module') {
    const name = tokens[2];
    if (
      !name ||
      !['"', "'"].includes(name[0]!) ||
      tokens[3] !== '{' ||
      tokens.at(-1) !== '}' ||
      (moduleName && name.slice(1, -1) !== moduleName)
    )
      return undefined;
    tokens.splice(0, 4);
    tokens.pop();
  }
  try {
    const value = new DeclarationReader(tokens).read();
    return value && withinTypeBudget(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function boundedText(filename: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximumBytes) return undefined;
    const buffer = Buffer.alloc(maximumBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    return size > maximumBytes ? undefined : buffer.subarray(0, size).toString('utf8');
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

async function findDeclaration(specifier: string, from: string): Promise<string | undefined> {
  if (specifier.startsWith('node:')) return undefined;
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const path = resolve(dirname(from), specifier),
      stem = path.replace(/\.(?:mjs|cjs|js)$/, '');
    const extensions = path.endsWith('.mjs')
      ? ['.d.mts', '.d.ts', '.d.cts']
      : path.endsWith('.cjs')
        ? ['.d.cts', '.d.ts', '.d.mts']
        : ['.d.ts', '.d.mts', '.d.cts'];
    for (const candidate of [
      ...extensions.map((extension) => stem + extension),
      join(path, 'index.d.ts'),
    ])
      if ((await boundedText(candidate)) !== undefined) return candidate;
    return undefined;
  }
  const pieces = specifier.split('/'),
    packageName = pieces.splice(0, specifier.startsWith('@') ? 2 : 1).join('/');
  if (!packageName || specifier.includes('\\') || pieces.some((p) => !p || p === '.' || p === '..'))
    return undefined;
  for (let directory = dirname(resolve(from)); ;) {
    const root = join(directory, 'node_modules', packageName),
      manifestText = await boundedText(join(root, 'package.json'));
    if (manifestText) {
      try {
        const manifest = JSON.parse(manifestText) as {
          types?: string;
          typings?: string;
          exports?: unknown;
        };
        const types = (entry: unknown): string | undefined => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
          const fields = entry as Record<string, unknown>;
          if (typeof fields.types === 'string') return fields.types;
          return types(fields.import) ?? types(fields.require) ?? types(fields.default);
        };
        const exports = manifest.exports as Record<string, unknown> | undefined;
        const declared =
          types(
            exports?.[pieces.length ? './' + pieces.join('/') : '.'] ??
              (!pieces.length ? exports : undefined),
          ) ?? (!pieces.length ? (manifest.types ?? manifest.typings) : undefined);
        const candidate = declared ?? (pieces.length ? pieces.join('/') + '.d.ts' : 'index.d.ts');
        if (
          typeof candidate === 'string' &&
          !isAbsolute(candidate) &&
          !candidate.split(/[\\/]/).includes('..')
        )
          return join(root, candidate);
      } catch {
        return undefined;
      }
      return undefined;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** Resolve declaration files only, never JavaScript modules or package entry points. */
export async function externalModuleTypes(
  source: string,
  filename: string,
  cache = new Map<string, Promise<Type | undefined>>(),
): Promise<Record<string, Type>> {
  if (!/\buse\s+js\b/.test(source)) return {};
  let tokens;
  try {
    tokens = tokenize(source);
  } catch {
    return {};
  }
  const result: Record<string, Type> = Object.create(null);
  for (let i = 0; i < tokens.length - 3; i++) {
    if (
      tokens[i]?.kind !== 'word' ||
      tokens[i]?.text !== 'use' ||
      tokens[i + 1]?.text !== 'js' ||
      tokens[i + 2]?.kind !== 'string'
    )
      continue;
    const specifier = tokens[i + 2]!.text,
      key = dirname(filename) + '\0' + specifier;
    let pending = cache.get(key);
    if (!pending) {
      pending = (async () => {
        const path = await findDeclaration(specifier, filename),
          text = path && (await boundedText(path));
        return text ? declarationModuleType(text, specifier) : undefined;
      })();
      cache.set(key, pending);
    }
    const type = await pending;
    if (type) result[specifier] = type;
  }
  return result;
}
