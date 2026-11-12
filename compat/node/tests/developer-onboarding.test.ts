import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildProject, writeProject} from '../src/project.js';

test('documented mixed JavaScript workflow runs the actual quickstart module and emits declarations', async t => {
  const guide = await readFile('docs/getting-started.md', 'utf8');
  const source = guide.match(/```arya\n([\s\S]*?)```/)?.[1];
  const consumer = guide.match(/```js\n([\s\S]*?)```/)?.[1];
  assert.ok(source); assert.ok(consumer);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya onboarding ')));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'report.arya'), source);
  await writeFile(join(root, 'run-report.mjs'), consumer);
  const output = await writeProject(await buildProject(join(root, 'report.arya')));
  assert.equal(output, join(root, '.arya/build/report.arya.mjs'));
  assert.match(await readFile(join(root, '.arya/build/report.arya.d.mts'), 'utf8'), /total.*number/);
  const result = spawnSync(process.execPath, ['--enable-source-maps', join(root, 'run-report.mjs')], {encoding:'utf8', timeout:10000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '60\n');
});

test('learner reference works from a copied consumer folder outside the checkout',async t=>{
  const {cp}=await import('node:fs/promises');
  const root=await realpath(await mkdtemp(join(tmpdir(),'arya learner ')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp('fixtures/examples/learner-review/reference',root,{recursive:true,filter:file=>!file.includes('.arya/build')&&!file.includes('__pycache__')});
  const output=await writeProject(await buildProject(join(root,'main.arya')));
  const result=spawnSync(process.execPath,['--enable-source-maps',output],{encoding:'utf8',timeout:10000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'Paid total: 2400\nUnpaid orders: 1\nModule: main.arya\n');
});
