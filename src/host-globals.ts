/** Guaranteed bare host names for Arya 0.2's Node execution profile.
 * These are fallback bindings, so user declarations may shadow them.
 * M3's resolver must use this list rather than inspecting the analysis host.
 * Keep docs/arya-specification.md's host-global table in sync.
 */
export const hostGlobals = Object.freeze([
  'undefined', 'NaN', 'Infinity', 'globalThis',
  'Object', 'Function', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol',
  'Math', 'JSON', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'WeakRef', 'FinalizationRegistry', 'Promise', 'Reflect', 'Proxy', 'Intl',
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError', 'AggregateError',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Atomics',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'console', 'process', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'fetch', 'Headers', 'Request', 'Response', 'FormData', 'Blob',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'performance', 'crypto',
] as const);
