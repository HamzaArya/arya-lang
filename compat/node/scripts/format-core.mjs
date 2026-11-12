import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';

// Expand this list deliberately as other modules adopt the same source style.
const files = [
  'src/native-ir.ts',
  'tests/native-ir.test.ts',
  'scripts/benchmark-native-preview.mjs',
  'src/native-lower.ts',
  'src/native-backend.ts',
  'src/native-preview.ts',
  'tests/native-preview.test.ts',
  'scripts/test-native-preview.mjs',
  'src/accounting.ts',
  'src/accounting-core.ts',
  'tests/accounting.test.ts',
  'native/accounting/build.mjs',
  'scripts/test-accounting.mjs',
  'scripts/package-accounting.mjs',
  'scripts/test-accounting-package.mjs',
  'scripts/benchmark-accounting.mjs',
  'scripts/benchmarks/accounting-data.mjs',
  'scripts/benchmarks/accounting-worker.mjs',
  'scripts/benchmarks/accounting-paired.mjs',
  'src/ast.ts',
  'src/compiler.ts',
  'src/emitter.ts',
  'src/types.ts',
  'src/type-model.ts',
  'src/type-effects.ts',
  'src/declarations.ts',
  'src/language-service.ts',
  'src/workspace-service.ts',
  'src/workspace-index.ts',
  'src/lsp.ts',
  'src/project.ts',
  'src/cli.ts',
  'tests/type-flow.test.ts',
  'tests/declarations.test.ts',
  'tests/fixtures/editor-host.cjs',
  'scripts/format-core.mjs',
  'scripts/test-editor-host.mjs',
  'scripts/sync-feature-status.mjs',
  'tests/fixtures/editor-debug.cjs',
];
const write = process.argv.includes('--write');
let changed = 0;
for (const filename of files) {
  const source = await readFile(filename, 'utf8');
  const formatted = await format(source, {
    filepath: filename,
    singleQuote: true,
    printWidth: 100,
  });
  if (source === formatted) continue;
  changed++;
  if (write) await writeFile(filename, formatted);
  else console.error(filename + ': run npm run format');
}
if (changed && !write) process.exitCode = 1;
else
  console.log(`Core formatting OK: ${files.length} files${write ? `, ${changed} updated` : ''}.`);
