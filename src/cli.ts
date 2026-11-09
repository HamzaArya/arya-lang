import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ARYA_VERSION } from './compiler.js';
import { buildProject, checkProject, writeProject, ProjectError } from './project.js';
import { checkNativeProject, writeNativeProject, type NativeOptions } from './native.js';

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === '--version') { console.log(`Arya ${ARYA_VERSION}`); return; }
  if (!command || command === '--help') {
    console.log('Arya — readable code, connected ecosystems\n\n  arya run <file.arya> [--target js|native] [-- program arguments]\n  arya check <file.arya> [--target js|native]\n  arya build <file.arya> [--target js|native] [-o executable]\n\nNative options: --cc executable, --debug, --release, --sanitize.\nJS is the default; native builds C11 machine-code executables under .arya/native.\nSet ARYA_CC to select the C compiler or ARYA_PYTHON for the Python bridge.'); return;
  }
  if (!['run', 'check', 'build'].includes(command) || !file || !file.toLowerCase().endsWith('.arya')) throw new Error('Use arya run, check, or build followed by a .arya file. See --help.');
  let target: 'js'|'native'='js'; const nativeOptions: NativeOptions={},programArgs:string[]=[];
  for(let i=0;i<rest.length;i++) {
    const arg=rest[i]!;
    if(arg==='--') {programArgs.push(...rest.slice(i+1));break;}
    if(arg==='--target') {const value=rest[++i];if(value!=='js'&&value!=='native')throw new Error('--target requires js or native.');target=value;}
    else if(arg==='-o'||arg==='--output'||arg==='--cc') {const value=rest[++i];if(!value)throw new Error(`${arg} requires a value.`);if(arg==='--cc')nativeOptions.compiler=value;else nativeOptions.output=resolve(value);}
    else if(arg==='--debug'||arg==='--release') nativeOptions.optimization=arg==='--debug'?'debug':'release';
    else if(arg==='--sanitize')nativeOptions.sanitize=true;
    else {programArgs.push(...rest.slice(i));break;}
  }
  if(command!=='run'&&programArgs.length)throw new Error('Program arguments are only supported by arya run.');
  if(target==='js'&&Object.keys(nativeOptions).length)throw new Error('Output/compiler/optimization options require --target native.');
  const source = resolve(file);
  let output: string;
  try {
    if(target==='native') {
      const project=await checkNativeProject(source,nativeOptions);
      if(command==='check') {console.log(`Check OK (native): ${file}`);return;}
      output=(await writeNativeProject(project,nativeOptions)).executable;
    } else {
      const project = command === 'check' ? await checkProject(source) : await buildProject(source);
      if(command==='check') {console.log(`Check OK: ${file}`);return;}
      output=await writeProject(project);
    }
  }
  catch (error) {
    if (error instanceof ProjectError) throw new Error(error.diagnostics.map(item => `${error.filename}:${item.token.line + 1}:${item.token.column + 1}: ${item.message}`).join('\n'));
    throw error;
  }
  if (command === 'build') { console.log(output); return; }
  const child = spawn(target==='native'?output:process.execPath, target==='native'?programArgs:['--enable-source-maps', output, ...programArgs], { stdio: 'inherit', env: process.env });
  // Forward interruption when the CLI is used outside AryaCode's task terminal.
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise<number>((ok, fail) => { child.once('error', fail); child.once('exit', (code, signal) => ok(code ?? (signal === 'SIGINT' ? 130 : 1))); });
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
