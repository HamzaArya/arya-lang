import {asyncRuntime} from './std/async.js';
import { decimalRuntime } from './std/decimal.js';
import { datetimeRuntime } from './std/datetime.js';
import { httpRuntime } from './std/http.js';
import { envRuntime } from './std/env.js';
import { mysqlRuntime } from './std/mysql.js';
import { validationRuntime } from './std/validate.js';
import { loggingRuntime } from './std/log.js';
import { asynchronousPythonRuntime } from './std/python.js';
import { debugRuntime } from './std/debug.js';
import { uiRuntime } from './std/ui.js';
import { listRuntime } from './std/list.js';
import { securityRuntime } from './std/security.js';
import { testingRuntime } from './std/testing.js';

/** JavaScript-profile standard libraries. Checking only emits this source; it never runs it. */
export const standardLibraries = ['async', 'decimal', 'datetime', 'fs', 'math', 'path', 'json', 'web', 'mysql', 'env', 'validate', 'log', 'python', 'debug', 'ui', 'list', 'security', 'testing'] as const;

const filesRuntime = String.raw`const __arya_files = Object.freeze({
  readText: path => __arya_fs.readFile(path, 'utf8'),
  writeText: (path, text) => __arya_fs.writeFile(path, text, 'utf8'),
  list: path => __arya_fs.readdir(path),
  exists: async path => {
    try { await __arya_fs.access(path); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
});
`;
const jsonRuntime = String.raw`const __arya_json = Object.freeze({
  parse: text => JSON.parse(text),
  stringify: value => JSON.stringify(value),
  read: async path => JSON.parse(await __arya_files.readText(path)),
  write: (path, value) => __arya_files.writeText(path, JSON.stringify(value, null, 2) + '\n')
});
`;

export const standardRuntime = String.raw`import * as __arya_fs from 'node:fs/promises';
import * as __arya_fsSync from 'node:fs';
import * as __arya_path from 'node:path';
import { createServer as __arya_createServer } from 'node:http';
import { AsyncLocalStorage as __arya_AsyncLocalStorage } from 'node:async_hooks';
import { Buffer as __arya_mysqlBuffer } from 'node:buffer';
import { randomUUID as __arya_randomUUID } from 'node:crypto';
import { inspect as __arya_inspectValue } from 'node:util';
import * as __arya_securityCrypto from 'node:crypto';
import { Buffer as __arya_securityBuffer } from 'node:buffer';
import * as __arya_nodeTest from 'node:test';
import * as __arya_nodeAssert from 'node:assert/strict';
${filesRuntime}
${jsonRuntime}
${datetimeRuntime}
${asyncRuntime}
${validationRuntime}
${loggingRuntime}
${httpRuntime}
${mysqlRuntime}
${envRuntime}
${asynchronousPythonRuntime}
${debugRuntime}
${uiRuntime}
${listRuntime}
${securityRuntime}
${testingRuntime}
const __arya_standard = (name, sourceDirectory) => {
  switch (name) {
    case 'async': return __arya_async;
    case 'decimal': return __arya_decimal;
    case 'datetime': return __arya_datetime;
    case 'fs': return __arya_files;
    case 'math': return Math;
    case 'path': return __arya_path;
    case 'json': return __arya_json;
    case 'web': return __arya_web(sourceDirectory);
    case 'mysql': return __arya_mysql;
    case 'env': return __arya_env;
    case 'validate': return __arya_validate;
    case 'log': return __arya_log;
    case 'python': return __arya_asyncPython(sourceDirectory);
    case 'debug': return __arya_debug;
    case 'ui': return __arya_ui;
    case 'list': return __arya_list;
    case 'security': return __arya_security;
    case 'testing': return __arya_testing;
    default: throw new Error('Unknown JavaScript standard library: ' + name);
  }
};`;

interface RuntimeDefinition {source: string; value: string; dependencies?: string[]; imports?: string[]}
const definitions: Record<string,RuntimeDefinition> = {
  async: {source:asyncRuntime,value:'__arya_async'}, decimal:{source:decimalRuntime,value:'__arya_decimal'}, datetime:{source:datetimeRuntime,value:'__arya_datetime'},
  fs:{source:filesRuntime,value:'__arya_files',imports:["import * as __arya_fs from 'node:fs/promises';"]},
  math:{source:'',value:'Math'}, path:{source:'',value:'__arya_path',imports:["import * as __arya_path from 'node:path';"]},
  json:{source:jsonRuntime,value:'__arya_json',dependencies:['fs']},
  web:{source:httpRuntime,value:'__arya_web(sourceDirectory)',dependencies:['fs','path','validate'],imports:["import * as __arya_fsSync from 'node:fs';", "import {createServer as __arya_createServer} from 'node:http';", "import {AsyncLocalStorage as __arya_AsyncLocalStorage} from 'node:async_hooks';", "import {Buffer as __arya_mysqlBuffer} from 'node:buffer';", "import {randomUUID as __arya_randomUUID} from 'node:crypto';"]},
  mysql:{source:mysqlRuntime,value:'__arya_mysql',imports:["import {AsyncLocalStorage as __arya_AsyncLocalStorage} from 'node:async_hooks';", "import {Buffer as __arya_mysqlBuffer} from 'node:buffer';"]},
  env:{source:envRuntime,value:'__arya_env'}, validate:{source:validationRuntime,value:'__arya_validate'}, log:{source:loggingRuntime,value:'__arya_log'},
  python:{source:asynchronousPythonRuntime,value:'__arya_asyncPython(sourceDirectory)',dependencies:['path']},
  debug:{source:debugRuntime,value:'__arya_debug',imports:["import {inspect as __arya_inspectValue} from 'node:util';"]},
  ui:{source:uiRuntime,value:'__arya_ui',imports:["import {Buffer as __arya_mysqlBuffer} from 'node:buffer';", "import {randomUUID as __arya_randomUUID} from 'node:crypto';"]},
  list:{source:listRuntime,value:'__arya_list'},
  security:{source:securityRuntime,value:'__arya_security',imports:["import * as __arya_securityCrypto from 'node:crypto';", "import {Buffer as __arya_securityBuffer} from 'node:buffer';"]},
  testing:{source:testingRuntime,value:'__arya_testing',imports:["import * as __arya_nodeTest from 'node:test';", "import * as __arya_nodeAssert from 'node:assert/strict';"]},
};
const runtimeCache = new Map<string,string>();
/** Emit only requested libraries and their runtime dependencies. */
export function standardRuntimeFor(libraries: string[]): string {
  const key = [...new Set(libraries)].sort().join(',');
  const cached = runtimeCache.get(key); if (cached !== undefined) return cached;
  const selected = new Set<string>(), imports = new Set<string>(), sources: string[] = [];
  const include = (name: string) => {
    if (selected.has(name)) return;
    const definition = definitions[name]; if (!definition) throw new Error('Unknown standard library: '+name);
    selected.add(name);
    for (const dependency of definition.dependencies ?? []) include(dependency);
    for (const imported of definition.imports ?? []) imports.add(imported);
    sources.push(definition.source);
  };
  for (const name of key.split(',').filter(Boolean)) include(name);
  const lookup = `const __arya_standard = (name, sourceDirectory) => {switch(name) {${[...selected].map(name => `case ${JSON.stringify(name)}: return ${definitions[name]!.value};`).join('')}default: throw new Error('Unknown JavaScript standard library: '+name);}};`;
  const result = [...imports,...sources,lookup].join('\n');
  if (runtimeCache.size >= 64) runtimeCache.delete(runtimeCache.keys().next().value!);
  runtimeCache.set(key,result); return result;
}
