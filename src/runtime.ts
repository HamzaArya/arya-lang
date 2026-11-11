import { pythonWorker } from './python-worker.js';

export const javascriptRuntime = `const print = (...values) => console.log(...values);
const len = value => {
  if (typeof value !== 'string' && !Array.isArray(value)) throw new TypeError('len expects a string or list.');
  return value.length;
};
const str = value => String(value);
const number = value => Number(value);
const args = typeof process === 'undefined' ? [] : process.argv.slice(2);
const range = (start, end, step = 1) => {
  if (end === undefined) { end = start; start = 0; }
  if (![start, end, step].every(Number.isSafeInteger) || step === 0) throw new TypeError('range expects safe integers and a nonzero step.');
  const count = Math.max(0, Math.ceil((end - start) / step));
  if (count > 100000) throw new RangeError('range supports at most 100000 items.');
  return Array.from({ length: count }, (_, index) => start + index * step);
};
const __arya_invoke = (function() {}).call.bind((function() {}).apply);
const __arya_pipeMember = (receiver, key) => ({fn: receiver[key], receiver});
const __arya_pipe = (value, reference, extra) => {
  if (typeof reference.fn !== 'function') {
    try { __arya_invoke(reference.fn, reference.receiver, [value, ...extra]); }
    catch (error) { error.code = 'ARYA_PIPELINE_STAGE'; error.message = 'Pipeline stage must be a callable function.'; throw error; }
  }
  return __arya_invoke(reference.fn, reference.receiver, [value, ...extra]);
};`;

export const pythonRuntime = `import { spawnSync as __arya_spawnSync } from 'node:child_process';
import { fileURLToPath as __arya_fileURLToPath } from 'node:url';
import { Buffer as __arya_Buffer } from 'node:buffer';
const __arya_bridgeError = (code, message, Type = Error, cause) => {
  const error = new Type(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
};
const __arya_python = module => {
  const call = (member, values, kwargs = {}) => {
    let input;
    try {
      input = JSON.stringify({ module, member, args: values, kwargs }, (_key, value) => {
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) throw __arya_bridgeError('ARYA_PYTHON_INPUT', 'Python bridge values must be JSON-compatible.', TypeError);
        return value;
      });
    } catch (error) {
      if (error?.code === 'ARYA_PYTHON_INPUT') throw error;
      throw __arya_bridgeError('ARYA_PYTHON_INPUT', 'Python bridge values must be JSON-compatible. Remove cycles or convert custom values to JSON data. ' + (error?.message ?? String(error)), TypeError, error);
    }
    const executable = process.env.ARYA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const result = __arya_spawnSync(executable, ['-c', ${JSON.stringify(pythonWorker)}], {
      input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      cwd: __arya_fileURLToPath(new URL('.', __arya_source)),
    });
    if (result.stderr) process.stderr.write(result.error ? __arya_Buffer.from(result.stderr, 'utf8').subarray(0, 65536) : result.stderr);
    if (result.error) {
      if (result.error.code === 'ENOENT') throw __arya_bridgeError('ARYA_PYTHON_NOT_FOUND', 'Python bridge failed: cannot start ' + executable + '. Install Python or set ARYA_PYTHON to its executable.', Error, result.error);
      if (result.error.code === 'ETIMEDOUT') throw __arya_bridgeError('ARYA_PYTHON_TIMEOUT', 'Python bridge failed: call exceeded 30000 ms. Batch or reduce the work in this call.', Error, result.error);
      if (result.error.code === 'ENOBUFS') throw __arya_bridgeError('ARYA_PYTHON_OUTPUT_LIMIT', 'Python bridge failed: output exceeds the 8 MiB buffer limit. Reduce logging or return a smaller result.', Error, result.error);
      throw __arya_bridgeError('ARYA_PYTHON_START', 'Python bridge failed: ' + result.error.message + '. Check the selected interpreter and executable permissions.', Error, result.error);
    }
    if (result.status !== 0) throw __arya_bridgeError('ARYA_PYTHON_EXIT', 'Python bridge exited with status ' + result.status + '.' + (result.signal ? ' Signal: ' + result.signal + '.' : '') + ' Review Python stderr and the selected interpreter.');
    let response;
    try { response = JSON.parse(result.stdout); } catch (error) { throw __arya_bridgeError('ARYA_PYTHON_PROTOCOL', 'Python bridge returned an invalid JSON response. Native writes to stdout must not bypass the bridge logging channel.', Error, error); }
    if (response === null || typeof response !== 'object' || Array.isArray(response) || typeof response.ok !== 'boolean' || (response.ok ? !Object.hasOwn(response, 'value') : typeof response.error !== 'string')) throw __arya_bridgeError('ARYA_PYTHON_PROTOCOL', 'Python bridge returned an invalid JSON response. Expected a complete bridge response object.');
    if (!response.ok) {
      const hints = {
        ARYA_PYTHON_FILE_NOT_FOUND: ' Check the .py path relative to the importing Arya source.',
        ARYA_PYTHON_MODULE_NOT_FOUND: ' Install this module and its dependencies in the selected Python environment.',
        ARYA_PYTHON_MEMBER: ' Choose an existing public callable; constants and persistent Python objects need a helper function.',
        ARYA_PYTHON_RETURN: ' Convert the Python return value to finite numbers, strings, booleans, None, lists, or JSON objects.',
      };
      const code = typeof response.code === 'string' && Object.hasOwn(hints, response.code) ? response.code : 'ARYA_PYTHON_EXCEPTION';
      throw __arya_bridgeError(code, 'Python: ' + response.error + (hints[code] || ''));
    }
    return response.value;
  };
  const member = parts => new Proxy(function () {}, {
    get(_target, key) {
      if (key === Symbol.for('arya.python.callable')) return Object.freeze({ module, member: Object.freeze([...parts]), source: __arya_source });
      if (key === 'then' || typeof key !== 'string') return undefined;
      if (key === 'with') return (values, kwargs) => {
        if (!Array.isArray(values) || kwargs === null || typeof kwargs !== 'object' || Array.isArray(kwargs)) throw __arya_bridgeError('ARYA_PYTHON_ARGUMENTS', 'Use function.with([arguments], { keyword: value }).', TypeError);
        return call(parts, values, kwargs);
      };
      if (key.startsWith('_')) throw __arya_bridgeError('ARYA_PYTHON_PRIVATE', 'Python bridge members must be public.');
      return member([...parts, key]);
    },
    apply(_target, _this, values) { return call(parts, values); },
  });
  return member([]);
};`;
