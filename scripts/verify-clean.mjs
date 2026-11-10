import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

// Verify a reviewed working-tree snapshot without changing the Git index or
// pretending that uncommitted changes form a clean release revision.
const parameters = process.argv.slice(2);
if (parameters.length && (parameters.length !== 2 || parameters[0] !== '--offline-cache')) throw new Error('Use npm run test:clean [-- --offline-cache /path/to/npm-cache].');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:clean so the active npm CLI is known.');
const root = process.cwd(), temp = await mkdtemp(join(tmpdir(), 'arya-clean-candidate-'));
const source = join(temp, 'source'), cache = join(temp, 'npm-cache');
const evidence = join(root, '.build', 'evidence', 'clean-' + new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(source); await mkdir(evidence, { recursive: true });
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Cannot inventory source files.');
  return result.stdout;
};
const allowed = /^(?:src\/|tests\/|scripts\/|fixtures\/|editors\/|docs\/|brand\/|packages\/|\.github\/|README\.md$|CONTRIBUTING\.md$|CHANGELOG\.md$|SECURITY\.md$|LICENSE(?:\.[^/]+)?$|NOTICE$|THIRD-PARTY-NOTICES\.txt$|\.gitignore$|\.npmignore$|package(?:-lock)?\.json$|tsconfig(?:\.[^/]+)?\.json$)/;
const deleted = new Set(git('ls-files', '-z', '--deleted').split('\0'));
const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(name => name && !deleted.has(name) && allowed.test(name)))].sort();
const sha = data => createHash('sha256').update(data).digest('hex');
const inventory = [];
for (const filename of files) {
  const bytes = await readFile(join(root, filename));
  inventory.push({ filename, sha256: sha(bytes) });
  const target = join(source, filename); await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const manifest = JSON.stringify({ gitRevision: git('rev-parse', 'HEAD').trim(), workingTreeDirty: !!git('status', '--porcelain').trim(), files: inventory }, null, 2) + '\n';
await writeFile(join(evidence, 'source-manifest.json'), manifest);
await writeFile(join(source, 'SOURCE-MANIFEST.json'), manifest);
await mkdir(cache);
if (parameters.length) await cp(join(resolve(parameters[1]), '_cacache'), join(cache, '_cacache'), { recursive: true, mode: constants.COPYFILE_FICLONE });
const env = { ...process.env, npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', ...(parameters.length ? { npm_config_offline: 'true' } : {}) };
const record = { snapshot: source, evidence, node: process.version, platform: process.platform, architecture: process.arch, sourceManifestSha256: sha(manifest), packageLockSha256: sha(await readFile(join(source, 'package-lock.json'))), commands: [], passed: false, publicReleaseReady: false, stableReleaseReady: false };
try {
  for (const [name, args] of [
    ['install', ['ci', '--no-audit', '--no-fund', ...(parameters.length ? ['--offline'] : [])]],
    ['check', ['run', 'check']],
    ['editors', ['run', 'package:editors']],
    ['package', ['run', 'test:package']],
    ['audit', ['run', 'release:check', '--', '--json']],
  ]) {
    console.log(`Clean candidate: ${name}`);
    const log = join(evidence, name + '.log'), handle = await open(log, 'w');
    let code;
    try {
      code = await new Promise((ok, fail) => {
        const child = spawn(process.execPath, [npm, ...args], { cwd: source, env, stdio: ['ignore', handle.fd, handle.fd] });
        child.once('error', fail); child.once('exit', code => ok(code ?? 1));
      });
    } finally { await handle.close(); }
    record.commands.push({ name, args, exitCode: code, log });
    if (code !== 0) throw new Error(`Clean ${name} failed; inspect ${log}`);
  }
  record.passed = true;
} finally {
  const encoded = JSON.stringify(record, null, 2) + '\n';
  await writeFile(join(evidence, 'verification.json'), encoded);
  await writeFile(join(root, '.build', 'clean-candidate-record.json'), encoded);
}
console.log(`Clean candidate verified: ${source}`);
console.log(`Evidence: ${evidence}`);
console.log('This verifies the recorded snapshot; public/stable gates remain separate.');
