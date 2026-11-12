import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { buildProject, writeProject } from '../src/project.js';
import type * as Api from '../src/accounting.js';
const require = createRequire(resolve('package.json'));
const api: typeof Api = require(resolve('dist/accounting.cjs'));
const info = api.backendInfo();
if (process.env.ARYA_TEST_ACCOUNTING_NATIVE === '1')
  assert.equal(info.nativeAvailable, true, info.nativeReason ?? 'Native backend required');
const backends: Api.Backend[] = info.nativeAvailable ? ['js', 'native'] : ['js'];
const options: Api.InvoiceOptions = { currency: 'AFN', scale: 2, rounding: 'half-even' };
const values = (result: Api.InvoiceResult) => ({
  gross: result.gross,
  discount: result.discount,
  net: result.net,
  tax: result.tax,
  total: result.total,
});

test('invoice policy is exact, explicit and identical across available backends', () => {
  for (const backend of backends) {
    const result = api.invoiceBatch(
      [{ price: '19.95', quantity: '2', discountBps: 1000, taxBps: 750 }],
      options,
      { backend },
    );
    assert.deepEqual(values(result), {
      gross: '39.90',
      discount: '3.99',
      net: '35.91',
      tax: '2.69',
      total: '38.60',
    });
    assert.equal(result.currency, 'AFN');
    assert.equal(result.backend, backend);
    assert.equal(result.lineCount, 1);
    assert.deepEqual(values(api.invoiceBatch([], options, { backend })), {
      gross: '0.00',
      discount: '0.00',
      net: '0.00',
      tax: '0.00',
      total: '0.00',
    });
    assert.equal(api.invoiceBatch([{ price: '-0.00' }], options, { backend }).total, '0.00');
  }
});

test('all nine rounding rules handle positive and negative ties at the selected money scale', () => {
  const names: Api.RoundingMode[] = [
    'up',
    'down',
    'ceil',
    'floor',
    'half-up',
    'half-down',
    'half-even',
    'half-ceil',
    'half-floor',
  ];
  const positive = ['0.03', '0.02', '0.03', '0.02', '0.03', '0.02', '0.02', '0.03', '0.02'];
  const negative = [
    '-0.03',
    '-0.02',
    '-0.02',
    '-0.03',
    '-0.03',
    '-0.02',
    '-0.02',
    '-0.02',
    '-0.03',
  ];
  for (const backend of backends)
    for (const [i, rounding] of names.entries()) {
      assert.equal(
        api.invoiceBatch(
          [{ price: '0.25', quantity: '0.1' }],
          { ...options, rounding },
          { backend },
        ).gross,
        positive[i],
      );
      assert.equal(
        api.invoiceBatch(
          [{ price: '-0.25', quantity: '0.1' }],
          { ...options, rounding },
          { backend },
        ).gross,
        negative[i],
      );
    }
});

test('signed line bounds are checked before storage and arithmetic while aggregates remain exact', () => {
  const maximum = '92233720368547758.07',
    minimum = '-92233720368547758.08';
  for (const backend of backends) {
    assert.equal(
      api.invoiceBatch([{ price: maximum }, { price: maximum }], options, { backend }).total,
      '184467440737095516.14',
    );
    assert.equal(api.invoiceBatch([{ price: minimum }], options, { backend }).total, minimum);
    for (const line of [
      { price: maximum, quantity: '2' },
      { price: minimum, quantity: '2' },
      { price: maximum, taxBps: 1 },
    ])
      assert.throws(() => api.invoiceBatch([line], options, { backend }), {
        code: 'ARYA_ACCOUNTING_RANGE',
        row: 0,
      });
    assert.throws(
      () => api.invoiceBatch([{ price: '92233720368547758.08' }], options, { backend }),
      { code: 'ARYA_ACCOUNTING_RANGE' },
    );
  }
});

