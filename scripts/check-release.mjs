import { readFile, stat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const args = process.argv.slice(2);
let root = process.cwd(), json = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--json') json = true;
  else if (args[index] === '--root' && args[index + 1]) root = resolve(args[++index]);
  else throw new Error('Use node scripts/check-release.mjs [--json] [--root directory].');
}
root = resolve(root);
const checks = [], artifacts = [];
const add = (id, status, detail) => checks.push({ id, status, detail });
const text = path => readFile(join(root, path), 'utf8');
const exists = async path => {
  try { return (await stat(join(root, path))).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const readJson = async path => JSON.parse(await text(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = { name: 'Hamza Arya', homepage: 'https://hamzaarya.com', securityContact: 'hamzaarya123@gmail.com', repository: 'https://github.com/HamzaArya/arya-lang' };
const repositoryUrl = value => (typeof value === 'string' ? value : value?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '');
const publicMetadata = value => value.private !== true && value.license === 'Apache-2.0' && value.publishConfig?.access === 'public' && value.publishConfig?.tag === 'next' && value.publishConfig?.registry === 'https://registry.npmjs.org/';
const legal = {};
let pkg;
try {
  pkg = await readJson('package.json');
  if (pkg.name !== 'arya-language' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) throw new Error('Expected arya-language with a valid version string.');
  add('package-identity', 'pass', `${pkg.name} ${pkg.version}`);
} catch (error) { add('package-identity', 'fail', error.message); }

if (pkg && checks[0].status === 'pass') {
  for (const [id, path, inspect] of [
    ['compiler-version', 'src/compiler.ts', source => source.match(/export const ARYA_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] === pkg.version],
    ['lockfile-version', 'package-lock.json', source => { const lock = JSON.parse(source); return lock.name === pkg.name && lock.version === pkg.version && lock.packages?.['']?.name === pkg.name && lock.packages?.['']?.version === pkg.version && lock.packages?.['']?.license === pkg.license; }],
    ['extension-version', 'editors/vscode/package.json', source => { const extension = JSON.parse(source); return extension.aryaLanguageVersion === pkg.version && extension.version === pkg.version.split('-')[0] && extension.preview === pkg.version.includes('-'); }],
    ['extension-license', 'editors/vscode/package.json', source => JSON.parse(source).license === pkg.license],
    ['security-contact', 'SECURITY.md', source => source.includes(owner.securityContact) && source.includes(owner.name)],
  ]) {
    try { add(id, inspect(await text(path)) ? 'pass' : 'fail', `${path} must match the candidate and recorded owner decisions.`); }
    catch (error) { add(id, 'fail', `${path}: ${error.message}`); }
  }
  add('public-prerelease-metadata', publicMetadata(pkg) && pkg.version.includes('-') ? 'pass' : 'fail', 'Apache-2.0 public prerelease; publishConfig must use the npm registry, public access, and next tag. This audit does not qualify a stable/latest release.');
  add('owner-metadata', (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name) === owner.name && pkg.homepage?.replace(/\/$/, '') === owner.homepage && repositoryUrl(pkg.repository) === owner.repository ? 'pass' : 'fail', 'Author Hamza Arya, homepage https://hamzaarya.com, and the existing GitHub repository match the owner selections.');
  add('node-requirement', typeof pkg.engines?.node === 'string' && pkg.engines.node.includes('22.15') ? 'pass' : 'fail', `Declared Node requirement: ${pkg.engines?.node ?? 'missing'}; documented minimum is 22.15.`);
  add('required-commands', ['check', 'build', 'test', 'test:package'].every(name => typeof pkg.scripts?.[name] === 'string') ? 'pass' : 'fail', 'Build/check/test/clean-package commands are declared; this audit does not run them.');

  const required = ['README.md', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt', 'SECURITY.md', 'docs/arya-specification.md', 'docs/arya-tutorial.md', 'docs/installing.md', 'docs/compatibility-policy.md', 'docs/community-review.md', 'docs/tooling-evidence.md', 'docs/release-readiness.md', `docs/releases/${pkg.version}.md`];
  for (const path of required) {
    try { const contents = await text(path); if (['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt'].includes(path)) legal[path] = contents; add(`file:${path}`, contents.trim() ? 'pass' : 'fail', path); }
    catch (error) { add(`file:${path}`, 'fail', `${path}: ${error.code ?? error.message}`); }
  }
  add('license-text', /Apache License[\s\S]*Version 2\.0, January 2004/.test(legal.LICENSE ?? '') && /END OF TERMS AND CONDITIONS/.test(legal.LICENSE ?? '') ? 'pass' : 'fail', 'LICENSE contains the adopted Apache-2.0 text; this is a mechanical file check, not a legal ownership assessment.');
  add('copyright-notice', /Copyright\s+2026\s+Hamza Arya/.test(legal.NOTICE ?? '') && (legal.NOTICE ?? '').includes(owner.homepage) && (legal.NOTICE ?? '').includes('THIRD-PARTY-NOTICES.txt') ? 'pass' : 'fail', 'NOTICE records Copyright 2026 Hamza Arya, the homepage, and retained third-party notices.');

  const archiveName = `${pkg.name}-${pkg.version}.tgz`, archivePath = join('artifacts', archiveName);
  if (await exists(archivePath)) {
    artifacts.push({ filename: archiveName, sha256: hash(await readFile(join(root, archivePath))) });
    try {
      const tar = (...parameters) => {
        const result = spawnSync('tar', parameters, { cwd: root, encoding: 'utf8', timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr.trim() || `tar exited ${result.status}`);
        return result.stdout;
      };
      const entries = new Set(tar('-tzf', archivePath).trim().split(/\r?\n/));
      const metadata = JSON.parse(tar('-xOf', archivePath, 'package/package.json'));
      add('archive-identity', metadata.name === pkg.name && metadata.version === pkg.version ? 'pass' : 'fail', 'Packed package name/version match source metadata.');
      add('archive-public-metadata', publicMetadata(metadata) && JSON.stringify(metadata.author) === JSON.stringify(pkg.author) && metadata.homepage === pkg.homepage && repositoryUrl(metadata.repository) === owner.repository ? 'pass' : 'fail', 'Packed license/owner/repository and public next-channel metadata match the reviewed source.');
      const files = ['dist/compiler.cjs', 'dist/project.cjs', 'dist/cli.cjs', 'dist/lsp.cjs', 'dist/language-service.cjs', 'dist/types/compiler.d.ts', 'dist/types/project.d.ts', 'LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt', 'SECURITY.md', 'docs/arya-specification.md', 'docs/arya-tutorial.md', `docs/releases/${pkg.version}.md`];
      const missing = files.filter(path => !entries.has(`package/${path}`));
      add('archive-contents', missing.length ? 'fail' : 'pass', missing.length ? `Missing from archive: ${missing.join(', ')}` : 'Compiler/project/CLI/LSP/types, legal files, security policy, specification, tutorial, and release notes are present.');
      for (const path of Object.keys(legal)) add(`archive-legal:${path}`, entries.has(`package/${path}`) && tar('-xOf', archivePath, `package/${path}`) === legal[path] ? 'pass' : 'fail', `${path} bytes must match the reviewed source.`);
      const accidental = [...entries].filter(path => /\/(?:\.arya|__pycache__|\.git|node_modules)\//.test(path));
      add('archive-generated-files', accidental.length ? 'fail' : 'pass', accidental.length ? `Unexpected generated/dependency files: ${accidental.slice(0, 8).join(', ')}` : 'No generated workspace output, cache, git metadata, or node_modules directory was packed.');
    } catch (error) { add('archive-inspection', 'fail', error.message); }
  } else add('archive', 'pending', `Build and review ${archivePath}.`);

  for (const [filename, prefix, metadata] of [[`arya-language-${pkg.version}.vsix`, 'extension/', true], [`arya-editor-kit-${pkg.version}.zip`, '', false]]) {
    if (!await exists(join('artifacts', filename))) { add(`artifact:${filename}`, 'pending', 'Build the editor artifacts before declaring a complete release set.'); continue; }
    const bytes = await readFile(join(root, 'artifacts', filename)); artifacts.push({ filename, sha256: hash(bytes) });
    try {
      const wanted = new Set(Object.keys(legal).map(path => prefix + path));
      if (metadata) { wanted.add('extension/package.json'); wanted.add('extension.vsixmanifest'); wanted.add('extension/LICENSE.txt'); }
      const entries = unzipSync(bytes, { filter: file => wanted.has(file.name) && file.originalSize <= 1024 * 1024 });
      let licenseAsset;
      if (metadata) {
        const manifest = Buffer.from(entries['extension.vsixmanifest'] ?? []).toString('utf8');
        for (const match of manifest.matchAll(/<Asset\b([^>]*)>/g)) {
          if (/\bType=["']Microsoft\.VisualStudio\.Services\.Content\.License["']/.test(match[1])) licenseAsset = /\bPath=["']([^"']+)["']/.exec(match[1])?.[1];
        }
        add('vsix-license-asset', ['extension/LICENSE', 'extension/LICENSE.txt'].includes(licenseAsset) ? 'pass' : 'fail', 'VSIX manifest must identify its actual LICENSE or normalized LICENSE.txt asset.');
      }
      for (const path of Object.keys(legal)) {
        const entry = entries[metadata && path === 'LICENSE' ? licenseAsset : prefix + path];
        add(`legal:${filename}:${path}`, entry && Buffer.from(entry).toString('utf8') === legal[path] ? 'pass' : 'fail', `${filename} must retain the exact reviewed ${path}.`);
      }
      if (metadata) {
        const extension = JSON.parse(Buffer.from(entries['extension/package.json'] ?? []).toString('utf8'));
        add('vsix-metadata', extension.license === pkg.license && extension.aryaLanguageVersion === pkg.version && extension.version === pkg.version.split('-')[0] && extension.preview === true ? 'pass' : 'fail', 'VSIX metadata declares the candidate language version, Apache-2.0, and preview status.');
      }
    } catch (error) { add(`inspect:${filename}`, 'fail', error.message); }
  }
  if (await exists('artifacts/SHA256SUMS')) {
    const lines = (await text('artifacts/SHA256SUMS')).split(/\r?\n/);
    for (const artifact of artifacts) {
      const record = lines.map(line => /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line)).find(match => match && basename(match[2]) === artifact.filename);
      add(`checksum:${artifact.filename}`, !record ? 'pending' : record[1].toLowerCase() === artifact.sha256 ? 'pass' : 'fail', !record ? 'Current candidate is absent from SHA256SUMS.' : 'Compare artifact bytes with the recorded SHA-256.');
    }
  } else add('checksums', 'pending', 'Write SHA256SUMS for the reviewed current artifact set.');
}

const manualGates = [
  { id: 'owner-decisions', status: 'recorded', appliesTo: 'public-prerelease', detail: 'On 2026-11-09 Hamza Arya selected Apache-2.0, npm arya-language with the next tag, the existing HamzaArya/arya-lang GitHub repository, and hamzaarya123@gmail.com for private security reports.' },
  { id: 'publication-authentication-and-result', status: 'unverified', appliesTo: 'public-prerelease', detail: 'The audit does not authenticate to npm/GitHub, verify account ownership, publish, or confirm a live prerelease. Record the actual transaction URLs, version and hashes separately.' },
  { id: 'clean-revision-and-test-evidence', status: 'unverified', appliesTo: 'public-prerelease', detail: 'Review the exact release revision/snapshot, test/clean-install logs and candidate hashes. This audit does not run tests or infer their results.' },
  { id: 'linux-windows-qualification', status: 'pending', appliesTo: 'additional-platform-claims', detail: 'Fresh Linux/Windows results must be recorded for the exact current candidate. Earlier-version CI evidence does not establish current platform qualification. Missing current results do not block the explicitly macOS-qualified experimental alpha.' },
  { id: 'external-community-observations', status: 'pending', appliesTo: 'stable-release', detail: 'No external learner feedback was supplied. Real observations and findings remain M7/M8/M9 stable-readiness gates, not alpha publication claims.' },
  { id: 'stable-contract-and-release-approval', status: 'unverified', appliesTo: 'stable-release', detail: 'No 1.0 release is qualified. A public alpha does not satisfy stable specification, support, platform, learner, or governance gates.' },
];
const failures = checks.filter(check => check.status === 'fail');
const localPending = checks.filter(check => check.status === 'pending').length;
const localArtifactReady = failures.length === 0 && localPending === 0;
const publicPrereleasePackageReady = localArtifactReady && !!pkg?.version?.includes('-') && publicMetadata(pkg);
const report = { version: pkg?.version ?? null, packageName: pkg?.name ?? null, root, localFailures: failures.length, localPending, localArtifactReady, publicPrereleasePackageReady, publicReleaseReady: false, publicationVerified: false, stableReleaseReady: false, interpretation: 'Read-only local package audit. publicPrereleasePackageReady covers mechanical package prerequisites only; legacy publicReleaseReady remains false because this audit cannot certify account authorization, test/provenance review or a live publication. Stable/platform/community gates remain separate.', checks, artifacts, manualGates };
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Arya ${report.version ?? '(unknown version)'} local release audit`);
  console.log(`Public prerelease package: ${publicPrereleasePackageReady ? 'MECHANICAL CHECKS PASS' : 'NOT READY'}. Publication: NOT VERIFIED. Stable release: NOT QUALIFIED.`);
  for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
  for (const artifact of artifacts) console.log(`SHA256 ${artifact.sha256}  ${artifact.filename}`);
  for (const gate of manualGates) console.log(`${gate.status.toUpperCase()} ${gate.id}: ${gate.detail}`);
  console.log(report.interpretation);
}
process.exitCode = failures.length ? 1 : 0;
