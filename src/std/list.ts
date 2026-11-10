/** Input-first collection helpers for readable pipelines; no dependency loading. */
export const listRuntime = String.raw`
const __arya_listError = (code, message) => Object.assign(new TypeError(message), {code});
const __arya_listValues = values => {
  if (!Array.isArray(values)) throw __arya_listError('ARYA_LIST_INPUT', 'List helpers require a list.');
  return values;
};
const __arya_listSelector = selector => {
  if (typeof selector === 'function') return selector;
  if (typeof selector === 'string' && selector.length) return value => value == null ? undefined : value[selector];
  throw __arya_listError('ARYA_LIST_CALLBACK', 'Use a function or nonempty field name as the list selector.');
};
const __arya_listSync = value => {
  const then = value == null ? undefined : value.then;
  if (typeof then === 'function') {
    // Report the misuse without leaking an unhandled rejected callback promise.
    try { __arya_invoke(then, value, [() => {}, () => {}]); } catch {}
    throw __arya_listError('ARYA_LIST_ASYNC', 'This list operation requires a synchronous callback. Use list.map followed by an awaited Promise.all for async work.');
  }
  return value;
};
const __arya_listIdentity = value => value;
const __arya_list = Object.freeze({
  map: (values, selector) => {
    const select = __arya_listSelector(selector);
    return __arya_listValues(values).map((value, index) => select(value, index));
  },
  flatMap: (values, selector) => {
    const select = __arya_listSelector(selector);
    return __arya_listValues(values).flatMap((value, index) => {
      const result = __arya_listSync(select(value, index));
      if (!Array.isArray(result)) throw __arya_listError('ARYA_LIST_CALLBACK', 'list.flatMap callbacks must return a list.');
      return result;
    });
  },
  filter: (values, selector) => {
    const select = __arya_listSelector(selector);
    return __arya_listValues(values).filter((value, index) => __arya_listSync(select(value, index)));
  },
  find: (values, selector) => {
    const select = __arya_listSelector(selector);
    for (const [index, value] of __arya_listValues(values).entries()) if (__arya_listSync(select(value, index))) return value;
    return null;
  },
  reduce: function(values, reducer, initial) {
    __arya_listValues(values);
    if (typeof reducer !== 'function' || arguments.length < 3) throw __arya_listError('ARYA_LIST_CALLBACK', 'Use list.reduce(values, reducer, initial) with an explicit initial value.');
    return values.reduce((result, value, index) => __arya_listSync(reducer(result, value, index)), initial);
  },
  groupBy: (values, selector) => {
    const select = __arya_listSelector(selector), groups = Object.create(null);
    for (const [index, value] of __arya_listValues(values).entries()) {
      const key = __arya_listSync(select(value, index));
      if (typeof key !== 'string') throw __arya_listError('ARYA_LIST_KEY', 'list.groupBy selectors must return string keys.');
      (groups[key] ??= []).push(value);
    }
    return groups;
  },
  sortBy: (values, selector = __arya_listIdentity, order = 'asc') => {
    __arya_listValues(values);
    if (!['asc', 'desc'].includes(order)) throw __arya_listError('ARYA_LIST_ORDER', 'Use asc or desc as the sort order.');
    const select = __arya_listSelector(selector);
    let keyType;
    const rows = values.map((value, index) => {
      const key = __arya_listSync(select(value, index));
      const type = typeof key;
      if (!(type === 'string' || type === 'number' && Number.isFinite(key)) || keyType && keyType !== type) throw __arya_listError('ARYA_LIST_KEY', 'list.sortBy keys must all be strings or all finite numbers.');
      keyType = type;
      return {value, key, index};
    });
    rows.sort((left, right) => {
      const comparison = left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
      return comparison ? (order === 'asc' ? comparison : -comparison) : left.index - right.index;
    });
    return rows.map(row => row.value);
  },
  take: (values, count = 1) => {
    __arya_listValues(values);
    if (!Number.isSafeInteger(count) || count < 0) throw __arya_listError('ARYA_LIST_COUNT', 'list.take count must be a nonnegative safe integer.');
    return values.slice(0, count);
  },
  unique: (values, selector = __arya_listIdentity) => {
    const select = __arya_listSelector(selector), seen = new Set();
    return __arya_listValues(values).filter((value, index) => {
      const key = __arya_listSync(select(value, index));
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  },
  sum: (values, selector = __arya_listIdentity) => {
    const select = __arya_listSelector(selector);
    let total = 0;
    for (const [index, value] of __arya_listValues(values).entries()) {
      const number = __arya_listSync(select(value, index));
      if (typeof number !== 'number' || !Number.isFinite(number) || !Number.isFinite(total + number)) throw __arya_listError('ARYA_LIST_NUMBER', 'list.sum requires finite numbers and a finite total.');
      total += number;
    }
    return total;
  }
});`;
