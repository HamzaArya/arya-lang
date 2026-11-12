import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { analyzeSource, compile } from '../src/compiler.js';
import { declarationModuleType, externalModuleTypes } from '../src/declarations.js';
import { buildProject, writeProject } from '../src/project.js';
import { signatureAt, typedCompletions } from '../src/workspace-service.js';
import { analyze } from '../src/language-service.js';

test('default, CommonJS, local export aliases and single ambient modules match Arya import semantics', () => {
  for (const source of [
    'export default function escape(value: string): string;',
    'export default function(value: string): string;',
    'declare function escape(value: string): string; export = escape;',
    'declare const escape: (value: string) => string; export default escape;',
    'declare function escape(value: string): string; export {escape as default};',
    'declare module "escape" { const escape: (value: string) => string; export = escape; }',
  ]) {
    const contract = declarationModuleType(source, 'escape');
    assert.equal(contract?.kind, 'function', source);
    assert.equal(
      analyzeSource('use js "escape" as escape\nconst text: string = escape(1)', 'main.arya', {
        escape: contract!,
      }).diagnostics[0]?.code,
      'ARYA_TYPE',
    );
  }
  assert.equal(
    declarationModuleType('declare module "other" {export const n: number;}', 'escape'),
    undefined,
  );
  assert.equal(
    declarationModuleType('declare const empty: null; export default empty;'),
    undefined,
  );
  assert.equal(
    declarationModuleType('export default function f():number; export class Unsupported {}'),
    undefined,
  );
});

test('overloads select a compatible signature and keep return types and editor signatures', () => {
  const api = declarationModuleType(
    'export function convert(value: number): string; export function convert(value: string): number;',
  )!;
  const options = { moduleTypes: { api } };
  assert.deepEqual(
    analyzeSource(
      'use js "api" as api\nconst text: string = api.convert(2)\nconst n: number = api.convert("2")',
      'main.arya',
      options.moduleTypes,
    ).diagnostics,
    [],
  );
  assert.match(
    analyzeSource(
      'use js "api" as api\nconst n: number = api.convert(2)',
      'main.arya',
      options.moduleTypes,
    ).diagnostics[0]!.message,
    /string/,
  );
  for (const arguments_ of ['true', '', '1, 2'])
    assert.match(
      analyzeSource(
        'use js "api" as api\nconst n: number = api.convert(' + arguments_ + ')',
        'main.arya',
        options.moduleTypes,
      ).diagnostics[0]!.message,
      /overload/,
    );
  const source = 'use js "api" as api\napi.convert(2)',
    analysis = analyze(source, 'file:///main.arya', options);
  assert.match(signatureAt(source, source.indexOf('2)'), analysis)!.label, /string.*number/);
  assert.equal(
    typedCompletions(source, source.indexOf('convert') + 2, analysis).find(
      (value) => value.label === 'convert',
    )?.kind,
    'function',
  );
});

test('real pinned npm ESM and CommonJS declarations work without handwritten boundaries', async (t) => {
  await mkdir('.build', { recursive: true });
  const root = await mkdtemp(resolve('.build/npm-types-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'main.arya');
  const source =
    'use js "escape-string-regexp" as escape\nuse js "fast-deep-equal" as equal\nexport const text: string = escape("a.b")\nexport const same: boolean = equal({n: 1}, {n: 1})';
  await writeFile(file, source);
  const output = await writeProject(await buildProject(file));
  const module = await import(pathToFileURL(output).href);
  assert.equal(module.text, 'a\\.b');
  assert.equal(module.same, true);
  await writeFile(file, source.replace('escape("a.b")', 'escape(123)'));
  await assert.rejects(buildProject(file), /Expected string, received number/);
  await writeFile(file, source.replace('same: boolean', 'same: number'));
  await assert.rejects(buildProject(file), /Expected number, received boolean/);
});

test('declaration checking never executes default or CommonJS package entry points', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'arya-passive-declarations-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, 'node_modules', 'passive');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'passive', main: 'index.cjs', types: 'index.d.ts' }),
  );
  await writeFile(join(pkg, 'index.cjs'), 'throw new Error("MUST NOT EXECUTE")');
  await writeFile(
    join(pkg, 'index.d.ts'),
    'declare function f(n: number): number; declare function f(n: string): string; export = f;',
  );
  const source = 'use js "passive" as f\nexport const n: number = f(1)',
    file = join(root, 'main.arya');
  await writeFile(file, source);
  assert.ok(await buildProject(file));
  await writeFile(join(pkg, 'index.d.ts'), 'export default function f(n: number): number;');
  assert.equal((await externalModuleTypes(source, file)).passive?.kind, 'function');
});

test('unsupported generic and external contracts fall back together and file bounds remain enforced', () => {
  for (const source of [
    'export function identity<T>(value:T):T;',
    'export function f(value: MissingType): number;',
    'export {value} from "other";',
    'export default function f(...values: number): number;',
    'export class Row {}',
    ' '.repeat(256 * 1024 + 1),
    'export const value: ' + '('.repeat(40) + 'string' + ')'.repeat(40) + ';',
    Array.from({ length: 65 }, () => 'export function f(n:number):number;').join('\n'),
  ])
    assert.equal(declarationModuleType(source), undefined, source.slice(0, 80));
});

test('exported overloaded callables produce declarations accepted by TypeScript', async (t) => {
  const api = declarationModuleType(
    'export function f(cb: (n: number) => number): string; export function f(n: string): number;',
  )!;
  const output = compile('use js "api" as api\nexport const convert = api.f', {
    filename: 'main.arya',
    outputFilename: 'main.mjs',
    moduleTypes: { api },
  });
  const root = await mkdtemp(join(tmpdir(), 'arya-overload-declarations-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'contract.ts'),
    output.typing.declarations +
      '\nconst text: string = convert(n => n + 1);\nconst n: number = convert("2");\n// @ts-expect-error Boolean is not an overload.\nconvert(true);\n',
  );
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, types: [], lib: ['es2022'] },
      files: ['contract.ts'],
    }),
  );
  const checked = spawnSync(
    process.execPath,
    [resolve('node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.json')],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.ifError(checked.error);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});

test(
  'declaration discovery refuses special files without blocking',
  { skip: process.platform === 'win32', timeout: 3000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'arya-declaration-fifo-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync('mkfifo', [join(root, 'local.d.ts')], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      Object.keys(
        await externalModuleTypes('use js "./local.js" as local', join(root, 'main.arya')),
      ),
      [],
    );
  },
);

test('alias expansion is bounded before type serialization', () => {
  const aliases = Array.from(
    { length: 25 },
    (_, i) =>
      `type T${i} = {left: ${i ? 'T' + (i - 1) : 'number'}; right: ${i ? 'T' + (i - 1) : 'number'}};`,
  ).join('\n');
  assert.equal(declarationModuleType(aliases + '\nexport const value: T24;'), undefined);
  const deep = Array.from(
    { length: 40 },
    (_, i) => `type T${i} = {next: ${i ? 'T' + (i - 1) : 'number'}};`,
  ).join('\n');
  assert.equal(declarationModuleType(deep + '\nexport const value: T39;'), undefined);
});
