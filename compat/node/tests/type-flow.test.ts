import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSource, compile } from '../src/compiler.js';

const errors = (source: string) => analyzeSource(source).diagnostics;

test('assignments respect the declared union and replace the current narrowing', () => {
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; row = null; return 0 }',
    ),
    [],
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; row = null; return row.n }',
    )[0]!.message,
    /null/,
  );
  assert.deepEqual(
    errors('fn f(row: {n: number} | null): number { row = {n: 2}; return row.n }'),
    [],
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null, other: {n: number} | null): number { row = other; return row.n }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors('fn f(): number { let n: number = 1; n += "x"; return n }')[0]!.message,
    /number/,
  );
  assert.match(
    errors('fn f(): number { let n: number | null = null; n += 1; return n }')[0]!.message,
    /number/,
  );
});

test('continuing branches merge assignments while terminating branches stay separate', () => {
  const unsafe =
    'fn f(row: {n: number} | null, flag: boolean): number { guard row != null else { return 0 }; if flag { row = null }; return row.n }';
  assert.match(errors(unsafe)[0]!.message, /null/);
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null, flag: boolean): number { if flag { row = {n: 1} } else { row = {n: 2} }; return row.n }',
    ),
    [],
  );
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null, flag: boolean): number { guard row != null else { return 0 }; if flag { row = null; return 0 }; return row.n }',
    ),
    [],
  );
});

test('loop back edges invalidate writes and the condition restores safe narrowing', () => {
  assert.match(
    errors(
      'fn f(row: {n: number} | null, flag: boolean): number { guard row != null else { return 0 }; while flag { print(row.n); row = null }; return 0 }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; for n in [1] { row = null }; return row.n }',
    )[0]!.message,
    /null/,
  );
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null): number { while row != null { print(row.n); row = null }; return 0 }',
    ),
    [],
  );
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; while false { row = null }; return row.n }',
    ),
    [],
  );
});

test('closures, calls and await cannot retain a captured writable narrowing', () => {
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; fn reset() { row = null }; reset(); return row.n }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; const later = fn(): number => row.n; row = null; return later() }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'async fn f(row: {n: number} | null): number { guard row != null else { return 0 }; fn reset() { row = null }; const pending: any = Promise.resolve(); await pending; return row.n }',
    )[0]!.message,
    /null/,
  );
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; const stable = row; fn later(): number => stable.n; return later() }',
    ),
    [],
  );
});

test('exception paths and finally invalidate stale writes', () => {
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; try { row = null; throw "x" } catch err { return row.n } }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; try { row = null } finally { print(row.n) }; return 0 }',
    )[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; try { print(1) } finally { row = null }; return row.n }',
    )[0]!.message,
    /null/,
  );
});

test('strict undefined guards and short circuit conditions narrow each executed path', () => {
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | null | undefined): number { if row != null and row != undefined { return row.n }; return 0 }',
    ),
    [],
  );
  assert.deepEqual(
    errors(
      'fn f(row: {n: number} | undefined): number { if row == undefined { return 0 } else { return row.n } }',
    ),
    [],
  );
  assert.deepEqual(
    errors('fn f(row: {n: number} | null): boolean => row != null and row.n > 0'),
    [],
  );
  assert.match(
    errors('fn f(row: {n: number} | null): boolean => row == null and row.n > 0')[0]!.message,
    /null/,
  );
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { fn reset(): boolean { row = null; return true }; if row != null and reset() { return row.n }; return 0 }',
    )[0]!.message,
    /null/,
  );
});

test('mutable aliases cannot widen record fields or array elements', () => {
  for (const source of [
    'const narrow = {n: 1}\nconst wide: {n: number | null} = narrow',
    'const narrow: number[] = [1]\nconst wide: unknown[] = narrow',
    'fn mutate(row: {n: number | null}) { row.n = null }\nconst narrow = {n: 1}\nmutate(narrow)',
    'fn widen(row: {n: number}): {n: number | null} => row',
    'const narrow = {nested: {n: 1}}\nconst wide: {nested: {n: number | null}} = {nested: narrow.nested}',
  ])
    assert.equal(errors(source)[0]?.code, 'ARYA_TYPE', source);
  assert.deepEqual(errors('const wide: {n: number | null} = {n: 1}\nwide.n = null'), []);
  assert.deepEqual(errors('const wide: unknown[] = [1]\nwide[0] = null'), []);
  assert.equal(errors('const values: number[] = [1]\nvalues[0] = undefined')[0]?.code, 'ARYA_TYPE');
  assert.equal(
    errors(
      'let wide: {n: number | null} = {n: 1}\nwide = {n: 2}\nconst narrow: {n: number} = wide',
    )[0]?.code,
    'ARYA_TYPE',
  );
});

test('accepted flow programs agree with runtime and preserve public contracts', async () => {
  const output = compile(`
export fn choose(row: {n: number} | null, flag: boolean): number {
  if flag { row = {n: 1} } else { row = {n: 2} }
  return row.n
}
export let value: number | null = 1
value = null
export fn read(): number { let n: number = 1; n += 2; return n }
`);
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(output.code).toString('base64')
  );
  assert.equal(module.choose(null, true), 1);
  assert.equal(module.choose(null, false), 2);
  assert.equal(module.value, null);
  assert.equal(module.read(), 3);
  assert.match(output.typing.declarations, /value: number \| null/);
});

test('array length and callable returns cannot hide mutable writes', () => {
  assert.equal(
    errors('const values: string[] = ["x"]\nvalues.length = "bad"')[0]?.code,
    'ARYA_TYPE',
  );
  assert.deepEqual(errors('const values: string[] = ["x"]\nvalues.length = 0'), []);
  assert.equal(
    errors(
      'const row = {n: 1}\nconst get = fn(): {n: number} => row\nconst widened: fn(): {n: number | null} = get',
    )[0]?.code,
    'ARYA_TYPE',
  );
});

test('default callbacks contribute captured-write effects', () => {
  assert.match(
    errors(
      'fn f(row: {n: number} | null): number { guard row != null else { return 0 }; fn reset(cb = fn() { row = null }) { cb() }; reset(); return row.n }',
    )[0]!.message,
    /null/,
  );
});
