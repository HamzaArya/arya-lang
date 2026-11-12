/** Arya's test vocabulary uses Node's runner, assertions, and mock implementation. */
export const testingRuntime = String.raw`
const __arya_testingOptions = (options = {}) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Testing options must be an object.');
  for (const key of Object.keys(options)) if (!['timeoutMs', 'skip', 'todo', 'concurrency'].includes(key)) throw new TypeError('Unknown testing option: ' + key);
  const result = {};
  if (options.timeoutMs !== undefined) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2147483647) throw new TypeError('timeoutMs must be an integer from 1 to 2147483647.');
    result.timeout = options.timeoutMs;
  }
  for (const key of ['skip', 'todo']) if (options[key] !== undefined) {
    if (typeof options[key] !== 'boolean' && typeof options[key] !== 'string') throw new TypeError(key + ' must be a boolean or reason string.');
    result[key] = options[key];
  }
  if (options.concurrency !== undefined) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) throw new TypeError('concurrency must be a positive safe integer.');
    result.concurrency = options.concurrency;
  }
  return result;
};
const __arya_testingName = name => {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Test names must be nonempty text.');
  return name;
};
const __arya_testingCallback = callback => {
  if (typeof callback !== 'function') throw new TypeError('Test bodies and hooks must be functions.');
  return callback;
};
// Always pass exactly one context parameter: Arya callbacks use promises rather
// than Node's second, legacy done callback (which depends on function.length).
const __arya_testingBody = callback => {
  __arya_testingCallback(callback);
  return context => callback(context);
};
const __arya_testingRegister = (runner, name, callback, options) => runner(__arya_testingName(name), __arya_testingOptions(options), __arya_testingBody(callback));
const __arya_testingExpected = expected => {
  if (typeof expected === 'string') throw new TypeError('Use an error matcher such as {code: "CODE"} or {message: "message"}, rather than a string.');
  return expected;
};
// Newer Node assertions distinguish an omitted message from explicit undefined.
// Preserve required values (including undefined); trim only optional arguments.
const __arya_testingAssertion = (assertion, values, required) => {
  while (values.length > required && values[values.length - 1] === undefined) values.pop();
  return assertion(...values);
};
const __arya_testing = Object.freeze({
  test: (name, callback, options) => __arya_testingRegister(__arya_nodeTest.test, name, callback, options),
  suite: (name, callback, options) => __arya_testingRegister(__arya_nodeTest.suite, name, callback, options),
  skip: (name, reason = true) => {
    const options = __arya_testingOptions({skip: reason});
    return __arya_nodeTest.test(__arya_testingName(name), {...options, skip: reason || true}, () => {});
  },
  todo: (name, reason = true) => {
    const options = __arya_testingOptions({todo: reason});
    return __arya_nodeTest.test(__arya_testingName(name), {...options, todo: reason || true}, () => {});
  },
  before: callback => __arya_nodeTest.before(__arya_testingBody(callback)),
  after: callback => __arya_nodeTest.after(__arya_testingBody(callback)),
  beforeEach: callback => __arya_nodeTest.beforeEach(__arya_testingBody(callback)),
  afterEach: callback => __arya_nodeTest.afterEach(__arya_testingBody(callback)),
  assert: (condition, message) => __arya_testingAssertion(__arya_nodeAssert.ok, [condition, message], 1),
  equal: (actual, expected, message) => __arya_testingAssertion(__arya_nodeAssert.strictEqual, [actual, expected, message], 2),
  notEqual: (actual, expected, message) => __arya_testingAssertion(__arya_nodeAssert.notStrictEqual, [actual, expected, message], 2),
  deepEqual: (actual, expected, message) => __arya_testingAssertion(__arya_nodeAssert.deepStrictEqual, [actual, expected, message], 2),
  notDeepEqual: (actual, expected, message) => __arya_testingAssertion(__arya_nodeAssert.notDeepStrictEqual, [actual, expected, message], 2),
  throws: (callback, expected, message) => __arya_testingAssertion(__arya_nodeAssert.throws, [__arya_testingCallback(callback), __arya_testingExpected(expected), message], 1),
  rejects: (callback, expected, message) => __arya_testingAssertion(__arya_nodeAssert.rejects, [__arya_testingCallback(callback), __arya_testingExpected(expected), message], 1),
  fail: message => __arya_testingAssertion(__arya_nodeAssert.fail, [message], 0),
  mock: (implementation = () => undefined) => __arya_nodeTest.mock.fn(__arya_testingCallback(implementation)),
});`;