test('input contracts reject implicit float conversion, ambiguous scales and invalid options', () => {
  const invalid: unknown[] = [
    { price: 0.1 },
    { price: '1e2' },
    { price: '01' },
    { price: 'NaN' },
    { price: '0.001' },
    { price: '1', quantity: null },
    { price: '1', quantity: '-1' },
    { price: '1', quantity: '0.0000001' },
    { price: '1', discountBps: 10001 },
    { price: '1', discountBps: 0.1 },
    { price: '1', taxBps: 1000001 },
    { price: '1', taxBps: null },
    { price: '1', typo: 1 },
    null,
  ];
  for (const line of invalid)
    assert.throws(() => api.prepareInvoices([line] as Api.InvoiceLine[], options));
  for (const invalidOptions of [
    {},
    { ...options, scale: 7 },
    { ...options, scale: 0.5 },
    { ...options, currency: 'afn' },
    { ...options, rounding: undefined },
    { ...options, rounding: 'bankers' },
    null,
  ])
    assert.throws(() =>
      api.prepareInvoices([] as Api.InvoiceLine[], invalidOptions as Api.InvoiceOptions),
    );
  assert.throws(() => api.prepareInvoices(new Array(1_000_001), options), {
    code: 'ARYA_ACCOUNTING_LIMIT',
  });
  const getter = {
    get price() {
      throw new Error('getter must not execute');
    },
  };
  assert.throws(
    () => api.prepareInvoices([getter as unknown as Api.InvoiceLine], options),
    /accessor/,
  );
  const batch = api.prepareInvoices([{ price: '1.2300', quantity: '1.0000000' }], options);
  assert.equal(batch.calculate().total, '1.23');
  for (const execution of [{ backend: 'other' }, { backend: null }, { typo: true }, null])
    assert.throws(() => batch.calculate(execution as Api.ExecutionOptions));
});

test('prepared batches snapshot inputs, reuse parsed values and return frozen result objects', () => {
  const lines = [{ price: '2.50', quantity: '2' }],
    config = { ...options };
  const batch = api.prepareInvoices(lines, config);
  lines[0]!.price = '999';
  lines.push({ price: '5', quantity: '1' });
  config.scale = 0;
  config.currency = 'USD';
  for (const backend of backends) {
    assert.equal(batch.calculate({ backend }).total, '5.00');
    assert.equal(batch.calculate({ backend }).currency, 'AFN');
  }
  assert.equal(batch.length, 1);
  assert.ok(Object.isFrozen(batch));
  assert.ok(Object.isFrozen(batch.calculate()));
});

test('ledger grouping preserves order, balances and large exact totals without prototype collisions', () => {
  const entries = [
    { account: 'cash', debit: '92233720368547758.07', credit: '0' },
    { account: 'sales', debit: '0', credit: '92233720368547758.07' },
    { account: 'cash', debit: '92233720368547758.07', credit: '0' },
    { account: '__proto__', debit: '0', credit: '92233720368547758.07' },
  ];
  for (const backend of backends) {
    const result = api.ledgerBatch(entries, { currency: 'AFN', scale: 2 }, { backend });
    assert.equal(result.balanced, true);
    assert.equal(result.debit, '184467440737095516.14');
    assert.deepEqual(
      result.accounts.map((account) => account.account),
      ['cash', 'sales', '__proto__'],
    );
    assert.equal(result.accounts[0]!.balance, result.debit);
    assert.ok(Object.isFrozen(result.accounts));
    assert.ok(Object.isFrozen(result.accounts[0]));
    assert.equal(
      api.ledgerBatch(
        [{ account: 'cash', debit: '1', credit: '0' }],
        { currency: 'AFN', scale: 2 },
        { backend },
      ).balanced,
      false,
    );
  }
  assert.throws(() =>
    api.prepareLedger([{ account: 'cash', debit: '-1', credit: '0' }], {
      currency: 'AFN',
      scale: 2,
    }),
  );
});

