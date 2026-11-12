/** Small explicit debugging tools. Object inspection never invokes custom inspectors/getters. */
export const debugRuntime = String.raw`
const __arya_debugInspect = (value, options = {}) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('debug.inspect options must be an object.');
  for (const key of Object.keys(options)) if (!['depth', 'maxArrayLength', 'colors'].includes(key)) throw new TypeError('Unknown debug.inspect option: ' + key);
  const { depth = 4, maxArrayLength = 50, colors = false } = options;
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > 20) throw new TypeError('Inspection depth must be an integer from 0 to 20.');
  if (!Number.isSafeInteger(maxArrayLength) || maxArrayLength < 0 || maxArrayLength > 1000) throw new TypeError('Inspection maxArrayLength must be an integer from 0 to 1000.');
  if (typeof colors !== 'boolean') throw new TypeError('Inspection colors must be a boolean.');
  return __arya_inspectValue(value, { depth, maxArrayLength, colors, customInspect: false, getters: false, maxStringLength: 10000, breakLength: 100 });
};
const __arya_debugAssert = (condition, message = 'Assertion failed.') => {
  if (condition) return condition;
  if (typeof message !== 'string') throw new TypeError('debug.assert expects a text message.');
  const error = Object.assign(new Error(message), { name: 'AryaAssertionError', code: 'ARYA_ASSERTION' });
  Error.captureStackTrace?.(error, __arya_debugAssert);
  throw error;
};
const __arya_debugTrace = (label, value) => {
  if (typeof label !== 'string' || !label.trim()) throw new TypeError('debug.trace expects a nonempty label and a value.');
  const location = new Error();
  Error.captureStackTrace?.(location, __arya_debugTrace);
  const caller = location.stack?.split('\n')[1]?.trim() ?? 'unknown caller';
  process.stderr.write(label + ' = ' + __arya_debugInspect(value) + '\n  ' + caller + '\n');
  return value;
};
const __arya_debug = Object.freeze({ assert: __arya_debugAssert, inspect: __arya_debugInspect, trace: __arya_debugTrace });`;
