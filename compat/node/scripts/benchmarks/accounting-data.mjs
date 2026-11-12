export function invoices(count) {
  let seed = 0x41525941;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  return Array.from({ length: count }, (_, i) => ({
    price:
      (i % 13 === 0 ? '-' : '') +
      String(next() % 10000) +
      '.' +
      String(next() % 100).padStart(2, '0'),
    quantity: String(next() % 10) + '.' + String(next() % 1000000).padStart(6, '0'),
    discountBps: next() % 2001,
    taxBps: next() % 2501,
  }));
}
export function ledger(count, groups) {
  return Array.from({ length: count }, (_, i) => ({
    account: 'account-' + (i % groups),
    debit: i % 2 ? '0.00' : String(i % 10000) + '.25',
    credit: i % 2 ? String((i - 1) % 10000) + '.25' : '0.00',
  }));
}
