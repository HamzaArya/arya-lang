# Historical documentation

These records preserve earlier plans, implementation descriptions, and release evidence. Paths, commands, test counts, and registry tags describe their recorded versions. Use the [current documentation](../README.md) and [Node.js migration guide](../node-runtime.md) for current development.

| Record | Scope |
| --- | --- |
| [Original language audit](arya-language-logic-report.md) | Arya 0.1 source review before the current compiler checks and application libraries |
| [Initial 0.2 plan](arya-0.2-initial-plan.md) | Original source-map-first proposal |
| [Repository extraction](repository-extraction.md) | Language/IDE ownership at the 8 November 2026 split |
| [Milestone roadmap through 1.3.0-alpha.3](roadmap-through-1.3.0-alpha.3.md) | Original M0–M9 plan, decisions, and progress/evidence log; superseded by the [current roadmap](../arya-roadmap.md) |
| [Native implementation plan](arya-1.1-native-plan.md) | Retired C11 backend, self-hosted compiler, and their qualification criteria |
| [Native usage guide](arya-native.md) | Commands and libraries for the native-capable 1.2.0-alpha.4 package |
| [Native specification](arya-native-specification.md) | Historical native language/runtime contract |
| [Verified native publication](native-release-verification.md) | 1.1.0-alpha.1 hashes, platform binaries, and bootstrap results |

The native implementation remains in Git history at revision `1d3d553826f6dc1f67c6a1f9a7a9f8955a23cfda`. It is absent from the current source. Do not run archived native build/bootstrap commands against this checkout.

Versioned release notes and immutable publication JSON records remain in [releases](../releases/README.md). Moving these documents does not change any published archive, hash, or release tag.
