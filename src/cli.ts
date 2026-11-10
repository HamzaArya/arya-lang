import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ARYA_VERSION, formatDiagnostics, diagnosticFixes } from './compiler.js';
import { buildProject, checkProject, writeProject, ProjectError } from './project.js';
import { checkNativeProject, writeNativeProject, type NativeOptions } from './native.js';
import { runProjectCreator } from './project-creator.js';
import { readBounded } from './files.js';
import {runEditorSetup} from './editor.js';

const jsonCheck = process.argv[2] === 'check' && process.argv.slice(4).includes('--json');

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === '--version') { console.log(`Arya ${ARYA_VERSION}`); return; }
  if (!command || command === '--help') {
    console.log('Arya — readable code, connected ecosystems\n\n  arya create [directory] [--template web|api|cli|native|ui|desktop]\n  arya init [directory] --web\n  arya editor status|install|path [--editor all|code|aryacode|cursor|codium|windsurf]\n  arya run <file.arya> [--target js|native] [-- program arguments]\n  arya check <file.arya> [--target js|native] [--json]\n  arya build <file.arya> [--target js|native] [-o executable]\n\nWeb projects use index.html, main.arya, and public CSS/JavaScript files.\nNative options: --cc executable, --debug, --release, --sanitize.\nJS is the default; native builds C11 machine-code executables under .arya/native.\nSet ARYA_CC to select the C compiler or ARYA_PYTHON for the Python bridge.'); return;
  }
  if (command === 'init' || command === 'create') { await runProjectCreator(process.argv.slice(3), command); return; }
  if (command === 'editor') {
    try { await runEditorSetup(process.argv.slice(3)); }
    catch (error) {
      if (!process.argv.slice(3).includes('--json')) throw error;
      console.log(JSON.stringify({ok: false, error: {code: 'ARYA_EDITOR', message: error instanceof Error ? error.message : String(error)}}));
      process.exitCode = 1;
    }
    return;
  }
  if (!['run', 'check', 'build'].includes(command) || !file || !file.toLowerCase().endsWith('.arya')) throw new Error('Use arya run, check, or build followed by a .arya file. See --help.');
  let target: 'js'|'native'='js'; const nativeOptions: NativeOptions={},programArgs:string[]=[];
  for(let i=0;i<rest.length;i++) {
    const arg=rest[i]!;
    if(arg==='--') {programArgs.push(...rest.slice(i+1));break;}
    if(arg==='--target') {const value=rest[++i];if(value!=='js'&&value!=='native')throw new Error('--target requires js or native.');target=value;}
    else if(command==='check'&&arg==='--json') { /* JSON reporting is selected before validation. */ }
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
      if(command==='check') {console.log(jsonCheck ? JSON.stringify({ok:true,command:'check',file:source,target,diagnostics:[]}) : `Check OK (native): ${file}`);return;}
      output=(await writeNativeProject(project,nativeOptions)).executable;
    } else {
      const project = command === 'check' ? await checkProject(source) : await buildProject(source);
      if(command==='check') {console.log(jsonCheck ? JSON.stringify({ok:true,command:'check',file:source,target,diagnostics:[]}) : `Check OK: ${file}`);return;}
      output=await writeProject(project);
    }
  }
  catch (error) {
    if (error instanceof ProjectError) {
      let text: string | undefined;
      try { text = await readBounded(error.filename); } catch { /* Keep diagnostics even when the file became unreadable. */ }
      if (jsonCheck) {
        console.log(JSON.stringify({ok:false,command:'check',file:source,target,diagnostics:error.diagnostics.map(item => ({
          file:error.filename,code:item.code,message:item.message,line:item.token.line+1,column:item.token.column+1,start:item.token.start,end:item.token.end,
          hint:item.hint,suggestion:item.suggestion,fixes:diagnosticFixes(text ?? '',[item])
        }))}));
      } else console.error(formatDiagnostics(error.filename,text,error.diagnostics));
      process.exitCode=1;
      return;
    }
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
void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  if(jsonCheck) console.log(JSON.stringify({ok:false,command:'check',diagnostics:[{code:'ARYA_CLI',message}]}));
  else console.error(message);
  process.exitCode = 1;
});
