# Compatibility and stabilization policy

This is the prepared project policy for the 0.2 preview and a future 1.0 release. It does not declare 1.0 stable. The owner-selected Apache-2.0 alpha publication policy is described below; publishing a preview does not qualify a stable release. The current [normative specification](arya-specification.md), versioned release notes, and actual qualification results define the available candidate.

## Version labels

Arya language/compiler versions are independent of AryaCode product versions. Package metadata, `ARYA_VERSION`, portable extension language metadata, release notes, and archive identity must identify the same language candidate. VSIX numeric metadata follows the existing editor packaging convention; the complete Arya prerelease version remains explicit in its language-version field and artifact filename.

Before 1.0, a minor release or prerelease may introduce a documented change to syntax, resolution, values, built-ins, modules, bridges, diagnostics, or the compiler API. Each deliberate behavior change needs a decision record, a meaningful conformance test, and an old/new migration example. A fix restoring already documented behavior may be a patch, but must still be explained when users can observe it. Do not silently change language semantics in a patch release.

A `1.0.0` label may be created only after the roadmap's external and engineering gates pass. Until then, a tested preview remains a preview even if its implementation work is complete.

## Future stable surface

Once a 1.0 release is qualified, its compatibility promise covers:

- lexical and statement grammar, operator precedence, scope timing, and required value semantics in its versioned specification;
- documented built-in signatures and error conditions;
- the approved bare host-global names for its supported Node execution profile;
- documented Arya module resolution, export behavior, and project boundaries;
- documented JavaScript alias-selection and Python serialization/call contracts;
- supported compiler and language-service call forms, result fields, diagnostic codes, and UTF-16 position conventions;
- CLI command forms, exit-status meaning, and documented build/source-map artifact relationships.

A breaking change to that stable surface requires a major language version. Additive backward-compatible syntax/APIs are minor-version work; corrective changes and security fixes that preserve the stable contract are patch work. A new reserved word can break existing identifiers and must be assessed as a language compatibility change, not assumed to be merely additive.

Host-library APIs, installed npm/Python package versions, operating-system behavior, exact Node/Python exception wording, console inspection formatting, network responses, and process timing are not independently stabilized by Arya. Their requirements and actually tested versions must still be published. Diagnostic codes and source positions are the reliable programmatic surface; do not scrape an entire host stack message.

## Experimental and internal surfaces

The following remain outside the future 1.0 promise until explicitly promoted by a versioned decision:

- unreleased proposals and roadmap checkboxes;
- generated JavaScript formatting, internal helper names, parser annotations, scope ID values, and dependency-graph traversal implementation details;
- private filesystem helpers and unexported compiler modules;
- unsupported editor adapters/platform combinations, interactive debugging, formatter/rename proposals, persistent Python workers, native execution, and Unicode identifier proposals;
- undocumented host extensions accessed through `globalThis` or an explicit host import.

The documented generated entry/map locations remain a user contract; internal text formatting does not. Analysis metadata's documented fields remain an API contract, while numeric scope IDs are local identifiers rather than stable cache or database keys.

## Deprecation and migrations

For stable releases, retain a deprecated supported construct/API through at least two subsequent minor releases and at least six months, whichever is longer, before removal in a major release. Mark it in documentation and release notes when deprecation starts, state its replacement, and supply a runnable migration example. Record exceptions needed for a security issue or an unrecoverable host/runtime incompatibility rather than promising unsafe behavior indefinitely.

Warnings must not execute imports or source code during Check/editor analysis. A migration must specify whether the change affects compilation, runtime results, output artifacts, or only tooling. Evaluate upgrades against representative examples and conformance tests; a source edit should not be required merely because generated output must be rebuilt.

Pre-1.0 deprecations may use a shorter window, but must say so and explain the cost. The alpha.2 lexical checks illustrate the required disclosure: formerly runtime unknown-name/const-write errors now fail compilation, known-name TDZ timing remains runtime behavior, and examples explain the migration.

## Host support and supported releases

Node 22.15 is the declared current minimum. A raised minimum is a compatibility decision with its own migration note and qualification matrix. Test both the minimum and a current supported runtime before making a release claim. Python support is limited to interpreter/platform combinations actually qualified for that release; installing an arbitrary interpreter does not establish compatibility.

No stable Arya release or stable maintenance branch is currently declared. Preview support is best effort on the active development line; previous previews should not be presented as maintained security branches. Hamza Arya handles private security reports at hamzaarya123@gmail.com on a best-effort basis for the active preview line, as recorded in [SECURITY.md](../SECURITY.md). Before 1.0 publication, the project must separately name maintained stable lines and maintenance periods. No SLA or fixed maintenance window is invented for the alpha.

## Release authority and contributions

On 9 November 2026, Hamza Arya selected Apache-2.0, copyright 2026 Hamza Arya, homepage https://hamzaarya.com, npm package `arya-language` on the `next` tag, and a GitHub prerelease in the existing `HamzaArya/arya-lang` repository. Hamza Arya is the release authority; actual account authentication, registry/repository permission, and successful publication must be verified by the release operation. `LICENSE`, `NOTICE`, and `THIRD-PARTY-NOTICES.txt` carry the adopted source/distribution terms. No separate contributor license agreement or copyright assignment is introduced by this policy. A contribution/governance process for stable maintenance remains future work.

Publish a versioned specification snapshot, migration notes, supported-platform evidence, checksums, notices, and provenance alongside a stable artifact. The [readiness record](release-readiness.md) distinguishes prepared policy from completed release gates.

The first public target is `0.2.0-alpha.3`, explicitly experimental and locally qualified on macOS arm64. Missing Linux/Windows and external learner evidence limits its claims and keeps the stable roadmap gates open; it does not prohibit an owner-authorized alpha intended for further review. Use the `next` npm tag and GitHub prerelease status, not `latest` or a stable 1.0 label.
