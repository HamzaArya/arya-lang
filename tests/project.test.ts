import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildProject, checkProject, writeProject, ProjectError } from '../src/project.js';

async function directory(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'arya modules 🌉 ')));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

async function source(root: string, path: string, text: string) {
  const filename = join(root, path);
  await mkdir(dirname(filename), { recursive: true }); await writeFile(filename, text);
  return filename;
}

function runNode(filename: string) {
  const result = spawnSync(process.execPath, ['--enable-source-maps', filename], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error); return result;
}

function cli(command: string, filename: string) {
  const result = spawnSync(process.execPath, [resolve('dist/cli.cjs'), command, filename], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error); return result;
}

test('one graph build runs the shipped multi-file learning project and emits every map', async t => {
  const root = await directory(t);
  await cp('fixtures/arya/modules/tasks', root, { recursive: true });
  const entry = join(root, 'main.arya');
  await checkProject(entry);
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
  const project = await buildProject(entry);
  assert.equal(project.entry, entry);
  assert.equal(project.root, root);
  assert.equal(project.modules.length, 3);
  assert.equal(project.entryOutput, join(root, '.arya', 'build', 'main.arya.mjs'));
  await assert.rejects(access(project.outputDirectory), { code: 'ENOENT' });
  await writeProject(project);
  for (const module of project.modules) {
    const metadata = JSON.parse(await readFile(`${module.outputFilename}.map`, 'utf8'));
    assert.equal(metadata.file, basename(module.outputFilename));
    assert.equal(metadata.sourcesContent[0], await readFile(module.filename, 'utf8'));
    assert.equal(await readFile(module.outputFilename, 'utf8'), module.compilation.code);
  }
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'Completed: 2 of 3\nRemaining: 1\nProject: tasks.arya\n');
});

test('transitive diamond dependencies compile once in deterministic dependency-before-importer order', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./left.arya" as left\nuse arya "./right.arya" as right\nprint(left.answer() + right.answer())');
  await source(root, 'left.arya', 'use arya "./shared.arya" as shared\nexport fn answer() { return shared.answer() }');
  await source(root, 'right.arya', 'use arya "./shared.arya" as shared\nexport fn answer() { return shared.answer() }');
  await source(root, 'shared.arya', 'export fn answer() { return 21 }');
  const first = await buildProject(entry), second = await buildProject(entry);
  const filenames = first.modules.map(module => module.filename);
  assert.equal(new Set(filenames).size, 4);
  assert.equal(filenames.length, 4);
  assert.deepEqual(second.modules.map(module => module.filename), filenames);
  for (const module of first.modules) for (const dependency of module.dependencies) {
    assert.ok(filenames.indexOf(dependency) < filenames.indexOf(module.filename), `${dependency} must precede ${module.filename}`);
  }
  await writeProject(first);
  const run = runNode(first.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '42\n');
});

test('nested imports normalize ../ and URL-escape spaces, Unicode, and # in module filenames', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./lib/answer.arya" as answer\nprint(answer.value())');
  await source(root, 'lib/answer.arya', 'use arya "../shared/value 🌉 #.arya" as shared\nexport fn value() { return shared.value }');
  await source(root, 'shared/value 🌉 #.arya', 'export const value = 42');
  const project = await buildProject(entry);
  assert.deepEqual(project.modules.map(module => relative(project.outputDirectory, module.outputFilename).split('\\').join('/')).sort(), ['lib/answer.arya.mjs', 'main.arya.mjs', 'shared/value 🌉 #.arya.mjs']);
  await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '42\n');
});

test('missing modules report the importer and original import token position', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', '# first line\nuse arya "./missing.arya" as missing');
  await assert.rejects(buildProject(entry), (error: unknown) => {
    assert.ok(error instanceof ProjectError);
    assert.equal(error.filename, entry);
    assert.ok(error.message.includes('missing.arya'));
    assert.equal(error.diagnostics[0]!.token.line, 1);
    return true;
  });
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
});

