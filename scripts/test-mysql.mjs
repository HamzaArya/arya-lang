import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';

if (!process.env.ARYA_MYSQL_TEST_CONFIG) {
  throw new Error('Set ARYA_MYSQL_TEST_CONFIG to connection options for a disposable MySQL database. See docs/mysql.md.');
}

await build({
  entryPoints: ['tests/mysql-live.test.ts'],
  outfile: '.build/tests/mysql-live.test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});

const result = spawnSync(process.execPath, ['--test', '.build/tests/mysql-live.test.cjs'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
