import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createVSIX} from '@vscode/vsce';
import {unzipSync} from 'fflate';
import {normalizeVsix, archiveEpoch} from './editor-archive.mjs';

// Repackage reviewed code with Marketplace metadata and an optional listing icon.
const [input, version, output, listingIcon] = process.argv.slice(2);
if (!input || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !output)
  throw new Error('Usage: node scripts/package-marketplace.mjs reviewed.vsix numeric.version output.vsix [listing-icon.png]');
const entries = unzipSync(await readFile(input));
const original = JSON.parse(Buffer.from(entries['extension/package.json']).toString());
if (original.publisher !== 'aryacode' || original.name !== 'arya-language') throw new Error('Unexpected extension identity');
const staging = await mkdtemp(join(tmpdir(), 'arya-marketplace-'));
const packaged = join(staging, 'packaged.vsix');
try {
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith('extension/') || name.endsWith('/')) continue;
    const relative = name.slice('extension/'.length);
    if (relative.split('/').includes('..')) throw new Error('Unsafe archive path');
    const path = join(staging, relative); await mkdir(dirname(path), {recursive: true}); await writeFile(path, bytes);
  }
  await writeFile(join(staging, 'package.json'), JSON.stringify({...original, version, preview: true}, null, 2) + '\n');
  await writeFile(join(staging, 'README.md'), await readFile('editors/vscode/README.md'));
  if (listingIcon) {
    const icon = await readFile(listingIcon);
    if (icon.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        icon.readUInt32BE(16) < 128 || icon.readUInt32BE(16) > 1024 ||
        icon.readUInt32BE(20) < 128 || icon.readUInt32BE(20) > 1024)
      throw new Error('Listing icon must be a PNG between 128 and 1024 pixels per dimension');
    if (original.icon !== 'media/arya-logo.png') throw new Error('Unexpected listing icon path');
    await writeFile(join(staging, original.icon), icon);
  }
  await createVSIX({cwd: staging, packagePath: packaged, dependencies: false, preRelease: true, allowMissingRepository: true, rewriteRelativeLinks: false});
  const bytes = normalizeVsix(await readFile(packaged), archiveEpoch());
  const rebuilt = unzipSync(bytes);
  const originalNames = Object.keys(entries).filter(n => !n.endsWith('/')).sort();
  const rebuiltNames = Object.keys(rebuilt).filter(n => !n.endsWith('/')).sort();
  if (JSON.stringify(originalNames) !== JSON.stringify(rebuiltNames)) throw new Error('Archive file inventory changed');
  const permitted = new Set(['extension/package.json', 'extension/readme.md', 'extension/README.md', 'extension.vsixmanifest']);
  if (listingIcon) permitted.add('extension/' + original.icon);
  const changed = originalNames.filter(n => !Buffer.from(entries[n]).equals(Buffer.from(rebuilt[n])));
  if (changed.some(n => !permitted.has(n))) throw new Error('Unexpected payload changes: ' + changed.join(', '));
  const newManifest = JSON.parse(Buffer.from(rebuilt['extension/package.json']).toString());
  if (newManifest.aryaLanguageVersion !== original.aryaLanguageVersion) throw new Error('Language version changed');
  await mkdir(dirname(resolve(output)), {recursive: true});
  await writeFile(output, bytes, {flag: 'wx'});
  const report = {input, output, version, languageVersion: original.aryaLanguageVersion, changed, listingIcon,
    sha256: createHash('sha256').update(bytes).digest('hex'), runtimePayloadsUnchanged: true};
  await writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(staging, {recursive: true, force: true}); }
