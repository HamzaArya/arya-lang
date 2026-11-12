import decimalSource from '../../node_modules/decimal.js/decimal.js' with { type: 'text' };

/** Embed the pinned mature engine: generated modules need no runtime npm install. */
export const decimalRuntime = `
const __arya_decimalEngine = (() => { const module = {exports: {}}; const exports = module.exports;
${decimalSource}
return module.exports;
})();
` + String.raw`
const __arya_decimal = (() => {
  const D = __arya_decimalEngine.clone({precision: 4096, rounding: 4, toExpNeg: -4096, toExpPos: 4096, minE: -4096, maxE: 4096});
  const fail = (code, message) => Object.assign(new RangeError(message), {code});
  const read = value => {
    if (typeof value !== 'string' || value.length > 1024 || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw fail('ARYA_DECIMAL_INPUT', 'Use a finite decimal string without grouping or exponent, at most 1024 characters.');
    return new D(value);
  };
  const serialize = value => {
    const text = value.toFixed();
    if (!value.isFinite() || text.length > 1024) throw fail('ARYA_DECIMAL_RANGE', 'Decimal result exceeds 1024 characters.');
    return text;
  };
  const modes = Object.freeze({'up': 0, 'down': 1, 'ceil': 2, 'floor': 3, 'half-up': 4, 'half-down': 5, 'half-even': 6, 'half-ceil': 7, 'half-floor': 8});
  const rounding = mode => {
    if (!Object.hasOwn(modes, mode)) throw fail('ARYA_DECIMAL_ROUNDING', 'Choose an explicit supported rounding mode.');
    return modes[mode];
  };
  const places = value => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100) throw fail('ARYA_DECIMAL_PLACES', 'Decimal places must be an integer from 0 to 100.');
    return value;
  };
  return Object.freeze({
    from: value => serialize(read(value)),
    add: (a,b) => serialize(read(a).plus(read(b))),
    subtract: (a,b) => serialize(read(a).minus(read(b))),
    multiply: (a,b) => serialize(read(a).times(read(b))),
    compare: (a,b) => read(a).comparedTo(read(b)),
    divide: (a,b,precision,mode) => {
      const left = read(a), right = read(b);
      places(precision); const round = rounding(mode);
      if (right.isZero()) throw fail('ARYA_DECIMAL_ZERO', 'Decimal division by zero.');
      return serialize(left.div(right).toDecimalPlaces(precision, round));
    },
    quantize: (value, precision, mode) => {
      const result = read(value).toFixed(places(precision), rounding(mode));
      if (result.length > 1024) throw fail('ARYA_DECIMAL_RANGE', 'Decimal result exceeds 1024 characters.');
      return result;
    },
    toNumber: value => {
      const decimal = read(value), result = decimal.toNumber();
      if (!Number.isFinite(result) || !new D(String(result)).equals(decimal) || decimal.abs().greaterThan('9007199254740991')) throw fail('ARYA_DECIMAL_PRECISION', 'Decimal cannot round trip through the JavaScript numeric interface.');
      return result;
    },
    roundingModes: Object.freeze(Object.keys(modes))
  });
})();`;
