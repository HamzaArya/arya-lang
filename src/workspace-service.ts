import {analyze, type Analysis} from './language-service.js';
import {tokenize} from './compiler.js';
import {typeText, type Type} from './types.js';
export interface SourceDocument {uri:string; source:string}
export function analyzeWorkspace(documents:SourceDocument[]):Map<string,Analysis> {
  const results=new Map<string,Analysis>(), active=new Set<string>(), sources=new Map(documents.map(d=>[d.uri,d.source]));
  const visit=(uri:string):Analysis=>{
    const previous=results.get(uri);if(previous)return previous;
    const source=sources.get(uri)!,initial=analyze(source,uri);
    if(active.has(uri))return initial;
    active.add(uri);const moduleTypes:Record<string,Type>=Object.create(null);
    for(const imported of initial.imports) {
      let target:string;try{target=new URL(imported.specifier,uri).href;}catch{continue;}
      if(!sources.has(target)||active.has(target))continue;
      const dependency=visit(target);
      if(dependency.typing.enabled)moduleTypes[imported.specifier]={kind:'record',fields:Object.fromEntries(Object.entries(dependency.typing.exports).map(([name,type])=>[name,{type,optional:false}]))};
    }
    const result=Object.keys(moduleTypes).length?analyze(source,uri,{moduleTypes}):initial;
    results.set(uri,result);active.delete(uri);return result;
  };
  for(const document of documents)visit(document.uri);
  return results;
}
/** Reuse one passive analysis for an unchanged set of open buffers, including dependency lifecycles. */
export function createWorkspaceAnalysisCache() {
  let sources = new Map<string, string>();
  let results: Map<string, Analysis> | undefined;
  return {
    analyze(documents: SourceDocument[]): Map<string, Analysis> {
      const next = new Map(documents.map(document => [document.uri, document.source]));
      if (!results || next.size !== sources.size || [...next].some(([uri, source]) => sources.get(uri) !== source)) {
        results = analyzeWorkspace(documents);
        sources = next;
      }
      return results;
    },
    clear() { sources.clear(); results = undefined; },
  };
}
export interface SourceLocation {uri:string; start:number; end:number}
/** Navigation operates on caller-supplied snapshots; it never imports dependencies. */
export function referencesInWorkspace(documents:SourceDocument[],uri:string,offset:number):SourceLocation[] {
  const parsed=new Map(documents.map(d=>[d.uri,analyze(d.source,d.uri)]));
  const current=parsed.get(uri);if(!current)return [];
  const contains=(t:{start:number;end:number})=>t.start<=offset&&offset<t.end;
  const moduleTarget=(analysis:Analysis,member:Analysis['moduleMembers'][number],from:string)=>{
    const imported=analysis.imports.find(i=>i.alias===member.reference.binding?.token);if(!imported)return undefined;
    let target:string;try{target=new URL(imported.specifier,from).href;}catch{return undefined;}
    const dependency=parsed.get(target), token=dependency?.exports.find(t=>t.text===member.token.text);
    return token?{uri:target,token}:undefined;
  };
  const member=current.moduleMembers.find(m=>contains(m.token));
  const local=current.references.find(r=>contains(r.token))?.binding?.token??current.bindings.find(b=>b.token&&contains(b.token))?.token;
  const target=member?moduleTarget(current,member,uri):local?{uri,token:local}:undefined;
  if(!target)return [];
  const result:SourceLocation[]=[{uri:target.uri,start:target.token.start,end:target.token.end}];
  const declaration=parsed.get(target.uri)!, binding=declaration.bindings.find(b=>b.token===target.token);
  for(const reference of declaration.references)if(reference.binding===binding)result.push({uri:target.uri,start:reference.token.start,end:reference.token.end});
  if(declaration.exports.includes(target.token))for(const [from,analysis] of parsed)for(const m of analysis.moduleMembers){const found=moduleTarget(analysis,m,from);if(found?.uri===target.uri&&found.token===target.token)result.push({uri:from,start:m.token.start,end:m.token.end});}
  return [...new Map(result.map(r=>[`${r.uri}:${r.start}`,r])).values()];
}
export function renameInWorkspace(documents:SourceDocument[],uri:string,offset:number,name:string,options:{openDocumentsOnly?:boolean}={}):{uri:string;start:number;end:number;replacement:string}[] {
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||analyze('const '+name+' = 0','untitled:rename').diagnostics.length)throw new Error('Choose a valid non-reserved Arya name.');
  const references=referencesInWorkspace(documents,uri,offset), edits=references.map(r=>({...r,replacement:name}));
  // Editors cannot discover unopened callers yet. Never silently perform a partial public rename.
  if (options.openDocumentsOnly && references.length) {
    const target = references[0]!;
    const document = documents.find(document => document.uri === target.uri)!;
    if (analyze(document.source, document.uri).exports.some(token => token.start === target.start)) {
      throw new Error('Cannot safely rename an exported symbol: unopened files may reference it. Project-wide rename is not supported yet.');
    }
  }
  for(const document of documents){let source=document.source;for(const edit of edits.filter(e=>e.uri===document.uri).sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+name+source.slice(edit.end);if(edits.some(e=>e.uri===document.uri)) {
      const before=analyze(document.source,document.uri), after=analyze(source,document.uri);
      if(after.diagnostics.length)throw new Error('Rename creates a conflict or the affected document has unresolved diagnostics.');
      const local=edits.filter(e=>e.uri===document.uri);
      const remap=(position:number)=>position+local.filter(e=>e.end<=position).reduce((sum,e)=>sum+name.length-(e.end-e.start),0);
      for(const reference of before.references) {
        const changed=after.references.find(r=>r.token.start===remap(reference.token.start));
        const original=reference.binding, actual=changed?.binding;
        if(original?.token ? actual?.token?.start!==remap(original.token.start) : original?.kind!==actual?.kind || original?.name!==actual?.name)throw new Error('Rename would capture or change an existing lexical reference.');
      }
    }}
  return edits;
}
export function signatureAt(source:string,offset:number):{label:string;activeParameter:number}|undefined {
  let tokens;try{tokens=tokenize(source).filter(t=>t.start<offset&&t.kind!=='newline');}catch{return undefined;}
  let depth=0,commas=0,open=-1;
  for(let i=tokens.length-1;i>=0;i--){const t=tokens[i]!;if(t.kind!=='symbol')continue;if([')',']','}'].includes(t.text))depth++;else if(['(','[','{'].includes(t.text)){if(depth===0&&t.text==='('){open=i;break;}depth--;}else if(t.text===','&&depth===0)commas++;}
  if(open<1)return undefined;
  const token=tokens[open-1]!;
  let analysis=analyze(source,'untitled:signature');
  // Only repair an unfinished call at EOF. Do not discard or rewrite unrelated source.
  if (analysis.diagnostics.some(d => d.code === 'ARYA_SYNTAX') && !source.slice(offset).trim()) {
    const stack: string[] = [];
    const pairs: Record<string,string> = {'(':')','[':']','{':'}'};
    for (const item of tokens) {
      if (item.kind !== 'symbol') continue;
      if (pairs[item.text]) stack.push(pairs[item.text]!);
      else if ([')',']','}'].includes(item.text) && stack.pop() !== item.text) return undefined;
      if (stack.length > 32) return undefined;
    }
    if (stack.length) {
      const last = tokens.at(-1);
      const placeholder = last?.kind === 'symbol' && ['(', ','].includes(last.text) ? 'null' : '';
      analysis = analyze(source.slice(0,offset) + placeholder + stack.reverse().join(''), 'untitled:signature');
    }
  }
  const reference=analysis.references.find(r=>r.token.start===token.start);
  let value=analysis.typing.bindings.find(b=>b.binding===reference?.binding)?.type;
  if(!value&&tokens[open-2]?.text==='.'){
    const object=tokens[open-3],ref=analysis.references.find(r=>r.token.start===object?.start),record=analysis.typing.bindings.find(b=>b.binding===ref?.binding)?.type;
    if(record?.kind==='record')value=record.fields[token.text]?.type;
  }
  return value?.kind==='function'?{label:token.text+typeText(value),activeParameter:commas}:undefined;
}
export function typedCompletions(source:string,offset:number):{label:string;kind:'variable'|'function';detail:string}[] {
  const prefix=source.slice(0,offset).match(/([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z0-9_]*$/);
  if(!prefix)return [];
  const start=offset-prefix[0].length;
  const end=offset+(source.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0].length ?? 0);
  // Repair only this member, preserving receiver offsets and lexical scope.
  const analysis=analyze(source.slice(0,start)+prefix[1]+'.aryaCompletion'+source.slice(end),'untitled:completion');
  const ref=analysis.references.find(r=>r.token.start===start),value=analysis.typing.bindings.find(b=>b.binding===ref?.binding)?.type;
  return value?.kind==='record'?Object.entries(value.fields).map(([label,field])=>({label,kind:field.type.kind==='function'?'function':'variable',detail:typeText(field.type)})):[];
}
