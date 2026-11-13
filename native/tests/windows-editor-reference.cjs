'use strict';
// Test controller only: native Windows Node launches the Cygwin PE executable
// exactly as the VS Code extension host does. Arya performs all analysis.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {pathToFileURL, fileURLToPath} = require('node:url');
if (process.platform !== 'win32') throw new Error('Run this gate with native Windows Node on the Windows qualification runner.');
const compiler = path.resolve(process.argv[2]);
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'arya editor-é-'));
const source = 'use arya "./lib-é.arya" as lib\nprint(lib.total(2))\n';
const filename = path.join(folder, 'main-😀.arya');
const library = path.join(folder, 'lib-é.arya');
const environment = {...process.env, LC_ALL: 'C.UTF-8'};
fs.writeFileSync(filename, source);
fs.writeFileSync(library, 'export fn total(n: number): number => n + 1\n');
let server, timer;
(async () => {
  const result = execFileSync(compiler, ['check', filename], {cwd:folder, env:environment, encoding:'utf8',timeout:30000});
  assert.match(result,/Check OK/);
  server = spawn(compiler,['lsp','--stdio'],{cwd:folder,env:environment,stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
  let buffer=Buffer.alloc(0), sequence=0, stderr='';
  const pending=new Map();
  const fail=error=>{for(const request of pending.values())request.reject(error);pending.clear()};
  server.on('error',fail);
  server.on('exit',code=>{if(pending.size)fail(new Error(`LSP exited ${code}: ${stderr}`))});
  server.stderr.on('data',chunk=>{stderr+=chunk});
  server.stdout.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(true){
      const end=buffer.indexOf('\r\n\r\n');if(end<0)return;
      const match=/Content-Length: ([0-9]+)/i.exec(buffer.subarray(0,end).toString());
      if(!match){fail(new Error('Invalid LSP frame'));return}
      const length=Number(match[1]);if(buffer.length<end+4+length)return;
      const value=JSON.parse(buffer.subarray(end+4,end+4+length));buffer=buffer.subarray(end+4+length);
      if(value.id!==undefined){const request=pending.get(value.id);if(request){pending.delete(value.id);value.error?request.reject(new Error(JSON.stringify(value.error))):request.resolve(value.result)}}
    }
  });
  function send(method,params,id){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',method,params,...(id===undefined?{}:{id})}));server.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),body]));}
  function request(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});send(method,params,id)})}
  timer=setTimeout(()=>{fail(new Error(`Windows editor reference timed out: ${stderr}`));server.kill()},60000);
  const initialized=await request('initialize',{rootUri:pathToFileURL(folder).href,capabilities:{}});
  assert.equal(initialized.serverInfo.name,'Arya Native Language Server');send('initialized',{});
  const uri=pathToFileURL(filename).href;
  send('textDocument/didOpen',{textDocument:{uri,languageId:'arya',version:1,text:source}});
  const definition=await request('textDocument/definition',{textDocument:{uri},position:{line:1,character:11}});
  assert.equal(path.resolve(fileURLToPath(definition.uri)).toLowerCase(),library.toLowerCase());
  assert.match(definition.uri,/^file:\/\/\/[A-Za-z]:\//);
  const hover=await request('textDocument/hover',{textDocument:{uri},position:{line:1,character:11}});
  assert.match(hover.contents.value,/number/);
  const renamed=await request('textDocument/rename',{textDocument:{uri},position:{line:1,character:11},newName:'sum'});
  assert.equal(renamed.documentChanges.length,2);
  assert(renamed.documentChanges.every(change=>/^file:\/\/\/[A-Za-z]:\//.test(change.textDocument.uri)));
  await request('shutdown');send('exit',{});server.stdin.end();
  console.log(JSON.stringify({passed:true,host:'native Windows',compiler:'Cygwin PE',checks:['Windows fsPath CLI check','Unicode/space path','file URI workspace','cross-file definition','hover','rename file URIs']}));
})().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(async()=>{
  clearTimeout(timer);
  if(server?.pid && server.exitCode===null){
    server.kill();
    await new Promise(resolve=>{const wait=setTimeout(resolve,3000);server.once('exit',()=>{clearTimeout(wait);resolve()})});
  }
  fs.rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});
