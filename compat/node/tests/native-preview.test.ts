import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rename, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compile, AryaError } from '../src/compiler.js';
import {
  compileNative,
  buildNativePreview,
  verifyNativeIR,
  serializeNativeIR,
} from '../src/native-preview.js';

const enabled = process.env.ARYA_TEST_NATIVE_PREVIEW === '1';
const sdk = { skip: !enabled };
async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'arya native preview '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function javascriptOutput(source: string, root: string): Promise<string> {
  const file = join(root, 'comparison.mjs');
  await writeFile(file, compile(source, join(root, 'comparison.arya')).code);
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function nativeOutput(file: string): string {
  const result = spawnSync(file, [], {
    // The executable must find neither Node nor Python through PATH, NODE_PATH,
    // preload hooks, or Python environment variables.
    env: { PATH: '', LC_ALL: 'C', LANG: 'C' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
async function compare(
  t: TestContext,
  source: string,
  modes: ('debug' | 'release')[] = ['debug', 'release'],
) {
  const root = await workspace(t),
    entry = join(root, 'main.arya');
  await writeFile(entry, source);
  const expected = await javascriptOutput(source, root);
  for (const mode of modes) {
    const output = join(root, 'program-' + mode);
    const result = await buildNativePreview(entry, { output, mode });
    assert.equal(result.output, output);
    assert.equal(result.mode, mode);
    assert.ok(result.bytes > 0);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isFinite(result.buildMs) && result.buildMs >= 0);
    assert.equal(
      nativeOutput(output),
      expected,
      mode + ' output differs from existing JavaScript semantics',
    );
  }
}

test('native compilation produces deterministic verified IR and LLVM without executing source', () => {
  const source = 'const amount: number = 1.5\nprint(amount + 2)';
  const first = compileNative(source, 'invoice.arya'),
    second = compileNative(source, 'invoice.arya');
  verifyNativeIR(first.ir);
  assert.equal(serializeNativeIR(first.ir), serializeNativeIR(second.ir));
  assert.equal(first.llvm, second.llvm);
  assert.match(first.llvm, /define\s+i32\s+@main/);
  assert.doesNotMatch(first.llvm, /execvp|system\(|node:|python3/);
});

test('native unsupported constructs retain source locations and never silently use JavaScript', () => {
  for (const statement of [
    'use js "node:fs" as fs',
    'use python "math" as math',
    'const values = [1, 2]',
    'const value = {amount: 1}',
    'const message = "hello"',
    'fn identity(value) { return value }',
    'fn identity(value: number = 1): number { return value }',
    'if 1 { print(1) }',
    'print("%s", 1)',
  ]) {
    assert.throws(
      () => compileNative('# first line\n' + statement, 'unsupported.arya'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok('token' in error && error.token && typeof error.token === 'object');
        assert.equal((error.token as { line: number }).line, 1, statement);
        return true;
      },
      statement,
    );
  }
  assert.throws(
    () => compileNative('const value = 2\nfn capture(): number { return value }\nprint(capture())'),
    /captur|scope|global|outside/i,
  );
});

test('native front end preserves lexical and static type errors from the shared parser', () => {
  for (const source of [
    'print(missing)',
    'const value = 1\nvalue = 2',
    'const value: number = true',
  ]) {
    assert.throws(
      () => compileNative(source),
      (error: unknown) => error instanceof AryaError,
    );
  }
  assert.throws(() =>
    compileNative(
      'fn partial(value: number): number { if value > 0 { return value } }\nprint(partial(0))',
    ),
  );
});

test('native IR verifier rejects incompatible versions and nonfinite source literals', () => {
  const original = compileNative('const value = 1\nprint(value)').ir;
  assert.throws(() => verifyNativeIR({ ...original, version: 999 } as unknown as typeof original));
  const broken = structuredClone(original);
  const pending: unknown[] = [broken];
  let replaced = false;
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    const node = value as Record<string, unknown>;
    if (node.kind === 'literal' && node.value === 1) {
      node.value = Infinity;
      replaced = true;
      break;
    }
    pending.push(...Object.values(node));
  }
  assert.ok(replaced, 'The literal in the typed IR fixture must be mutated.');
  assert.throws(() => verifyNativeIR(broken));
});

test('native IR verification rejects forged references, mutation contracts and hostile structure', () => {
  const original = compileNative(
    'fn twice(value: number): number { return value * 2 }\nlet amount = 1\namount = 2\nprint(twice(amount))',
  ).ir;
  const unavailable = structuredClone(original);
  const printed = unavailable.body[2];
  assert.ok(printed?.kind === 'print');
  printed.values = [{ kind: 'load', binding: 999999, type: 'number', span: printed.span }];
  assert.throws(() => verifyNativeIR(unavailable));
  const immutable = structuredClone(original),
    declaration = immutable.body[0];
  assert.ok(declaration?.kind === 'declare');
  declaration.mutable = false;
  assert.throws(() => verifyNativeIR(immutable));
  const badCall = structuredClone(original),
    callPrint = badCall.body[2];
  assert.ok(callPrint?.kind === 'print');
  const call = callPrint.values[0];
  assert.ok(call?.kind === 'call');
  call.arguments = [];
  assert.throws(() => verifyNativeIR(badCall));
  const duplicate = structuredClone(original);
  duplicate.functions.push(structuredClone(duplicate.functions[0]!));
  assert.throws(() => verifyNativeIR(duplicate));
  const cycle = structuredClone(original);
  Object.assign(cycle, { cycle });
  assert.throws(() => verifyNativeIR(cycle), /acyclic|limit/i);
  const accessor = structuredClone(original);
  let executed = false;
  Object.defineProperty(accessor, 'surprise', {
    get() {
      executed = true;
      throw new Error('getter ran');
    },
  });
  assert.throws(() => verifyNativeIR(accessor), /accessor/i);
  assert.equal(executed, false);
});

test('native IR serialization preserves negative zero and is independent of object key order', () => {
  const original = compileNative('const value = 0\nprint(value)').ir;
  const negative = structuredClone(original),
    statement = negative.body[0];
  assert.ok(statement?.kind === 'declare' && statement.value.kind === 'literal');
  statement.value.value = -0;
  assert.notEqual(serializeNativeIR(negative), serializeNativeIR(original));
  const reordered = Object.fromEntries(
    Object.entries(original).reverse(),
  ) as unknown as typeof original;
  assert.equal(serializeNativeIR(reordered), serializeNativeIR(original));
});

test(
  'native debug/release functions, loops, lexical shadowing and recursion agree with JavaScript',
  sdk,
  async (t) => {
    await compare(
      t,
      `
fn factorial(value: number): number {
  if value <= 1 { return 1 }
  return value * factorial(value - 1)
}
fn positive(value: number): boolean { return value > 0 }
let count: number = 0
let total: number = 0
while count < 7 {
  total = total + factorial(count)
  count = count + 1
}
if positive(total) { const total: number = 42; print(total) } else { print(0) }
print(total, count, positive(total))
`,
    );
  },
);

test(
  'native floating point values, comparisons, formatting and remainder agree with JavaScript',
  sdk,
  async (t) => {
    await compare(
      t,
      `
print(0.1 + 0.2, -0, 1 / 0, -1 / 0, 0 / 0)
print(0.000001, 0.0000001, 1e20, 1e21, 5e-324)
print(1.7976931348623157e308, 1e308 * 10, 1e-300 * 1e-300)
print(9007199254740992 + 1, -5 % 2, 5 % -2, -4 % 2)
print((0 / 0) == (0 / 0), (0 / 0) != (0 / 0), (0 / 0) < 1)
print((0 / 0) <= 1, (0 / 0) > 1, (0 / 0) >= 1, -0 == 0)
`,
    );
  },
);

test(
  'native short circuit and argument evaluation preserve visible effect order',
  sdk,
  async (t) => {
    await compare(
      t,
      `
fn observe(value: number): number { print(value); return value }
fn truth(value: boolean): boolean { print(value); return value }
print(observe(1) + observe(2))
print(observe(3), observe(4))
print(false and truth(true), true or truth(false))
print(true and truth(false), false or truth(true))
print(not false, !true)
`,
    );
  },
);

test('native literal output retains UTF-8, embedded NUL and string spacing', sdk, async (t) => {
  await compare(
    t,
    'print("سلام Arya 🌍")\nprint("stats", 1, true, "done")\nprint("%s")\nprint("zero' +
      String.fromCharCode(0) +
      'byte")\nprint()',
    ['release'],
  );
});

test('seeded arithmetic native programs agree with the JavaScript backend', sdk, async (t) => {
  let seed = 0x4e415449;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const expression = (depth: number): string => {
    if (!depth) return String(((next() % 2001) - 1000) / 10);
    const op = ['+', '-', '*', '/', '%'][next() % 5]!;
    return `(${expression(depth - 1)} ${op} ${expression(depth - 1)})`;
  };
  const source = Array.from({ length: 80 }, () => 'print(' + expression(3) + ')').join('\n');
  await compare(t, source);
});

test(
  'seeded finite binary64 literals retain their bits and printed representation',
  sdk,
  async (t) => {
    let seed = 0x42495453;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const bytes = Buffer.alloc(8),
      statements: string[] = [];
    while (statements.length < 256) {
      bytes.writeUInt32LE(next(), 0);
      bytes.writeUInt32LE(next(), 4);
      const value = bytes.readDoubleLE();
      if (Number.isFinite(value)) statements.push('print(' + String(value) + ')');
    }
    await compare(t, statements.join('\n'), ['release']);
  },
);

test('native executable relocates and runs without source, Node or Python', sdk, async (t) => {
  const root = await workspace(t),
    entry = join(root, 'main.arya'),
    output = join(root, 'hello');
  await writeFile(entry, 'print("Hello from Arya native")');
  await buildNativePreview(entry, { output, mode: 'release' });
  const bytes = await readFile(output),
    magic = bytes.subarray(0, 4).toString('hex');
  assert.ok(
    ['cffaedfe', 'feedfacf', '7f454c46'].includes(magic),
    'Expected Mach-O or ELF executable, got ' + magic,
  );
  const relocated = join(root, 'relocated');
  await mkdir(relocated);
  const executable = join(relocated, 'hello');
  await rename(output, executable);
  await rm(entry);
  assert.equal(nativeOutput(executable), 'Hello from Arya native\n');
  const tool = process.platform === 'darwin' ? '/usr/bin/otool' : 'ldd';
  const result = spawnSync(
    tool,
    process.platform === 'darwin' ? ['-L', executable] : [executable],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /libnode|python|node_modules/i);
  assert.deepEqual(await readdir(relocated), ['hello']);
});

test(
  'native builds refuse existing outputs and leave failed destinations absent',
  sdk,
  async (t) => {
    const root = await workspace(t),
      entry = join(root, 'main.arya'),
      output = join(root, 'app');
    await writeFile(entry, 'print(42)');
    await writeFile(output, 'existing application');
    await assert.rejects(buildNativePreview(entry, { output }));
    assert.equal(await readFile(output, 'utf8'), 'existing application');
    const failed = join(root, 'failed');
    await assert.rejects(
      buildNativePreview(entry, { output: failed, compiler: join(root, 'no-such-compiler') }),
    );
    await assert.rejects(readFile(failed), { code: 'ENOENT' });
    assert.deepEqual((await readdir(root)).sort(), ['app', 'main.arya']);
    const compiler = join(root, 'failing-compiler');
    await writeFile(
      compiler,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "clang version test\\n"; exit 0; fi\nfor last do :; done\nprintf partial > "$last"\nexit 1\n',
      { mode: 0o755 },
    );
    await assert.rejects(
      buildNativePreview(entry, { output: failed, compiler }),
      /compilation\/linking failed/i,
    );
    await assert.rejects(readFile(failed), { code: 'ENOENT' });
    assert.deepEqual((await readdir(root)).sort(), ['app', 'failing-compiler', 'main.arya']);
  },
);

test(
  'unsupported native sources are rejected before invoking an external compiler',
  sdk,
  async (t) => {
    const root = await workspace(t),
      entry = join(root, 'main.arya'),
      output = join(root, 'app');
    const compiler = join(root, 'compiler'),
      touched = join(root, 'compiler-ran');
    const quoted = "'" + touched.replaceAll("'", "'\\''") + "'";
    await writeFile(compiler, '#!/bin/sh\ntouch ' + quoted + '\nexit 1\n', { mode: 0o755 });
    await writeFile(entry, 'const value = [1, 2]\nprint(value)');
    await assert.rejects(buildNativePreview(entry, { output, compiler }));
    await assert.rejects(readFile(touched), { code: 'ENOENT' });
    await assert.rejects(readFile(output), { code: 'ENOENT' });
  },
);

test('native CLI builds through the explicitly selected preview command', sdk, async (t) => {
  const root = await workspace(t),
    entry = join(root, 'main.arya'),
    output = join(root, 'cli app');
  await writeFile(entry, 'print("CLI native", 42)');
  const result = spawnSync(
    process.execPath,
    [resolve('dist/cli.cjs'), 'native', entry, '--output', output, '--release'],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(nativeOutput(output), 'CLI native 42\n');
});
