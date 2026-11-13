# Map and Set mutation repair

Status: source repair implemented; final compiler regression run pending.

## Reproduced failure

The previous compiler loses values when an insertion compacts a collection during a native `for` loop. A Set containing integers 0 through 63 was traversed; at value 40, the loop deleted values 0 through 40 and added 64. It visited only 0 through 40, rather than all integers 0 through 64. The executable exited with `AryaAssertionError: Set iteration lost values after compaction`.

Local evidence: `.build/collection-repair/repro.arya`, `repro-build.log`, and `repro-before.log`.

Deletion leaves tombstones. The existing insertion compactor respects `forEach` guards, but a native `for` loop previously supplied only a numeric cursor. Compaction moved pending entries behind that cursor. Clearing and repopulating a collection during a loop had the same underlying problem.

## Repair

Every collection traversal receives a distinct rooted native iterator handle. Its guard prevents compaction and preserves the old cursor positions while the traversal is active. Natural exhaustion, `break`, `return`, and exceptions release the guard through the compiler's iterator cleanup paths. Cleanup is idempotent, so nested loops close independently. The handle retains the collection while live; a finalizer releases an abandoned guard. Explicit close drops the collection reference immediately.

`Array.from` uses the same guard because its mapper can mutate the source collection. Constructor and spread traversal also use the shared iterator entry point. `clear` preserves tombstones only while a traversal remains active. Its empty-storage case no longer calls `memset` on a null pointer.

This change does not expand `async.map` input support: its existing accepted inputs are arrays, strings, and native async iterators.

## Regression coverage

`native/tests/collection-mutation.sh` builds `native/tests/fixtures/collection-mutation.arya` in optimized release, optimizer-disabled reference, and sanitizer modes. Each execution enables garbage collection stress. The fixture checks:

- Map and Set insertion after deletion crosses the compaction threshold.
- Map values updated before visitation are observed.
- `clear`, replacement entries, and deletion followed by reinsertion retain insertion-order semantics.
- Nested loop `break`, exception, and function `return` preserve the outer traversal.
- `forEach` and native loops can nest without releasing each other's guards.
- `Array.from` mapper mutations and mapper exceptions retain valid state.
- Constructors, spread, and empty collection traversal still work.
- Completed and broken loops allow storage to be reclaimed while compiler temporaries remain in the same stack frame.

The fixture passed the existing compiler's syntax/type check. Execution against the rebuilt compiler is required before qualification.