test('cycle diagnostics contain the full discovered import chain and close the cycle', async t => {
  const root = await directory(t);
  const entry = await source(root, 'a.arya', 'use arya "./lib/b.arya" as b');
  await source(root, 'lib/b.arya', 'use arya "../a.arya" as a');
  await assert.rejects(buildProject(entry), (error: unknown) => error instanceof ProjectError && /a\.arya[\s\S]*b\.arya[\s\S]*a\.arya|b\.arya[\s\S]*a\.arya[\s\S]*b\.arya/.test(error.message));
});

test('cycle diagnostics select a shortest cycle rather than the first longer cycle', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./a.arya" as a\nuse arya "./z.arya" as z');
  await source(root, 'a.arya', 'use arya "./b.arya" as b');
  await source(root, 'b.arya', 'use arya "./c.arya" as c');
  await source(root, 'c.arya', 'use arya "./a.arya" as a');
  await source(root, 'z.arya', 'use arya "./z.arya" as self');
  await assert.rejects(buildProject(entry), (error: unknown) => {
    assert.ok(error instanceof ProjectError);
    assert.match(error.message, /z\.arya[\s\S]*z\.arya/);
    assert.ok(!error.message.includes('a.arya'), error.message);
    assert.equal(error.filename, join(root, 'z.arya'));
    return true;
  });
});

test('dependency syntax and invalid export diagnostics identify the dependency source', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./dependency.arya" as dependency');
  const dependency = join(root, 'dependency.arya');
  for (const text of ['export fn invalid(a, a) {}', 'fn invalid() { export const value = 1 }']) {
    await writeFile(dependency, text);
    await assert.rejects(buildProject(entry), (error: unknown) => error instanceof ProjectError && error.filename === dependency && error.diagnostics.length > 0);
  }
});

test('direct namespace and constructor checks identify missing Arya exports without confusing shadowed names', async t => {
  const root = await directory(t);
  const entry = join(root, 'main.arya');
  await source(root, 'library.arya', 'export const present = 1');
  for (const [expression, name] of [['print(library.missing)', 'missing'], ['new library.Missing()', 'Missing']]) {
    await writeFile(entry, `use arya "./library.arya" as library\n${expression}`);
    await assert.rejects(checkProject(entry), (error: unknown) => {
      assert.ok(error instanceof ProjectError);
      assert.equal(error.filename, entry);
      assert.equal(error.diagnostics[0]!.token.text, name);
      assert.ok(error.message.includes(`does not export '${name}'`), error.message);
      return true;
    });
  }
  await writeFile(entry, 'use arya "./library.arya" as library\nfn read(library) { return library.missing }\nprint(read({missing: 42}))');
  const project = await buildProject(entry); await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '42\n');
});

test('a runtime failure in a dependency maps to its Arya source and the entry call site', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./lib/fail.arya" as library\nlibrary.fail()');
  await source(root, 'lib/fail.arya', 'export fn fail() {\n  const item = null\n  return item.name\n}');
  const project = await buildProject(entry); await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /fail\.arya:3:15/);
  assert.match(run.stderr, /main\.arya:2:/);
  const throughCLI = cli('run', entry);
  assert.notEqual(throughCLI.status, 0);
  assert.match(throughCLI.stderr, /fail\.arya:3:15/);
});

test('different aliases and symlink identities share one canonical module while duplicate aliases fail', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./shared.arya" as first\nuse arya "./alias.arya" as second\nprint(first.loads(), second.loads())');
  const shared = await source(root, 'shared.arya', 'globalThis.aryaModuleLoads = (globalThis.aryaModuleLoads or 0) + 1\nexport fn loads() { return globalThis.aryaModuleLoads }');
  try { await symlink(shared, join(root, 'alias.arya'), 'file'); }
  catch (error) { if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('File symlink privilege is unavailable.'); return; } throw error; }
  const project = await buildProject(entry);
  assert.equal(project.modules.length, 2);
  assert.equal(project.modules.filter(module => module.filename === shared).length, 1);
  await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '1 1\n');
  await writeFile(entry, 'use arya "./shared.arya" as same\nuse arya "./shared.arya" as same');
  await assert.rejects(buildProject(entry), (error: unknown) => error instanceof ProjectError && /already defined/.test(error.message));
});

