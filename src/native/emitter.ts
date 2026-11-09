import { resolve, dirname } from 'node:path';
import { AryaError, ARYA_VERSION, parseProgram, type LexicalBinding, type Token } from '../compiler.js';
import type { Block, Expression, Statement } from '../ast.js';
import runtime from './runtime.c';

type Parsed = ReturnType<typeof parseProgram>;
export interface NativeSource { filename: string; source: string }
export interface NativeEmission { code: string; sourceFiles: string[]; functions: number; specializedFunctions: number }
interface Unit { filename: string; source: string; parsed: Parsed; index: number; groups: Map<number, LexicalBinding[]> }
const quote = (s: string) => JSON.stringify(s).replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const cnumber = (n: number) => { const text=String(n); return /[.eE]/.test(text)?text:text+'.0'; };
const identifier = (b: LexicalBinding) => `v${b.scopeId}_${b.token?.start ?? b.name}`;
export function nativeDiagnostics(parsed: Parsed): { token: Token; message: string; code: 'ARYA_NATIVE_UNSUPPORTED' }[] {
  const errors: ReturnType<typeof nativeDiagnostics> = [];
  const add = (token: Token, message: string) => errors.push({ token, message, code: 'ARYA_NATIVE_UNSUPPORTED' });
  for (const reference of parsed.references) if(reference.binding?.kind==='host') {
    if(!['undefined','NaN','Infinity'].includes(reference.token.text))add(reference.token,`Host global '${reference.token.text}' is unavailable in native Arya; use a native standard library.`);
    else if(reference.access!=='read')add(reference.token,`Cannot assign native constant '${reference.token.text}'.`);
  }
  const expr = (e: Expression): void => {
    switch (e.kind) {
      case 'new': add(e.token, 'Host constructors are unavailable in native Arya.'); expr(e.callee); e.arguments.forEach(expr); break;
      case 'unary': if (e.operator === 'await') add(e.token, 'await is unavailable in the native profile.'); expr(e.value); break;
      case 'function': if (e.async) add(e.token, 'async functions are unavailable in the native profile.'); block(e.body); break;
      case 'binary': expr(e.left); expr(e.right); break;
      case 'call': expr(e.callee); e.arguments.forEach(expr); break;
      case 'member': expr(e.object); expr(e.key); break;
      case 'list': e.items.forEach(expr); break;
      case 'object': e.fields.forEach(f => expr(f.value)); break;
    }
  };
  const block = (b: Block): void => { for (const s of b.statements) switch (s.kind) {
    case 'import': if (!['arya', 'std'].includes(s.bridge)) add(s.token, `use ${s.bridge} is unavailable in the native profile.`); else if (s.bridge === 'std' && !['io','fs','math','runtime','process','path'].includes(s.specifier)) add(s.token, `Unknown native standard library '${s.specifier}'.`); break;
    case 'declaration': case 'function': case 'expression': case 'throw': expr(s.value); break;
    case 'assignment': expr(s.target); expr(s.value); break;
    case 'return': if (s.value) expr(s.value); break;
    case 'if': expr(s.condition); block(s.body); if (s.otherwise) block(s.otherwise); break;
    case 'while': expr(s.condition); block(s.body); break;
    case 'for': expr(s.iterable); block(s.body); break;
    case 'try': block(s.body); block(s.handler); break;
  } };
  block(parsed.ast); return errors.sort((a,b) => a.token.start - b.token.start);
}

