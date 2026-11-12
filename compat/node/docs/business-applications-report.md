# Business application engineering report — 11 November 2026

The delivered compiler is **1.3.0-alpha.7**, published to npm’s `next` channel.
See the [publication record](releases/1.3.0-alpha.7-publication.json) for public archive verification and distribution status. The qualification evidence below records the prepublication candidate.
Arya Ledger pins its reviewed tarball and lockfile integrity. No package was
published, release declared, service deployed, commit pushed or business database
used. Unrelated working-tree changes in both repositories were preserved.

## Implemented behavior

- Runtime helpers are isolated from resolved user module host bindings/import
  aliases while preserving exports, lexical timing and source maps.
- `std decimal` embeds decimal.js 10.6.0 with private configuration and exact
  bounded string operations, explicit rounding and checked number conversion.
  `std datetime` distinguishes strict date-only values, instants and explicit
  zones. `std async` supplies bounded streaming map/each, backpressure and cleanup.
- Optional annotations support common primitive/record/array/function/nullable/
  promise contracts, inference and supported narrowing. Project and open-document
  checks propagate Arya exports; checked builds emit `.d.mts`. External JS/Python
  values require a trusted boundary or runtime validation in checked modules.
- Conservative formatting/check mode, lint, bounded parser recovery, snapshot
  references/rename/signatures, editor providers, incremental compilation,
  esbuild integration and explicit Node test entries are implemented.
- Ledger's fixed, developer-owned Arya mapping normalizes bank CSV dates,
  references, currencies and exact amounts. The existing CSV codec, safety limits,
  money/storage policy, tenant/book Prisma facade and duplicate rules are reused.
  Preview performs no business-data writes. Acceptance revalidates source/context
  and enters the existing staged import, restore-point and audit path.

Contracts, examples, errors and bounds are in [the API guide](business-applications.md).
Per-phase changes, reasons, compatibility and evidence are in
[the implementation record](business-applications-plan.md).

## Important files

| Repository | Files and role |
| --- | --- |
| Arya | [compiler](../src/compiler.ts), [types](../src/types.ts), [project graph/cache](../src/project.ts), [esbuild adapter](../src/esbuild.ts) |
| Arya | [decimal](../src/std/decimal.ts), [dates](../src/std/datetime.ts), [async](../src/std/async.ts), [formatter/lint](../src/tooling.ts), [workspace analysis](../src/workspace-service.ts), CLI/LSP/portable providers and regression tests |
| Ledger | `backend/src/arya/bank-import.arya`, `services/bankImportPreview.service.js`, reconciliation controller/routes/shared signatures and opt-in strict CSV parsing |
| Ledger | `scripts/build-arya.mjs`, `scripts/verify-arya-package.mjs`, build/Docker/desktop hooks, BankReconcile UI/tests, vendored compiler record/archive and package lock |

## Executed verification

| Check | Result |
| --- | --- |
| Fresh recorded snapshot, Node 24.16.0/macOS arm64/Python 3.13.15 | Documentation, TypeScript, build and **273 tests passed; 4 optional skips** (277 total), with serial test files |
| Snapshot distribution workflow | Install, checks, compiler/creator/VSIX/editor-kit packaging, installed-package acceptance and release audit passed |
| Node 22.15.0 | Installed-package acceptance and **21 focused tests** passed, covering all new runtime/tooling/type paths and a real inspector breakpoint |
| Chrome | Both real UI/browser checks passed on this exact candidate |
| Editors | VS Code 1.143.1 and AryaCode 1.145.2 activation/semantic/icon/theme checks passed; compiled-in AryaCode providers remain a separately pinned product |
| Ledger | **22 backend unit/integration-with-mocks checks**, **5 frontend checks**, and production build passed; Vite reported bundle-size/dynamic-import warnings |
| Package behavior | Relocated CJS/map execution passed in Asia/Kabul and America/Los_Angeles without Python/compiler; notices and archive integrity checked; failed mapping builds removed stale executable output |
| Real Python string transport | Installed candidate preserved `9007199254740993.31` through Python Decimal; no decimal object identity is claimed |

Earlier concurrent checks hit host scheduling/startup deadlines. Test-file
parallelism is now bounded; the queue/shutdown fixture uses a 15-second handshake
budget rather than treating process startup as its assertion. Dedicated deadline
and cancellation tests retain their short assertions and pass. Initial failed
runs remain in local evidence; they were not promoted as qualification.

Measurements: 20 fresh Python calls took **3991.26 ms**, versus **126.26 ms** for
one batch. Retain fresh subprocess isolation and batching. A mocked 10,000-row,
348,923-byte bank preview took **91.71 ms** in the initial run, with approximately
14.94 MB heap growth; later loaded-host runs varied. These are observations, not
service-level promises. Currency allocation policy stays in the application.

## Artifact and migration

Compiler archive SHA-256:
`cfe66ecc8b96888d1e6c9e62545c253a161afcf7ed35e4d47c8c30dcd4ac9a20`.
Source manifest SHA-256:
`ba6871662cd784dbec7f434f8185b4518487280b4746d1c24c60fed09407da44`.
This records a dirty working-tree snapshot based on Git
`f0b8079d77b56fedcc0ab5063bc5c3d425ee5769`, not a clean release commit.
Root `artifacts/arya-language-1.3.0-alpha.7.tgz` and Ledger's vendored copy match.
All 44 prior retained archives, including alpha.5/alpha.6 candidates, remain frozen.
Final evidence-only documentation updates were made after the snapshot without
repacking it. The recorded npm baseline remains separate from this local artifact.

Rebuild generated output. Host shadowing no longer changes builtin dependencies;
call a user binding explicitly when its conversion behavior is desired. Existing
unannotated modules retain dynamic behavior. Checked rest parameters need array
annotations (`...values: number[]`). Headerless Ledger pastes must add the documented
CSV header and preview before acceptance. The existing 1 MiB HTTP body limit is
retained; the shared parser's 5 MiB defense does not raise it. Decimal/date strings
and their bounded conversions are explicit APIs, not changes to Number/Date.

## Remaining qualification

No disposable MySQL URL/server is configured; Docker's daemon socket is absent.
Live MySQL/session-auth/request-chain verification and Docker image execution
remain unqualified. A Ledger Electron binary/signing environment and native
Linux/Windows runners were not available for exact-candidate packaging checks.
Use Ledger's documented disposable runner, Docker build and desktop package paths;
never substitute an existing business database. The compiler CI matrix remains
the executable Linux/Windows path for the exact source snapshot/revision.

Before broader adoption: expand type/alias/higher-order/control-flow analysis,
add declaration-file ingestion if needed, improve incomplete/closed-file editor
analysis, qualify actual editor breakpoint workflows and Ledger installers, and
complete live database/authorization, platform, learner and stable-support gates.
The implementation does not claim full TypeScript compatibility or stable support.
