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
};`;

// A fresh Python process handles one JSON request. Library stdout goes to stderr,
// leaving stdout exclusively for the protocol response. No shell is involved.
const pythonWorker = `import contextlib, importlib, importlib.util, json, os, sys, traceback
request = json.load(sys.stdin)
try:
    with contextlib.redirect_stdout(sys.stderr):
        module_name = request['module']
        if module_name.endswith('.py') or os.path.isabs(module_name):
            spec = importlib.util.spec_from_file_location('_arya_bridge', module_name)
            if spec is None or spec.loader is None:
                raise ImportError('Cannot load Python file: ' + module_name)
            module = importlib.util.module_from_spec(spec)
            sys.path.insert(0, os.path.dirname(os.path.abspath(module_name)))
            spec.loader.exec_module(module)
        else:
            module = importlib.import_module(module_name)
        target = module
        for part in request['member']:
            if part.startswith('_'):
                raise ValueError('Python bridge members must be public')
            target = getattr(target, part)
        result = target(*request['args'], **request.get('kwargs', {}))
    response = json.dumps({'ok': True, 'value': result}, allow_nan=False)
except Exception as error:
    response = json.dumps({'ok': False, 'error': type(error).__name__ + ': ' + str(error)})
sys.stdout.write(response)
`;

export const pythonRuntime = `import { spawnSync as __arya_spawnSync } from 'node:child_process';
import { fileURLToPath as __arya_fileURLToPath } from 'node:url';
const __arya_python = module => {
  const call = (member, values, kwargs = {}) => {
    const input = JSON.stringify({ module, member, args: values, kwargs }, (_key, value) => {
      if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError('Python bridge values must be JSON-compatible.');
      return value;
    });
    const executable = process.env.ARYA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const result = __arya_spawnSync(executable, ['-c', ${JSON.stringify(pythonWorker)}], {
      input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      cwd: __arya_fileURLToPath(new URL('.', __arya_source)),
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw new Error('Python bridge failed: ' + result.error.message);
    if (result.status !== 0) throw new Error('Python bridge exited with status ' + result.status + '.');
    let response;
    try { response = JSON.parse(result.stdout); } catch { throw new Error('Python bridge returned an invalid JSON response.'); }
    if (!response.ok) throw new Error('Python: ' + response.error);
    return response.value;
  };
  const member = parts => new Proxy(function () {}, {
    get(_target, key) {
      if (key === 'then' || typeof key !== 'string') return undefined;
      if (key === 'with') return (values, kwargs) => {
        if (!Array.isArray(values) || kwargs === null || typeof kwargs !== 'object' || Array.isArray(kwargs)) throw new TypeError('Use function.with([arguments], { keyword: value }).');
        return call(parts, values, kwargs);
      };
      if (key.startsWith('_')) throw new Error('Python bridge members must be public.');
      return member([...parts, key]);
    },
    apply(_target, _this, values) { return call(parts, values); },
  });
  return member([]);
};`;
