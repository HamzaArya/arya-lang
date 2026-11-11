import type {Block, Expression, Statement} from './ast.js';
import type {LexicalBinding, AryaDiagnostic} from './resolver.js';
import type {Token} from './compiler.js';

export type Type = {kind: 'number'|'string'|'boolean'|'null'|'undefined'|'void'|'unknown'|'any'|'never'}
  | {kind:'array'|'promise'; value:Type}
  | {kind:'record'; fields:Record<string,{type:Type; optional:boolean}>}
  | {kind:'function'; parameters:Type[]; optional:boolean[]; result:Type; rest?:Type}
  | {kind:'union'; values:Type[]};
export const type = (kind: 'number'|'string'|'boolean'|'null'|'undefined'|'void'|'unknown'|'any'|'never'):Type => ({kind});
// Declarative signatures only: analysis must never load a runtime library.
// These two string APIs have closed, documented contracts. Other libraries and
// the JavaScript Date object boundary retain their existing dynamic behavior.
const standardSignature = (parameters:Type[], result:Type):Type => ({kind:'function', parameters, optional:parameters.map(()=>false), result});
const standardRecord = (fields:Record<string,Type>):Type => ({kind:'record', fields:Object.fromEntries(Object.entries(fields).map(([name,value])=>[name,{type:value,optional:false}]))});
function standardModuleType(name:string):Type {
  const text=type('string'), number=type('number');
  if(name==='decimal') return standardRecord({
    from:standardSignature([text],text),
    add:standardSignature([text,text],text),
    subtract:standardSignature([text,text],text),
    multiply:standardSignature([text,text],text),
    compare:standardSignature([text,text],number),
    divide:standardSignature([text,text,number,text],text),
    quantize:standardSignature([text,number,text],text),
    toNumber:standardSignature([text],number),
    roundingModes:{kind:'array',value:text},
  });
  if(name==='datetime') return standardRecord({
    date:standardSignature([text],text),
    instant:standardSignature([text],text),
    zoned:standardSignature([text,text],standardRecord({date:text,time:text,timeZone:text})),
    dateAt:standardSignature([text,text],text),
    atOffset:standardSignature([text,text,text],text),
    fromDate:standardSignature([type('any')],text),
    toDate:standardSignature([text],type('any')),
  });
  return type('any');
}
export function typeText(t:Type):string {
  if(t.kind==='array') return `(${typeText(t.value)})[]`;
  if(t.kind==='promise') return `Promise<${typeText(t.value)}>`;
  if(t.kind==='union') return t.values.map(value=>value.kind==='function'?`(${typeText(value)})`:typeText(value)).join(' | ');
  if(t.kind==='record') return '{ '+Object.entries(t.fields).map(([key,v])=>`${JSON.stringify(key)}${v.optional?'?':''}: ${typeText(v.type)}`).join('; ')+' }';
  if(t.kind==='function') {
    const parameters=t.parameters.map((p,i)=>{
      const rest=!!t.rest&&i===t.parameters.length-1;
      // A default before a required positional parameter cannot use TS's ? syntax.
      const requiredAfter=t.optional.slice(i+1,t.rest?-1:undefined).includes(false);
      const optional=t.optional[i]&&!rest;
      return `${rest?'...':''}arg${i}${optional&&!requiredAfter?'?':''}: ${typeText(optional&&requiredAfter?union([p,type('undefined')]):p)}`;
    });
    return '('+parameters.join(', ')+') => '+typeText(t.result);
  }
  return t.kind;
}
const union=(values:Type[]):Type=>{
  const all=values.flatMap(t=>t.kind==='union'?t.values:[t]).filter(t=>t.kind!=='never');
  const unique=[...new Map(all.map(t=>[typeText(t),t])).values()];
  return unique.length===1?unique[0]!:unique.length?{kind:'union',values:unique}:type('never');
};
const nullable=(t:Type)=>t.kind==='null'||t.kind==='undefined'||t.kind==='union'&&t.values.some(nullable);
const present=(t:Type):Type=>t.kind==='union'?union(t.values.filter(t=>t.kind!=='null'&&t.kind!=='undefined')):t.kind==='null'||t.kind==='undefined'?type('never'):t;
export function assignable(from:Type,to:Type):boolean {
  if(from.kind==='any'||to.kind==='any'||to.kind==='unknown'||from.kind==='never') return true;
  if(from.kind==='union') return from.values.every(t=>assignable(t,to));
  if(to.kind==='union') return to.values.some(t=>assignable(from,t));
  if(from.kind===to.kind) {
    if(to.kind==='array'&&from.kind==='array'||to.kind==='promise'&&from.kind==='promise') return assignable(from.value,to.value);
    if(to.kind==='record'&&from.kind==='record') return Object.entries(to.fields).every(([k,v])=>from.fields[k]?(!from.fields[k]!.optional||v.optional)&&assignable(from.fields[k]!.type,v.type):v.optional);
    if(to.kind==='function'&&from.kind==='function') return to.parameters.length===from.parameters.length&&to.parameters.every((p,i)=>assignable(p,from.parameters[i]!))&&assignable(from.result,to.result);
    return true;
  }
  return to.kind==='void'&&from.kind==='undefined';
}
export interface TypeAnalysis {enabled:boolean; exports:Record<string,Type>; declarations:string; bindings:{binding:LexicalBinding; type:Type}[]}
export function checkTypes(ast:Block, bindings:LexicalBinding[], diagnostics:AryaDiagnostic[], moduleTypes:Readonly<Record<string,Type>>={},annotated=false):TypeAnalysis {
  const hasReturn=(body:Block):boolean=>body.statements.some(s=>s.kind==='function'&&(!!s.value.returnType||hasReturn(s.value.body)));
  const enabled=annotated||bindings.some(b=>b.annotation)||hasReturn(ast)||Object.keys(moduleTypes).length>0;
  const env=new Map<LexicalBinding,Type>();
  const report=(token:Token,message:string,code:AryaDiagnostic['code']='ARYA_TYPE')=>{if(enabled&&!diagnostics.some(d=>d.token.start===token.start&&d.code===code)) diagnostics.push({code,token,message});};
  const check=(actual:Type,expected:Type,token:Token)=>{if(!assignable(actual,expected))report(token,`Expected ${typeText(expected)}, received ${typeText(actual)}.`);};
  const fnType=(expr:Expression & {kind:'function'}):Type=>{
    const parameters=expr.parameters.map(p=>{
      const annotation=bindings.find(b=>b.token===p)?.annotation??type('any');
      if(p!==expr.rest)return annotation;
      if(annotation.kind==='array')return annotation;
      if(!['any','unknown'].includes(annotation.kind))report(p,'Rest parameter type must be an array, any or unknown.');
      return {kind:'array',value:['any','unknown'].includes(annotation.kind)?annotation:type('any')} as Type;
    });
    return {kind:'function',parameters,optional:expr.parameters.map(p=>expr.optionalParameters?.includes(p.start)??false),result:expr.async?{kind:'promise',value:expr.returnType??type('any')}:expr.returnType??type('any'),...(expr.rest?{rest:parameters.at(-1)!}: {})};
  };
  const refine=(condition:Expression,truth:boolean,scope:Map<LexicalBinding,Type>)=>{
    if(condition.kind==='unary'&&['!','not'].includes(condition.operator)) return refine(condition.value,!truth,scope);
    let candidate:Expression|undefined, excluded:'null'|'undefined'|undefined;
    if(condition.kind==='name'&&truth) candidate=condition;
    if(condition.kind==='binary'&&['==','!='].includes(condition.operator)) {
      const nullish=(v:Expression)=>v.kind==='literal'&&v.value===null||v.kind==='name'&&v.reference.binding?.kind==='host'&&v.reference.token.text==='undefined';
      if(nullish(condition.right)&&((condition.operator==='!=')===truth)){candidate=condition.left;excluded=condition.right.kind==='literal'?'null':'undefined';}
      if(nullish(condition.left)&&((condition.operator==='!=')===truth)){candidate=condition.right;excluded=condition.left.kind==='literal'?'null':'undefined';}
    }
    if(candidate?.kind==='name'&&candidate.reference.binding) { const value=scope.get(candidate.reference.binding)??type('any');scope.set(candidate.reference.binding,excluded?(value.kind==='union'?union(value.values.filter(t=>t.kind!==excluded)):value.kind===excluded?type('never'):value):present(value));};
  };
  const member=(base:Type,key:Expression,token:Token):Type=>{
    if(base.kind==='any') return base;
    if(nullable(base)) {report(token,'Handle null or undefined before reading this value.');return type('any');}
    if(base.kind==='unknown') {report(token,'Unknown external value: validate it or supply an explicit trusted boundary declaration.','ARYA_TYPE_UNKNOWN');return type('any');}
    if(base.kind==='union') return union(base.values.map(t=>member(t,key,token)));
    if(key.kind==='literal'&&typeof key.value==='string') {
      if(base.kind==='record') {
        const field=base.fields[key.value];
        if(!field) {report(token,`Record has no field '${key.value}'.`);return type('any');}
        return field.optional?union([field.type,type('undefined')]):field.type;
      }
      if((base.kind==='array'||base.kind==='string')&&key.value==='length') return type('number');
      if(base.kind==='string'&&['trim','toUpperCase','toLowerCase','replace','slice','substring'].includes(key.value))return {kind:'function',parameters:[],optional:[],result:type('string')};
      if(base.kind==='string'&&key.value==='split')return {kind:'function',parameters:[],optional:[],result:{kind:'array',value:type('string')}};
    }
    if(base.kind==='array') return union([base.value,type('undefined')]);
    report(token,`Cannot statically read this member of ${typeText(base)}; declare its boundary shape.`);return type('any');
  };
  const spreadElement=(value:Type,token:Token):Type=>{
    if(value.kind==='array')return value.value;
    if(value.kind==='string'||value.kind==='any'||value.kind==='never')return value;
    if(value.kind==='union')return union(value.values.map(v=>spreadElement(v,token)));
    report(token,`Cannot spread ${typeText(value)}; expected an array or string.`);
    return type('any');
  };
  const call=(callee:Type,args:Expression[],scope:Map<LexicalBinding,Type>,token:Token):Type=>{
    // Literal lists have a known length. Other spreads may contribute zero items.
    const expand=(items:Expression[]):Expression[]=>items.flatMap(a=>a.kind==='spread'&&a.value.kind==='list'?expand(a.value.items):[a]);
    const expanded=expand(args);
    const actual=expanded.map(a=>({expr:a,value:expression(a,scope)}));
    if(callee.kind==='any') return callee;
    if(callee.kind!=='function') {report(token,`Value of type ${typeText(callee)} is not a known callable.`,callee.kind==='unknown'?'ARYA_TYPE_UNKNOWN':'ARYA_TYPE');return type('any');}
    const minimum=callee.parameters.reduce((n,_,i)=>!callee.optional[i]&&!(callee.rest&&i===callee.parameters.length-1)?i+1:n,0);
    const guaranteed=expanded.filter(a=>a.kind!=='spread').length;
    if(guaranteed<minimum) report(token,`Expected at least ${minimum} arguments, received ${guaranteed} guaranteed arguments.`);
    const expectedAt=(i:number):Type|undefined=>{
      if(callee.rest&&i>=callee.parameters.length-1)return callee.rest.kind==='array'?callee.rest.value:callee.rest;
      const value=callee.parameters[i];return value&&callee.optional[i]?union([value,type('undefined')]):value;
    };
    let position=0,uncertain=false;
    for(const {expr,value} of actual) {
      if(expr.kind==='spread')uncertain=true;
      const end=uncertain?Math.max(position,callee.parameters.length-1):position;
      for(let i=position;i<=end;i++){const expected=expectedAt(i);if(expected)check(value,expected,expr.token);}
      if(expr.kind!=='spread')position++;
    }
    return callee.result;
  };
  const expression=(expr:Expression,scope:Map<LexicalBinding,Type>):Type=>{
    switch(expr.kind) {
      case 'literal':return type(expr.value===null?'null':typeof expr.value as 'string'|'number'|'boolean');
      case 'name':return expr.reference.binding?scope.get(expr.reference.binding)??type('any'):type('any');
      case 'object':return {kind:'record',fields:Object.fromEntries(expr.fields.map(f=>[f.key,{type:expression(f.value,scope),optional:false}]))};
      case 'list':return {kind:'array',value:union(expr.items.map(e=>expression(e,scope)))};
      case 'spread':return spreadElement(expression(expr.value,scope),expr.token);
      case 'function':{
        const signature=fnType(expr) as Type & {kind:'function'}, local=new Map(scope);
        for(const [i,p] of expr.parameters.entries()) {const b=bindings.find(b=>b.token===p);if(b)local.set(b,signature.parameters[i]!);}
        for(const [index,defaultValue] of expr.defaults.entries()) {
          const parameter=expr.parameters.findIndex(p=>p.start===expr.optionalParameters?.[index]);
          if(parameter>=0)check(expression(defaultValue,local),signature.parameters[parameter]!,defaultValue.token);
        }
        const flow=block(expr.body,local,expr.async);
        const inferred=union([...flow.returns.map(r=>r.value),...(flow.normal?[type('undefined')]:[])]);
        if(expr.returnType)for(const result of flow.returns)check(result.value,expr.returnType,result.token);
        if(expr.returnType&&expr.returnType.kind!=='void'&&flow.normal) check(type('undefined'),expr.returnType,expr.token);
        if(!expr.returnType) signature.result=expr.async?{kind:'promise',value:inferred}:inferred;
        return signature;
      }
      case 'member':return member(expression(expr.object,scope),expr.key,expr.token);
      case 'call':return call(expression(expr.callee,scope),expr.arguments,scope,expr.token);
      case 'new':expr.arguments.forEach(a=>expression(a,scope));return type('any');
      case 'chain':{
        let current=expression(expr.base,scope),optional=false;
        for(const step of expr.steps) {if(step.optional){optional=true;current=present(current);} current=step.kind==='member'?member(current,step.key,step.token):call(current,step.arguments,scope,step.token);}
        return optional?union([current,type('undefined')]):current;
      }
      case 'unary':{
        const value=expression(expr.value,scope);
        if(expr.operator==='await')return value.kind==='promise'?value.value:value;
        if(['not','!'].includes(expr.operator))return type('boolean');
        check(value,type('number'),expr.token);return type('number');
      }
      case 'binary':{
        const left=expression(expr.left,scope), right=expression(expr.right,scope);
        if(['==','!=','<','>','<=','>='].includes(expr.operator))return type('boolean');
        if(expr.operator==='??')return union([present(left),right]);
        if(['and','or'].includes(expr.operator))return union([left,right]);
        if(expr.operator==='+'&&left.kind==='string'&&right.kind==='string')return type('string');
        check(left,type('number'),expr.left.token);check(right,type('number'),expr.right.token);return type('number');
      }
      case 'pipe':{
        const result=call(expression(expr.callee,scope),[expr.value,...expr.arguments],scope,expr.token);
        return expr.awaited&&result.kind==='promise'?result.value:result;
      }
      case 'view':expr.expressions.forEach(e=>expression(e,scope));return type('string');
    }
  };
  interface Flow {normal:boolean; returns:{value:Type;token:Token}[]; throws:boolean; breaks:boolean; continues:boolean}
  const flow=(normal=true):Flow=>({normal,returns:[],throws:false,breaks:false,continues:false});
  const merge=(a:Flow,b:Flow):Flow=>({normal:a.normal||b.normal,returns:[...a.returns,...b.returns],throws:a.throws||b.throws,breaks:a.breaks||b.breaks,continues:a.continues||b.continues});
  const block=(body:Block,scope:Map<LexicalBinding,Type>,unwrap=false):Flow=>{
    for(const statement of body.statements) {
      if(statement.kind==='function')scope.set(statement.binding,fnType(statement.value));
      if(statement.kind==='declaration')scope.set(statement.binding,statement.binding.annotation??type('any'));
      if(statement.kind==='import')scope.set(statement.binding,statement.binding.annotation??moduleTypes[statement.specifier]??(statement.bridge==='std'?standardModuleType(statement.specifier):type(statement.bridge==='arya'?'any':'unknown')));
    }
    let result=flow();
    for(const s of body.statements) {
      let next=flow();
      switch(s.kind) {
        case 'declaration':{const actual=expression(s.value,scope);if(s.binding.annotation)check(actual,s.binding.annotation,s.value.token);scope.set(s.binding,s.binding.annotation??actual);break;}
        case 'function':scope.set(s.binding,expression(s.value,scope));break;
        case 'import':break;
        case 'return':{let value=s.value?expression(s.value,scope):type('undefined');if(unwrap&&value.kind==='promise')value=value.value;next.normal=false;next.returns.push({value,token:s.token});break;}
        case 'expression':expression(s.value,scope);break;
        case 'assignment':{const target=expression(s.target,scope),value=expression(s.value,scope);check(value,target,s.value.token);break;}
        case 'throw':expression(s.value,scope);next.normal=false;next.throws=true;break;
        case 'break':next.normal=false;next.breaks=true;break;
        case 'continue':next.normal=false;next.continues=true;break;
        case 'if':{
          expression(s.condition,scope);const yes=new Map(scope),no=new Map(scope);refine(s.condition,true,yes);refine(s.condition,false,no);
          const yesFlow=block(s.body,yes,unwrap),noFlow=s.otherwise?block(s.otherwise,no,unwrap):flow();
          next=merge(yesFlow,noFlow);
          if(!yesFlow.normal)refine(s.condition,false,scope);else if(!noFlow.normal)refine(s.condition,true,scope);break;
        }
        case 'while':{
          expression(s.condition,scope);const bodyFlow=block(s.body,new Map(scope),unwrap);
          const always=s.condition.kind==='literal'&&s.condition.value===true;
          const never=s.condition.kind==='literal'&&s.condition.value===false;
          next=never?flow():{...bodyFlow,normal:!always||bodyFlow.breaks,breaks:false,continues:false};break;
        }
        case 'for':{const values=expression(s.iterable,scope),local=new Map(scope);local.set(s.binding,values.kind==='array'?values.value:type('any'));if(s.indexBinding)local.set(s.indexBinding,type('number'));next={...block(s.body,local,unwrap),normal:true,breaks:false,continues:false};break;}
        case 'try':{
          next=block(s.body,new Map(scope),unwrap);
          // Calls and member reads can throw too, so a handler is always reachable.
          if(s.handler)next=merge({...next,throws:false},block(s.handler,new Map(scope),unwrap));
          if(s.finalizer){
            const finalizer=block(s.finalizer,new Map(scope),unwrap);
            // An abrupt finally completion replaces any pending return/throw/loop exit.
            next=finalizer.normal?merge(next,{...finalizer,normal:false}):finalizer;
          }
          break;
        }
      }
      // Continue checking unreachable syntax, but do not infer unreachable returns.
      if(result.normal)result=merge({...result,normal:false},next);
    }
    return result;
  };
  for(const binding of bindings) {
    if(binding.kind==='host')env.set(binding,type('any'));
    if(binding.kind==='builtin')env.set(binding,type(binding.name==='args'?'any':'any'));
  }
  block(ast,env);
  const exports:Record<string,Type>=Object.create(null);
  for(const s of ast.statements)if((s.kind==='declaration'||s.kind==='function')&&s.exported)exports[s.binding.name]=env.get(s.binding)??type('unknown');
  const declarations=Object.entries(exports).map(([name,t])=>`export declare const ${name}: ${typeText(t)};`).join('\n')+'\n';
  return {enabled,exports,declarations,bindings:[...env].map(([binding,type])=>({binding,type}))};
}
