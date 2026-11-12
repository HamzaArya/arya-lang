import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyNativeRuntime } from '../native/accounting/build.mjs';
const includeNative = process.argv.includes('--native');
if (process.argv.slice(2).some((arg) => arg !== '--native'))
  throw new Error('Use --native to include the qualified local binary, or no flags for JS-only.');
const root = process.cwd(),
  manifest = JSON.parse(await readFile('package.json', 'utf8'));
const temp = await mkdtemp(join(tmpdir(), 'arya-accounting-package-')),
  stage = join(temp, 'package');
await mkdir(join(stage, 'dist'), { recursive: true });
await mkdir(join(stage, 'types'));
await mkdir(join(stage, 'native/accounting'), { recursive: true });
try {
  await copyFile('dist/accounting.cjs', join(stage, 'dist/accounting.cjs'));
  for (const name of ['accounting.d.ts', 'accounting-core.d.ts'])
    await copyFile(join('dist/types', name), join(stage, 'types', name));
  for (const name of ['kernel.h', 'addon.cc', 'kernel-test.cc', 'build.mjs'])
    await copyFile(join('native/accounting', name), join(stage, 'native/accounting', name));
  for (const name of ['LICENSE', 'NOTICE']) await copyFile(name, join(stage, name));
  await copyFile('docs/accounting-engine.md', join(stage, 'README.md'));
  if (includeNative && !(await copyNativeRuntime(join(stage, 'dist'))))
    throw new Error('Build and test the current native kernel before packaging --native.');
  const pkg = {
    name: 'arya-accounting',
    version: manifest.version,
    description:
      'Exact bounded invoice and ledger batches with portable BigInt and optional native kernels.',
    license: 'Apache-2.0',
    author: manifest.author,
    repository: manifest.repository,
    type: 'commonjs',
    main: './dist/accounting.cjs',
    types: './types/accounting.d.ts',
    exports: { '.': { types: './types/accounting.d.ts', default: './dist/accounting.cjs' } },
    engines: manifest.engines,
    scripts: { 'build:native': 'node native/accounting/build.mjs' },
    files: ['dist', 'types', 'native/accounting', 'README.md', 'LICENSE', 'NOTICE'],
    publishConfig: { access: 'public', tag: 'next' },
  };
  await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run through npm run package:accounting.');
  const packed = spawnSync(
    process.execPath,
    [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temp],
    { cwd: stage, encoding: 'utf8' },
  );
  if (packed.error) throw packed.error;
  if (packed.status !== 0) throw new Error(packed.stderr);
  const filename = JSON.parse(packed.stdout)[0].filename,
    bytes = await readFile(join(temp, filename));
  const output = resolve(
    'artifacts',
    `arya-accounting-${manifest.version}${includeNative ? '-' + process.platform + '-' + process.arch : ''}.tgz`,
  );
  await mkdir('artifacts', { recursive: true });
  await copyFile(join(temp, filename), output, constants.COPYFILE_EXCL);
  const record = {
    name: pkg.name,
    version: pkg.version,
    nativeIncluded: includeNative,
    platform: includeNative ? process.platform : null,
    architecture: includeNative ? process.arch : null,
    filename: output,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  await writeFile(output + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(record, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true });
}