/** Pure code generation. The parser and lexical resolver are shared with JS. */
export function emitNative(sources: NativeSource[], entryFilename = sources.at(-1)?.filename): NativeEmission {
  const units: Unit[] = sources.map((source,index) => {
    const parsed = parseProgram(source.source, source.filename), diagnostics = [...parsed.diagnostics, ...nativeDiagnostics(parsed)];
    if (diagnostics.length) throw new AryaError(diagnostics[0]!.message, diagnostics[0]!.token, diagnostics);
    const groups = new Map<number, LexicalBinding[]>();
    for (const binding of parsed.bindings) if (binding.scopeId >= 0) { const list = groups.get(binding.scopeId) ?? []; list.push(binding); groups.set(binding.scopeId,list); }
    return { ...source, filename: resolve(source.filename), parsed, index, groups };
  });
  const functions: string[] = [], prototypes: string[] = [];
  let functionCount = 0, specialized = 0;
  const globalScope = (u: Unit, scope: number) => u.index * 100000 + scope;
  const slot = (u: Unit,b: LexicalBinding) => u.groups.get(b.scopeId)!.indexOf(b);
  const sizes = (u: Unit,scope: number) => u.groups.get(scope)?.length ?? 0;
  const functionIds = new Map<Expression,string>();
  const numeric = new Map<Expression,{ name: string; params: LexicalBinding[] }>();

  // Numeric functions have no captures, calls, dynamic operations, or allocations.
  // Guard their arguments at the generic ABI and retain an unspecialized fallback.
  function specialize(u: Unit,e: Expression & { kind: 'function' },name: string): void {
    const allowed = new Set<LexicalBinding>();
    const params = e.parameters.map(p => u.parsed.bindings.find(b => b.token === p)!);
    params.forEach(b => allowed.add(b));
    const exp = (x: Expression): string | undefined => {
      if (x.kind === 'literal' && typeof x.value === 'number') return cnumber(x.value);
      if (x.kind === 'name' && x.reference.binding && allowed.has(x.reference.binding)) return identifier(x.reference.binding);
      if (x.kind === 'unary' && ['+','-','not','!'].includes(x.operator)) { const a=exp(x.value); if(a!==undefined) return ['not','!'].includes(x.operator)?`(!anumtruth(${a}))`:`(${x.operator}${a})`; }
      if (x.kind === 'binary' && !['and','or'].includes(x.operator)) { if(!numericResult(x.left)||!numericResult(x.right))return undefined; const a=exp(x.left),b=exp(x.right); if(a!==undefined && b!==undefined) { if(x.operator==='**') return `apower(${a},${b})`; if(x.operator==='%') return `fmod(${a},${b})`; return `(${a} ${x.operator} ${b})`; } }
      return undefined;
    };
    const lines: string[] = []; let returned = false, valid = true;
    const block=(b: Block): void => { for(const s of b.statements) {
      if(s.kind==='declaration') { const value=exp(s.value); if(value===undefined || !numericResult(s.value)) { valid=false; return; } allowed.add(s.binding); lines.push(`double ${identifier(s.binding)} = ${value};`); }
      else if(s.kind==='return' && s.value) { const value=exp(s.value); if(value===undefined) { valid=false; return; } lines.push(`return ${value};`); returned=true; }
      else if(s.kind==='assignment' && s.target.kind==='name' && s.target.reference.binding && allowed.has(s.target.reference.binding)) { const value=exp(s.value); if(value===undefined || !numericResult(s.value)) { valid=false; return; } lines.push(`${identifier(s.target.reference.binding)} ${s.operator} ${value};`); }
      else if(s.kind==='while') { const value=exp(s.condition); if(value===undefined) { valid=false; return; } lines.push(`while (anumtruth(${value})) {`); block(s.body); lines.push('}'); }
      else if(s.kind==='if') { const value=exp(s.condition); if(value===undefined) { valid=false; return; } lines.push(`if (anumtruth(${value})) {`); block(s.body); lines.push('}'); if(s.otherwise) { lines.push('else {'); block(s.otherwise); lines.push('}'); } }
      else { valid=false; return; }
    } };
    block(e.body);
    // Only numeric returns are eligible. Comparison/not return values are booleans.
    function numericResult(x: Expression): boolean { return x.kind==='literal'?typeof x.value==='number':x.kind==='name'?true:x.kind==='unary'?['+','-'].includes(x.operator)&&numericResult(x.value):x.kind==='binary'?['+','-','*','/','%','**'].includes(x.operator)&&numericResult(x.left)&&numericResult(x.right):false; }
    const returnTypes=(b: Block): boolean => b.statements.every(s => s.kind==='return'?!!s.value&&numericResult(s.value):s.kind==='if'?returnTypes(s.body)&&(!s.otherwise||returnTypes(s.otherwise)):s.kind==='while'?returnTypes(s.body):true);
    // Require an unconditional final return, preventing fallthrough/undefined changes.
    if(valid && returned && returnTypes(e.body) && e.body.statements.at(-1)?.kind==='return') {
      const n=`${name}_numeric`; functions.push(`static double ${n}(${params.map(b=>`double ${identifier(b)}`).join(', ')||'void'}) {\n${lines.join('\n')}\n}`); numeric.set(e,{name:n,params}); specialized++;
    }
  }

  class FunctionEmitter {
    lines: string[]=[]; count=1; labels=0; error='failure';
    constructor(readonly u: Unit, readonly name: string, readonly display = name) {}
    temp(code: string, token?: Token): string { const name=`T[${this.count++}]`; if(token) this.loc(token); this.lines.push(`${name} = ${code};`, `if (afailed) goto ${this.error};`); return name; }
    loc(token: Token) { this.lines.push(`fr.line=${token.line+1}; fr.column=${token.column+1};`); }
    scope(parent: string,id: number): string { return this.temp(`aenv(${parent},${globalScope(this.u,id)},${sizes(this.u,id)})`); }
    read(env: string,b: LexicalBinding): string { return `agetvar(${env},${globalScope(this.u,b.scopeId)},${slot(this.u,b)})`; }
    write(env: string,b: LexicalBinding,value: string,initialize=false): string { return `asetvar(${env},${globalScope(this.u,b.scopeId)},${slot(this.u,b)},${value},${initialize?1:0})`; }
    string(s: string): string { // UTF-16 literals preserve NUL and lone surrogates.
      const chars=Array.from({length:s.length},(_,i)=>s.charCodeAt(i)); return this.temp(`as16((const uint16_t[]){${chars.join(',')||0}},${chars.length})`);
    }
    expression(e: Expression,env: string): string {
      switch(e.kind) {
        case 'literal': return e.value===null?'av(ANULL)':typeof e.value==='number'?`an(${cnumber(e.value)})`:typeof e.value==='boolean'?`ab(${e.value?1:0})`:this.string(e.value);
        case 'name': { const b=e.reference.binding!; if(b.kind==='host') return e.token.text==='NaN'?'an(NAN)':e.token.text==='Infinity'?'an(INFINITY)':'av(AUNDEF)'; return this.temp(this.read(env,b),e.token); }
        case 'list': { const items=e.items.map(x=>this.expression(x,env)); return this.temp(`alist(${items.length},${items.length?`(AV[]){${items.join(',')}}`:'NULL'})`,e.token); }
        case 'object': { const object=this.temp('arecord()',e.token); for(const field of e.fields) { const key=this.string(field.key),value=this.expression(field.value,env); this.temp(`aset(${object},${key},${value})`,e.token); } return object; }
        case 'unary': { const x=this.expression(e.value,env); return this.temp(`aunary(${quote(e.operator)},${x})`,e.token); }
        case 'binary': {
          const x=this.expression(e.left,env);
          if(e.operator==='and'||e.operator==='or') { const result=this.temp(x); this.lines.push(`if (${e.operator==='or'?'!':''}atruth(${x})) {`); const y=this.expression(e.right,env); this.lines.push(`${result}=${y};`, '}'); return result; }
          const y=this.expression(e.right,env); return this.temp(`abin(${quote(e.operator)},${x},${y})`,e.token);
        }
        case 'member': { const x=this.expression(e.object,env),y=this.expression(e.key,env); return this.temp(`aget(${x},${y})`,e.token); }
        case 'function': { const id=makeFunction(this.u,e,'anonymous'); return this.temp(`afunction(${id},${env},"anonymous")`,e.token); }
        case 'call': { const fn=this.expression(e.callee,env), args=e.arguments.map(x=>this.expression(x,env)); return this.temp(`acall(${fn},${args.length},${args.length?`(AV[]){${args.join(',')}}`:'NULL'})`,e.token); }
        case 'new': throw new AryaError('Native constructors are unsupported.',e.token);
      }
    }
    block(b: Block,env: string,initialize?: (env:string)=>void): void {
      const local=b.scopeId<0?env:this.scope(env,b.scopeId); initialize?.(local); this.body(b,local);
    }
    body(b: Block,env: string): void {
      for(const s of b.statements) if(s.kind==='function') { const fn=makeFunction(this.u,s.value,s.binding.name); const value=this.temp(`afunction(${fn},${env},${quote(s.binding.name)})`); this.temp(this.write(env,s.binding,value,true)); }
      for(const s of b.statements) this.statement(s,env);
    }
    statement(s: Statement,env: string): void {
      this.loc(s.token);
      switch(s.kind) {
        case 'function': return;
        case 'declaration': { const value=this.expression(s.value,env); this.temp(this.write(env,s.binding,value,true),s.token); return; }
        case 'expression': this.expression(s.value,env); return;
        case 'import': { let value: string; if(s.bridge==='std') value=this.temp(`astd(${quote(s.specifier)})`,s.token); else { const unit=units.find(u=>u.filename===resolve(dirname(this.u.filename),s.specifier)); if(!unit) throw new AryaError(`Cannot find native module ${s.specifier}.`,s.token); value=`ans[${unit.index}]`; } this.temp(this.write(env,s.binding,value,true)); return; }
        case 'assignment': {
          const target=s.target;
          if(target.kind==='name') { const binding=target.reference.binding!; const old=s.operator==='='?undefined:this.temp(this.read(env,binding),target.token); const value=this.expression(s.value,env); const next=old?this.temp(`abin(${quote(s.operator[0]!)},${old},${value})`,s.token):value; this.temp(this.write(env,binding,next),s.token); }
          else if(target.kind==='member') { const object=this.expression(target.object,env),key=this.expression(target.key,env),old=s.operator==='='?undefined:this.temp(`aget(${object},${key})`,target.token); const value=this.expression(s.value,env),next=old?this.temp(`abin(${quote(s.operator[0]!)},${old},${value})`,s.token):value; this.temp(`aset(${object},${key},${next})`,s.token); }
          return;
        }
        case 'if': { const condition=this.expression(s.condition,env); this.lines.push(`if (atruth(${condition})) {`); this.block(s.body,env); this.lines.push('}'); if(s.otherwise) { this.lines.push('else {'); this.block(s.otherwise,env); this.lines.push('}'); } return; }
        case 'while': this.lines.push('for (;;) {'); { const condition=this.expression(s.condition,env); this.lines.push(`if (!atruth(${condition})) break;`); this.block(s.body,env); } this.lines.push('}'); return;
        case 'for': {
          const header=this.scope(env,s.binding.scopeId),iterable=this.expression(s.iterable,header),position=this.temp('an(0)');
          this.lines.push('for (;;) {'); const item=this.temp(`aiternext(${iterable},&${position})`,s.token); this.lines.push(`if (${item}.t==AUINIT) break;`);
          const local=this.scope(env,s.binding.scopeId); this.temp(this.write(local,s.binding,item,true)); this.block(s.body,local); this.lines.push('}'); return;
        }
        case 'return': { const value=s.value?this.expression(s.value,env):'av(AUNDEF)'; this.lines.push(`result=${value}; goto done;`); return; }
        case 'break': case 'continue': this.lines.push(`${s.kind};`); return;
        case 'throw': { const value=this.expression(s.value,env); this.loc(s.token); this.lines.push(`athrow(${value}); goto ${this.error};`); return; }
        case 'try': {
          const id=this.labels++,handler=`catch${id}`,after=`after${id}`,previous=this.error; this.error=handler; this.block(s.body,env); this.error=previous;
          this.lines.push(`goto ${after};`,`${handler}:;`); const thrown=this.temp('aerror'); // clear failure before using a checked temporary
          this.lines.splice(this.lines.length-1,1); this.lines.push('afailed=0;');
          this.block(s.handler,env,local=>{ this.temp(this.write(local,s.binding,thrown,true)); }); this.lines.push(`${after}:;`); return;
        }
      }
    }
    finish(scope: number, parent: string, body: Block,parameters: Token[] = [], module=false,fast?: {name:string;params:LexicalBinding[]}): string {
      this.lines.push(`T[0]=aenv(${parent},${globalScope(this.u,scope)},${sizes(this.u,scope)});`,`if(afailed) goto failure;`);
      if(module) {
        this.lines.push(`amod[${this.u.index}]=T[0];`, `ans[${this.u.index}]=arecord();`);
        for(const b of this.u.groups.get(0) ?? []) if(b.kind==='builtin') { const ids:Record<string,number>={print:0,len:1,str:2,number:3,range:4}; this.temp(this.write('T[0]',b,b.name==='args'?'aprogramArgs':`abuilt(${ids[b.name]})`,true)); }
        for(const s of body.statements) if((s.kind==='declaration'||s.kind==='function')&&s.exported) this.lines.push(`aaddexport(ans[${this.u.index}],${quote(s.binding.name)},T[0],${globalScope(this.u,0)},${slot(this.u,s.binding)});`);
        this.lines.push(`ans[${this.u.index}].p->scope=-1;`);
      }
      for(let i=0;i<parameters.length;i++) { const binding=this.u.parsed.bindings.find(b=>b.token===parameters[i])!; this.temp(this.write('T[0]',binding,`argc>${i}?argv[${i}]:av(AUNDEF)`,true)); }
      this.body(body,'T[0]');
      const guard=fast?`if(argc>=${fast.params.length}${fast.params.map((_,i)=>` && argv[${i}].t==ANUM`).join('')}) return an(${fast.name}(${fast.params.map((_,i)=>`argv[${i}].n`).join(',')}));`:'';
      return `static AV ${this.name}(AV closure,int argc,AV *argv) {\n${guard}\nAV *T=(AV*)amemory(${this.count}*sizeof(AV)); AV result=av(AUNDEF);\nAFrame fr; fr.prev=aframes; fr.file=${quote(this.u.filename)}; fr.name=${quote(this.display)}; fr.line=1; fr.column=1; aframes=&fr; aroot(&fr.roots,T,${this.count});\n${this.lines.join('\n')}\ngoto done;\nfailure: result=av(AUNDEF);\ndone: aunroot(&fr.roots); aframes=fr.prev; free(T); return result;\n}`;
    }
  }
  function makeFunction(u: Unit,e: Expression & {kind:'function'},display: string): string {
    const existing=functionIds.get(e); if(existing) return existing;
    const id=`afn${functionCount++}`; functionIds.set(e,id); prototypes.push(`static AV ${id}(AV,int,AV*);`); specialize(u,e,id);
    const emitter=new FunctionEmitter(u,id,display); functions.push(emitter.finish(e.body.scopeId,'closure',e.body,e.parameters,false,numeric.get(e))); return id;
  }
  const initializers: string[]=[];
  for(const u of units) { const id=`amodule${u.index}`; prototypes.push(`static AV ${id}(AV,int,AV*);`); initializers.push(new FunctionEmitter(u,id).finish(0,'closure',u.parsed.ast,[],true)); }
  const entry=units.find(u=>u.filename===resolve(entryFilename??'')); if(!entry) throw new Error('Native entry module is missing.');
  const code=`/* Generated by Arya ${ARYA_VERSION}; native C11. */\n${runtime}\nstatic AV amod[${units.length}],ans[${units.length}],aprogramArgs;\n${prototypes.join('\n')}\n${functions.join('\n')}\n${initializers.join('\n')}\nint main(int argc,char **argv) {\nARoot modules,names,argsRoot; aroot(&modules,amod,${units.length}); aroot(&names,ans,${units.length}); aroot(&argsRoot,&aprogramArgs,1); aprogramArgs=alist(0,NULL);\nfor(int i=1;i<argc;i++) { AV value=astr(argv[i]); aresize(aprogramArgs.p,aprogramArgs.p->len+1); aprogramArgs.p->data[aprogramArgs.p->len++]=value; }\n${units.map(u=>`amodule${u.index}(av(AUNDEF),0,NULL); if(afailed) goto finished;`).join('\n')}\nfinished:; int status=areport(); aunroot(&argsRoot); aunroot(&names); aunroot(&modules); afailed=0; agc(); if(getenv("ARYA_GC_STATS")) fprintf(stderr,"Arya GC: collections=%zu live=%zu peak=%zu\\n",acollections,aallocated,apeakh); return status;\n}\n`;
  return { code, sourceFiles:units.map(u=>u.filename), functions:functionCount, specializedFunctions:specialized };
}
