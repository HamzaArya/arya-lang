import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { strToU8, zipSync } from 'fflate';

const audit = resolve('scripts/check-release.mjs');
const version = '0.2.0-audit.1';
const name = 'arya-language';
const legalFiles = ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt'];
const requiredDocuments = ['README.md', ...legalFiles, 'SECURITY.md', 'docs/arya-specification.md', 'docs/arya-tutorial.md', 'docs/installing.md', 'docs/compatibility-policy.md', 'docs/community-review.md', 'docs/tooling-evidence.md', 'docs/release-readiness.md'];

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya audit 🌉 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = { name, version, private: false, license: 'Apache-2.0', author: { name: 'Hamza Arya', url: 'https://hamzaarya.com' }, homepage: 'https://hamzaarya.com', repository: { type: 'git', url: 'git+https://github.com/HamzaArya/arya-lang.git' }, publishConfig: { access: 'public', tag: 'next', registry: 'https://registry.npmjs.org/' }, engines: { node: '>=22.15' }, scripts: { check: 'node MUST-NOT-EXECUTE.mjs', build: 'node MUST-NOT-EXECUTE.mjs', test: 'node MUST-NOT-EXECUTE.mjs', 'test:package': 'node MUST-NOT-EXECUTE.mjs' } };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(pkg),
    'package-lock.json': JSON.stringify({ name, version, packages: { '': { name, version, license: pkg.license } } }),
    'src/compiler.ts': `export const ARYA_VERSION = '${version}';\n`,
    'editors/vscode/package.json': JSON.stringify({ version: '0.2.0', aryaLanguageVersion: version, preview: true, license: pkg.license }),
    [`docs/releases/${version}.md`]: 'Audit fixture release notes.\n',
    'MUST-NOT-EXECUTE.mjs': 'import {writeFileSync} from "node:fs"; writeFileSync("CANARY", "bad");\n',
  };
  for (const path of requiredDocuments) files[path] = await readFile(path, 'utf8');
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return { root, pkg };
}

function run(root: string) {
  const result = spawnSync(process.execPath, [audit, '--root', root, '--json'], { encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  assert.ok(result.stdout, result.stderr);
  return { result, report: JSON.parse(result.stdout) };
}

async function archive(root: string, pkg: object, overrides: Record<string, string> = {}) {
  const staging = join(root, 'staging/package');
  await mkdir(staging, { recursive: true });
  for (const path of ['dist/compiler.cjs', 'dist/project.cjs', 'dist/cli.cjs', 'dist/lsp.cjs', 'dist/language-service.cjs', 'dist/types/compiler.d.ts', 'dist/types/project.d.ts', ...legalFiles, 'SECURITY.md', 'docs/arya-specification.md', 'docs/arya-tutorial.md', `docs/releases/${version}.md`]) {
    const output = join(staging, path);
    await mkdir(dirname(output), { recursive: true });
    if (path.startsWith('dist/')) await writeFile(output, '// Mechanical audit fixture, not executable acceptance evidence.\n');
    else await cp(join(root, path), output);
  }
  for (const [path, value] of Object.entries(overrides)) await writeFile(join(staging, path), value);
  await writeFile(join(staging, 'package.json'), JSON.stringify(pkg));
  await mkdir(join(root, 'artifacts'), { recursive: true });
  const tar = spawnSync('tar', ['-czf', join('artifacts', `${name}-${version}.tgz`), '-C', 'staging', 'package'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(tar.error);
  assert.equal(tar.status, 0, tar.stderr);
}

async function editorArchives(root: string, wrongNotice = false) {
  const legal: Record<string, Uint8Array> = {};
  for (const path of legalFiles) legal[path] = new Uint8Array(await readFile(join(root, path)));
  const extension = JSON.parse(await readFile(join(root, 'editors/vscode/package.json'), 'utf8'));
  const vsix: Record<string, Uint8Array> = {
    'extension/package.json': strToU8(JSON.stringify(extension)),
    'extension.vsixmanifest': strToU8('<PackageManifest><Assets><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" /></Assets></PackageManifest>'),
  };
  for (const [path, bytes] of Object.entries(legal)) vsix[`extension/${path === 'LICENSE' ? 'LICENSE.txt' : path}`] = bytes;
  if (wrongNotice) vsix['extension/NOTICE'] = strToU8('Wrong owner notice.\n');
  await writeFile(join(root, `artifacts/arya-language-${version}.vsix`), zipSync(vsix));
  await writeFile(join(root, `artifacts/arya-editor-kit-${version}.zip`), zipSync(legal));
  const checksums = [];
  for (const filename of [`${name}-${version}.tgz`, `arya-language-${version}.vsix`, `arya-editor-kit-${version}.zip`]) {
    const hash = createHash('sha256').update(await readFile(join(root, 'artifacts', filename))).digest('hex');
    checksums.push(`${hash}  ${filename}`);
  }
  await writeFile(join(root, 'artifacts/SHA256SUMS'), checksums.join('\n') + '\n');
}

test('release audit separates missing evidence from local failures and never executes candidate commands', async t => {
  const { root } = await fixture(t);
  const { result, report } = run(root);
  assert.equal(result.status, 0);
  assert.equal(report.localFailures, 0);
  assert.ok(report.localPending > 0);
  assert.equal(report.publicPrereleasePackageReady, false);
  assert.equal(report.publicReleaseReady, false);
  assert.equal(report.stableReleaseReady, false);
  assert.ok(report.manualGates.some((item: { id: string; status: string }) => item.id === 'external-community-observations' && item.status === 'pending'));
  await assert.rejects(access(join(root, 'CANARY')), { code: 'ENOENT' });
});

test('release audit rejects source and packed version mismatches', async t => {
  const { root, pkg } = await fixture(t);
  await writeFile(join(root, 'src/compiler.ts'), 'export const ARYA_VERSION = "9.9.9";\n');
  await archive(root, { ...pkg, version: '9.9.9' });
  const { result, report } = run(root);
  assert.equal(result.status, 1);
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'compiler-version' && item.status === 'fail'));
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'archive-identity' && item.status === 'fail'));
  assert.equal(report.publicPrereleasePackageReady, false);
});

