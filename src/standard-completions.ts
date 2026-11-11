import type { Block, Expression } from './ast.js';
import { uiCatalog } from './ui-catalog.js';
import { parseProgram, tokenize, type LexicalBinding } from './compiler.js';

const queries = {
  rows: 'await db.rows(sql, params = []) — return all rows from a prepared query.',
  one: 'await db.one(sql, params = []) — return the first row, or null.',
  scalar: 'await db.scalar(sql, params = []) — return the first column of the first row, or null.',
  execute: 'await db.execute(sql, params = []) — return rows or write metadata (affectedRows, insertId).',
};
const pythonMethods = {
  call: 'await python.call(function, args = [], {kwargs, signal, timeoutMs, interpreter}) — call Python without blocking JavaScript.',
  map: 'await python.map(function, values, options = {}) — process a list in order in one Python process.',
  bind: 'python.bind(moduleOrFunction, options = {}) — bind async calls and shared call options to a Python import.',
  info: 'await python.info(options = {}) — inspect the selected interpreter and virtual environment.',
  close: 'await python.close() — reject new work and drain accepted Python jobs.',
  stats: 'python.stats() — inspect active jobs, queued jobs, and closed state.',
};
const members: Record<string, Record<string, string>> = {
  decimal: Object.fromEntries(['from(text)', 'add(a, b)', 'subtract(a, b)', 'multiply(a, b)', 'compare(a, b)', 'divide(a, b, places, rounding)', 'quantize(value, places, rounding)', 'toNumber(value)'].map(signature=>[signature.split('(')[0]!, 'decimal.'+signature+' — exact decimal strings; explicit rounding.'])),
  datetime: Object.fromEntries(['date(text)', 'instant(text)', 'zoned(instant, zone)', 'dateAt(instant, zone)', 'toDate(instant)', 'fromDate(date)', 'atOffset(date, time, offset)'].map(signature=>[signature.split('(')[0]!, 'datetime.'+signature+' — strict ISO values and explicit zones.'])),
  async: {map:'async.map(iterable, callback, {concurrency = 4, signal}) — ordered async iterable with bounded read-ahead.',each:'await async.each(iterable, callback, options) — drain work with backpressure and cleanup.'},
  list: {
    map: 'list.map(values, selector) — transform values; selector can be a function or field name.',
    flatMap: 'list.flatMap(values, selector) — transform and flatten one list level.',
    filter: 'list.filter(values, selector) — keep values matching a synchronous predicate or truthy field.',
    find: 'list.find(values, selector) — return the first matching value, or null.',
    reduce: 'list.reduce(values, reducer, initial) — combine values with an explicit initial value.',
    groupBy: 'list.groupBy(values, selector) — group values by string keys into a record without a prototype.',
    sortBy: 'list.sortBy(values, selector, order = "asc") — return a stably sorted copy.',
    take: 'list.take(values, count = 1) — return the first count values.',
    unique: 'list.unique(values, selector) — keep the first value for each distinct key.',
    sum: 'list.sum(values, selector) — sum finite numbers or numeric fields.',
  },
  ui: Object.fromEntries(uiCatalog.map(([name, , signature, description]) => [name, 'ui.' + signature + ' — ' + description])),
  debug: {
    assert: 'debug.assert(condition, message = "Assertion failed.") — throw ARYA_ASSERTION if the condition is false.',
    inspect: 'debug.inspect(value, {depth = 4, maxArrayLength = 50, colors = false}) — inspect without invoking getters/custom inspectors.',
    trace: 'debug.trace(label, value) — write a value and caller location to stderr; return the value.',
  },
  python: {
    ...pythonMethods,
    client: 'python.client({interpreter, timeoutMs, maxConcurrency = 4, queueLimit = 100}) — create an independent managed Python client.',
  },
  'python.client': pythonMethods,
  mysql: { connect: 'await mysql.connect(options) — verify a MySQL connection and return a managed pool.' },
  'mysql.pool': {
    ...queries,
    transaction: 'await db.transaction(async fn(tx) { ... }) — commit on success; roll back on failure.',
    ping: 'await db.ping() — check connectivity; returns true or throws.',
    close: 'await db.close() — wait for active work and close the pool; safe to call repeatedly.',
  },
  'mysql.transaction': queries,
  env: {
    get: 'env.get(name, fallback = null) — read an environment variable, preserving empty text.',
    require: 'env.require(name) — require a nonempty environment variable.',
    int: 'env.int(name, fallback) — read a safe integer; reject invalid configuration.',
    bool: 'env.bool(name, fallback) — accept true, false, 1, or 0.',
  },
  web: {
    serve: 'web.serve(port, routes = {}, options = {}) — start an HTTP server; index.html is required unless html:false.',
    response: 'web.response(status, body, headers = {}) — return a custom HTTP status and headers.',
    route: 'web.route(handler, {body, query, params}) — validate request data before running a handler.',
    error: 'web.error(status, message, code = "ARYA_HTTP_ERROR") — create a catchable HTTP error.',
    health: 'await web.health(checks, {timeoutMs = 1000}) — return a bounded readiness response.',
    shutdown: 'await web.shutdown(server, {timeoutMs = 10000, cleanup}) — drain requests and then release resources.',
  },
  validate: {
    string: 'validate.string({min, max, trim = false}) — validate text.',
    number: 'validate.number({min, max, integer = false, coerce = false}) — validate finite numbers.',
    integer: 'validate.integer({min, max, coerce = false}) — validate safe integers.',
    boolean: 'validate.boolean({coerce = false}) — validate booleans.',
    enum: 'validate.enum(values) — accept one of a list of primitive values.',
    optional: 'validate.optional(schema, default?) — allow a missing value, with an optional validated default.',
    nullable: 'validate.nullable(schema) — allow null or a value matching the schema.',
    array: 'validate.array(schema, {min, max}) — validate a bounded list.',
    object: 'validate.object(fields, {strict = true}) — validate and copy named fields.',
    check: 'validate.check(schema, value) — return {ok, value} or {ok, issues}.',
    parse: 'validate.parse(schema, value) — return normalized data or throw ARYA_VALIDATION.',
  },
  log: { create: 'log.create({name, level = "info", redact = [], sink?}) — create a structured JSON logger.' },
  'log.logger': {
    trace: 'logger.trace(message, fields = {}) — log a trace event.',
    debug: 'logger.debug(message, fields = {}) — log a debugging event.',
    info: 'logger.info(message, fields = {}) — log an informational event.',
    warn: 'logger.warn(message, fields = {}) — log a warning event.',
    error: 'logger.error(message, fields = {}) — log an error event.',
    fatal: 'logger.fatal(message, fields = {}) — log a fatal event; does not exit the process.',
    child: 'logger.child(fields) — bind shared fields to a child logger.',
  },
  fs: {
    readText: 'await fs.readText(path) — read UTF-8 text.',
    writeText: 'await fs.writeText(path, text) — write UTF-8 text.',
    list: 'await fs.list(path) — list directory entries.',
    exists: 'await fs.exists(path) — check whether a path exists.',
  },
  json: {
    parse: 'json.parse(text) — parse JSON text.',
    stringify: 'json.stringify(value) — serialize a JSON value.',
    read: 'await json.read(path) — read and parse a JSON file.',
    write: 'await json.write(path, value) — write an indented JSON file.',
  },
};

