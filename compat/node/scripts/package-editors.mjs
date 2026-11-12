import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { archiveEpoch, deterministicZip, normalizeVsix } from './editor-archive.mjs';
import {generateEditorAdapters} from './editor-adapters.mjs';
const epoch = archiveEpoch();
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
for (const filename of [`${manifest.name}-${manifest.version}.tgz`, `create-arya-language-${manifest.version}.tgz`, `arya-language-${manifest.version}.vsix`, `arya-editor-kit-${manifest.version}.zip`]) {
  try { await access(resolve('artifacts', filename)); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw new Error(`Refusing to replace retained archive ${filename}. Choose a new candidate version or package in a fresh disposable snapshot.`);
}
// Give VSCE the same valid timestamp, then canonicalize its ZIP metadata below.
process.env.SOURCE_DATE_EPOCH = String(epoch);
await import('./build.mjs');
const { ARYA_VERSION, keywords, builtins } = createRequire(import.meta.url)(resolve('dist/compiler.cjs'));
const output = resolve('artifacts');
const kit = resolve('.build/arya-editor-kit');
await rm(kit, { recursive: true, force: true });
await mkdir(output, { recursive: true }); await mkdir(kit, { recursive: true });
await cp('editors', join(kit, 'editors'), { recursive: true });
await cp('brand', join(kit, 'brand'), { recursive: true });
await cp('docs/arya-editors.md', join(kit, 'README.md'));
const legalFiles = new Map();
for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) {
  const bytes = await readFile(filename);
  if (!bytes.length) throw new Error(`Distribution legal file is empty: ${filename}`);
  if (!(await readFile(join('editors/vscode', filename))).equals(bytes)) throw new Error(`Editor legal file differs from the root: ${filename}`);
  legalFiles.set(filename, bytes);
  await cp(filename, join(kit, filename));
}
const verifyLegalFiles = (files, prefix = '') => {
  for (const [filename, expected] of legalFiles) {
    // VSCE names its license asset LICENSE.txt even when the source is LICENSE.
    const name = prefix + (prefix && filename === 'LICENSE' ? 'LICENSE.txt' : filename);
    if (!files[name] || !Buffer.from(files[name]).equals(expected)) throw new Error(`Archive legal file is missing or differs from the root: ${name}`);
  }
};
await generateEditorAdapters(kit, keywords, builtins);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm run package:editors so the active npm executable is available.');
const packed = await promisify(execFile)(process.execPath, [npmCli, 'pack', resolve('.'), '--pack-destination', output, '--json', '--ignore-scripts'], { maxBuffer: 4 * 1024 * 1024 });
const filename = JSON.parse(packed.stdout)[0].filename;
const creatorPacked = await promisify(execFile)(process.execPath, [npmCli, 'pack', resolve('packages/create-arya-language'), '--pack-destination', output, '--json', '--ignore-scripts'], { maxBuffer: 4 * 1024 * 1024 });
const creatorFilename = JSON.parse(creatorPacked.stdout)[0].filename;
const vsix = `arya-language-${ARYA_VERSION}.vsix`;
await cp('dist/editor/arya-language.vsix', join(output, vsix));
const normalizedVsix = normalizeVsix(await readFile(join(output, vsix)), epoch);
const { unzipSync } = await import('fflate');
verifyLegalFiles(unzipSync(normalizedVsix), 'extension/');
await writeFile(join(output, vsix), normalizedVsix);
await cp(join(output, filename), join(kit, filename)); await cp(join(output, vsix), join(kit, vsix));
await cp(join(output, creatorFilename), join(kit, creatorFilename));
const files = {};
async function collect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(kit, path).split('\\').join('/')] = new Uint8Array(await readFile(path));
  }
}
await collect(kit);
const zip = `arya-editor-kit-${ARYA_VERSION}.zip`;
const kitArchive = deterministicZip(files, epoch);
verifyLegalFiles(unzipSync(kitArchive));
await writeFile(join(output, zip), kitArchive);
const checksums = [];
for (const file of [filename, creatorFilename, vsix, zip]) checksums.push(`${createHash('sha256').update(await readFile(join(output, file))).digest('hex')}  ${file}`);
await writeFile(join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
console.log(`Packaged Arya into ${output}. No packages were published or installed globally.`);
