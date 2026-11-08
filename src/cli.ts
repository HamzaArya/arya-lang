import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { compile, AryaError, ARYA_VERSION } from './compiler.js';
import { readBounded } from './files.js';

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === '--version') { console.log(`Arya ${ARYA_VERSION}`); return; }
  if (!command || command === '--help') {
    console.log('Arya — readable code, connected ecosystems\n\n  arya run <file.arya> [-- program arguments]\n  arya check <file.arya>\n  arya build <file.arya>\n\nBuild writes an ES module under .arya/build beside the source.\nSet ARYA_PYTHON to select a Python interpreter for the bridge.'); return;
  }
  if (!['run', 'check', 'build'].includes(command) || !file || !file.toLowerCase().endsWith('.arya') || (command !== 'run' && rest.length)) throw new Error('Use arya run, check, or build followed by a .arya file. See --help.');
  const source = resolve(file);
  let result;
  try { result = compile(await readBounded(source), source); }
  catch (error) {
    if (error instanceof AryaError) throw new Error(`${source}:${error.token.line + 1}:${error.token.column + 1}: ${error.message}`);
    throw error;
  }
  if (command === 'check') { console.log(`Syntax OK: ${file}`); return; }
  const directory = join(dirname(source), '.arya/build');
  // Build artifacts live beside their source so npm resolves that package's dependencies.
  const { containedPath } = await import('./files.js');
  const { realpath } = await import('node:fs/promises');
  const root = await realpath(dirname(source));
  const output = await containedPath(root, join(directory, `${basename(source)}.mjs`));
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, result.code);
  if (command === 'build') { console.log(output); return; }
  const child = spawn(process.execPath, [output, ...(rest[0] === '--' ? rest.slice(1) : rest)], { stdio: 'inherit', env: process.env });
  // Forward interruption when the CLI is used outside AryaCode's task terminal.
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise<number>((ok, fail) => { child.once('error', fail); child.once('exit', (code, signal) => ok(code ?? (signal === 'SIGINT' ? 130 : 1))); });
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
