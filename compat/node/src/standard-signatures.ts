import type {Type} from './types.js';
const primitive = (kind: 'number'|'string'|'boolean'|'null'|'undefined'|'void'|'unknown'|'any'): Type => ({kind});
const text = primitive('string'), number = primitive('number'), boolean = primitive('boolean'), any = primitive('any'), unknown = primitive('unknown'), nothing = primitive('void');
export const arrayType = (value: Type): Type => ({kind: 'array', value});
const promise = (value: Type): Type => ({kind: 'promise', value});
const either = (...values: Type[]): Type => ({kind: 'union', values});
const record = (fields: Record<string, Type>, optional = false): Type => ({kind: 'record', fields: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, {type, optional}]))});
const fn = (parameters: Type[], result: Type, required = parameters.length, builtin?: string): Type => ({kind: 'function', parameters, optional: parameters.map((_, i) => i >= required), result, ...(builtin ? {builtin} : {})});
const list = arrayType(any), selector = either(text, fn([any, number], any));
const options = record({timeoutMs: number, interpreter: text, maxInputBytes: number, maxOutputBytes: number, kwargs: any, signal: any}, true);
const clientOptions = record({...Object.fromEntries(options.kind === 'record' ? Object.entries(options.fields).map(([k,v]) => [k,v.type]) : []), maxConcurrency: number, queueLimit: number}, true);
const queries = () => record({rows: fn([text, list], promise(arrayType(unknown)), 1), one: fn([text, list], promise(unknown), 1), scalar: fn([text, list], promise(unknown), 1), execute: fn([text, list], promise(unknown), 1)});