/** Conservative, same-file API hints. No driver imports, filesystem reads, or execution. */
export function standardCompletions(source: string, offset: number, target: 'js' = 'js') {
  if (target !== 'js') return [];
  const match = /([A-Za-z_][A-Za-z0-9_]*)\??\.([A-Za-z0-9_]*)$/.exec(source.slice(0, offset));
  if (!match) return [];
  const start = offset - match[0].length;
  try {
    // Token identity excludes strings/comments, even when they resemble member access.
    const token = tokenize(source.slice(0, start + match[1]!.length)).find(item => item.start === start);
    if (token?.kind !== 'word' || token.text !== match[1]) return [];
    // Repair only the member being completed, so a trailing dot remains useful.
    const end = offset + (source.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0].length ?? 0);
    const parsed = parseProgram(source.slice(0, start) + match[1] + '.aryaCompletion' + source.slice(end), 'document.arya');
    const shapes = new Map<LexicalBinding, string>();
    const shape = (expression: Expression): string | undefined => {
      if (expression.kind === 'unary' && expression.operator === 'await') return shape(expression.value);
      if (expression.kind === 'name' && expression.reference.binding) return shapes.get(expression.reference.binding);
      if ((expression.kind === 'call' || expression.kind === 'pipe') && expression.callee.kind === 'member' && expression.callee.key.kind === 'literal' && expression.callee.key.value === 'connect' && shape(expression.callee.object) === 'mysql') return 'mysql.pool';
      if ((expression.kind === 'call' || expression.kind === 'pipe') && expression.callee.kind === 'member' && expression.callee.key.kind === 'literal') {
        const owner = shape(expression.callee.object);
        if (owner === 'log' && expression.callee.key.value === 'create' || owner === 'log.logger' && expression.callee.key.value === 'child') return 'log.logger';
        if (owner === 'python' && expression.callee.key.value === 'client') return 'python.client';
      }
      return undefined;
    };
    const expression = (value: Expression): void => {
      switch (value.kind) {
        case 'function': value.defaults.forEach(expression); block(value.body); break;
        case 'call': case 'pipe':
          if (value.callee.kind === 'member' && value.callee.key.kind === 'literal' && value.callee.key.value === 'transaction' && shape(value.callee.object) === 'mysql.pool') {
            const callback = value.kind === 'pipe' ? value.value : value.arguments[0];
            if (callback?.kind === 'function' && callback.parameters[0]) {
              const binding = parsed.bindings.find(item => item.token === callback.parameters[0]);
              if (binding) shapes.set(binding, 'mysql.transaction');
            }
          }
          if (value.kind === 'pipe') expression(value.value);
          expression(value.callee); value.arguments.forEach(expression); break;
        case 'new': expression(value.callee); value.arguments.forEach(expression); break;
        case 'unary': case 'spread': expression(value.value); break;
        case 'binary': expression(value.left); expression(value.right); break;
        case 'member': expression(value.object); expression(value.key); break;
        case 'chain': expression(value.base); value.steps.forEach(step => step.kind === 'member' ? expression(step.key) : step.arguments.forEach(expression)); break;
        case 'list': value.items.forEach(expression); break;
        case 'object': value.fields.forEach(field => expression(field.value)); break;
        case 'view': value.expressions.forEach(expression); break;
      }
    };
    const block = (value: Block): void => {
      for (const statement of value.statements) {
        switch (statement.kind) {
          case 'import': if (statement.bridge === 'std') shapes.set(statement.binding, statement.specifier); break;
          case 'declaration': {
            const result = shape(statement.value);
            if (result && statement.binding.kind === 'const') shapes.set(statement.binding, result);
            expression(statement.value); break;
          }
          case 'function': case 'expression': case 'throw': expression(statement.value); break;
          case 'assignment': expression(statement.target); expression(statement.value); break;
          case 'return': if (statement.value) expression(statement.value); break;
          case 'if': expression(statement.condition); block(statement.body); if (statement.otherwise) block(statement.otherwise); break;
          case 'while': expression(statement.condition); block(statement.body); break;
          case 'for': expression(statement.iterable); block(statement.body); break;
          case 'try': block(statement.body); if (statement.handler) block(statement.handler); if (statement.finalizer) block(statement.finalizer); break;
        }
      }
    };
    block(parsed.ast);
    const binding = parsed.references.find(item => item.token.start === start)?.binding;
    const api = binding ? shapes.get(binding) : undefined;
    return Object.entries(api ? members[api] ?? {} : {}).map(([label, detail]) => ({ label, detail, kind: 'function' as const }));
  } catch { return []; }
}
