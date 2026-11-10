import { build } from 'esbuild';
import { cp, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {buildEditorPackage, buildPortableEditors} from './build-editor-package.mjs';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'warning' };
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/features.json', JSON.stringify({ version: manifest.version, runtime: 'node', capabilities: ['arya.node.v1', 'arya.syntax.flow.v1', 'arya.list.v1', 'arya.ui.v1', 'arya.ui.library.v1', 'arya.ui.motion.v1'] }, null, 2) + '\n');
await mkdir('artifacts', { recursive: true });
for (const name of ['compiler', 'project', 'language-service', 'cli', 'lsp', 'create', 'editor']) {
  await build({ ...common, entryPoints: [`src/${name}.ts`], outfile: `dist/${name}.cjs`, ...(['cli', 'lsp', 'create'].includes(name) ? { banner: { js: '#!/usr/bin/env node' } } : {}) });
}
for (const name of ['cli', 'lsp', 'create']) await chmod(`dist/${name}.cjs`, 0o755);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
await build({ ...common, entryPoints: ['editors/vscode/src/extension.ts'], outfile: 'editors/vscode/dist/extension.cjs', external: ['vscode'] });
await cp('dist/cli.cjs', 'editors/vscode/dist/arya.cjs');
await cp('brand', 'editors/vscode/media', { recursive: true });
const extension = JSON.parse(await readFile('editors/vscode/package.json', 'utf8'));
extension.version = manifest.version.split('-')[0];
extension.preview = manifest.version.includes('-');
extension.aryaLanguageVersion = manifest.version;
await writeFile('editors/vscode/package.json', JSON.stringify(extension, null, 2) + '\n');
const notices = [];
for (const name of ['vscode-languageserver', 'vscode-languageserver-protocol', 'vscode-languageserver-types', 'vscode-jsonrpc', 'vscode-languageserver-textdocument', '@jridgewell/gen-mapping', '@jridgewell/sourcemap-codec', '@jridgewell/resolve-uri', '@jridgewell/trace-mapping']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  notices.push(`${name} ${pkg.version}\n${await readFile(`node_modules/${name}/${name.startsWith('@jridgewell/') ? 'LICENSE' : 'License.txt'}`, 'utf8')}`);
}
await writeFile('THIRD-PARTY-NOTICES.txt', notices.join('\n\n-----\n\n'));
await cp('THIRD-PARTY-NOTICES.txt', 'editors/vscode/THIRD-PARTY-NOTICES.txt');
for (const filename of ['LICENSE', 'NOTICE']) await cp(filename, `editors/vscode/${filename}`);
const creatorRoot = 'packages/create-arya-language';
const creator = JSON.parse(await readFile(`${creatorRoot}/package.json`, 'utf8'));
creator.version = manifest.version;
await writeFile(`${creatorRoot}/package.json`, JSON.stringify(creator, null, 2) + '\n');
await mkdir(`${creatorRoot}/dist`, { recursive: true });
await cp('dist/create.cjs', `${creatorRoot}/dist/create.cjs`);
for (const filename of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']) await cp(filename, `${creatorRoot}/${filename}`);
const { ARYA_VERSION, keywords, builtins } = require('../dist/compiler.cjs');
if (ARYA_VERSION !== manifest.version) throw new Error('Compiler and package versions differ.');
await buildEditorPackage();
await buildPortableEditors(keywords, builtins);
console.log(`Built Arya ${ARYA_VERSION}: compiler API, CLI, LSP, and portable extension.`);
