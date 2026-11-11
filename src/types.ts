import type {Block, Expression, Statement} from './ast.js';
import type {LexicalBinding, AryaDiagnostic} from './resolver.js';
import type {Token} from './compiler.js';

export type Type = {kind: 'number'|'string'|'boolean'|'null'|'undefined'|'void'|'unknown'|'any'|'never'}
  | {kind:'array'|'promise'; value:Type}
  | {kind:'record'; fields:Record<string,{type:Type; optional:boolean}>}
  | {kind:'function'; parameters:Type[]; optional:boolean[]; result:Type; rest?:Type}
  | {kind:'union'; values:Type[]};
export const type = (kind: 'number'|'string'|'boolean'|'null'|'undefined'|'void'|'unknown'|'any'|'never'):Type => ({kind});
export function typeText(t:Type):string {
  if(t.kind==='array') return `(${typeText(t.value)})[]`;
  if(t.kind==='promise') return `Promise<${typeText(t.value)}>`;
  if(t.kind==='union') return t.values.map(typeText).join(' | ');
  if(t.kind==='record') return '{ '+Object.entries(t.fields).map(([key,v])=>`${JSON.stringify(key)}${v.optional?'?':''}: ${typeText(v.type)}`).join('; ')+' }';
  if(t.kind==='function') return '('+t.parameters.map((p,i)=>`${t.rest && i===t.parameters.length-1?'...':''}arg${i}${t.optional[i] && !(t.rest && i===t.parameters.length-1)?'?':''}: ${typeText(p)}`).join(', ')+') => '+typeText(t.result);
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
  const call=(callee:Type,args:Expression[],scope:Map<LexicalBinding,Type>,token:Token):Type=>{
    const actual=args.map(a=>expression(a,scope));
    if(callee.kind==='any') return callee;
    if(callee.kind!=='function') {report(token,`Value of type ${typeText(callee)} is not a known callable.`,callee.kind==='unknown'?'ARYA_TYPE_UNKNOWN':'ARYA_TYPE');return type('any');}
    const minimum=callee.optional.filter((v,i)=>!v&&!(callee.rest&&i===callee.parameters.length-1)).length;
    if(args.length<minimum) report(token,`Expected at least ${minimum} arguments, received ${args.length}.`);
    actual.forEach((value,i)=>{let expected=callee.parameters[i];if(callee.rest&&i>=callee.parameters.length-1) expected=callee.rest.kind==='array'?callee.rest.value:callee.rest; if(expected)check(value,callee.optional[i]?union([expected,type('undefined')]):expected,args[i]!.token);});
    return callee.result;
  };
  const expression=(expr:Expression,scope:Map<LexicalBinding,Type>):Type=>{
    switch(expr.kind) {
      case 'literal':return type(expr.value===null?'null':typeof expr.value as 'string'|'number'|'boolean');
      case 'name':return expr.reference.binding?scope.get(expr.reference.binding)??type('any'):type('any');
      case 'object':return {kind:'record',fields:Object.fromEntries(expr.fields.map(f=>[f.key,{type:expression(f.value,scope),optional:false}]))};
      case 'list':return {kind:'array',value:union(expr.items.map(e=>expression(e,scope)))};
      case 'spread':return expression(expr.value,scope);
      case 'function':{
        const signature=fnType(expr) as Type & {kind:'function'}, local=new Map(scope);
        for(const [i,p] of expr.parameters.entries()) {const b=bindings.find(b=>b.token===p);if(b)local.set(b,signature.parameters[i]!);}
        for(const [index,defaultValue] of expr.defaults.entries()) {
          const parameter=expr.parameters.findIndex(p=>p.start===expr.optionalParameters?.[index]);
          if(parameter>=0)check(expression(defaultValue,local),signature.parameters[parameter]!,defaultValue.token);
        }
        const returns:Type[]=[]; block(expr.body,local,returns,expr.returnType,expr.async);
        const inferred=returns.length?union(returns):type('undefined');
        if(expr.returnType&&expr.returnType.kind!=='void'&&!terminates(expr.body)) check(type('undefined'),expr.returnType,expr.token);
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
  const terminates=(body:Block):boolean=>body.statements.some(s=>s.kind==='return'||s.kind==='throw'||s.kind==='if'&&!!s.otherwise&&terminates(s.body)&&terminates(s.otherwise));
  const block=(body:Block,scope:Map<LexicalBinding,Type>,returns:Type[]=[],expected?:Type,unwrap=false)=>{
    for(const statement of body.statements) {
      if(statement.kind==='function')scope.set(statement.binding,fnType(statement.value));
      if(statement.kind==='declaration')scope.set(statement.binding,statement.binding.annotation??type('any'));
      if(statement.kind==='import')scope.set(statement.binding,statement.binding.annotation??moduleTypes[statement.specifier]??type(['std','arya'].includes(statement.bridge)?'any':'unknown'));
    }
    for(const s of body.statements) {
      switch(s.kind) {
        case 'declaration':{const actual=expression(s.value,scope);if(s.binding.annotation)check(actual,s.binding.annotation,s.value.token);scope.set(s.binding,s.binding.annotation??actual);break;}
        case 'function':scope.set(s.binding,expression(s.value,scope));break;
        case 'import':break;
        case 'return':{let value=s.value?expression(s.value,scope):type('undefined');if(unwrap&&value.kind==='promise')value=value.value;returns.push(value);if(expected)check(value,expected,s.token);break;}
        case 'expression':expression(s.value,scope);break;
        case 'assignment':{const target=expression(s.target,scope),value=expression(s.value,scope);check(value,target,s.value.token);break;}
        case 'throw':expression(s.value,scope);break;
        case 'if':{
          expression(s.condition,scope);const yes=new Map(scope),no=new Map(scope);refine(s.condition,true,yes);refine(s.condition,false,no);
          block(s.body,yes,returns,expected,unwrap);if(s.otherwise)block(s.otherwise,no,returns,expected,unwrap);
          if(terminates(s.body))refine(s.condition,false,scope);else if(s.otherwise&&terminates(s.otherwise))refine(s.condition,true,scope);break;
        }
        case 'while':expression(s.condition,scope);block(s.body,new Map(scope),returns,expected,unwrap);break;
        case 'for':{const values=expression(s.iterable,scope),local=new Map(scope);local.set(s.binding,values.kind==='array'?values.value:type('any'));if(s.indexBinding)local.set(s.indexBinding,type('number'));block(s.body,local,returns,expected,unwrap);break;}
        case 'try':block(s.body,new Map(scope),returns,expected,unwrap);if(s.handler)block(s.handler,new Map(scope),returns,expected,unwrap);if(s.finalizer)block(s.finalizer,new Map(scope),returns,expected,unwrap);break;
      }
    }
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