/** Static contracts only. No runtime imports, package evaluation or service calls. */
function createStandardModuleType(name: string): Type {
  if (name === 'security') {
    const passwordOptions = record({profile:text},true), context = record({account:text,purpose:text});
    const keyring = record({encrypt:fn([text,context],text),decrypt:fn([text,context],text),rotate:fn([text,context],record({encrypted:text,rotated:boolean}))});
    return record({
      randomToken: fn([number],text,0), uuid: fn([],text), generateKey: fn([],text), hash: fn([text],text),
      hmac: fn([text,text],text), verifyHmac: fn([text,text,text],boolean), timingSafeEqual: fn([text,text],boolean),
      hashPassword: fn([text,passwordOptions],promise(text),1), verifyPassword: fn([text,text],promise(boolean)),
      passwordNeedsUpgrade: fn([text,passwordOptions],boolean,1),
      verifyPasswordAndUpgrade: fn([text,text,passwordOptions],promise(record({ok:boolean,upgraded:boolean,hash:either(text,primitive('null'))})),2),
      keyring: fn([record({active:text,keys:any})],keyring), encrypt: fn([text,text],text), decrypt: fn([text,text],text),
    });
  }
  if (name === 'testing') {
    const testOptions = record({timeoutMs:number,skip:either(boolean,text),todo:either(boolean,text),concurrency:number},true);
    const callback = fn([any],any);
    return record({
      test: fn([text,callback,testOptions],promise(nothing),2), suite: fn([text,callback,testOptions],promise(nothing),2),
      skip: fn([text,either(boolean,text)],promise(nothing),1), todo: fn([text,either(boolean,text)],promise(nothing),1),
      before: fn([callback],nothing), after: fn([callback],nothing), beforeEach: fn([callback],nothing), afterEach: fn([callback],nothing),
      assert: fn([any,text],nothing,1), equal: fn([any,any,text],nothing,2), notEqual: fn([any,any,text],nothing,2),
      deepEqual: fn([any,any,text],nothing,2), notDeepEqual: fn([any,any,text],nothing,2),
      throws: fn([fn([],any),any,text],nothing,1), rejects: fn([fn([],any),any,text],promise(nothing),1),
      fail: fn([text],nothing,0), mock: fn([any],any,0),
    });
  }
  if (name === 'decimal') return record({from: fn([text], text), add: fn([text,text],text), subtract: fn([text,text],text), multiply: fn([text,text],text), compare: fn([text,text],number), divide: fn([text,text,number,text],text), quantize: fn([text,number,text],text), toNumber: fn([text],number), roundingModes: arrayType(text)});
  if (name === 'datetime') return record({date: fn([text],text), instant: fn([text],text), zoned: fn([text,text],record({date:text,time:text,timeZone:text})), dateAt: fn([text,text],text), atOffset: fn([text,text,text],text), fromDate: fn([any],text), toDate: fn([text],any)});
  if (name === 'list') return record({
    map: fn([list,selector],list,2,'list.map'), flatMap: fn([list,selector],list,2,'list.flatMap'), filter: fn([list,selector],list,2,'list.filter'),
    find: fn([list,selector],any,2,'list.find'), reduce: fn([list,fn([any,any,number],any),any],any,3,'list.reduce'), groupBy: fn([list,selector],any),
    sortBy: fn([list,selector,text],list,1,'list.sortBy'), take: fn([list,number],list,1,'list.take'), unique: fn([list,selector],list,1,'list.unique'), sum: fn([list,selector],number,1),
  });
  if (name === 'mysql') {
    const session = queries();
    const pool = record({...Object.fromEntries(session.kind === 'record' ? Object.entries(session.fields).map(([k,v]) => [k,v.type]) : []), transaction: fn([fn([session],any)],promise(unknown)), ping: fn([],promise(boolean)), close: fn([],promise(nothing))});
    return record({connect: fn([record({host:text,user:text,password:text,database:text,socketPath:text,port:number,connectionLimit:number,queueLimit:number,connectTimeout:number,multipleStatements:boolean,namedPlaceholders:boolean,ssl:any},true)],promise(pool),0)});
  }
  if (name === 'python') {
    const methods = {call: fn([any,list,options],promise(unknown),1), map: fn([any,list,options],promise(arrayType(unknown)),2), bind: fn([any,options],any,1), info: fn([options],promise(record({executable:text,version:text,prefix:text,basePrefix:text,virtualenv:boolean})),0), close: fn([],promise(nothing)), stats: fn([],record({active:number,queued:number,closed:boolean}))};
    return record({...methods,client:fn([clientOptions],record(methods),0)});
  }
  if (name === 'web') {
    const response = record({status:number,body:any,headers:any});
    return record({response:fn([number,any,any],response,2), error:fn([number,text,text],any,2), route:fn([fn([any],any),any],any,1), health:fn([any,record({timeoutMs:number},true)],promise(response),0), shutdown:fn([any,record({timeoutMs:number,cleanup:fn([],any)},true)],promise(nothing),1), serve:fn([number,any,record({host:text,root:text,html:boolean,requestTimeoutMs:number,handlerTimeoutMs:number,trustRequestId:boolean,before:fn([any],any),logger:any},true)],any,1)});
  }
  if (name === 'fs') return record({readText:fn([text],promise(text)),writeText:fn([text,text],promise(nothing)),list:fn([text],promise(arrayType(text))),exists:fn([text],promise(boolean))});
  if (name === 'json') return record({parse:fn([text],unknown),stringify:fn([any],either(text,primitive('undefined'))),read:fn([text],promise(unknown)),write:fn([text,any],promise(nothing))});
  if (name === 'env') return record({get:fn([text,any],any,1),require:fn([text],text),int:fn([text,either(text,number)],number,1),bool:fn([text,either(text,boolean)],boolean,1)});
  return any;
}

const signatures = new Map<string,Type>();
export function standardModuleType(name: string): Type {
  const cached = signatures.get(name); if (cached) return cached;
  const value = createStandardModuleType(name);
  const describe = (value: Type, role: string) => {
    if (value.kind !== 'record') return;
    for (const [member,field] of Object.entries(value.fields)) {
      if (field.type.kind !== 'function') continue;
      field.type.builtin ??= role+'.'+member;
      if (role === 'mysql' && member === 'connect' && field.type.result.kind === 'promise') describe(field.type.result.value,'mysql.pool');
      if (role === 'python' && member === 'client') describe(field.type.result,'python.client');
      if (role === 'security' && member === 'keyring') describe(field.type.result,'security.keyring');
    }
  };
  describe(value,name); signatures.set(name,value); return value;
}