test('module specifiers require relative paths and the explicit .arya extension', async t => {
  const root = await directory(t);
  const entry = join(root, 'main.arya');
  await source(root, 'library.arya', 'export const value = 1');
  for (const specifier of ['library.arya', './library', './library.mjs', 'node:fs', join(root, 'library.arya')]) {
    await writeFile(entry, `use arya ${JSON.stringify(specifier)} as library`);
    await assert.rejects(checkProject(entry), ProjectError, specifier);
  }
});

test('relative and symlink source escapes are rejected under project and workspace boundaries', async t => {
  const workspace = await directory(t), outside = await directory(t);
  const root = join(workspace, 'project'); await mkdir(root);
  const external = await source(workspace, 'outside.arya', 'export const value = 1');
  const entry = await source(root, 'main.arya', 'use arya "../outside.arya" as external');
  await assert.rejects(buildProject(entry), /outside|escape|root|contain/i);
  await assert.rejects(buildProject(external, { workspaceRoot: root }), /outside|escape|workspace|contain/i);
  const externalTarget = await source(outside, 'outside.arya', 'export const value = 2');
  try { await symlink(externalTarget, join(root, 'linked.arya'), 'file'); }
  catch (error) { if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('File symlink privilege is unavailable.'); return; } throw error; }
  await writeFile(entry, 'use arya "./linked.arya" as external');
  await assert.rejects(buildProject(entry), /outside|escape|root|contain/i);
});

test('JavaScript and local Python bridges resolve from the importing Arya dependency', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./lib/answer.arya" as answer\nprint(answer.value())');
  await source(root, 'lib/answer.arya', 'use js "./helper.mjs" as js\nuse python "./helper.py" as py\nexport fn value() { return js.adjust(py.double(20)) }');
  await source(root, 'lib/helper.mjs', 'export const adjust = value => value + 2;');
  await source(root, 'lib/helper.py', 'def double(value):\n    return value * 2\n');
  const project = await buildProject(entry); await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '42\n');
});

test('namespace imports expose live read-only exported bindings across modules', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'use arya "./counter.arya" as counter\nprint(counter.value)\ncounter.increment()\nprint(counter.value)\ntry { counter.value = 9 } catch error { print(error.name) }\nprint(counter.value)');
  await source(root, 'counter.arya', 'export let value = 0\nexport fn increment() { value += 1 }');
  const project = await buildProject(entry); await writeProject(project);
  const run = runNode(project.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '0\n1\nTypeError\n1\n');
});

test('Check and Build never execute graph code, and a failed graph cannot run stale dependencies', async t => {
  const root = await directory(t), canary = join(root, 'CANARY');
  const entry = await source(root, 'main.arya', `use arya "./dependency.arya" as dependency\nuse js "node:fs" as fs\nfs.writeFileSync(${JSON.stringify(canary)}, str(dependency.value))`);
  const dependency = await source(root, 'dependency.arya', 'export const value = 1');
  assert.equal(cli('check', entry).status, 0);
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
  const first = cli('build', entry); assert.equal(first.status, 0, first.stderr);
  await assert.rejects(access(canary), { code: 'ENOENT' });
  const entryOutput = first.stdout.trim(), dependencyOutput = join(dirname(entryOutput), 'dependency.arya.mjs');
  const old = await Promise.all([readFile(entryOutput, 'utf8'), readFile(dependencyOutput, 'utf8')]);
  await writeFile(dependency, 'export const = invalid');
  for (const command of ['check', 'build', 'run']) {
    const failed = cli(command, entry);
    assert.equal(failed.status, 1, command);
    assert.match(failed.stderr, /dependency\.arya:/);
    await assert.rejects(access(canary), { code: 'ENOENT' });
    assert.equal(await readFile(entryOutput, 'utf8'), old[0]);
    assert.equal(await readFile(dependencyOutput, 'utf8'), old[1]);
  }
});

