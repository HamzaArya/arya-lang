import { build } from 'esbuild';
import { cp, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'warning' };
await mkdir('dist', { recursive: true });
await mkdir('artifacts', { recursive: true });
for (const name of ['compiler', 'project', 'language-service', 'cli', 'lsp']) {
  await build({ ...common, entryPoints: [`src/${name}.ts`], outfile: `dist/${name}.cjs`, ...(['cli', 'lsp'].includes(name) ? { banner: { js: '#!/usr/bin/env node' } } : {}) });
}
for (const name of ['cli', 'lsp']) await chmod(`dist/${name}.cjs`, 0o755);
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
const { ARYA_VERSION } = require('../dist/compiler.cjs');
if (ARYA_VERSION !== manifest.version) throw new Error('Compiler and package versions differ.');
console.log(`Built Arya ${ARYA_VERSION}: compiler API, CLI, LSP, and portable extension.`);
