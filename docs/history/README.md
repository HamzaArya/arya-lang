# Historical documentation

These records preserve earlier plans, implementation descriptions and release evidence. Their commands, test counts and registry tags describe their recorded versions. Start with the [current native documentation](../README.md) for present-day usage.

| Record | Scope |
| --- | --- |
| [Original language audit](arya-language-logic-report.md) | Arya 0.1 source review before later compiler checks and application libraries |
| [Initial 0.2 plan](arya-0.2-initial-plan.md) | Original source-map-first proposal |
| [Repository extraction](repository-extraction.md) | Language/IDE ownership at the 8 November 2026 split |
| [Milestone roadmap through 1.3.0-alpha.3](roadmap-through-1.3.0-alpha.3.md) | Original M0–M9 plan and evidence; later plans for that implementation are retained in [compat/node/docs](../../compat/node/docs/README.md) |
| [Native implementation plan](arya-1.1-native-plan.md) | Retired 1.1 C11 backend and its qualification criteria |
| [Native usage guide](arya-native.md) | Commands and libraries for the native-capable 1.2.0-alpha.4 package |
| [Native specification](arya-native-specification.md) | Historical native language/runtime contract |
| [Verified native publication](native-release-verification.md) | 1.1.0-alpha.1 hashes, platform binaries and bootstrap results |

The particular 1.1 implementation discussed above is retained in Git history at revision `1d3d553826f6dc1f67c6a1f9a7a9f8955a23cfda`. The current 2.0 implementation lives in `native/` and has its own [SDK](../native-sdk.md), [language profile](../native-profile.md) and build instructions. Historical commands are not the installation instructions for that SDK.

The original Node-profile guides remain under [compat/node/docs](../../compat/node/docs/README.md). Removing redundant copies from the current documentation does not remove their original content; [the cleanup manifest](../maintenance/cleanup-2026-11-13.json) records each preserved counterpart.

Versioned release notes and publication JSON records remain in [releases](../releases/README.md). Published archives, qualification data and benchmark evidence retain their identities. Current work is tracked in the [engineering status](../tasks/native-professionalization.md).
