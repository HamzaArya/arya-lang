/** Ordered streaming map, bounded read-ahead, cooperative cancellation and drain. */
export const asyncRuntime=String.raw`
const __arya_async = Object.freeze({
  map: async function* (values, callback, {concurrency = 4, signal} = {}) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64 || typeof callback !== 'function') throw Object.assign(new TypeError('async.map requires a callback and concurrency from 1 to 64.'), {code:'ARYA_ASYNC_OPTIONS'});
    signal?.throwIfAborted();
    const iterator = values[Symbol.asyncIterator]?.() ?? values[Symbol.iterator]?.();
    if (!iterator) throw new TypeError('async.map requires an iterable.');
    const pending = [];
    let index = 0, done = false;
    const fill = async () => {
      while (!done && pending.length < concurrency) {
        signal?.throwIfAborted();
        const next = await iterator.next();
        if (next.done) { done = true; break; }
        const position = index++;
        // Always observe rejections, including work drained after early return.
        pending.push(Promise.resolve().then(() => {signal?.throwIfAborted(); return callback(next.value, position, signal);}).then(value => ({ok:true, value}), error => ({ok:false, error})));
      }
    };
    try {
      await fill();
      while (pending.length) {
        const result = await pending.shift();
        signal?.throwIfAborted();
        if (!result.ok) throw result.error;
        yield result.value;
        await fill();
      }
    } finally {
      try { if (!done) await iterator.return?.(); }
      finally { await Promise.all(pending); }
    }
  },
  each: async (values, callback, options) => { for await (const _ of __arya_async.map(values, callback, options)) {} },
});`;
