import { pythonWorker } from '../python-worker.js';

/** Bounded asynchronous Python calls; imported only as code during compilation. */
export const asynchronousPythonRuntime = String.raw`
import { spawn as __arya_spawnPython } from 'node:child_process';
import { fileURLToPath as __arya_pythonFilePath } from 'node:url';
import { Buffer as __arya_pythonBuffer } from 'node:buffer';
const __arya_asyncPythonWorker = ${JSON.stringify(pythonWorker)};
const __arya_pythonFailure = (code, message, cause, Type = Error) => {
  const error = new Type(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
};
const __arya_pythonSettings = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'Python options must be an object.', undefined, TypeError);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'Unknown Python option: ' + key + '.', undefined, TypeError);
  for (const [key, maximum] of [['timeoutMs', 2147483647], ['maxInputBytes', 16 * 1024 * 1024], ['maxOutputBytes', 16 * 1024 * 1024], ['maxConcurrency', 64], ['queueLimit', 10000]]) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < (key === 'queueLimit' ? 0 : 1) || value[key] > maximum)) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'Python ' + key + ' is outside its supported integer range.', undefined, TypeError);
  }
  if (value.interpreter !== undefined && (typeof value.interpreter !== 'string' || !value.interpreter || value.interpreter.includes('\0'))) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'Python interpreter must be an executable name or path.', undefined, TypeError);
  if (value.signal !== undefined && (!value.signal || typeof value.signal.aborted !== 'boolean' || typeof value.signal.addEventListener !== 'function' || typeof value.signal.removeEventListener !== 'function')) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'Python signal must be an AbortSignal.', undefined, TypeError);
  if (value.kwargs !== undefined && (!value.kwargs || typeof value.kwargs !== 'object' || Array.isArray(value.kwargs))) throw __arya_pythonFailure('ARYA_PYTHON_ARGUMENTS', 'Python kwargs must be an object of keyword arguments.', undefined, TypeError);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
};
const __arya_asyncPython = sourceDirectory => {
  const create = (settings = {}) => {
    settings = __arya_pythonSettings(settings, ['interpreter', 'timeoutMs', 'maxInputBytes', 'maxOutputBytes', 'maxConcurrency', 'queueLimit']);
    const defaults = { timeoutMs: 30000, maxInputBytes: 8 * 1024 * 1024, maxOutputBytes: 8 * 1024 * 1024, maxConcurrency: 4, queueLimit: 100, ...settings };
    const queue = [];
    let active = 0, closed = false, closing, finishClose;
    const drained = () => { if (closed && active === 0 && queue.length === 0) finishClose?.(); };
    const pump = () => {
      while (active < defaults.maxConcurrency && queue.length) queue.shift().start();
      drained();
    };
    const run = async (request, options, source) => {
      const caller = new Error('Async Python caller');
      options = __arya_pythonSettings(options, ['interpreter', 'timeoutMs', 'maxInputBytes', 'maxOutputBytes', 'kwargs', 'signal']);
      if (closed) throw __arya_pythonFailure('ARYA_PYTHON_CLOSED', 'This Python client is closed. Create another client to start more work.');
      const config = { ...defaults, ...options };
      if (config.signal?.aborted) throw __arya_pythonFailure('ARYA_PYTHON_CANCELLED', 'Python call was cancelled.');
      if (request.mode === 'info' && options.kwargs !== undefined) throw __arya_pythonFailure('ARYA_PYTHON_OPTIONS', 'python.info does not accept keyword arguments.', undefined, TypeError);
      request = { ...request, async: true, kwargs: options.kwargs ?? {} };
      let input;
      try {
        // Reject callable values before JSON can invoke a proxy's toJSON member.
        const seen = new WeakSet();
        const inspect = value => {
          if (typeof value === 'function') throw __arya_pythonFailure('ARYA_PYTHON_INPUT', 'Python callables and JavaScript callbacks are not JSON argument values.', undefined, TypeError);
          if (!value || typeof value !== 'object' || seen.has(value)) return;
          seen.add(value);
          for (const key of Object.keys(value)) {
            const field = Object.getOwnPropertyDescriptor(value, key);
            if (field && Object.hasOwn(field, 'value') && !(key === 'toJSON' && typeof field.value === 'function')) inspect(field.value);
          }
        };
        inspect(request);
        input = JSON.stringify(request, (_key, value) => {
          if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'number' && !Number.isFinite(value)) throw __arya_pythonFailure('ARYA_PYTHON_INPUT', 'Python bridge values must be JSON-compatible.', undefined, TypeError);
          return value;
        });
      } catch (error) {
        if (error?.code === 'ARYA_PYTHON_INPUT') throw error;
        throw __arya_pythonFailure('ARYA_PYTHON_INPUT', 'Python bridge values must be JSON-compatible. Remove cycles or serialize custom values explicitly.', error, TypeError);
      }
      if (__arya_pythonBuffer.byteLength(input, 'utf8') > config.maxInputBytes) throw __arya_pythonFailure('ARYA_PYTHON_INPUT', 'Python request exceeds maxInputBytes. Reduce the input or split the batch.', undefined, TypeError);
      if (request.mode === 'map' && !request.values.length) return [];
      if (active >= defaults.maxConcurrency && queue.length >= defaults.queueLimit) throw __arya_pythonFailure('ARYA_PYTHON_QUEUE_FULL', 'Python client queue is full. Reduce concurrent work or configure its limits.');
      const cwd = source ? __arya_pythonFilePath(new URL('.', source)) : sourceDirectory;
      const requestedInterpreter = config.interpreter ?? (process.env.ARYA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'));
      const interpreter = /[\\/]/.test(requestedInterpreter) ? __arya_path.resolve(sourceDirectory, requestedInterpreter) : requestedInterpreter;
      const decode = output => {
        let response;
        try { response = JSON.parse(output, (_key, value) => {
          if (typeof value === 'number' && !Number.isFinite(value)) throw __arya_pythonFailure('ARYA_PYTHON_RETURN', 'Python returned a number outside JavaScript\'s finite range. Encode exact large numbers as text.');
          return value;
        }); }
        catch (error) {
          if (error?.code === 'ARYA_PYTHON_RETURN') throw error;
          throw __arya_pythonFailure('ARYA_PYTHON_PROTOCOL', 'Python bridge returned an invalid JSON response.', error);
        }
        if (!response || typeof response !== 'object' || Array.isArray(response) || typeof response.ok !== 'boolean' || (response.ok ? !Object.hasOwn(response, 'value') : typeof response.error !== 'string')) throw __arya_pythonFailure('ARYA_PYTHON_PROTOCOL', 'Python bridge returned an invalid JSON response envelope.');
        if (!response.ok) {
          const hints = {
            ARYA_PYTHON_FILE_NOT_FOUND: ' Check the .py path relative to the importing Arya source.',
            ARYA_PYTHON_MODULE_NOT_FOUND: ' Install the module in the selected Python environment.',
            ARYA_PYTHON_MEMBER: ' Choose an existing public callable.',
            ARYA_PYTHON_RETURN: ' Convert the return value to supported JSON data; encode exact integers and decimals as text.',
          };
          const code = Object.hasOwn(hints, response.code) ? response.code : 'ARYA_PYTHON_EXCEPTION';
          const error = __arya_pythonFailure(code, 'Python: ' + response.error + (hints[code] ?? ''));
          if (typeof response.type === 'string') error.pythonType = response.type.slice(0, 128);
          if (typeof response.traceback === 'string') error.pythonTraceback = response.traceback.slice(-65536);
          if (request.mode === 'map' && Number.isSafeInteger(response.index) && response.index >= 0 && response.index < request.values.length) error.index = response.index;
          throw error;
        }
        if (request.mode === 'map' && (!Array.isArray(response.value) || response.value.length !== request.values.length)) throw __arya_pythonFailure('ARYA_PYTHON_PROTOCOL', 'Python map returned an invalid result list.');
        if (request.mode === 'info' && (!response.value || ['version', 'executable', 'prefix', 'basePrefix'].some(key => typeof response.value[key] !== 'string') || typeof response.value.virtualenv !== 'boolean')) throw __arya_pythonFailure('ARYA_PYTHON_PROTOCOL', 'Python environment information is invalid.');
        return response.value;
      };
      return await new Promise((resolve, reject) => {
        let child, failure, timer, killTimer, finished = false, started = false;
        let stdoutBytes = 0, stderrBytes = 0;
        const stdout = [], stderr = [];
        const complete = (error, result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer); clearTimeout(killTimer);
          config.signal?.removeEventListener('abort', abort);
          if (started) active--;
          else { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); }
          if (error) {
            if (error.stack && caller.stack) error.stack += '\nAsync Python caller:\n' + caller.stack.split('\n').slice(1).join('\n');
            reject(error);
          } else resolve(result);
          pump();
        };
        const stop = error => {
          if (finished || failure) return;
          failure = error;
          if (!child) { complete(error); return; }
          child.kill('SIGTERM');
          killTimer = setTimeout(() => {
            child.kill('SIGKILL');
            child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
          }, 250);
        };
        const abort = () => stop(__arya_pythonFailure('ARYA_PYTHON_CANCELLED', 'Python call was cancelled.'));
        const startError = error => __arya_pythonFailure(error.code === 'ENOENT' ? 'ARYA_PYTHON_NOT_FOUND' : 'ARYA_PYTHON_START', error.code === 'ENOENT' ? 'Cannot start the selected Python interpreter. Install Python, select a client interpreter, or set ARYA_PYTHON.' : 'Cannot start Python. Check the interpreter, source directory, and executable permissions.', error);
        const capture = (chunks, stream, chunk) => {
          if (failure) return;
          if (stream === 'stdout') stdoutBytes += chunk.length; else stderrBytes += chunk.length;
          if ((stream === 'stdout' ? stdoutBytes : stderrBytes) > config.maxOutputBytes) {
            const used = (stream === 'stdout' ? stdoutBytes : stderrBytes) - chunk.length;
            if (used < config.maxOutputBytes) chunks.push(chunk.subarray(0, config.maxOutputBytes - used));
            stop(__arya_pythonFailure('ARYA_PYTHON_OUTPUT_LIMIT', 'Python ' + stream + ' exceeded maxOutputBytes. Reduce logging or return less data.'));
          } else chunks.push(chunk);
        };
        const job = { start: () => {
          if (finished) return;
          started = true; active++;
          try {
            child = __arya_spawnPython(interpreter, ['-c', __arya_asyncPythonWorker], {
              cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
            });
          } catch (error) { complete(startError(error)); return; }
          child.on('error', error => { if (!failure) failure = startError(error); });
          child.stdout.on('data', chunk => capture(stdout, 'stdout', chunk));
          child.stderr.on('data', chunk => capture(stderr, 'stderr', chunk));
          child.stdout.on('error', error => stop(startError(error)));
          child.stderr.on('error', error => stop(startError(error)));
          child.stdin.on('error', error => { if (error.code !== 'EPIPE') stop(startError(error)); });
          child.on('close', (code, signal) => {
            if (finished) return;
            let error = failure, result;
            if (!error && code !== 0) error = __arya_pythonFailure('ARYA_PYTHON_EXIT', 'Python exited unsuccessfully (' + (code ?? signal) + '). Review Python stderr.');
            if (!error) {
              try { result = decode(__arya_pythonBuffer.concat(stdout).toString('utf8')); }
              catch (invalid) { error = invalid; }
            }
            const logs = __arya_pythonBuffer.concat(stderr);
            if (logs.length) process.stderr.write(error ? logs.subarray(0, 65536) : logs);
            complete(error, result);
          });
          child.stdin.end(input, 'utf8');
        } };
        timer = setTimeout(() => stop(__arya_pythonFailure('ARYA_PYTHON_TIMEOUT', 'Python call exceeded ' + config.timeoutMs + ' ms, including time waiting in the queue.')), config.timeoutMs);
        config.signal?.addEventListener('abort', abort, { once: true });
        if (config.signal?.aborted) { abort(); return; }
        queue.push(job);
        pump();
      });
    };
    const target = callable => {
      const metadata = typeof callable === 'function' ? callable[Symbol.for('arya.python.callable')] : undefined;
      if (!metadata || !Array.isArray(metadata.member) || !metadata.member.length) throw __arya_pythonFailure('ARYA_PYTHON_ARGUMENTS', 'Pass a public Python function from a use python import.', undefined, TypeError);
      return metadata;
    };
    const call = async (callable, args = [], options = {}) => {
      if (!Array.isArray(args)) throw __arya_pythonFailure('ARYA_PYTHON_ARGUMENTS', 'python.call expects a positional argument list.', undefined, TypeError);
      const metadata = target(callable);
      return await run({ mode: 'call', module: metadata.module, member: metadata.member, args }, options, metadata.source);
    };
    const map = async (callable, values, options = {}) => {
      if (!Array.isArray(values) || values.length > 10000) throw __arya_pythonFailure('ARYA_PYTHON_ARGUMENTS', 'python.map expects a list of at most 10000 values.', undefined, TypeError);
      const metadata = target(callable);
      return await run({ mode: 'map', module: metadata.module, member: metadata.member, values }, options, metadata.source);
    };
    const info = async (options = {}) => await run({ mode: 'info' }, options);
    const bind = (namespace, options = {}) => {
      const metadata = typeof namespace === 'function' ? namespace[Symbol.for('arya.python.callable')] : undefined;
      if (!metadata || !Array.isArray(metadata.member)) throw __arya_pythonFailure('ARYA_PYTHON_ARGUMENTS', 'python.bind expects a module or callable from use python.', undefined, TypeError);
      const boundOptions = __arya_pythonSettings(options, ['interpreter', 'timeoutMs', 'maxInputBytes', 'maxOutputBytes', 'kwargs', 'signal']);
      const wrap = callable => new Proxy(function () {}, {
        get(_target, key) {
          if (key === 'then' || key === 'toJSON' || typeof key !== 'string') return undefined;
          if (key === 'with') return (args, kwargs) => call(callable, args, { ...boundOptions, kwargs });
          return wrap(callable[key]);
        },
        apply(_target, _receiver, args) { return call(callable, args, boundOptions); }
      });
      return wrap(namespace);
    };
    const close = () => {
      if (!closing) { closed = true; closing = new Promise(resolve => { finishClose = resolve; }); drained(); }
      return closing;
    };
    return Object.freeze({ call, map, bind, info, close, stats: () => ({ active, queued: queue.length, closed }) });
  };
  return Object.freeze({ ...create(), client: create });
};`;
