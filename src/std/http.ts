/** HTTP helpers emitted into the JavaScript execution profile. */
export const httpRuntime = String.raw`
const __arya_responseTag = Symbol.for('arya.web.response');
const __arya_routeTag = Symbol.for('arya.web.route');
const __arya_serverTag = Symbol.for('arya.web.server');
const __arya_httpError = (status, message, code = 'ARYA_HTTP_ERROR') => {
  if (!Number.isInteger(status) || status < 400 || status > 599 || typeof message !== 'string' || !message || typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) throw new TypeError('web.error expects a 400–599 status, a message, and an optional uppercase error code.');
  return Object.assign(new Error(message), { aryaHttpStatus: status, code });
};
const __arya_httpTimeout = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new TypeError(label + ' must be an integer from 1 to 2147483647.');
  return value;
};
const __arya_httpShutdown = (server, options = {}) => {
  if (!server?.[__arya_serverTag]) return Promise.reject(new TypeError('web.shutdown expects a server returned by web.serve.'));
  if (!options || typeof options !== 'object' || Array.isArray(options)) return Promise.reject(new TypeError('Shutdown options must be an object.'));
  const state = server[__arya_serverTag];
  if (state.context.getStore()?.active) return Promise.reject(Object.assign(new Error('Call web.shutdown after the current request has finished, or from a process signal handler.'), { code: 'ARYA_SHUTDOWN_CONTEXT' }));
  if (state.shutdown) return state.shutdown;
  let timeout;
  try { timeout = __arya_httpTimeout(options.timeoutMs ?? 10000, 'Shutdown timeoutMs'); }
  catch (error) { return Promise.reject(error); }
  if (options.cleanup !== undefined && typeof options.cleanup !== 'function') return Promise.reject(new TypeError('Shutdown cleanup must be a function.'));
  state.stopping = true;
  // Node's HTTP idle-connection bookkeeping omits sockets that have never sent a request.
  for (const socket of state.pendingSockets ?? []) socket.destroy();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      state.timedOut = true;
      for (const controller of state.controllers) controller.abort();
      server.closeAllConnections();
      for (const socket of state.sockets ?? []) socket.destroy();
      reject(Object.assign(new Error('HTTP shutdown exceeded its deadline. Outstanding work must honor cancellation.'), { code: 'ARYA_SHUTDOWN_TIMEOUT' }));
    }, timeout);
  });
  const drain = (async () => {
    await new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
    while (state.active.size) await Promise.allSettled([...state.active]);
    if (!state.timedOut && options.cleanup) await options.cleanup();
  })();
  state.shutdown = Promise.race([drain, deadline]).finally(() => clearTimeout(timer));
  return state.shutdown;
};
const __arya_web = sourceDirectory => Object.freeze({
  error: __arya_httpError,
  shutdown: __arya_httpShutdown,
  route: (handler, schemas = {}) => {
    if (typeof handler !== 'function' || !schemas || typeof schemas !== 'object' || Array.isArray(schemas)) throw new TypeError('web.route expects a handler function and optional body/query/params schemas.');
    for (const [name, schema] of Object.entries(schemas)) {
      if (!['body', 'query', 'params'].includes(name)) throw new TypeError('Unknown route schema: ' + name);
      __arya_requireSchema(schema);
    }
    return Object.freeze({ [__arya_routeTag]: true, handler, schemas: Object.freeze({ ...schemas }) });
  },
  health: async (checks = {}, options = {}) => {
    if (!checks || typeof checks !== 'object' || Array.isArray(checks) || Object.values(checks).some(check => typeof check !== 'function')) throw new TypeError('web.health expects named check functions.');
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Health options must be an object.');
    const timeout = __arya_httpTimeout(options.timeoutMs ?? 1000, 'Health timeoutMs');
    const results = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
      const controller = new AbortController();
      let timer;
      const deadline = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve('timeout'); }, timeout); });
      try {
        const result = await Promise.race([Promise.resolve().then(() => check(controller.signal)).then(value => value === false ? 'failed' : 'ok', () => 'failed'), deadline]);
        return [name, result];
      } finally { clearTimeout(timer); }
    }));
    const ready = results.every(([, result]) => result === 'ok');
    return { [__arya_responseTag]: true, status: ready ? 200 : 503, body: { status: ready ? 'ready' : 'unready', checks: Object.fromEntries(results) }, headers: { 'cache-control': 'no-store' } };
  },
  response: (status, body, headers = {}) => {
    if (!Number.isInteger(status) || status < 200 || status > 599) throw new TypeError('web.response expects a status from 200 to 599.');
    return { [__arya_responseTag]: true, status, body, headers };
  },
  serve: (port, routes = {}, options = {}) => {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('web.serve expects an integer port from 0 to 65535.');
    if (!routes || typeof routes !== 'object' || Array.isArray(routes)) throw new TypeError('web.serve expects a route object.');
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('web.serve expects an options object.');
    if (options.host !== undefined && (typeof options.host !== 'string' || !options.host)) throw new TypeError('web host must be a nonempty string.');
    if (options.root !== undefined && (typeof options.root !== 'string' || !options.root)) throw new TypeError('web root must be a nonempty directory path.');
    const requestTimeout = __arya_httpTimeout(options.requestTimeoutMs ?? 30000, 'requestTimeoutMs');
    const handlerTimeout = __arya_httpTimeout(options.handlerTimeoutMs ?? 30000, 'handlerTimeoutMs');
    if (options.trustRequestId !== undefined && typeof options.trustRequestId !== 'boolean') throw new TypeError('trustRequestId must be a boolean.');
    if (options.before !== undefined && typeof options.before !== 'function') throw new TypeError('before must be a request function.');
    if (options.logger !== undefined && (!options.logger || ['info', 'error', 'child'].some(name => typeof options.logger[name] !== 'function'))) throw new TypeError('logger must provide info, error, and child methods.');
    const state = { stopping: false, timedOut: false, shutdown: undefined, active: new Set(), controllers: new Set(), sockets: new Set(), pendingSockets: new Set(), context: new __arya_AsyncLocalStorage() };
    const requestIds = new WeakMap();
    const patterns = [];
    const identities = new Set();
    for (const [key, value] of Object.entries(routes)) {
      const parts = /^(?:([A-Z]+) )?(\/[^?#]*)$/.exec(key);
      if (!parts) throw new TypeError('Route keys must be paths or METHOD /path: ' + key);
      const segments = parts[2].split('/');
      const names = new Set();
      for (const segment of segments) if (segment.startsWith(':')) {
        const name = segment.slice(1);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || names.has(name)) throw new TypeError('Route parameters must have unique names: ' + key);
        names.add(name);
      }
      if (names.size) {
        const identity = (parts[1] ?? '*') + ' ' + segments.map(segment => segment.startsWith(':') ? ':' : segment).join('/');
        if (identities.has(identity)) throw new TypeError('Ambiguous parameter route: ' + key);
        identities.add(identity);
        patterns.push({ method: parts[1], segments, value, score: segments.filter(segment => !segment.startsWith(':')).length });
      }
    }
    patterns.sort((left, right) => right.score - left.score || Number(Boolean(right.method)) - Number(Boolean(left.method)));
    const findRoute = (method, pathname) => {
      for (const candidate of method === 'HEAD' ? ['HEAD', 'GET'] : [method]) {
        const key = candidate + ' ' + pathname;
        if (own(routes, key)) return { value: routes[key], params: {} };
        if (own(routes, pathname)) return { value: routes[pathname], params: {} };
        const segments = pathname.split('/');
        for (const pattern of patterns) {
          if ((pattern.method && pattern.method !== candidate) || pattern.segments.length !== segments.length) continue;
          const params = {};
          let matches = true;
          for (let index = 0; index < segments.length; index++) {
            const expected = pattern.segments[index], actual = segments[index];
            if (expected.startsWith(':')) {
              if (!actual) { matches = false; break; }
              let decoded;
              try { decoded = decodeURIComponent(actual); } catch { throw problem(400, 'Invalid URL encoding'); }
              if (/[\\/\0]/.test(decoded)) throw problem(400, 'Invalid route parameter');
              Object.defineProperty(params, expected.slice(1), { value: decoded, enumerable: true });
            } else if (expected !== actual) { matches = false; break; }
          }
          if (matches) return { value: pattern.value, params };
        }
      }
      return undefined;
    };
    const html = options.html ?? 'index.html';
    const assets = options.assets ?? 'public';
    if (html !== false && (typeof html !== 'string' || !/\.html?$/i.test(html))) throw new TypeError('html must name an .html/.htm file, or be false for an API-only or inline application.');
    if (assets !== false && (typeof assets !== 'string' || !assets)) throw new TypeError('assets must name a directory, or be false.');
    const inside = (root, file) => {
      const relative = __arya_path.relative(root, file);
      return relative === '' || (!relative.startsWith('..' + __arya_path.sep) && relative !== '..' && !__arya_path.isAbsolute(relative));
    };
    const sourceRoot = __arya_path.resolve(sourceDirectory ?? process.cwd());
    const requestedRoot = __arya_path.resolve(sourceRoot, options.root ?? '.');
    let root;
    try { root = __arya_fsSync.realpathSync(requestedRoot); if (!__arya_fsSync.statSync(root).isDirectory()) throw new Error('not a directory'); }
    catch { throw new Error('Web root is not an accessible directory: ' + requestedRoot); }
    const contained = (name, label) => {
      if (__arya_path.isAbsolute(name)) throw new TypeError(label + ' must be relative to the web root.');
      const file = __arya_path.resolve(root, name);
      if (!inside(root, file)) throw new TypeError(label + ' must stay inside the web root.');
      return file;
    };
    const indexPath = html === false ? undefined : contained(html, 'HTML entry');
    if (indexPath) {
      try {
        const actual = __arya_fsSync.realpathSync(indexPath);
        if (!inside(root, actual) || !__arya_fsSync.statSync(actual).isFile()) throw new Error('not a contained file');
      } catch {
        throw new Error('Arya web requires an HTML entry file: ' + indexPath + '. Create it or start a project with arya init --web. Use {html: false} explicitly for API-only or inline applications.');
      }
    }
    const assetPath = assets === false ? undefined : contained(assets, 'Assets directory');
    if (assetPath) {
      try {
        const actual = __arya_fsSync.realpathSync(assetPath);
        if (!inside(root, actual) || !__arya_fsSync.statSync(actual).isDirectory()) throw new TypeError('Assets directory must be a directory inside the web root.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const limit = options.maxBodyBytes ?? 1024 * 1024;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16 * 1024 * 1024) throw new TypeError('maxBodyBytes must be between 1 and 16777216.');
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const problem = (status, message) => Object.assign(new Error(message), { aryaHttpStatus: status });
    const tagged = (status, body, headers = {}) => ({ [__arya_responseTag]: true, status, body, headers });
    const send = (response, value, method = 'GET') => {
      let status = 200, headers = {};
      if (value && value[__arya_responseTag] === true) { status = value.status; headers = value.headers; value = value.body; }
      let body, type;
      if (value === undefined) { body = ''; if (status === 200) status = 204; }
      else if (Buffer.isBuffer(value)) { body = value; type = 'application/octet-stream'; }
      else if (typeof value === 'string') { body = value; type = 'text/html; charset=utf-8'; }
      else { body = JSON.stringify(value); type = 'application/json; charset=utf-8'; }
      response.statusCode = status;
      if (type) response.setHeader('content-type', type);
      response.setHeader('x-content-type-options', 'nosniff');
      for (const [name, content] of Object.entries(headers)) response.setHeader(name, content);
      response.setHeader('x-request-id', requestIds.get(response));
      if (state.stopping) { response.shouldKeepAlive = false; response.setHeader('connection', 'close'); }
      const hasBody = status !== 204 && status !== 304;
      if (hasBody && body !== undefined) response.setHeader('content-length', Buffer.byteLength(body));
      else response.removeHeader('content-length');
      response.end(method === 'HEAD' || !hasBody ? undefined : body);
    };
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
      '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'
    };
    const sendFile = async (response, method, file, boundary) => {
      try {
        const actual = await __arya_fs.realpath(file);
        if (!inside(boundary, actual)) return false;
        if (__arya_path.relative(boundary, actual).split(__arya_path.sep).some(part => part.startsWith('.'))) return false;
        const stat = await __arya_fs.stat(actual);
        if (!stat.isFile()) return false;
        const type = mimeTypes[__arya_path.extname(actual).toLowerCase()] ?? 'application/octet-stream';
        const bytes = await __arya_fs.readFile(actual);
        send(response, tagged(200, bytes, {'content-type': type}), method);
        return true;
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES', 'ELOOP'].includes(error.code)) return false;
        throw error;
      }
    };
    const staticFile = async (response, method, rawPath) => {
      let pathname;
      try { pathname = decodeURIComponent(rawPath); } catch { throw problem(400, 'Invalid URL encoding'); }
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) throw problem(400, 'Invalid asset path');
      if (pathname === '/' && indexPath) return sendFile(response, method, indexPath, root);
      if (!assetPath) return false;
      try {
        const actualRoot = await __arya_fs.realpath(assetPath);
        if (!inside(root, actualRoot)) return false;
        const file = __arya_path.resolve(actualRoot, '.' + pathname);
        if (!inside(actualRoot, file)) return false;
        return sendFile(response, method, file, actualRoot);
      } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; }
    };
    const track = operation => {
      state.active.add(operation);
      operation.then(() => state.active.delete(operation), () => state.active.delete(operation));
      return operation;
    };
    const emit = (level, message, fields) => {
      try { options.logger?.[level](message, fields); } catch { /* Logging failures cannot change an HTTP response. */ }
    };
    const handle = async (request, response) => {
      const context = state.context.getStore();
      const suppliedId = request.headers['x-request-id'];
      const requestId = options.trustRequestId && typeof suppliedId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId) ? suppliedId : __arya_randomUUID();
      requestIds.set(response, requestId);
      response.setHeader('x-request-id', requestId);
      const controller = new AbortController();
      state.controllers.add(controller);
      const started = Date.now();
      let path, background, timer;
      const disconnected = () => { if (!response.writableFinished) controller.abort(); };
      request.once('aborted', disconnected);
      response.once('close', disconnected);
      response.once('finish', () => emit('info', 'http.request', { requestId, method: request.method, path, status: response.statusCode, durationMs: Math.max(0, Date.now() - started) }));
      try {
        if (state.stopping) { request.resume(); throw __arya_httpError(503, 'Server is shutting down.', 'ARYA_HTTP_UNAVAILABLE'); }
        let url;
        try { url = new URL(request.url, 'http://localhost'); }
        catch { throw problem(400, 'Invalid request URL'); }
        path = url.pathname;
        const method = request.method ?? 'GET';
        const route = findRoute(method, url.pathname);
        if (route === undefined) {
          request.resume();
          const rawPath = request.url.split(/[?#]/)[0];
          if ((method === 'GET' || method === 'HEAD') && await staticFile(response, method, rawPath)) return;
          send(response, tagged(404, { error: 'Not found' }), method); return;
        }
        if (Number(request.headers['content-length']) > limit) { request.resume(); throw problem(413, 'Request body too large'); }
        const text = await new Promise((resolve, reject) => {
          let bytes = 0, chunks = [], failed = false;
          request.on('data', chunk => {
            if (failed) return;
            bytes += chunk.length;
            if (bytes > limit) { failed = true; chunks = []; reject(problem(413, 'Request body too large')); }
            else chunks.push(chunk);
          });
          request.on('end', () => { if (!failed) resolve(__arya_mysqlBuffer.concat(chunks).toString('utf8')); });
          request.on('error', reject);
          request.on('aborted', () => reject(problem(400, 'Request aborted')));
        });
        let body = text;
        if ((request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json' && text !== '') {
          try { body = JSON.parse(text); } catch { throw problem(400, 'Invalid JSON body'); }
        }
        const input = { method, path: url.pathname, params: route.params, query: Object.fromEntries(url.searchParams), headers: { ...request.headers }, body, requestId, signal: controller.signal, log: options.logger?.child({ requestId }) };
        background = track(Promise.resolve().then(async () => {
          if (options.before) {
            const result = await options.before(input);
            if (result !== undefined) return result;
          }
          const value = route.value;
          if (value?.[__arya_routeTag]) {
            const issues = [];
            for (const [name, schema] of Object.entries(value.schemas)) {
              const result = __arya_validate.check(schema, input[name]);
              if (!result.ok) issues.push(...result.issues.map(issue => ({ ...issue, path: [name, ...issue.path] })));
              else input[name] = result.value;
            }
            if (issues.length) throw Object.assign(__arya_httpError(400, 'Input validation failed.', 'ARYA_VALIDATION'), { issues: issues.slice(0, 32) });
            return value.handler(input);
          }
          return typeof value === 'function' ? value(input) : value;
        }));
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(__arya_httpError(504, 'Request handler exceeded its deadline.', 'ARYA_HTTP_TIMEOUT'));
          }, handlerTimeout);
        });
        send(response, await Promise.race([background, deadline]), method);
      } catch (error) {
        request.resume();
        if (response.headersSent || response.destroyed) { response.destroy(); return; }
        const candidate = error?.aryaHttpStatus;
        const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
        if (status >= 500) {
          if (options.logger) emit('error', 'http.error', { requestId, method: request.method, path, code: typeof error?.code === 'string' ? error.code : 'ARYA_HTTP_INTERNAL' });
          else if (status === 500) console.error(error);
        }
        const body = { error: status >= 500 ? 'Internal server error' : error?.message ?? 'Request failed' };
        if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) body.code = error.code;
        if (error?.code === 'ARYA_VALIDATION' && Array.isArray(error.issues)) body.issues = error.issues;
        send(response, tagged(status, body), request.method);
      } finally {
        clearTimeout(timer);
        request.off('aborted', disconnected);
        response.off('close', disconnected);
        const finished = () => { state.controllers.delete(controller); context.active = false; };
        if (background) background.then(finished, finished);
        else finished();
      }
    };
    const server = __arya_createServer((request, response) => {
      state.pendingSockets.delete(request.socket);
      track(state.context.run({ active: true }, () => handle(request, response))).catch(() => { response.destroy(); });
    });
    server.on('connection', socket => {
      state.sockets.add(socket); state.pendingSockets.add(socket);
      socket.once('close', () => { state.sockets.delete(socket); state.pendingSockets.delete(socket); });
      if (state.stopping) socket.destroy();
    });
    Object.defineProperty(server, __arya_serverTag, { value: state });
    server.requestTimeout = requestTimeout;
    server.headersTimeout = Math.min(requestTimeout, 30000);
    server.listen(port, options.host ?? '127.0.0.1');
    return server;
  }
});
`;
