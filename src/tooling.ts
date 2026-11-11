import {parseProgram, tokenize, type AryaDiagnostic, type LexicalBinding} from './compiler.js';
import type {Block} from './ast.js';

/** Conservative whitespace formatter: never rewrites tokens, comments or line breaks. */
export function formatSource(source:string,filename='main.arya'):string {
  parseProgram(source,filename); // Refuse incomplete/invalid source before any edit.
  const tokens=tokenize(source), lines=source.split('\n');
  const protectedLines=new Set<number>();
  for(const token of tokens) if(token.kind==='string'&&source.slice(token.start,token.end).includes('\n')) {
    const count=source.slice(token.start,token.end).split('\n').length;
    for(let line=token.line;line<token.line+count;line++)protectedLines.add(line);
  }
  let depth=0;
  const result=lines.map((line,index)=>{
    const code=tokens.filter(t=>t.line===index&&t.kind==='symbol');
    const closings=/^\s*[}\])]/.test(line)?1:0;
    const output=protectedLines.has(index)?line:'  '.repeat(Math.max(0,depth-closings))+line.trim();
    for(const token of code) {if(['{','[','('].includes(token.text))depth++;if(['}',']',')'].includes(token.text))depth--;}
    return protectedLines.has(index)?line:output.trim().length?output:'';
  }).join('\n');
  return result.replace(/\n*$/,'')+'\n';
}
export function lintSource(source:string,filename='main.arya'):AryaDiagnostic[] {
  const parsed=parseProgram(source,filename), diagnostics:AryaDiagnostic[]=[];
  const exported=new Set(parsed.exports.map(t=>t.start));
  for(const binding of parsed.bindings) if(binding.token&&!exported.has(binding.token.start)&&!binding.name.startsWith('_')&&!['parameter','catch','loop'].includes(binding.kind)&&!parsed.references.some(r=>r.binding===binding&&r.access!=='write')) diagnostics.push({code:'ARYA_UNUSED',token:binding.token,message:`Binding '${binding.name}' is never read.`});
  const walk=(body:Block)=>{
    let stopped=false;
    for(const s of body.statements) {
      if(stopped&&s.kind!=='function')diagnostics.push({code:'ARYA_UNREACHABLE',token:s.token,message:'Statement is unreachable after unconditional control flow.'});
      if(['return','throw','break','continue'].includes(s.kind))stopped=true;
      if(s.kind==='function')walk(s.value.body);
      if(s.kind==='expression'&&s.value.kind==='call'&&s.value.callee.kind==='name') {
        const binding=s.value.callee.reference.binding, value=parsed.typing.bindings.find(item=>item.binding===binding)?.type;
        if(value?.kind==='function'&&value.result.kind==='promise')diagnostics.push({code:'ARYA_UNHANDLED_PROMISE',token:s.token,message:'Known promise result is ignored; await it or return it from an async function.'});
      }
      if(s.kind==='if') {walk(s.body);if(s.otherwise)walk(s.otherwise);}
      if(s.kind==='for'||s.kind==='while')walk(s.body);
      if(s.kind==='try'){walk(s.body);if(s.handler)walk(s.handler);if(s.finalizer)walk(s.finalizer);}
    }
  };walk(parsed.ast);return diagnostics;
}
