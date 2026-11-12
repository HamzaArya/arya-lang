import { createRequire } from 'node:module';
import { join } from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import {
  MAX_ROWS,
  MAX_ACCOUNTS,
  ROUNDING,
  failure,
  inRange,
  parseUnits,
  formatUnits,
  emptyInvoice,
  invoiceKernel,
  ledgerKernel,
} from './accounting-core.js';
import type {
  Backend,
  RoundingMode,
  InvoiceColumns,
  InvoiceTotals,
  LedgerColumns,
  LedgerTotals,
} from './accounting-core.js';
export type { Backend, RoundingMode } from './accounting-core.js';

export interface MoneyOptions {
  currency: string;
  scale: number;
}
export interface InvoiceOptions extends MoneyOptions {
  rounding: RoundingMode;
  priceScale?: number;
}
export interface InvoiceLine {
  price: string;
  quantity?: string;
  discountBps?: number;
  taxBps?: number;
  discountRate?: string;
  taxRate?: string;
}
export interface LedgerEntry {
  account: string;
  debit: string;
  credit: string;
}
export interface ExecutionOptions {
  backend?: Backend;
}
export interface AsyncExecutionOptions extends ExecutionOptions {
  signal?: AbortSignal;
}
export interface InvoiceResult extends Readonly<MoneyOptions> {
  readonly backend: 'js' | 'native';
  readonly lineCount: number;
  readonly rounding: RoundingMode;
  readonly priceScale: number;
  readonly quantityScale: 6;
  readonly policy: 'line-v1';
  readonly gross: string;
  readonly discount: string;
  readonly net: string;
  readonly tax: string;
  readonly total: string;
}
export interface AccountBalance {
  readonly account: string;
  readonly debit: string;
  readonly credit: string;
  readonly balance: string;
}
export interface LedgerResult extends Readonly<MoneyOptions> {
  readonly backend: 'js' | 'native';
  readonly entryCount: number;
  readonly debit: string;
  readonly credit: string;
  readonly difference: string;
  readonly balanced: boolean;
  readonly accounts: readonly AccountBalance[];
}
export interface InvoiceBatch extends Readonly<MoneyOptions> {
  readonly length: number;
  calculate(options?: ExecutionOptions): InvoiceResult;
  calculateAsync(options?: AsyncExecutionOptions): Promise<InvoiceResult>;
}
export interface LedgerBatch extends Readonly<MoneyOptions> {
  readonly length: number;
  calculate(options?: ExecutionOptions): LedgerResult;
  calculateAsync(options?: AsyncExecutionOptions): Promise<LedgerResult>;
}
interface NativeEngine {
  abi: number;
  invoice(
    prices: BigInt64Array,
    quantities: BigInt64Array,
    discounts: Uint32Array,
    taxes: Uint32Array,
    divisor: number,
    rounding: number,
  ): InvoiceTotals;
  ledger(
    debits: BigInt64Array,
    credits: BigInt64Array,
    accounts: Uint32Array,
    accountCount: number,
  ): LedgerTotals;
}
const nativeThreshold = 256;
let native: NativeEngine | undefined,
  attempted = false,
  nativeFailure = 'Native kernel has not been loaded.';
