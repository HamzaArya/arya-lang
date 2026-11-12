/** Composable data validation. Schemas can cross separately compiled Arya modules. */
export const validationRuntime = String.raw`
const __arya_schemaTag = Symbol.for('arya.validation.schema');
const __arya_schemaError = message => Object.assign(new TypeError(message), { code: 'ARYA_VALIDATION_SCHEMA' });
const __arya_requireSchema = schema => {
  if (!schema || schema[__arya_schemaTag] !== true || typeof schema.read !== 'function') throw __arya_schemaError('Expected a schema created by the validate library.');
  return schema;
};
const __arya_validationIssue = (issues, path, code, message) => {
  if (issues.length < 32) issues.push({ path, code, message });
};
const __arya_schema = read => Object.freeze({
  [__arya_schemaTag]: true,
  read: (value, path, issues, depth = 0) => {
    if (issues.length >= 32) return undefined;
    if (depth > 64) { __arya_validationIssue(issues, path, 'depth', 'Input is nested too deeply.'); return undefined; }
    return read(value, path, issues, depth);
  }
});
const __arya_validationOptions = (options, names) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw __arya_schemaError('Schema options must be an object.');
  for (const key of Object.keys(options)) if (!names.includes(key)) throw __arya_schemaError('Unknown schema option: ' + key + '.');
  for (const key of ['trim', 'coerce', 'integer', 'strict']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw __arya_schemaError(key + ' must be a boolean.');
};
const __arya_validationBounds = (options, length = false) => {
  for (const key of ['min', 'max']) if (options[key] !== undefined && (typeof options[key] !== 'number' || !Number.isFinite(options[key]) || (length && (!Number.isSafeInteger(options[key]) || options[key] < 0)))) throw __arya_schemaError(key + ' must be ' + (length ? 'a nonnegative integer.' : 'a finite number.'));
  if (options.min !== undefined && options.max !== undefined && options.min > options.max) throw __arya_schemaError('Schema min must not exceed max.');
};
const __arya_validate = Object.freeze({
  string: (options = {}) => {
    __arya_validationOptions(options, ['min', 'max', 'trim']);
    __arya_validationBounds(options, true);
    const { min = 0, max = Infinity, trim = false } = options;
    return __arya_schema((value, path, issues) => {
      if (typeof value !== 'string') { __arya_validationIssue(issues, path, 'type', 'Expected text.'); return undefined; }
      const result = trim ? value.trim() : value;
      if (result.length < min || result.length > max) __arya_validationIssue(issues, path, 'length', 'Text length is outside the allowed range.');
      return result;
    });
  },
  number: (options = {}) => {
    __arya_validationOptions(options, ['min', 'max', 'integer', 'coerce']);
    __arya_validationBounds(options);
    const { min = -Infinity, max = Infinity, integer = false, coerce = false } = options;
    return __arya_schema((value, path, issues) => {
      if (coerce && typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) value = Number(value);
      if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) { __arya_validationIssue(issues, path, 'type', integer ? 'Expected a safe integer.' : 'Expected a finite number.'); return undefined; }
      if (value < min || value > max) __arya_validationIssue(issues, path, 'range', 'Number is outside the allowed range.');
      return value;
    });
  },
  integer: (options = {}) => {
    __arya_validationOptions(options, ['min', 'max', 'coerce']);
    return __arya_validate.number({ ...options, integer: true });
  },
  boolean: (options = {}) => {
    __arya_validationOptions(options, ['coerce']);
    const { coerce = false } = options;
    return __arya_schema((value, path, issues) => {
      if (coerce && ['true', 'false'].includes(value)) value = value === 'true';
      if (typeof value !== 'boolean') { __arya_validationIssue(issues, path, 'type', 'Expected a boolean.'); return undefined; }
      return value;
    });
  },
  enum: values => {
    if (!Array.isArray(values) || !values.length || values.some(value => value !== null && !['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value))) throw __arya_schemaError('enum expects a nonempty list of finite primitive values.');
    const choices = [...values];
    return __arya_schema((value, path, issues) => {
      if (!choices.includes(value)) __arya_validationIssue(issues, path, 'enum', 'Expected one of the allowed values.');
      return value;
    });
  },
  optional: (schema, ...defaults) => {
    __arya_requireSchema(schema);
    if (defaults.length > 1) throw __arya_schemaError('optional accepts one default value.');
    let fallback;
    if (defaults.length) {
      try { fallback = __arya_validate.parse(schema, defaults[0]); }
      catch { throw __arya_schemaError('The optional default must satisfy its schema.'); }
    }
    return __arya_schema((value, path, issues, depth) => value === undefined && !defaults.length ? undefined : schema.read(value === undefined ? fallback : value, path, issues, depth + 1));
  },
  nullable: schema => {
    __arya_requireSchema(schema);
    return __arya_schema((value, path, issues, depth) => value === null ? null : schema.read(value, path, issues, depth + 1));
  },
  array: (schema, options = {}) => {
    __arya_requireSchema(schema);
    __arya_validationOptions(options, ['min', 'max']);
    __arya_validationBounds(options, true);
    const { min = 0, max = 10000 } = options;
    if (max > 10000 || min > max) throw __arya_schemaError('Array schemas support at most 10000 items.');
    return __arya_schema((value, path, issues, depth) => {
      if (!Array.isArray(value)) { __arya_validationIssue(issues, path, 'type', 'Expected a list.'); return undefined; }
      if (value.length < min || value.length > max) { __arya_validationIssue(issues, path, 'length', 'List length is outside the allowed range.'); return undefined; }
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor && !Object.hasOwn(descriptor, 'value')) { __arya_validationIssue(issues, [...path, index], 'type', 'Expected a data item.'); return undefined; }
        return schema.read(descriptor?.value, [...path, index], issues, depth + 1);
      });
    });
  },
  object: (fields, options = {}) => {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw __arya_schemaError('object expects named field schemas.');
    __arya_validationOptions(options, ['strict']);
    const entries = Object.entries(fields);
    entries.forEach(([, schema]) => __arya_requireSchema(schema));
    const names = new Set(entries.map(([name]) => name));
    const { strict = true } = options;
    return __arya_schema((value, path, issues, depth) => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) { __arya_validationIssue(issues, path, 'type', 'Expected an object.'); return undefined; }
      const result = {};
      if (strict) for (const key of Object.keys(value)) if (!names.has(key)) __arya_validationIssue(issues, [...path, key], 'unknown', 'Unexpected field.');
      for (const [key, schema] of entries) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && !Object.hasOwn(descriptor, 'value')) { __arya_validationIssue(issues, [...path, key], 'type', 'Expected a data field.'); continue; }
        const parsed = schema.read(descriptor?.value, [...path, key], issues, depth + 1);
        if (parsed !== undefined) Object.defineProperty(result, key, { value: parsed, enumerable: true, writable: true, configurable: true });
      }
      return result;
    });
  },
  check: (schema, value) => {
    __arya_requireSchema(schema);
    const issues = [];
    const parsed = schema.read(value, [], issues);
    return issues.length ? { ok: false, issues } : { ok: true, value: parsed };
  },
  parse: (schema, value) => {
    const result = __arya_validate.check(schema, value);
    if (!result.ok) throw Object.assign(new Error('Input validation failed.'), { code: 'ARYA_VALIDATION', issues: result.issues, aryaHttpStatus: 400 });
    return result.value;
  }
});`;