test('seeded invoice batches agree with an independent Python Decimal model', () => {
  let seed = 0x41525941;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const names: Api.RoundingMode[] = [
    'up',
    'down',
    'ceil',
    'floor',
    'half-up',
    'half-down',
    'half-even',
    'half-ceil',
    'half-floor',
  ];
  const cases = [];
  for (const scale of [0, 2, 3, 6])
    for (const rounding of names) {
      const lines = Array.from({ length: 80 }, () => {
        const fraction = scale ? '.' + String(next() % 10 ** scale).padStart(scale, '0') : '';
        return {
          price: (next() % 3 === 0 ? '-' : '') + String(next() % 1000000) + fraction,
          quantity: String(next() % 10) + '.' + String(next() % 1000000).padStart(6, '0'),
          discountBps: next() % 10001,
          taxBps: next() % 25001,
        };
      });
      cases.push({ lines, options: { currency: 'AFN', scale, rounding } });
    }
  for (const rounding of names) {
    const lines = Array.from({ length: 80 }, () => ({
      price: String(next() % 10000) + '.' + String(next() % 1000000).padStart(6, '0'),
      quantity: String(next() % 10) + '.' + String(next() % 1000000).padStart(6, '0'),
      discountRate: '0.' + String(next() % 1000000).padStart(6, '0'),
      taxRate: '0.' + String(next() % 500000).padStart(6, '0'),
    }));
    cases.push({ lines, options: { currency: 'AFN', scale: 2, priceScale: 6, rounding } });
  }
  const python = process.env.ARYA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const oracle = spawnSync(python, ['tests/fixtures/accounting-oracle.py'], {
    input: JSON.stringify(cases),
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(oracle.error);
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  for (const backend of backends)
    for (const [i, scenario] of cases.entries())
      assert.deepEqual(
        values(api.invoiceBatch(scenario.lines, scenario.options, { backend })),
        expected[i],
        `case ${i}, ${backend}`,
      );
});

test('async batches yield, cancel cooperatively, retain exact totals and bound outstanding jobs', async () => {
  const batch = api.prepareInvoices(
    Array.from({ length: 20000 }, () => ({ price: '1.25', quantity: '1.1', taxBps: 750 })),
    options,
  );
  for (const backend of backends) {
    let observed = false;
    setImmediate(() => {
      observed = true;
    });
    const result = await batch.calculateAsync({ backend });
    assert.equal(observed, true);
    assert.deepEqual(values(result), values(batch.calculate({ backend })));
    const controller = new AbortController();
    const pending = batch.calculateAsync({ backend, signal: controller.signal });
    setImmediate(() => controller.abort());
    await assert.rejects(pending, { code: 'ARYA_ACCOUNTING_ABORTED' });
  }
  const one = batch.calculateAsync({ backend: 'js' }),
    two = batch.calculateAsync({ backend: 'js' });
  await assert.rejects(batch.calculateAsync({ backend: 'js' }), { code: 'ARYA_ACCOUNTING_BUSY' });
  await Promise.all([one, two]);
  const ledger = api.prepareLedger(
    Array.from({ length: 10000 }, (_, i) => ({
      account: 'a' + (i % 17),
      debit: '1.25',
      credit: '1.25',
    })),
    { currency: 'AFN', scale: 2 },
  );
  for (const backend of backends) {
    const result = await ledger.calculateAsync({ backend });
    assert.deepEqual(result, ledger.calculate({ backend }));
  }
});

test(
  'native ABI rejects malformed, shared and detached buffers without unsafe reads',
  { skip: !info.nativeAvailable },
  () => {
    const native = require(
      resolve('dist/native', process.platform + '-' + process.arch + '-napi9/accounting.node'),
    );
    const p = new BigInt64Array([1n]),
      q = new BigInt64Array([1000000n]),
      r = new Uint32Array([0]);
    for (const args of [
      [],
      [p, q, r, r, 0, 6],
      [p, q, r, r, 1e6, 9],
      [[], q, r, r, 1e6, 6],
      [new BigInt64Array(2), q, r, r, 1e6, 6],
      [new BigInt64Array(new SharedArrayBuffer(8)), q, r, r, 1e6, 6],
    ])
      assert.throws(() => native.invoice(...args));
    const detached = new BigInt64Array(1);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    assert.throws(() => native.invoice(detached, q, r, r, 1e6, 6));
    assert.throws(() => native.ledger(p, p, new Uint32Array([1]), 1), {
      code: 'ARYA_ACCOUNTING_INPUT',
    });
    assert.throws(() => native.ledger(new BigInt64Array([-1n]), p, r, 1), {
      code: 'ARYA_ACCOUNTING_INPUT',
    });
  },
);

test(
  'native module can run in a worker environment without shared global state',
  { skip: !info.nativeAvailable },
  async (t) => {
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');const api=require(${JSON.stringify(resolve('dist/accounting.cjs'))});parentPort.postMessage(api.invoiceBatch([{price:'0.10'},{price:'0.20'}],{currency:'AFN',scale:2,rounding:'half-even'},{backend:'native'}));`,
      { eval: true },
    );
    t.after(() => worker.terminate());
    const result = await new Promise<Api.InvoiceResult>((ok, fail) => {
      worker.once('message', ok);
      worker.once('error', fail);
    });
    assert.equal(result.total, '0.30');
    assert.equal(result.backend, 'native');
  },
);

test('portable fallback can be forced and native requests fail explicitly when unavailable', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const a=require('./dist/accounting.cjs');const options={currency:'AFN',scale:2,rounding:'half-even'};if(a.backendInfo().nativeAvailable)process.exit(1);if(a.invoiceBatch([{price:'1'}],options).backend!=='js')process.exit(2);try{a.invoiceBatch([],options,{backend:'native'});process.exit(3)}catch(error){if(error.code!=='ARYA_ACCOUNTING_NATIVE')throw error}`,
    ],
    {
      env: { ...process.env, ARYA_ACCOUNTING_DISABLE_NATIVE: '1' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('Arya consumers import the accounting module through ordinary JavaScript interop', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'arya-accounting-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = `use js ${JSON.stringify(resolve('dist/accounting.cjs'))} as accounting\nconst result = accounting.invoiceBatch([{price: "0.10"}, {price: "0.20"}], {currency: "AFN", scale: 2, rounding: "half-even"})\nprint(result.total)`;
  const file = join(root, 'main.arya');
  await writeFile(file, source);
  const output = await writeProject(await buildProject(file));
  const result = spawnSync(process.execPath, [output], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '0.30\n');
});

test('fractional unit prices and exact fractional rates retain the same line rounding policy', () => {
  const lines = [{ price: '1.2345', quantity: '2', discountRate: '0.125', taxRate: '0.07125' }];
  for (const backend of backends) {
    const result = api.invoiceBatch(lines, { ...options, priceScale: 4 }, { backend });
    assert.deepEqual(values(result), {
      gross: '2.47',
      discount: '0.31',
      net: '2.16',
      tax: '0.15',
      total: '2.31',
    });
    assert.equal(result.priceScale, 4);
    assert.equal(result.policy, 'line-v1');
    assert.equal(result.rounding, 'half-even');
  }
  for (const row of [
    { price: '1', taxRate: '0.0000001' },
    { price: '1', discountRate: '1.01' },
    { price: '1', taxRate: '0.1', taxBps: 1000 },
  ])
    assert.throws(() => api.prepareInvoices([row], options));
});

test('automatic selection keeps small or account-dense work on the portable path', () => {
  assert.equal(api.invoiceBatch([{ price: '1' }], options).backend, 'js');
  const dense = api.prepareLedger(
    Array.from({ length: 256 }, (_, i) => ({ account: String(i), debit: '1', credit: '0' })),
    { currency: 'AFN', scale: 2 },
  );
  assert.equal(dense.calculate().backend, 'js');
  if (info.nativeAvailable)
    assert.equal(
      api.invoiceBatch(
        Array.from({ length: 256 }, () => ({ price: '1' })),
        options,
      ).backend,
      'native',
    );
});

test('async range failures preserve the original global row without returning partial totals', async () => {
  const lines = Array.from({ length: 6000 }, () => ({ price: '1', quantity: '1' }));
  lines[5000] = { price: '92233720368547758.07', quantity: '2' };
  const batch = api.prepareInvoices(lines, options);
  for (const backend of backends) {
    assert.throws(() => batch.calculate({ backend }), { code: 'ARYA_ACCOUNTING_RANGE', row: 5000 });
    await assert.rejects(batch.calculateAsync({ backend }), {
      code: 'ARYA_ACCOUNTING_RANGE',
      row: 5000,
    });
  }
});