test('generated output cannot escape the project through an existing directory symlink', async t => {
  const root = await directory(t), outside = await directory(t);
  const entry = await source(root, 'main.arya', 'print(42)');
  await symlink(outside, join(root, '.arya'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(async () => writeProject(await buildProject(entry)), /outside|escape|root|contain/i);
  await assert.rejects(access(join(outside, 'build', 'main.arya.mjs')), { code: 'ENOENT' });
});

test('a custom output directory must remain inside the project boundary', async t => {
  const root = await directory(t), outside = await directory(t);
  const entry = await source(root, 'main.arya', 'print(42)');
  await assert.rejects(buildProject(entry, { outputDirectory: outside }), /outside|escape|root|contain/i);
});

test('map symlinks never overwrite an external target during graph publication', async t => {
  const root = await directory(t), outside = await directory(t);
  const entry = await source(root, 'main.arya', 'print(42)');
  const project = await buildProject(entry);
  await mkdir(project.outputDirectory, { recursive: true });
  const sentinel = await source(outside, 'map.txt', 'preserve external data');
  try { await symlink(sentinel, `${project.entryOutput}.map`, 'file'); }
  catch (error) { if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('File symlink privilege is unavailable.'); return; } throw error; }
  try { await writeProject(project); }
  catch (error) { assert.match(String(error), /outside|escape|root|contain/i); }
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve external data');
});

test('graph publication preserves an unrelated orphan map instead of claiming it by its extension', async t => {
  const root = await directory(t);
  const entry = await source(root, 'main.arya', 'print(42)');
  const project = await buildProject(entry);
  await mkdir(project.outputDirectory, { recursive: true });
  const personal = join(project.outputDirectory, 'personal.mjs.map');
  await writeFile(personal, 'unrelated original data');
  await assert.rejects(writeProject(project), /unowned|owned|map/i);
  assert.equal(await readFile(personal, 'utf8'), 'unrelated original data');
});

test('Build rejects an unowned FIFO without blocking or replacing it', { skip: process.platform === 'win32' }, async t => {
  const root = await directory(t), entry = await source(root, 'main.arya', 'print(42)');
  const output = join(root, '.arya', 'build'); await mkdir(output, { recursive: true });
  const fifo = join(output, 'personal.mjs');
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8', timeout: 2000 });
  if (created.error && (created.error as NodeJS.ErrnoException).code === 'ENOENT') { t.skip('mkfifo is unavailable.'); return; }
  assert.ifError(created.error); assert.equal(created.status, 0, created.stderr);
  // The CLI runs in a bounded child process: a future blocking-open regression
  // fails this assertion without stranding the test runner's filesystem worker.
  const result = cli('build', entry);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /regular|unowned|special/i);
  assert.equal((await lstat(fifo)).isFIFO(), true);
});

test('a cancelled graph request produces no artifacts', async t => {
  const root = await directory(t), entry = await source(root, 'main.arya', 'print(42)');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildProject(entry, { signal: controller.signal }), /abort|cancel/i);
  await assert.rejects(access(join(root, '.arya')), { code: 'ENOENT' });
});

test('a cancelled publication preserves the previous complete graph', async t => {
  const root = await directory(t), entry = await source(root, 'main.arya', 'print(1)');
  const first = await buildProject(entry); await writeProject(first);
  const original = await readFile(first.entryOutput, 'utf8');
  await writeFile(entry, 'print(2)');
  const next = await buildProject(entry), controller = new AbortController(); controller.abort();
  await assert.rejects(writeProject(next, { signal: controller.signal }), /abort|cancel/i);
  assert.equal(await readFile(first.entryOutput, 'utf8'), original);
  const run = runNode(first.entryOutput);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '1\n');
});
