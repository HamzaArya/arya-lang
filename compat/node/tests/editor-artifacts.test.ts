import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { strToU8, unzipSync, zipSync } from 'fflate';

interface ArchiveHelper {
  archiveEpoch(value?: string): number;
  deterministicZip(files: Record<string, Uint8Array>, epoch?: number): Uint8Array;
  normalizeVsix(bytes: Uint8Array, epoch?: number): Uint8Array;
}
const helper = async () => await import(pathToFileURL(resolve('scripts/editor-archive.mjs')).href) as ArchiveHelper;

function centralEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: { name: string; mode: number; time: number; date: number }[] = [];
  // Test archives have no archive comment; use the standard end record offset.
  let offset = view.getUint32(bytes.length - 6, true);
  while (view.getUint32(offset, true) === 0x02014b50) {
    const length = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
    entries.push({ name, mode: view.getUint32(offset + 38, true) >>> 16, time: view.getUint16(offset + 12, true), date: view.getUint16(offset + 14, true) });
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return entries;
}

test('editor archives have canonical entry order/timestamps and retain executable Node payloads', async t => {
  const { deterministicZip, normalizeVsix, archiveEpoch } = await helper();
  const script = strToU8('#!/usr/bin/env node\nconsole.log("archive works");\n');
  const files = { 'extension/readme.txt': strToU8('سلام 🌉\n'), 'extension/bin/arya.cjs': script, 'extension/': new Uint8Array() };
  const first = deterministicZip(files, archiveEpoch(''));
  const second = deterministicZip({ 'extension/': files['extension/'], 'extension/bin/arya.cjs': script, 'extension/readme.txt': files['extension/readme.txt'] }, archiveEpoch(''));
  assert.deepEqual(first, second, 'insertion or filesystem order must not affect bytes');
  assert.deepEqual(unzipSync(first), files);
  const entries = centralEntries(first);
  assert.deepEqual(entries.map(item => item.name), ['extension/', 'extension/bin/arya.cjs', 'extension/readme.txt']);
  assert.ok(entries.every(item => item.time === 0 && item.date === 33), 'default timestamp must be 1980-01-01 00:00:00');
  assert.equal(entries.find(item => item.name.endsWith('.cjs'))!.mode & 0o777, 0o755);
  assert.equal(entries.find(item => item.name.endsWith('.txt'))!.mode & 0o777, 0o644);
  const original = zipSync({ 'extension/readme.txt': [files['extension/readme.txt'], { mtime: new Date(2020, 0, 1) }], 'extension/bin/arya.cjs': [script, { mtime: new Date(2026, 9, 1) }], 'extension/': new Uint8Array() });
  assert.deepEqual(normalizeVsix(original, archiveEpoch('')), first, 'VSCE time/order metadata must normalize away');
  const root = await mkdtemp(join(tmpdir(), 'arya-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, 'arya.cjs'); await writeFile(filename, unzipSync(first)['extension/bin/arya.cjs']!);
  const run = spawnSync(process.execPath, [filename], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, 'archive works\n');
});

test('SOURCE_DATE_EPOCH is validated, bounded to ZIP years, and rounded to two seconds', async () => {
  const { archiveEpoch, deterministicZip } = await helper();
  assert.equal(archiveEpoch(''), Date.UTC(1980, 0, 1) / 1000);
  assert.equal(archiveEpoch('0'), archiveEpoch(''));
  assert.equal(archiveEpoch('1700000001'), 1700000000);
  assert.equal(archiveEpoch('999999999999'), Date.UTC(2099, 11, 31, 23, 59, 58) / 1000);
  for (const value of ['-1', '1.5', 'Infinity', 'not-a-date', '9007199254740992']) assert.throws(() => archiveEpoch(value), /SOURCE_DATE_EPOCH/);
  const date = new Date(archiveEpoch('1700000001') * 1000);
  const entry = centralEntries(deterministicZip({ file: strToU8('data') }, archiveEpoch('1700000001')))[0]!;
  assert.equal(entry.time, (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1));
  assert.equal(entry.date, ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate());
});

test('archive bytes do not depend on process timezone, including a DST-gap timestamp', async () => {
  const module = pathToFileURL(resolve('scripts/editor-archive.mjs')).href;
  const source = `import {deterministicZip,archiveEpoch} from ${JSON.stringify(module)}; const before = process.env.TZ; const bytes = deterministicZip({file:new TextEncoder().encode('data')},archiveEpoch('1772937000')); if (process.env.TZ !== before) throw new Error('Timezone leaked'); console.log(Buffer.from(bytes).toString('base64'));`;
  const outputs = [];
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Kabul']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr); outputs.push(result.stdout);
  }
  assert.equal(new Set(outputs).size, 1);
});

test('VSIX normalization and editor-kit ZIP preserve the complete license and notice payloads', async () => {
  const { normalizeVsix, deterministicZip, archiveEpoch } = await helper();
  const legal = new Map<string, Uint8Array>();
  for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) {
    const bytes = new Uint8Array(await readFile(filename));
    assert.ok(bytes.length > 0, filename); legal.set(filename, bytes);
  }
  const vsixFiles: Record<string, Uint8Array> = {};
  const kitFiles: Record<string, Uint8Array> = {};
  for (const [filename, bytes] of legal) {
    vsixFiles['extension/' + (filename === 'LICENSE' ? 'LICENSE.txt' : filename)] = bytes;
    kitFiles[filename] = bytes;
    kitFiles['editors/vscode/' + filename] = bytes;
  }
  const vsix = unzipSync(normalizeVsix(zipSync(vsixFiles), archiveEpoch('')));
  const kit = unzipSync(deterministicZip(kitFiles, archiveEpoch('')));
  for (const [filename, bytes] of legal) {
    assert.deepEqual(vsix['extension/' + (filename === 'LICENSE' ? 'LICENSE.txt' : filename)], bytes);
    assert.deepEqual(kit[filename], bytes);
    assert.deepEqual(kit['editors/vscode/' + filename], bytes);
  }
});
