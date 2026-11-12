import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {createVSIX} from '@vscode/vsce';
import {unzipSync} from 'fflate';
import {normalizeVsix, archiveEpoch} from './editor-archive.mjs';
import {generateEditorAdapters} from './editor-adapters.mjs';

/** Included in every npm build; never writes the retained published archives. */
export async function buildEditorPackage() {
  const output = resolve('dist/editor/arya-language.vsix');
  await mkdir(dirname(output), {recursive: true});
  const extension = JSON.parse(await readFile('editors/vscode/package.json', 'utf8'));
  await createVSIX({cwd: resolve('editors/vscode'), packagePath: output, dependencies: false, preRelease: Boolean(extension.preview), allowMissingRepository: true, rewriteRelativeLinks: false});
  const bytes = normalizeVsix(await readFile(output), archiveEpoch());
  const entries = unzipSync(bytes);
  for (const filename of ['package.json', 'dist/extension.cjs', 'dist/arya.cjs', 'media/arya-mark.svg', 'media/arya-mark-dark.svg', 'icons/arya-file-icons.json', 'themes/arya-dark.json', 'themes/arya-light.json']) {
    if (!entries['extension/' + filename]?.length) throw new Error('VSIX is missing ' + filename);
  }
  for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) {
    const expected = await readFile(filename);
    if (!Buffer.from(entries['extension/' + (filename === 'LICENSE' ? 'LICENSE.txt' : filename)] ?? []).equals(expected)) throw new Error('VSIX legal payload differs: ' + filename);
  }
  await writeFile(output, bytes);
  return output;
}

export async function buildPortableEditors(keywords, builtins) {
  const root = resolve('dist/editor/adapters');
  await rm(root, {recursive: true, force: true});
  await mkdir(root, {recursive: true});
  for (const name of ['vim', 'neovim', 'emacs', 'nano', 'helix']) await cp('editors/' + name, root + '/editors/' + name, {recursive: true});
  await cp('brand', root + '/brand', {recursive: true});
  await generateEditorAdapters(root, keywords, builtins);
  await cp('docs/arya-editors.md', root + '/README.md');
}
