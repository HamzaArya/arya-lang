import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ARYA_VERSION } from './compiler.js';
import { buildProject, checkProject, writeProject, ProjectError } from './project.js';

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === '--version') { console.log(`Arya ${ARYA_VERSION}`); return; }
  if (!command || command === '--help') {
    console.log('Arya — readable code, connected ecosystems\n\n  arya run <file.arya> [-- program arguments]\n  arya check <file.arya>\n  arya build <file.arya>\n\nBuild writes an ES module under .arya/build beside the source.\nSet ARYA_PYTHON to select a Python interpreter for the bridge.'); return;
  }
  if (!['run', 'check', 'build'].includes(command) || !file || !file.toLowerCase().endsWith('.arya') || (command !== 'run' && rest.length)) throw new Error('Use arya run, check, or build followed by a .arya file. See --help.');
  const source = resolve(file);
  let project;
  try { project = command === 'check' ? await checkProject(source) : await buildProject(source); }
  catch (error) {
    if (error instanceof ProjectError) throw new Error(error.diagnostics.map(item => `${error.filename}:${item.token.line + 1}:${item.token.column + 1}: ${item.message}`).join('\n'));
    throw error;
  }
  if (command === 'check') { console.log(`Check OK: ${file}`); return; }
  const output = await writeProject(project);
  if (command === 'build') { console.log(output); return; }
  const child = spawn(process.execPath, ['--enable-source-maps', output, ...(rest[0] === '--' ? rest.slice(1) : rest)], { stdio: 'inherit', env: process.env });
  // Forward interruption when the CLI is used outside AryaCode's task terminal.
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise<number>((ok, fail) => { child.once('error', fail); child.once('exit', (code, signal) => ok(code ?? (signal === 'SIGINT' ? 130 : 1))); });
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
