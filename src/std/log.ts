/** JSON log records with bounded serialization and recursive field redaction. */
export const loggingRuntime = String.raw`
const __arya_logLevels = Object.freeze({ trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity });
const __arya_logError = message => Object.assign(new TypeError(message), { code: 'ARYA_LOG_CONFIG' });
const __arya_log = Object.freeze({
  create: (options = {}) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw __arya_logError('log.create expects an options object.');
    for (const key of Object.keys(options)) if (!['name', 'level', 'sink', 'redact'].includes(key)) throw __arya_logError('Unknown logger option: ' + key + '.');
    const { name = 'arya', level = 'info', sink = line => process.stdout.write(line), redact = [] } = options;
    if (typeof name !== 'string' || !name.trim()) throw __arya_logError('Logger name must be nonempty text.');
    if (!Object.hasOwn(__arya_logLevels, level)) throw __arya_logError('Logger level must be trace, debug, info, warn, error, fatal, or silent.');
    if (typeof sink !== 'function') throw __arya_logError('Logger sink must be a function receiving one JSON line.');
    if (!Array.isArray(redact) || redact.some(key => typeof key !== 'string' || !key)) throw __arya_logError('Logger redact must be a list of field names.');
    const normalize = key => key.replace(/[-_]/g, '').toLowerCase();
    const secrets = new Set(['password', 'passwd', 'pwd', 'secret', 'token', 'authorization', 'cookie', 'setcookie', 'apikey', 'accesstoken', 'refreshtoken', ...redact.map(normalize)]);
    const clean = value => {
      const seen = new WeakSet();
      let nodes = 0;
      const visit = (item, depth = 0) => {
        if (++nodes > 1000 || depth > 8) return '[Truncated]';
        if (item === null || typeof item === 'boolean' || typeof item === 'number') return item;
        if (typeof item === 'string') return item.length > 8192 ? item.slice(0, 8192) + '[Truncated]' : item;
        if (typeof item === 'bigint') return String(item);
        if (typeof item !== 'object') return '[' + typeof item + ']';
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
        if (item instanceof Error) {
          const output = {};
          for (const key of ['name', 'message', 'code', 'driverCode', 'sqlState']) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (descriptor && Object.hasOwn(descriptor, 'value')) output[key] = visit(descriptor.value, depth + 1);
          }
          if (!output.name) output.name = 'Error';
          return output;
        }
        if (Array.isArray(item)) return Array.from({ length: Math.min(item.length, 100) }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          return descriptor && Object.hasOwn(descriptor, 'value') ? visit(descriptor.value, depth + 1) : '[Accessor]';
        });
        const output = {};
        for (const key of Object.keys(item).slice(0, 100)) {
          const descriptor = Object.getOwnPropertyDescriptor(item, key);
          const content = secrets.has(normalize(key)) ? '[Redacted]' : descriptor && Object.hasOwn(descriptor, 'value') ? visit(descriptor.value, depth + 1) : '[Accessor]';
          Object.defineProperty(output, key, { value: content, enumerable: true });
        }
        return output;
      };
      return visit(value);
    };
    const fields = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw __arya_logError('Log fields must be an object.');
      return clean(value);
    };
    const create = initial => {
      const bindings = fields(initial);
      const logger = { child: extra => create({ ...bindings, ...fields(extra) }) };
      for (const [method, weight] of Object.entries(__arya_logLevels)) if (method !== 'silent') {
        logger[method] = (message, extra = {}) => {
          if (weight < __arya_logLevels[level]) return;
          if (typeof message !== 'string') throw __arya_logError('Log messages must be text; put data in the fields argument.');
          const record = { ...bindings, ...fields(extra), timestamp: new Date().toISOString(), level: method, name, message: message.slice(0, 8192) };
          sink(JSON.stringify(record) + '\n');
        };
      }
      return Object.freeze(logger);
    };
    return create({});
  }
});`;