let activeAsync = 0;
function loadNative(): NativeEngine | undefined {
  if (process.env.ARYA_ACCOUNTING_DISABLE_NATIVE === '1') {
    nativeFailure = 'Native loading disabled by ARYA_ACCOUNTING_DISABLE_NATIVE.';
    return undefined;
  }
  if (attempted) return native;
  attempted = true;
  try {
    const require = createRequire(join(__dirname, 'accounting.cjs'));
    const value = require(
      join(
        __dirname,
        'native',
        process.platform + '-' + process.arch + '-napi9',
        'accounting.node',
      ),
    ) as NativeEngine;
    if (
      value.abi !== 1 ||
      typeof value.invoice !== 'function' ||
      typeof value.ledger !== 'function'
    )
      throw new Error('Incompatible accounting kernel ABI.');
    native = Object.freeze(value);
  } catch (error) {
    nativeFailure = error instanceof Error ? error.message : 'Native kernel unavailable.';
  }
  return native;
}
export interface BackendInformation {
  readonly nativeAvailable: boolean;
  readonly nativeReason: string | null;
  readonly nativeAbi: number;
  readonly nodeApi: number;
  readonly platform: string;
  readonly architecture: string;
  readonly autoNativeThreshold: number;
  readonly maxRows: number;
  readonly maxAccounts: number;
  readonly maxAsyncJobs: number;
  readonly autoNativeLedgerRowsPerAccount: number;
}
/** Loading remains lazy: small auto batches use JS without opening a native binary. */
export function backendInfo(): BackendInformation {
  const available = !!loadNative();
  return Object.freeze({
    nativeAvailable: available,
    nativeReason: available ? null : nativeFailure,
    nativeAbi: 1,
    nodeApi: 9,
    platform: process.platform,
    architecture: process.arch,
    autoNativeThreshold: nativeThreshold,
    maxRows: MAX_ROWS,
    maxAccounts: MAX_ACCOUNTS,
    maxAsyncJobs: 2,
    autoNativeLedgerRowsPerAccount: 16,
  });
}
function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw failure('ARYA_ACCOUNTING_INPUT', label + ' must be a plain object.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors))
    if (!keys.includes(key) || !('value' in descriptor))
      throw failure('ARYA_ACCOUNTING_INPUT', 'Unknown or accessor ' + label + ' field: ' + key);
  return value as Record<string, unknown>;
}
function context(
  options: unknown,
  invoice: boolean,
): MoneyOptions & { mode: number; priceScale: number; divisor: number } {
  const value = object(
    options,
    invoice ? ['currency', 'scale', 'rounding', 'priceScale'] : ['currency', 'scale'],
    'options',
  );
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))
    throw failure('ARYA_ACCOUNTING_CURRENCY', 'Specify a three-letter uppercase currency tag.');
  if (!Number.isSafeInteger(value.scale) || Number(value.scale) < 0 || Number(value.scale) > 6)
    throw failure('ARYA_ACCOUNTING_SCALE', 'Specify a scale from 0 to 6.');
  const mode = invoice ? ROUNDING.indexOf(value.rounding as RoundingMode) : 0;
  if (mode < 0)
    throw failure('ARYA_ACCOUNTING_ROUNDING', 'Specify a supported rounding mode explicitly.');
  const priceScale = invoice && value.priceScale !== undefined ? value.priceScale : value.scale;
  if (
    !Number.isSafeInteger(priceScale) ||
    Number(priceScale) < Number(value.scale) ||
    Number(priceScale) > 6
  )
    throw failure('ARYA_ACCOUNTING_SCALE', 'priceScale must be between the money scale and 6.');
  return {
    currency: value.currency,
    scale: value.scale as number,
    mode,
    priceScale: priceScale as number,
    divisor: 10 ** (6 + Number(priceScale) - Number(value.scale)),
  };
}
function length(rows: unknown): asserts rows is unknown[] {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    throw failure('ARYA_ACCOUNTING_LIMIT', 'Provide an array with at most ' + MAX_ROWS + ' rows.');
}
function rate(value: unknown, max: number, row: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max)
    throw failure(
      'ARYA_ACCOUNTING_RATE',
      'Rates must be integer basis points in the supported range.',
      row,
    );
  return value as number;
}
function inputRate(row: Record<string, unknown>, kind: 'discount' | 'tax', index: number): number {
  const bps = row[kind + 'Bps'],
    fraction = row[kind + 'Rate'];
  if (bps !== undefined && fraction !== undefined)
    throw failure(
      'ARYA_ACCOUNTING_RATE',
      'Specify either basis points or an exact fractional rate, not both.',
      index,
    );
  if (fraction === undefined)
    return rate(bps === undefined ? 0 : bps, kind === 'discount' ? 10000 : 1000000, index) * 100;
  const units = parseUnits(fraction, 6, index, kind + 'Rate', true),
    maximum = kind === 'discount' ? 1000000n : 100000000n;
  if (units > maximum)
    throw failure('ARYA_ACCOUNTING_RATE', 'Fractional rate exceeds the supported range.', index);
  return Number(units);
}
function selection(
  options: unknown,
  rows: number,
  async = false,
  eligible = true,
): { backend: 'js' | 'native'; engine?: NativeEngine; signal?: AbortSignal } {
  const value = object(
    options === undefined ? {} : options,
    async ? ['backend', 'signal'] : ['backend'],
    'execution',
  );
  const requested = value.backend === undefined ? 'auto' : value.backend;
  if (!['auto', 'js', 'native'].includes(requested as string))
    throw failure('ARYA_ACCOUNTING_BACKEND', 'Choose auto, js or native.');
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal))
    throw failure('ARYA_ACCOUNTING_INPUT', 'signal must be an AbortSignal.');
  const engine =
    requested === 'js' || (requested === 'auto' && (rows < nativeThreshold || !eligible))
      ? undefined
      : loadNative();
  if (requested === 'native' && !engine)
    throw failure('ARYA_ACCOUNTING_NATIVE', 'Native kernel unavailable: ' + nativeFailure);
  return {
    ...(engine ? { backend: 'native' as const, engine } : { backend: 'js' as const }),
    ...(value.signal ? { signal: value.signal as AbortSignal } : {}),
  };
}
function invoiceRun(
  columns: InvoiceColumns,
  mode: number,
  divisor: number,
  engine?: NativeEngine,
  offset = 0,
): InvoiceTotals {
  if (!engine) return invoiceKernel(columns, BigInt(divisor), mode, offset);
  try {
    return engine.invoice(
      columns.prices,
      columns.quantities,
      columns.discounts,
      columns.taxes,
      divisor,
      mode,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'row' in error && typeof error.row === 'number')
      error.row += offset;
    throw error;
  }
}
function invoiceResult(
  totals: InvoiceTotals,
  config: MoneyOptions & { mode: number; priceScale: number },
  count: number,
  backend: 'js' | 'native',
): InvoiceResult {
  return Object.freeze({
    currency: config.currency,
    scale: config.scale,
    backend,
    lineCount: count,
    rounding: ROUNDING[config.mode]!,
    priceScale: config.priceScale,
    quantityScale: 6,
    policy: 'line-v1' as const,
    gross: formatUnits(totals.gross, config.scale),
    discount: formatUnits(totals.discount, config.scale),
    net: formatUnits(totals.net, config.scale),
    tax: formatUnits(totals.tax, config.scale),
    total: formatUnits(totals.total, config.scale),
  });
}
function abort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw Object.assign(failure('ARYA_ACCOUNTING_ABORTED', 'Calculation aborted.'), {
      name: 'AbortError',
    });
}
async function scheduled<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  abort(signal);
  if (activeAsync >= 2)
    throw failure(
      'ARYA_ACCOUNTING_BUSY',
      'Two asynchronous calculations are already active; apply backpressure.',
    );
  activeAsync++;
  try {
    await yieldTurn();
    abort(signal);
    return await run();
  } finally {
    activeAsync--;
  }
}
/** Snapshot/parse once. Quantities have six fractional digits; prices use the explicit money scale. */
export function prepareInvoices(
  lines: readonly InvoiceLine[],
  options: InvoiceOptions,
): InvoiceBatch {
  length(lines);
  const config = context(options, true),
    count = lines.length;
  const columns: InvoiceColumns = {
    prices: new BigInt64Array(count),
    quantities: new BigInt64Array(count),
    discounts: new Uint32Array(count),
    taxes: new Uint32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const row = object(
      lines[i],
      ['price', 'quantity', 'discountBps', 'taxBps', 'discountRate', 'taxRate'],
      'invoice line',
    );
    columns.prices[i] = parseUnits(row.price, config.priceScale, i, 'price');
    columns.quantities[i] = parseUnits(
      row.quantity === undefined ? '1' : row.quantity,
      6,
      i,
      'quantity',
      true,
    );
    columns.discounts[i] = inputRate(row, 'discount', i);
    columns.taxes[i] = inputRate(row, 'tax', i);
  }
  return Object.freeze({
    currency: config.currency,
    scale: config.scale,
    length: count,
    calculate(execution: ExecutionOptions = {}) {
      const selected = selection(execution, count);
      return invoiceResult(
        invoiceRun(columns, config.mode, config.divisor, selected.engine),
        config,
        count,
        selected.backend,
      );
    },
    async calculateAsync(execution: AsyncExecutionOptions = {}) {
      const selected = selection(execution, count, true);
      return scheduled(selected.signal, async () => {
        const total = emptyInvoice();
        for (let start = 0; start < count; start += 4096) {
          abort(selected.signal);
          const end = Math.min(start + 4096, count);
          const part = invoiceRun(
            {
              prices: columns.prices.subarray(start, end),
              quantities: columns.quantities.subarray(start, end),
              discounts: columns.discounts.subarray(start, end),
              taxes: columns.taxes.subarray(start, end),
            },
            config.mode,
            config.divisor,
            selected.engine,
            start,
          );
          for (const key of ['gross', 'discount', 'net', 'tax', 'total'] as const)
            total[key] += part[key];
          await yieldTurn();
        }
        abort(selected.signal);
        return invoiceResult(total, config, count, selected.backend);
      });
    },
  });
}
export function invoiceBatch(
  lines: readonly InvoiceLine[],
  options: InvoiceOptions,
  execution: ExecutionOptions = {},
): InvoiceResult {
  return prepareInvoices(lines, options).calculate(execution);
}
function ledgerResult(
  totals: LedgerTotals,
  names: readonly string[],
  config: MoneyOptions,
  count: number,
  backend: 'js' | 'native',
): LedgerResult {
  let debit = 0n,
    credit = 0n;
  const accounts = names.map((account, index) => {
    const d = totals.debits[index]!,
      c = totals.credits[index]!;
    debit += d;
    credit += c;
    return Object.freeze({
      account,
      debit: formatUnits(d, config.scale),
      credit: formatUnits(c, config.scale),
      balance: formatUnits(d - c, config.scale),
    });
  });
  return Object.freeze({
    currency: config.currency,
    scale: config.scale,
    backend,
    entryCount: count,
    debit: formatUnits(debit, config.scale),
    credit: formatUnits(credit, config.scale),
    difference: formatUnits(debit - credit, config.scale),
    balanced: debit === credit,
    accounts: Object.freeze(accounts),
  });
}
/** Debits/credits are nonnegative; account order is first appearance, never locale-dependent sorting. */
export function prepareLedger(entries: readonly LedgerEntry[], options: MoneyOptions): LedgerBatch {
  length(entries);
  const config = context(options, false),
    count = entries.length,
    names: string[] = [],
    ids = new Map<string, number>();
  const columns: LedgerColumns = {
    debits: new BigInt64Array(count),
    credits: new BigInt64Array(count),
    accounts: new Uint32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const row = object(entries[i], ['account', 'debit', 'credit'], 'ledger entry');
    if (typeof row.account !== 'string' || !row.account.trim() || row.account.length > 128)
      throw failure(
        'ARYA_ACCOUNTING_INPUT',
        'Account tags must be nonempty strings of at most 128 characters.',
        i,
      );
    let id = ids.get(row.account);
    if (id === undefined) {
      if (names.length >= MAX_ACCOUNTS)
        throw failure('ARYA_ACCOUNTING_LIMIT', 'Too many account groups.', i);
      id = names.length;
      names.push(row.account);
      ids.set(row.account, id);
    }
    columns.accounts[i] = id;
    columns.debits[i] = parseUnits(row.debit, config.scale, i, 'debit', true);
    columns.credits[i] = parseUnits(row.credit, config.scale, i, 'credit', true);
  }
  return Object.freeze({
    currency: config.currency,
    scale: config.scale,
    length: count,
    calculate(execution: ExecutionOptions = {}) {
      const selected = selection(execution, count, false, count >= names.length * 16);
      const totals = selected.engine
        ? selected.engine.ledger(columns.debits, columns.credits, columns.accounts, names.length)
        : ledgerKernel(columns, names.length);
      return ledgerResult(totals, names, config, count, selected.backend);
    },
    async calculateAsync(execution: AsyncExecutionOptions = {}) {
      const selected = selection(execution, count, true, count >= names.length * 16);
      return scheduled(selected.signal, async () => {
        const totals: LedgerTotals = {
          debits: Array<bigint>(names.length).fill(0n),
          credits: Array<bigint>(names.length).fill(0n),
        };
        // Avoid rebuilding a large account result vector for tiny native chunks.
        const chunk = selected.engine
          ? Math.max(4096, Math.min(MAX_ROWS, names.length * 16))
          : 4096;
        for (let start = 0; start < count; start += chunk) {
          abort(selected.signal);
          const end = Math.min(start + chunk, count);
          const part = selected.engine
            ? selected.engine.ledger(
                columns.debits.subarray(start, end),
                columns.credits.subarray(start, end),
                columns.accounts.subarray(start, end),
                names.length,
              )
            : ledgerKernel(
                {
                  debits: columns.debits.subarray(start, end),
                  credits: columns.credits.subarray(start, end),
                  accounts: columns.accounts.subarray(start, end),
                },
                names.length,
                totals,
              );
          if (selected.engine) {
            for (let i = 0; i < names.length; i++) {
              totals.debits[i]! += part.debits[i]!;
              totals.credits[i]! += part.credits[i]!;
            }
          }
          await yieldTurn();
        }
        abort(selected.signal);
        return ledgerResult(totals, names, config, count, selected.backend);
      });
    },
  });
}
export function ledgerBatch(
  entries: readonly LedgerEntry[],
  options: MoneyOptions,
  execution: ExecutionOptions = {},
): LedgerResult {
  return prepareLedger(entries, options).calculate(execution);
}
