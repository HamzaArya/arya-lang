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

## Validated journals

`ledgerBatch` remains a diagnostic aggregation API: it permits incomplete or
unbalanced rows and reports `balanced` and `difference`. A globally balanced
aggregate does not prove that every constituent transaction is valid. Use the
new journal API when accepting double-entry transactions:

```arya
use std "accounting" as accounting
const transaction = {id: "sale-001", entries: [
  {account: "cash", debit: "100.25", credit: "0"},
  {account: "sales", debit: "0", credit: "100.25"}
]}
const options = {currency: "AFN", scale: 2}
const validation = accounting.validateTransaction(transaction, options)
const journal = accounting.prepareJournal([transaction], options)
print((await journal.calculateAsync()).balanced) # true
```

`validateTransaction(transaction, options)` returns a frozen summary with `id`,
`currency`, `scale`, `entryCount`, `debit`, `credit`, and `balanced: true`. Invalid
transactions throw; this function does not return false or an unchecked result.
The transaction must contain only `id` and `entries`. The ID is nonblank text
of at most 128 UTF-16 units. Each transaction needs at least two posting rows;
each row must have exactly one positive debit or credit, and every transaction
must balance exactly. Zero-only rows, two-sided rows, negative amounts, nonzero
digits beyond the selected scale and numeric rather than string amounts are rejected. Existing native
ledger preparation validates account tags, signed 64-bit row bounds, exact
decimal grammar and accessor/unknown-field rejection before reporting code
reads the rows. No monetary value passes through binary64 arithmetic.

`prepareJournal(transactions, options)` additionally rejects duplicate IDs within
the supplied journal, more than 100000 transactions, and more than one million
total posting rows. An empty journal is allowed, and its currency/scale policy
is still validated. A pair of individually unbalanced transactions is rejected
even when their differences cancel in the whole journal. Transaction identity
is case-sensitive exact text; IDs and account names are not trimmed or otherwise
normalized. Duplicate protection is scoped to this call: persistence,
cross-request idempotency and database atomicity belong to the caller.

Prepared journals snapshot their amounts and metadata. Later input mutation
cannot affect calculations. They expose `currency`, `scale`, `length` (posting
count), `transactionCount`, `calculate(execution?)`, and
`calculateAsync(execution?)`. `journalBatch(transactions, options, execution?)`
prepares and calculates in one call. Results contain the ordinary immutable
ledger fields plus `transactionCount`, immutable `transactions` summaries, and
`policy: "journal-v1"`. Account order follows first appearance; transaction
summaries retain input order. Existing execution options, two-job backpressure,
4096-row cooperative chunks and cancellation contracts apply to calculation.
Preparation and per-transaction validation are synchronous.

New journal failures use `ARYA_ACCOUNTING_TRANSACTION` for too few postings,
`ARYA_ACCOUNTING_POSTING` for zero/two-sided postings,
`ARYA_ACCOUNTING_UNBALANCED`, or `ARYA_ACCOUNTING_DUPLICATE`. Existing input,
scale, range and limit codes remain applicable. A preparation error includes
zero-based `transactionIndex`; row-specific errors include `row` within that
transaction. An unbalanced transaction also supplies its exact `difference`.

## Trial balances and basic financial statements

`trialBalance(entries, options)` nets each account's debits and credits. It
returns immutable `accounts: [{account, debit, credit}]`, net-side `debit` and
`credit` totals, `difference`, `balanced`, `currency`, `scale`, `entryCount`, and
`policy: "trial-balance-v1"`. Only one net side is positive per account. These
totals differ from the gross posting totals in `ledgerBatch`. Unbalanced input
is retained for diagnosis. Accounts retain first-appearance order, including
zero-balance accounts.

`financialStatements(entries, chart, options)` requires a balanced ledger and
an explicit chart such as:

```arya
const chart = [
  {account: "cash", type: "asset"},
  {account: "sales", type: "revenue"},
  {account: "rent", type: "expense"}
]
```

Each chart entry contains exactly `account` and `type`. Supported types are
`asset`, `liability`, `equity`, `revenue`, and `expense`. Chart size is at most
100000 accounts. Duplicate chart names, accessors, unknown fields and missing
classifications for used accounts are errors. Unused chart accounts appear
with zero balances. Output follows chart order. Credit balances are positive
for liabilities, equity and revenue; debit balances are positive for assets
and expenses. Contra balances remain negative. The function returns:

- `incomeStatement`: `revenue`, `expenses`, and `netIncome = revenue - expenses`.
- `balanceSheet`: `assets`, `liabilities`, `equity`, `currentEarnings`,
  `liabilitiesAndEquity`, `difference`, and `balanced`.
- `accounts`: account name/type, gross `debit`/`credit`, debit-minus-credit
  `balance`, and classification-adjusted `normalBalance`.
- `currency`, `scale`, `entryCount`, and `policy: "statements-v1"`.

The equation includes unclosed earnings:
`assets = liabilities + equity + currentEarnings`. Amounts remain exact strings
at the selected scale; no additional rounding or currency conversion occurs.
All returned records and arrays are immutable. Classification errors use
`ARYA_ACCOUNTING_CLASSIFICATION`; invalid chart rows include `chartIndex`.

These are basic reports over the entries supplied by the caller. Period/date
filtering, opening balances, closing entries, tax rules, consolidation,
multi-currency translation and formal reporting standards are outside this API.
The functions do not post to a database or implement persistent transactions.

Run [journal-report.arya](../native/examples/journal-report.arya) for a complete
example: a 100.25 sale and 25.10 expense produce 75.15 net income and cash, and
a trial balance of 100.25 on each side.

```sh
bin/arya run native/examples/journal-report.arya
sh native/tests/accounting-journal.sh
```

The focused suite checks transaction-level conservation, cancellation, immutable
snapshots, duplicate and malformed inputs, exact wide amounts, net-side trial
balances, chart classifications, liabilities/equity and earnings, and generated
cases against an independent integer-cent oracle. It runs optimized and
optimization-disabled release builds and an ASan/UBSan build with collector
stress. Sanitizer leak detection is disabled on the local macOS host; execution
uses an empty PATH and needs no Node or Python interpreter.