test('release audit verifies archive contents and recorded checksum bytes rather than artifact names alone', async t => {
  const { root, pkg } = await fixture(t);
  await archive(root, pkg);
  await writeFile(join(root, 'artifacts/SHA256SUMS'), `${'0'.repeat(64)}  ${name}-${version}.tgz\n`);
  const { result, report } = run(root);
  assert.equal(result.status, 1);
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'archive-contents' && item.status === 'pass'));
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === `checksum:${name}-${version}.tgz` && item.status === 'fail'));
  assert.equal(report.artifacts.length, 1);
  assert.match(report.artifacts[0].sha256, /^[a-f0-9]{64}$/);
});

test('a complete licensed alpha can be mechanically ready without claiming publication or stable/platform/learner qualification', async t => {
  const { root, pkg } = await fixture(t);
  await archive(root, pkg);
  await editorArchives(root);
  const { result, report } = run(root);
  assert.equal(result.status, 0);
  assert.equal(report.localFailures, 0);
  assert.equal(report.localPending, 0);
  assert.equal(report.localArtifactReady, true);
  assert.equal(report.publicPrereleasePackageReady, true);
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'vsix-license-asset' && item.status === 'pass'));
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === `legal:arya-language-${version}.vsix:LICENSE` && item.status === 'pass'));
  assert.equal(report.publicReleaseReady, false);
  assert.equal(report.publicationVerified, false);
  assert.equal(report.stableReleaseReady, false);
  assert.ok(report.manualGates.some((item: { id: string; status: string }) => item.id === 'linux-windows-qualification' && item.status === 'pending'));
});

test('public alpha audit rejects private/latest metadata and missing or mismatched legal identity', async t => {
  const { root, pkg } = await fixture(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ ...pkg, private: true, publishConfig: { ...pkg.publishConfig, tag: 'latest' } }));
  await writeFile(join(root, 'NOTICE'), 'Copyright 2026 Someone Else\n');
  const { result, report } = run(root);
  assert.equal(result.status, 1);
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'public-prerelease-metadata' && item.status === 'fail'));
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'copyright-notice' && item.status === 'fail'));
  assert.equal(report.publicPrereleasePackageReady, false);
});

test('tarball and editor legal files must be the exact reviewed source texts', async t => {
  const { root, pkg } = await fixture(t);
  await archive(root, pkg, { LICENSE: 'This is not the reviewed Apache license.\n' });
  await editorArchives(root, true);
  const { result, report } = run(root);
  assert.equal(result.status, 1);
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === 'archive-legal:LICENSE' && item.status === 'fail'));
  assert.ok(report.checks.some((item: { id: string; status: string }) => item.id === `legal:arya-language-${version}.vsix:NOTICE` && item.status === 'fail'));
  assert.equal(report.publicPrereleasePackageReady, false);
});
