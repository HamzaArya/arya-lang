import { httpRuntime } from './std/http.js';
import { envRuntime } from './std/env.js';
import { mysqlRuntime } from './std/mysql.js';
import { validationRuntime } from './std/validate.js';
import { loggingRuntime } from './std/log.js';
import { asynchronousPythonRuntime } from './std/python.js';
import { debugRuntime } from './std/debug.js';
import { uiRuntime } from './std/ui.js';

/** JavaScript-profile standard libraries. Checking only emits this source; it never runs it. */
export const standardLibraries = ['fs', 'math', 'path', 'json', 'web', 'mysql', 'env', 'validate', 'log', 'python', 'debug', 'ui'] as const;

export const standardRuntime = String.raw`import * as __arya_fs from 'node:fs/promises';
import * as __arya_fsSync from 'node:fs';
import * as __arya_path from 'node:path';
import { createServer as __arya_createServer } from 'node:http';
import { AsyncLocalStorage as __arya_AsyncLocalStorage } from 'node:async_hooks';
import { Buffer as __arya_mysqlBuffer } from 'node:buffer';
import { randomUUID as __arya_randomUUID } from 'node:crypto';
import { inspect as __arya_inspectValue } from 'node:util';
const __arya_files = Object.freeze({
  readText: path => __arya_fs.readFile(path, 'utf8'),
  writeText: (path, text) => __arya_fs.writeFile(path, text, 'utf8'),
  list: path => __arya_fs.readdir(path),
  exists: async path => {
    try { await __arya_fs.access(path); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
});
const __arya_json = Object.freeze({
  parse: text => JSON.parse(text),
  stringify: value => JSON.stringify(value),
  read: async path => JSON.parse(await __arya_files.readText(path)),
  write: (path, value) => __arya_files.writeText(path, JSON.stringify(value, null, 2) + '\n')
});
${validationRuntime}
${loggingRuntime}
${httpRuntime}
${mysqlRuntime}
${envRuntime}
${asynchronousPythonRuntime}
${debugRuntime}
${uiRuntime}
const __arya_standard = (name, sourceDirectory) => {
  switch (name) {
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
    default: throw new Error('Unknown JavaScript standard library: ' + name);
  }
};`;
