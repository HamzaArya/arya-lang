# Native accounting

`use std "accounting" as accounting` provides exact invoice and ledger batches. `prepareInvoices(lines, options)` and `prepareLedger(entries, options)` snapshot validated input once. A batch exposes `currency`, `scale`, `length`, `calculate(execution?)` and `calculateAsync(execution?)`. `invoiceBatch` / `ledgerBatch` prepare and calculate in one call. `backendInfo()` reports native availability and limits. Every calculation uses the native kernel; `backend` accepts `auto` or `native`.

```arya
use std "accounting" as accounting
let batch = accounting.prepareInvoices(
  [{price: "19.95", quantity: "2", discountBps: 1000, taxBps: 750}],
  {currency: "AFN", scale: 2, rounding: "half-even"}
)
let total = await batch.calculateAsync()
print(total.total) # 38.60
```

Invoice options require an uppercase three-letter currency tag, a scale from 0 to 6 and one of `up`, `down`, `ceil`, `floor`, `half-up`, `half-down`, `half-even`, `half-ceil`, `half-floor`. Optional `priceScale` is between the money scale and six. Quantities have six fractional digits and default to `"1"`. Currency tags label a batch; they are not a currency registry or exchange-rate service.

A line uses exact string `price` and optional string `quantity`. Choose integer `discountBps` / `taxBps` or exact string `discountRate` / `taxRate`; do not supply both forms for one rate. Discounts range from 0 to 10000 basis points; taxes from 0 to 1000000 basis points. Fractional rates have six decimal places. Negative prices represent credits; quantities must be nonnegative. Nonzero fractional digits beyond the selected scale are rejected. Inputs never pass through binary floating-point amount storage.

The `line-v1` policy rounds gross price × quantity to the money scale, rounds the gross discount, subtracts that discount, rounds tax on the net, then adds net and tax. Each line result must fit signed 64-bit minor units. Checked signed 128-bit intermediates hold products and aggregates of at most one million rows. Returned amounts are strings at the selected scale; results include gross, discount, net, tax, total, currency, scale, lineCount, rounding, priceScale, quantityScale, policy and backend.

Ledger entries are `{account, debit, credit}` with exact nonnegative string amounts. Account tags are nonblank text of at most 128 UTF-16 units. Options are `{currency, scale}`. Results include ordered per-account debit, credit and balance strings, exact grand totals, difference and balanced. Account order follows first appearance. Prepared batches/results are immutable; subsequent input mutation cannot change a batch. At most 100000 distinct accounts are accepted.

`calculateAsync({signal})` yields between 4096-row chunks, supports AbortSignal cancellation and allows at most two active jobs, then reports `ARYA_ACCOUNTING_BUSY` for backpressure. It is cooperative scheduling, not a claim of parallel CPU execution. Errors have stable `ARYA_ACCOUNTING_*` codes; per-line errors include the zero-based `row`.

The native [JSON-lines financial worker](../native/examples/calculation-worker.arya) accepts `invoiceBatch` and `ledgerBatch` operations with these inputs. Its existing `invoiceTotals` protocol remains unchanged for callers summing precomputed subtotals/taxes. This worker reads requests from stdin and writes responses to stdout; it does not read or modify Ledger data. Existing Node accounting packages remain preserved under `compat/node` for pinned consumers; the native API has no Node addon loader or JavaScript fallback.

Qualification includes all nine positive/negative tie rules, signed bounds, malformed inputs, accessor rejection, snapshot isolation, grouped wide ledger totals, cancellation/backpressure, 85 independent Decimal/integer batches (7600 rows), and a separate 100000-row execution/ownership check.
