import {writeFile} from 'node:fs/promises';
import {formatSource, lintSource} from './tooling.js';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ARYA_VERSION, formatDiagnostics, diagnosticFixes } from './compiler.js';
import { buildProject, checkProject, writeProject, ProjectError } from './project.js';
import { runProjectCreator } from './project-creator.js';
import { readBounded } from './files.js';
import {runEditorSetup} from './editor.js';

const jsonCheck = process.argv[2] === 'check' && process.argv.slice(4).includes('--json');

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (command === '--version') { console.log(`Arya ${ARYA_VERSION}`); return; }
  if (!command || command === '--help') {
    console.log('Arya — readable code, connected ecosystems\n\n  arya create [directory] [--template web|api|cli|ui|desktop]\n  arya init [directory] --web\n  arya editor status|install|path [--editor all|code|aryacode|cursor|codium|windsurf]\n  arya run <file.arya> [-- program arguments]\n  arya check <file.arya> [--json]\n  arya build <file.arya>\n  arya fmt <file.arya> [--check]\n  arya lint <file.arya>\n  arya test <file.test.arya>\n\nArya compiles to JavaScript modules and runs on Node.js 22.15+.\nBuild output: .arya/build beside the entry source.\nWeb projects use index.html, main.arya, and public CSS/JavaScript files.\nSet ARYA_PYTHON to select the interpreter for Python bridge calls.'); return;
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
  if ((command === 'fmt' || command === 'lint') && file?.endsWith('.arya')) {
    if(rest.some(arg=>arg!=='--check') || command==='lint'&&rest.length)throw new Error('Use arya fmt file.arya [--check] or arya lint file.arya.');
    const source=await readBounded(resolve(file));
    if(command==='fmt') { const formatted=formatSource(source,file); if(rest.includes('--check')) {if(formatted!==source){console.error('Formatting required: '+file);process.exitCode=1;}} else await writeFile(resolve(file),formatted); }
    else {const diagnostics=lintSource(source,file);if(diagnostics.length){console.error(formatDiagnostics(file,source,diagnostics));process.exitCode=1;}}
    return;
  }
  if (!['run','test', 'check', 'build'].includes(command) || !file || !file.toLowerCase().endsWith('.arya')) throw new Error('Use arya run, check, or build followed by a .arya file. See --help.');
  const target = 'js';
  const programArgs: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index]!;
    if (argument === '--') { programArgs.push(...rest.slice(index + 1)); break; }
    if (argument === '--target' || argument.startsWith('--target=')) {
      const value = argument === '--target' ? rest[++index] : argument.slice('--target='.length);
      if (value !== 'js') throw new Error('Arya supports the Node.js runtime only. Remove --target; native compilation is retired.');
    } else if (command === 'check' && argument === '--json') {
      // JSON reporting is selected before validation.
    } else if (['-o', '--output', '--cc', '--debug', '--release', '--sanitize'].includes(argument.split('=')[0]!)) {
      throw new Error(argument + ' was a native compiler option and is no longer supported. Build Node.js modules with arya build. Pass literal program arguments after --.');
    } else { programArgs.push(...rest.slice(index)); break; }
  }
  if (command !== 'run' && programArgs.length) throw new Error('Program arguments are only supported by arya run.');
  const source = resolve(file);
  let output: string;
  try {
    const project = command === 'check' ? await checkProject(source) : await buildProject(source);
    if (command === 'check') {
      console.log(jsonCheck ? JSON.stringify({ok: true, command: 'check', file: source, target, diagnostics: []}) : `Check OK: ${file}`);
      return;
    }
    output = await writeProject(project);
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
  const childEnv = {...process.env};
  if(command==='test')delete childEnv.NODE_TEST_CONTEXT; // Start an independent runner when invoked from a Node test host.
  const child = spawn(process.execPath, ['--enable-source-maps', ...(command==='test'?['--test']:[]), output, ...programArgs], { stdio: 'inherit', env: childEnv });
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
