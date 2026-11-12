import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';

await build({
  entryPoints: ['tests/native-preview.test.ts'],
  outfile: '.build/native-preview-tests/native-preview.test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    '--test-timeout=120000',
    '.build/native-preview-tests/native-preview.test.cjs',
  ],
  { stdio: 'inherit', env: { ...process.env, ARYA_TEST_NATIVE_PREVIEW: '1' } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
