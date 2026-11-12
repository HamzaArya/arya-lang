/** Exact fixed-point kernels. No decimal engine, compiler, I/O, or native loading. */
export const MAX_ROWS = 1_000_000;
export const MAX_ACCOUNTS = 100_000;
export const MIN_I64 = -(1n << 63n);
export const MAX_I64 = (1n << 63n) - 1n;
export const ROUNDING = [
  'up',
  'down',
  'ceil',
  'floor',
  'half-up',
  'half-down',
  'half-even',
  'half-ceil',
  'half-floor',
] as const;
export type RoundingMode = (typeof ROUNDING)[number];
export type Backend = 'auto' | 'js' | 'native';
export interface InvoiceColumns {
  prices: BigInt64Array;
  quantities: BigInt64Array;
  discounts: Uint32Array;
  taxes: Uint32Array;
}
export interface LedgerColumns {
  debits: BigInt64Array;
  credits: BigInt64Array;
  accounts: Uint32Array;
}
export interface InvoiceTotals {
  gross: bigint;
  discount: bigint;
  net: bigint;
  tax: bigint;
  total: bigint;
}
export interface LedgerTotals {
  debits: bigint[];
  credits: bigint[];
}

export function failure(
  code: string,
  message: string,
  row?: number,
): Error & { code: string; row?: number } {
  return Object.assign(new Error(message), { code, ...(row === undefined ? {} : { row }) });
}
export function inRange(value: bigint, row?: number): bigint {
  if (value < MIN_I64 || value > MAX_I64)
    throw failure('ARYA_ACCOUNTING_RANGE', 'A line amount exceeds signed 64-bit minor units.', row);
  return value;
}
export function parseUnits(
  value: unknown,
  scale: number,
  row: number,
  label: string,
  positive = false,
): bigint {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) ||
    (positive && value.startsWith('-'))
  )
    throw failure(
      'ARYA_ACCOUNTING_INPUT',
      label + ' must be an exact decimal string without grouping or exponent.',
      row,
    );
  const negative = value.startsWith('-'),
    parts = (negative ? value.slice(1) : value).split('.');
  const fraction = parts[1] ?? '';
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale)))
    throw failure(
      'ARYA_ACCOUNTING_SCALE',
      label + ' has nonzero digits beyond the selected scale.',
      row,
    );
  const units =
    BigInt(parts[0]! + fraction.slice(0, scale).padEnd(scale, '0')) * (negative ? -1n : 1n);
  return inRange(units, row);
}
export function formatUnits(units: bigint, scale: number): string {
  const negative = units < 0n,
    digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  return (
    (negative ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits)
  );
}
export function rounded(numerator: bigint, denominator: bigint, mode: number): bigint {
  const quotient = numerator / denominator,
    remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n,
    absolute = remainder < 0n ? -remainder : remainder,
    twice = absolute * 2n;
  let increment = false;
  switch (mode) {
    case 0:
      increment = true;
      break;
    case 1:
      break;
    case 2:
      increment = !negative;
      break;
    case 3:
      increment = negative;
      break;
    case 4:
      increment = twice >= denominator;
      break;
    case 5:
      increment = twice > denominator;
      break;
    case 6:
      increment = twice > denominator || (twice === denominator && quotient % 2n !== 0n);
      break;
    case 7:
      increment = twice > denominator || (twice === denominator && !negative);
      break;
    case 8:
      increment = twice > denominator || (twice === denominator && negative);
      break;
    default:
      throw failure('ARYA_ACCOUNTING_ROUNDING', 'Unknown rounding mode.');
  }
  return quotient + (increment ? (negative ? -1n : 1n) : 0n);
}
export function emptyInvoice(): InvoiceTotals {
  return { gross: 0n, discount: 0n, net: 0n, tax: 0n, total: 0n };
}
export function invoiceKernel(
  columns: InvoiceColumns,
  divisor: bigint,
  mode: number,
  offset = 0,
): InvoiceTotals {
  const totals = emptyInvoice();
  for (let i = 0; i < columns.prices.length; i++) {
    const row = i + offset;
    const gross = inRange(rounded(columns.prices[i]! * columns.quantities[i]!, divisor, mode), row);
    const discount = inRange(rounded(gross * BigInt(columns.discounts[i]!), 1000000n, mode), row);
    const net = inRange(gross - discount, row);
    const tax = inRange(rounded(net * BigInt(columns.taxes[i]!), 1000000n, mode), row);
    const total = inRange(net + tax, row);
    totals.gross += gross;
    totals.discount += discount;
    totals.net += net;
    totals.tax += tax;
    totals.total += total;
  }
  return totals;
}
export function ledgerKernel(
  columns: LedgerColumns,
  accountCount: number,
  existing?: LedgerTotals,
): LedgerTotals {
  const debits = existing?.debits ?? Array<bigint>(accountCount).fill(0n),
    credits = existing?.credits ?? Array<bigint>(accountCount).fill(0n);
  for (let i = 0; i < columns.debits.length; i++) {
    const account = columns.accounts[i]!;
    debits[account]! += columns.debits[i]!;
    credits[account]! += columns.credits[i]!;
  }
  return { debits, credits };
}
