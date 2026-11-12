// Independent ECMAScript JSON oracle; optional host only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const compiler = process.env.ARYA_NATIVE_BIN || join(root, '.build/independent/arya');
const dir = mkdtempSync(join(root, '.build/json-reference.'));
try {
  writeFileSync(join(dir, 'main.arya'), `use std "io" as io
use std "json" as json
while true { let line = io.readLine(); if line == null { break }; let input: any = json.parse(line)
  try { print(json.stringify({ok: json.stringify(json.parse(input))})) }
  catch error { print(json.stringify({error: error.name})) }
}\n`);
  const build = spawnSync(compiler, ['build', join(dir, 'main.arya'), '-o', join(dir, 'program'), '--debug', '--sanitize'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  let state = 0x41525941;
  const random = n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
  const strings = ['', 'plain', '\0', '\"\\\b\f\n\r\t', 'فارسی', '😀', '\ud800', '\udc00', '__proto__', 'balance', 'a'.repeat(4096)];
  function value(depth) {
    const k = random(depth > 4 ? 4 : 6);
    if (k === 0) return strings[random(strings.length)];
    if (k === 1) return (random(2000001) - 1000000) / 1000;
    if (k === 2) return random(2) === 0;
    if (k === 3) return null;
    if (k === 4) return Array.from({ length: random(5) }, () => value(depth + 1));
    return Object.fromEntries(Array.from({ length: random(5) }, () => [strings[random(strings.length)], value(depth + 1)]));
  }
  const cases = ['-0', '1e400', '-1e400', '1e-400', '1.7976931348623157e308', '5e-324',
    '"\\uD800"', '"\\uDC00"', '"\\uD83D\\uDE00"', '{"a":1,"a":2,"1":3,"0":4}',
    ...['', 'undefined', 'NaN', 'Infinity', '[1,]', '{"x":}', '01', '-01', '1.', '1e+', '"a\0b"', '"\\uXYZW"', '"\\x20"', '"\\', '[]x']];
  for (let i = 0; i < 700; i++) { const encoded = JSON.stringify(value(0)); cases.push(encoded); if (encoded.length > 1) cases.push(encoded.slice(0, -1)); }
  const expected = cases.map(text => { try { return { ok: JSON.stringify(JSON.parse(text)) }; } catch (error) { return { error: error.name }; } });
  const result = spawnSync(join(dir, 'program'), [], { input: cases.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8', timeout: 120000,
    maxBuffer: 32 * 1024 * 1024, env: { PATH: '/nonexistent', ARYA_GC_STRESS: '1', ASAN_OPTIONS: 'detect_leaks=0', UBSAN_OPTIONS: 'halt_on_error=1' } });
  assert.equal(result.status, 0, result.stderr);
  const actual = result.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.deepEqual(actual, expected);
  console.log(`JSON: ${cases.length} Node reference cases passed with ASan/UBSan and GC stress`);
} finally { rmSync(dir, { recursive: true, force: true }); }
