import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/accounting.test.ts'],
  outfile: '.build/accounting-tests/accounting.test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', '.build/accounting-tests/accounting.test.cjs'],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
