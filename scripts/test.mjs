import { build } from 'esbuild';
import { readdir, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await rm('.build/tests', {recursive: true, force: true});
await mkdir('.build/tests', { recursive: true });
const files = (await readdir('tests')).filter(name => name.endsWith('.test.ts'));
await build({ entryPoints: files.map(name => `tests/${name}`), outdir: '.build/tests', outExtension: { '.js': '.cjs' }, bundle: true, external:['esbuild'], platform: 'node', format: 'cjs', target: 'node22' });
const concurrency=Number(process.env.ARYA_TEST_CONCURRENCY ?? 2);
if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>64)throw new Error('ARYA_TEST_CONCURRENCY must be an integer from 1 to 64.');
const timeout=Number(process.env.ARYA_TEST_TIMEOUT_MS ?? 120000);
if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>600000)throw new Error('ARYA_TEST_TIMEOUT_MS must be an integer from 1000 to 600000.');
// TAP emits failure details immediately, including when another test leaves a
// process or server alive. Bound each test and the complete runner as well.
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-timeout='+timeout, '--test-concurrency='+concurrency, ...files.map(name => `.build/tests/${name.replace(/\.ts$/, '.cjs')}`)], { stdio: 'inherit', timeout: 15 * 60 * 1000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
