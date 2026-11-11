# Node business applications candidate

Status: implementation in progress, 11 November 2026. Baseline: dirty working-tree
1.3.0-alpha.4, Node 24.16.0 macOS arm64; `npm run check` passes 252 tests,
4 optional skips. Existing changes are retained. Ledger baseline has unrelated
printing edits; no business database will be used for verification.

## Plan and acceptance

A. Isolate emitted runtime dependencies from lexical user host bindings; reproduce
TDZ/import/standard/Python failures and retain language/source-map regressions.
B. Add isolated decimal.js string arithmetic and strict date-only/instant/zone
utilities, with accounting rounding, invalid-value and boundary tests.
C. Add bounded optional annotations, inference, unknown external boundaries,
module contracts and declarations. Reuse the AST/resolver; keep analysis passive.
D. Add conservative formatting, recovered diagnostics, editor navigation and
signatures, incremental graph builds and Node test integration without weakening
owned-output publication or cancellation.
E. Add bounded async iteration with backpressure/cancellation and context tests;
measure fresh Python calls versus batches before deciding on workers.
F. Build an application-owned bank CSV mapping in Arya; use Ledger's CSV safety,
money, tenant/book context and existing staged import execution. Preview is read
only. Verify malformed input, duplicates, precision and authorization boundaries.
G. Produce a new immutable local candidate through the existing snapshot process;
pin Ledger to its exact archive. Record executed checks, hashes, environmental
skips and remaining qualification. No publish, push, deploy or stable claim.

Each phase's implementation, evidence, compatibility and limitations are recorded
below as completed. A documented limitation is not an implemented capability.

## A. Compiler/runtime correctness

Changed lexical emission to rename resolved module host bindings with reserved
internal names and retain explicit public export aliases. Runtime code cannot
resolve these user bindings. Reproduced the old process TDZ crash before editing.
Focused tests cover every supported host name, imported aliases, builtin and
standard initialization, Python initialization, nested scopes, recursion and TDZ.
Existing async, pipeline order/receivers, graph order and source-map suites pass.
Generated async exports retain supplied transaction object identity and concurrent
AsyncLocalStorage contexts. Internal spelling changes require rebuilding output;
user lexical/export semantics remain unchanged. Global-object mutation is still
ordinary JavaScript behavior.

## B. Exact values and dates

Added pinned decimal.js 10.6.0 with private configuration and bounded string APIs;
engine bytes are embedded only for decimal imports. Tests cover exact arithmetic,
large/unsafe values, half-up/even, negative/0-/3-place values, allocation remainder,
JSON round trips, invalid values/rounding/division and checked numeric conversion.
Added strict date-only and instant parsers, JavaScript Date conversions and explicit
Intl-zone projections; leap days, rollover, offsets, year boundaries and New York
DST transitions pass. These APIs are additive. Limits and explicit string transport
are in the API guide. Local-time-to-IANA-zone ambiguity is deliberately not inferred.

## C. Gradual types and module contracts

Added erased optional annotations, expression/function inference, record/array/
nullable/Promise types, strict null narrowing, default checks, unknown JS/Python
boundaries and dependency-first Arya contract checking. Checked builds emit `.d.mts`;
package acceptance checks their consumption with TypeScript. Missing fields, bad
arguments/returns, nullable reads and imported argument mismatches have focused
tests. Unannotated legacy graphs still pass. `any`, dynamic host/standard calls and
unannotated parameters remain explicit limits. `.d.ts` ingestion, full TypeScript
semantics and advanced flow/alias analysis are not implemented.

## D. Build and developer tools

Added cached graph compilation with source/import/output/type keys while rereading
the graph, plus esbuild integration and watchFiles. Failed signature edits fail
instead of yielding stale output; cancellation/ownership tests remain green.
Added whitespace-only formatting preserving raw strings/comments, check mode,
bounded top-level parser recovery, lexical/module snapshot references/rename with
capture checks, typed signatures/completion, open-document imported diagnostics,
and LSP/portable providers. Added conservative unused/unreachable/known-promise
lint and explicit Node test entry points, async/failure/map/exit-status tests.
An actual Node inspector breakpoint is checked against original-source maps.
No real editor-host qualification or closed-file discovery is claimed. Formatter
style breadth and incomplete-source inference remain limited.

## E. Async workloads

Added ordered async map/each with bounded read-ahead, backpressure, cleanup,
observed failures and cooperative AbortSignal propagation. Tests cover 10,000-item
sources, early exit, bounded active work, cancellation, drain and request context.
Existing Python queue/deadline/cancellation/shutdown tests pass. A real 20-item
sqrt measurement on Node 24.16.0/macOS arm64/Python 3.13 measured 3991.26 ms for 20
fresh calls and 126.26 ms for one batch during concurrent checks. This synthetic
measurement is not a service latency guarantee. Retain fresh subprocess isolation:
batching addresses this workload without cross-request worker state. Persistent
workers require a measured non-batchable workload and a separate lifecycle design.
Cancellation does not undo commits or forcibly terminate callbacks that ignore it.

## F. Ledger integration

The separate Ledger repository now contains an application-owned typed Arya CSV
mapping, build adapter, scoped preview service, guarded preview/accept routes and
preview UI. Existing CSV codec/safety, currency/storage/money helpers, duplicate
signatures, restore points and import execution are reused. Strict CSV mode is
opt-in, preserving existing codec callers. Tests use mocked Prisma/context and
OS-temp reconciliation files; no business database is queried or reset. Preview
writes no business data; accepted rows enter the established staged import path.
A 10,000-row/348,923-byte preview measured 91.71 ms and ~14.94 MB heap growth in a
local unit run; this is a single mocked-service observation, not a throughput SLA.
Live session/database/Electron qualification is recorded separately from these
unit results. The reviewed local compiler artifact pin and final evidence follow
in G after the snapshot workflow.
