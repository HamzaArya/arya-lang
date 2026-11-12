import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { invoices, ledger } from './accounting-data.mjs';
const [kind, variant, countText, groupsText, roundsText] = process.argv.slice(2),
  count = Number(countText),
  groups = Number(groupsText),
  rounds = Number(roundsText);
const require = createRequire(import.meta.url),
  options = { currency: 'AFN', scale: 2, rounding: 'half-even' },
  keys = ['gross', 'discount', 'net', 'tax', 'total'];
const normalize = (value) => {
  const { backend, ...result } = value;
  return result;
};
const format = (units) => {
  const negative = units < 0n,
    digits = (negative ? -units : units).toString().padStart(3, '0');
  return (negative ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2);
};
const iterations = count === 1 ? 500 : count <= 256 ? 10 : 1;
function sample(action) {
  action();
  action();
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    global.gc?.();
    const started = performance.now();
    for (let j = 0; j < iterations; j++) action();
    samples.push((performance.now() - started) / iterations);
  }
  return {
    medianMs: [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)],
    samplesMs: samples,
  };
}
let prepare, calculate, endToEnd;
const lines = kind === 'invoice' ? invoices(count) : ledger(count, groups);
const imported = performance.now();
if (variant === 'js' || variant === 'native') {
  const api = require(resolve('dist/accounting.cjs'));
  const execution = { backend: variant };
  prepare = () =>
    kind === 'invoice'
      ? api.prepareInvoices(lines, options)
      : api.prepareLedger(lines, { currency: 'AFN', scale: 2 });
  calculate = (plan) => normalize(plan.calculate(execution));
  endToEnd = () => calculate(prepare());
} else if (variant === 'decimal-wrapper') {
  const { d } = await import(
    pathToFileURL(resolve('.build/accounting-benchmark/decimal.mjs')).href
  );
  prepare = () =>
    lines.map((line) => ({
      p: BigInt(line.price.replace('.', '')).toString(),
      q: BigInt(line.quantity.replace('.', '')).toString(),
      d: String(line.discountBps),
      t: String(line.taxBps),
    }));
  calculate = (rows) => {
    const sums = ['0', '0', '0', '0', '0'];
    for (const row of rows) {
      const gross = d.divide(d.multiply(row.p, row.q), '1000000', 0, 'half-even');
      const discount = d.divide(d.multiply(gross, row.d), '10000', 0, 'half-even');
      const net = d.subtract(gross, discount);
      const tax = d.divide(d.multiply(net, row.t), '10000', 0, 'half-even');
      const total = d.add(net, tax);
      for (const [i, value] of [gross, discount, net, tax, total].entries())
        sums[i] = d.add(sums[i], value);
    }
    return {
      currency: 'AFN',
      scale: 2,
      lineCount: count,
      rounding: 'half-even',
      priceScale: 2,
      quantityScale: 6,
      policy: 'line-v1',
      ...Object.fromEntries(keys.map((key, i) => [key, format(BigInt(sums[i]))])),
    };
  };
} else {
  const Decimal = require('decimal.js'),
    D = Decimal.clone({ precision: 4096, rounding: 6, toExpNeg: -4096, toExpPos: 4096 });
  prepare = () =>
    lines.map((line) => ({
      p: new D(line.price.replace('.', '')),
      q: new D(line.quantity.replace('.', '')),
      d: line.discountBps,
      t: line.taxBps,
    }));
  calculate = (rows) => {
    const sums = keys.map(() => new D(0));
    for (const row of rows) {
      const gross = row.p.times(row.q).div(1000000).toDecimalPlaces(0, 6);
      const discount = gross.times(row.d).div(10000).toDecimalPlaces(0, 6);
      const net = gross.minus(discount);
      const tax = net.times(row.t).div(10000).toDecimalPlaces(0, 6);
      const total = net.plus(tax);
      for (const [i, value] of [gross, discount, net, tax, total].entries())
        sums[i] = sums[i].plus(value);
    }
    return {
      currency: 'AFN',
      scale: 2,
      lineCount: count,
      rounding: 'half-even',
      priceScale: 2,
      quantityScale: 6,
      policy: 'line-v1',
      ...Object.fromEntries(keys.map((key, i) => [key, format(BigInt(sums[i].toFixed(0)))])),
    };
  };
}
const importMs = performance.now() - imported;
const prepStarted = performance.now(),
  prepared = prepare(),
  initialPreparationMs = performance.now() - prepStarted;
const first = performance.now(),
  result = calculate(prepared),
  firstExecutionMs = performance.now() - first;
const memory = () => ({
  rssBytes: process.memoryUsage().rss,
  maxRssKiB: process.resourceUsage().maxRSS,
});
if (process.env.ARYA_BENCH_COLD === '1') {
  console.log(
    JSON.stringify({
      kind,
      variant,
      count,
      importMs,
      initialPreparationMs,
      firstExecutionMs,
      ...memory(),
    }),
  );
} else {
  const preparedTiming = sample(() => calculate(prepared)),
    preparation = sample(prepare),
    end = endToEnd ? sample(endToEnd) : undefined;
  const hash = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  console.log(
    JSON.stringify({
      kind,
      variant,
      count,
      groups,
      importMs,
      initialPreparationMs,
      firstExecutionMs,
      prepared: preparedTiming,
      preparation,
      ...(end ? { endToEnd: end } : {}),
      checksum: hash,
      ...memory(),
    }),
  );
}
