import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

test('source snapshot includes new working files and excludes tracked deletions without staging changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya source inventory '));
  const repo = join(root, 'source');
  const npmStub = join(root, 'npm-stub.cjs');
  t.after(async () => {
    try {
      const record = JSON.parse(await readFile(join(repo, '.build/clean-candidate-record.json'), 'utf8'));
      await rm(resolve(record.snapshot, '..'), {recursive: true, force: true});
    } catch { /* Verification may fail before producing a record. */ }
    await rm(root, {recursive: true, force: true});
  });
  await mkdir(join(repo, 'src'), {recursive: true});
  await writeFile(join(repo, '.gitignore'), '.build/\nartifacts/\n');
  await writeFile(join(repo, 'src/keep.ts'), 'export const value = 1;\n');
  await writeFile(join(repo, 'src/retired.ts'), 'export const retired = true;\n');
  await writeFile(join(repo, 'package.json'), '{"name":"inventory-fixture","version":"0.0.0"}\n');
  await writeFile(join(repo, 'package-lock.json'), '{}\n');
  const git = (...args: string[]) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  git('init'); git('add', '.');
  git('-c', 'user.name=Inventory test', '-c', 'user.email=inventory@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Inventory fixture');
  await rm(join(repo, 'src/retired.ts'));
  await writeFile(join(repo, 'src/new.ts'), 'export const added = true;\n');
  // Stub only the downstream npm commands: this regression checks real Git/file inventory.
  await writeFile(npmStub, 'process.exit(0);\n');
  const before = git('status', '--porcelain');
  const result = spawnSync(process.execPath, [resolve('scripts/verify-clean.mjs')], {cwd: repo, env: {...process.env, npm_execpath: npmStub}, encoding: 'utf8', timeout: 15000});
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(await readFile(join(repo, '.build/clean-candidate-record.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(record.snapshot, 'SOURCE-MANIFEST.json'), 'utf8'));
  assert.deepEqual(manifest.files.map((file: {filename: string}) => file.filename), ['.gitignore', 'package-lock.json', 'package.json', 'src/keep.ts', 'src/new.ts']);
  assert.equal(manifest.workingTreeDirty, true);
  assert.equal(await readFile(join(record.snapshot, 'src/new.ts'), 'utf8'), 'export const added = true;\n');
  assert.equal(git('status', '--porcelain'), before);
});
