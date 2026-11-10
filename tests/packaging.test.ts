import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('packaging refuses each retained distribution before building or replacing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arya retained archive '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const version = '1.2.0-alpha.4';
  await writeFile(join(root, 'package.json'), JSON.stringify({name: 'arya-language', version}));
  await mkdir(join(root, 'artifacts'));
  for (const name of [`arya-language-${version}.tgz`, `create-arya-language-${version}.tgz`, `arya-language-${version}.vsix`, `arya-editor-kit-${version}.zip`]) {
    const path = join(root, 'artifacts', name);
    await writeFile(path, 'retained distribution');
    const result = spawnSync(process.execPath, [resolve('scripts/package-editors.mjs')], {cwd: root, encoding: 'utf8', timeout: 15000});
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to replace retained archive/);
    assert.ok(result.stderr.includes(name));
    assert.equal(await readFile(path, 'utf8'), 'retained distribution');
    assert.deepEqual((await readdir(root)).sort(), ['artifacts', 'package.json']);
    await rm(path);
  }
});
