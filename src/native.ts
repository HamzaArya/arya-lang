import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ARYA_VERSION, AryaError, parseProgram } from './compiler.js';
import { buildProject, ProjectError, type ProjectOptions } from './project.js';
import { containedPath, readBounded } from './files.js';
import { emitNative, nativeDiagnostics, type NativeEmission } from './native/emitter.js';
export { emitNative, nativeDiagnostics } from './native/emitter.js';
export type { NativeEmission, NativeSource } from './native/emitter.js';
export interface NativeOptions extends ProjectOptions { execute?: (executable: string, args: string[], signal?: AbortSignal) => Promise<{exitCode: number | null; stdout: string; stderr: string}>; output?: string; compiler?: string; compilerArgs?: string[]; optimization?: 'debug' | 'release'; sanitize?: boolean; env?: NodeJS.ProcessEnv }
export interface NativeProject extends NativeEmission { entry: string; root: string; outputDirectory: string; entryOutput: string; workspaceRoot?: string; signal?: AbortSignal; fingerprint: string }
export interface NativeBuild { executable: string; source: string; manifest: string; compiler: string; arguments: string[]; stdout: string; stderr: string }
/** Read/check the shared graph and generate C, without invoking any toolchain. */
export async function checkNativeProject(filename: string,options: NativeOptions = {}): Promise<NativeProject> {
  const graph=await buildProject(filename,{...options,target:'native'});
  const sources=[];
  for(const module of graph.modules) {
    const source=await readBounded(module.filename);
    try { const p=parseProgram(source,module.filename), diagnostics=[...p.diagnostics,...nativeDiagnostics(p)]; if(diagnostics.length) throw new ProjectError(module.filename,diagnostics); }
    catch(error) { if(error instanceof AryaError) throw new ProjectError(module.filename,error.diagnostics); throw error; }
    sources.push({filename:module.filename,source});
  }
  const emission=emitNative(sources,graph.entry),outputDirectory=resolve(options.outputDirectory??join(graph.root,'.arya','native'));
  await containedPath(graph.root,outputDirectory);
  if(options.workspaceRoot) await containedPath(options.workspaceRoot,outputDirectory);
  const entryOutput=resolve(options.output??join(outputDirectory,basename(graph.entry,'.arya')+(process.platform==='win32'?'.exe':'')));
  // Explicit output may be outside the source directory, but an embedding workspace remains authoritative.
  if(options.workspaceRoot) await containedPath(options.workspaceRoot,entryOutput);
  const fingerprint=createHash('sha256').update(emission.code).digest('hex');
  return { ...emission,entry:graph.entry,root:graph.root,outputDirectory,entryOutput,fingerprint,...(graph.workspaceRoot?{workspaceRoot:graph.workspaceRoot}:{}),...(options.signal?{signal:options.signal}:{}) };
}
export const buildNativeProject=checkNativeProject;
const publications=new Map<string,Promise<void>>();
/** Compile/link in staging and publish a complete owned build, with rollback. */
export async function writeNativeProject(project: NativeProject,options: NativeOptions = {}): Promise<NativeBuild> {
  const previous=publications.get(project.outputDirectory)??Promise.resolve(); let unlock!:()=>void;
  const lock=new Promise<void>(ok=>{unlock=ok;}); publications.set(project.outputDirectory,lock); await previous;
  let stage: string|undefined,backup: string|undefined; let published=false,committed=false;
  const signal=options.signal??project.signal;
  try {
    signal?.throwIfAborted(); await containedPath(project.root,project.outputDirectory);
    if(project.workspaceRoot) { await containedPath(project.workspaceRoot,project.outputDirectory); await containedPath(project.workspaceRoot,project.entryOutput); }
    if(project.sourceFiles.includes(project.entryOutput)) throw new Error('Native output cannot replace source.');
    let existing=false;
    try { const stat=await lstat(project.outputDirectory); if(stat.isSymbolicLink()||!stat.isDirectory()) throw new Error('Native output must be an owned directory, not a link.'); existing=true; }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
    if(existing) {
      let manifest;
      try { const marker=join(project.outputDirectory,'.arya-native.json'); if((await lstat(marker)).isSymbolicLink())throw new Error('Linked native manifest.'); manifest=JSON.parse(await readFile(marker,'utf8')); }
      catch {throw new Error('Native output directory is not owned by Arya. Choose another output directory.');}
      if(manifest.format!==1||manifest.owner!=='arya-native')throw new Error('Native output directory is not owned by Arya.');
      const args=Array.isArray(manifest.arguments)?manifest.arguments:[],name=args[args.indexOf('-o')+1];
      const allowed=new Set(['.arya-native.json','program.c',name]);
      const ownedDebug=async(directory:string):Promise<void>=>{for(const child of await readdir(directory,{withFileTypes:true})){if(child.isSymbolicLink()||(!child.isFile()&&!child.isDirectory()))throw new Error('Native debug output contains a link or special file.');if(child.isDirectory())await ownedDebug(join(directory,child.name));}};
      for(const item of await readdir(project.outputDirectory,{withFileTypes:true})) {
        if(item.name==='program.dSYM'&&args.includes('-g')&&item.isDirectory()&&!item.isSymbolicLink()){await ownedDebug(join(project.outputDirectory,item.name));continue;}
        if(!allowed.has(item.name)||!item.isFile()||item.isSymbolicLink())throw new Error('Native output contains an unowned file or link: '+item.name);
      }
    }
    await mkdir(dirname(project.outputDirectory),{recursive:true}); stage=await mkdtemp(join(dirname(project.outputDirectory),'.arya-native-stage-'));
    const source=join(stage,'program.c'),executable=join(stage,'program'+(process.platform==='win32'?'.exe':'')); await writeFile(source,project.code,{flag:'wx'});
    const compiler=options.compiler??options.env?.ARYA_CC??process.env.ARYA_CC??process.env.CC??'cc';
    const args=[...(options.compilerArgs??[]),'-std=c11',options.optimization==='debug'?'-O0':'-O2','-g0','-fno-omit-frame-pointer','-ffp-contract=off',...(options.sanitize?['-fsanitize=address,undefined']:[]),source,'-o',executable,'-lm'];
    let stdout='',stderr='';
    if(options.execute) { const result=await options.execute(compiler,args,signal); stdout=result.stdout;stderr=result.stderr;if(result.exitCode!==0)throw new Error(`C compilation failed (${compiler}, exit ${result.exitCode}):\n${stderr}`); }
    else await new Promise<void>((ok,fail)=>{
      const child=spawn(compiler,args,{stdio:['ignore','pipe','pipe'],env:options.env??process.env,...(signal?{signal}:{})}); let bytes=0,settled=false;
      const stop=(error:Error)=>{if(!settled){settled=true;child.kill('SIGKILL');fail(error);}};
      const timer=setTimeout(()=>stop(new Error('Native compiler exceeded its 180 second deadline.')),180000);
      child.stdout.on('data',chunk=>{bytes+=chunk.length; if(bytes>8*1024*1024) stop(new Error('Native compiler output exceeds 8 MiB.')); else stdout+=chunk;});
      child.stderr.on('data',chunk=>{bytes+=chunk.length; if(bytes>8*1024*1024) stop(new Error('Native compiler output exceeds 8 MiB.')); else stderr+=chunk;});
      child.once('error',error=>{clearTimeout(timer);stop(new Error(`Cannot start C compiler ${compiler}: ${error.message}. Install a C11 toolchain or set ARYA_CC.`));});
      child.once('close',code=>{clearTimeout(timer);if(settled)return;settled=true;if(code===0)ok();else fail(new Error(`C compilation failed (${compiler}, exit ${code}):\n${stderr}`));});
    });
    signal?.throwIfAborted();
    const executableName=basename(project.entryOutput),internal=dirname(project.entryOutput)===project.outputDirectory;
    if(internal && executableName!==basename(executable)) await rename(executable,join(stage,executableName));
    const metadata={format:1,owner:'arya-native',version:ARYA_VERSION,entry:project.entry,sourceFiles:project.sourceFiles,fingerprint:project.fingerprint,compiler,arguments:args.map(a=>a===source?'program.c':a===executable?(internal?executableName:basename(executable)):a),platform:process.platform,architecture:process.arch,optimization:options.optimization??'release',specializedFunctions:project.specializedFunctions};
    await writeFile(join(stage,'.arya-native.json'),JSON.stringify(metadata,null,2)+'\n');
    try { await lstat(project.outputDirectory); backup=stage+'-previous'; await rename(project.outputDirectory,backup); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
    try { await rename(stage,project.outputDirectory); stage=undefined; published=true; } catch(error) { if(backup){await rename(backup,project.outputDirectory);backup=undefined;} throw error; }
    if(!internal) {
      await mkdir(dirname(project.entryOutput),{recursive:true});
      try { const s=await lstat(project.entryOutput); if(s.isSymbolicLink()||!s.isFile()) throw new Error('Explicit native output cannot replace a link or special file.'); } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      // A same-directory temporary preserves atomic replacement across filesystems.
      const externalStage=await mkdtemp(join(dirname(project.entryOutput),'.arya-executable-'));
      try { const {copyFile,chmod}=await import('node:fs/promises'); const temp=join(externalStage,'program'); await copyFile(join(project.outputDirectory,basename(executable)),temp); await chmod(temp,0o755); signal?.throwIfAborted(); await rename(temp,project.entryOutput); } finally {await rm(externalStage,{recursive:true,force:true});}
    }
    committed=true;
    if(backup) {await rm(backup,{recursive:true,force:true});backup=undefined;}
    return {executable:project.entryOutput,source:join(project.outputDirectory,'program.c'),manifest:join(project.outputDirectory,'.arya-native.json'),compiler,arguments:metadata.arguments,stdout,stderr};
  } finally { if(!committed && published) {await rm(project.outputDirectory,{recursive:true,force:true});if(backup){await rename(backup,project.outputDirectory);backup=undefined;}} if(stage)await rm(stage,{recursive:true,force:true}); if(backup)await rm(backup,{recursive:true,force:true}); unlock(); if(publications.get(project.outputDirectory)===lock)publications.delete(project.outputDirectory); }
}
