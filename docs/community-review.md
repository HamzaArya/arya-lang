# External learner review plan and evidence log

**Evidence status, 9 November 2026:** the owner reports no feedback from external Arya learners yet. No participants have been recruited, observed, or counted by this work. This document prepares M7's review; it does not mark M7's external-participation gates complete.

The project should observe people who did not implement Arya using a supplied candidate archive, its installation guide, and the beginner learning path. Include both beginners and programmers familiar with another language, and seek Afghan programmers/learners where possible. Invitations and participant coordination require a real project owner/reviewer; no messages or invitations are sent by this plan.

Use the current [1.2.0-alpha.4 release](releases/1.2.0-alpha.4.md) as the starting candidate, with an exact package pin and matching documentation revision. Its automated/public-install results are recorded separately; no new participant observations were supplied with this release.

## Candidate and session setup

Record the candidate version, archive SHA-256, source revision or candidate manifest, Node/Python versions, operating system/architecture, editor, and the documentation revision before the session. Use the exact artifact rather than a participant unknowingly using a global older compiler. A clean temporary project should not depend on the implementation checkout.

Explain that the session is evaluating Arya and its instructions, not the learner's ability. Ask whether observations may be recorded and use a participant ID rather than unnecessary personal details. The observer should wait before coaching, record the learner's own interpretation, and intervene only when the participant asks to stop, is blocked, or risks losing their work. Record every intervention and whether the task then completed.

## Short learning path

Use the [installation guide](installing.md), [beginner tutorial](arya-tutorial.md), and [short project learning path](learning-path.md). The completed reference project is `fixtures/arya/modules/tasks/main.arya`, with helpers in `lib/tasks.arya` and `lib/report.arya`. Its baseline output is `Completed: 2 of 3`, `Remaining: 1`, and `Project: tasks.arya` on separate lines. The learning path must start with one file and end with relative Arya modules plus one JavaScript or Python bridge. A completed reference project and expected output must be available for comparison after the independent attempt.

| Task | Observable completion | Exercise / expected evidence |
| --- | --- | --- |
| Install | Exact candidate version appears from the local CLI | Follow the archive installation instructions without repository knowledge; record every command/error. |
| First run | One `.arya` file prints a chosen greeting | Change a supplied value and predict the new output before running. |
| Rules | Correct prediction for a condition, list, and function | Explain strict equality, the excluded end of `range`, and const binding versus object mutation in the learner's own words. |
| Check an error | Learner finds and fixes an unknown lexical name and a const write | Use a source such as `let greeting = "hello"; print(greetng)` and `const count = 1; count += 1`; note whether the diagnostic explains the fix. |
| Modules | Entry imports a dependency and prints its exported calculation | Place a helper in a subdirectory; check/run the entry; explain why imports need a relative path and `.arya` suffix. |
| Interop | A documented JavaScript or Python call works | Prefer a dependency-free `node:` example first; a Python example additionally records the selected interpreter and required environment. |
| Runtime location | Learner opens the original dependency at a mapped runtime failure | Insert a deliberate null-property error into a dependency, run the entry, and record which source location the learner chooses. |
| Small project | Learner completes a change spanning entry/helper files | Add an item or rule, predict the result, run Check, then compare against the reference project's expected output. |

A task may be completed, completed with assistance, attempted and blocked, skipped, or declined. A skipped task must not be counted as success. A technically working example does not prove that a new user understood it.

## Observation record

Create one copy of this template per real session. Do not fill it with hypothetical learners or successful outcomes inferred from automated tests.

```text
Session ID:
Participant ID:
Date / observer:
Prior programming experience (optional):
Preferred language / accessibility needs (optional):
Candidate version / archive SHA-256 / source revision:
OS / architecture / Node / Python / editor:
Documentation revision:

Task:
Start / finish or elapsed time:
Status: completed | assisted | blocked | skipped | declined
Commands attempted and relevant output:
Learner's prediction / explanation:
Observed difficulty (verbatim quote only with permission):
Observer intervention:
Recovery / actual result:
Issue ID(s):
```

## Issue classification and priority

Separate the evidence from the proposed fix. A learner saying “I could not find the run command” is evidence; “build a debugger” is a proposed solution requiring further assessment.

| Field | Required contents |
| --- | --- |
| Issue ID / tasks / candidate | Trace back to the actual observation. |
| Category | Language, diagnostics/tooling, documentation, installation/packaging, platform, or interoperability. |
| Affected participants | Count distinct observed participants and the denominator who attempted the task. |
| Severity | Blocker: cannot continue; major: assistance/repeated failures; minor: recoverable confusion; suggestion: no observed task failure. |
| Frequency | Observed count and proportion, not an invented estimate. |
| Evidence | Session IDs, minimal reproducer, command/output or permitted quote. |
| Smallest proposed remedy | A concrete instruction, message, behavior fix, or tool change. |
| Verification | A new test and/or a repeat learner task with observable success. |

Prioritize blockers and repeated major problems first. A severe reproducible engineering fault may warrant action even if only one participant observed it; label that rationale rather than inflating frequency. Keep untested feature suggestions in the backlog. Feed selected changes into the [tooling evidence gate](tooling-evidence.md).

## Current evidence log

| Evidence | Status | Consequence |
| --- | --- | --- |
| External learner attempts | Not collected; owner confirmed none on 9 November 2026 | M7 observation and findings gates remain open. |
| Afghan learner/programmer participation | Not collected | No participation claim is made. |
| Dari/Pashto translation review | Not collected; no translated learning material is qualified | Require fluent review before publishing a translation as reviewed. |
| Automated compiler/package/tutorial examples | Recorded separately by implementation tests and release audit | Engineering verification; do not count as external learning evidence. |

## Exit criteria

M7 closes only when the shipped path works from a clean install, actual external participants attempt it, and a prioritized evidence log records their findings. Any translated material requires fluent review. Recruitment targets and a protocol are preparation, not completed participation. Report participant counts, failed tasks, interventions, and unresolved issues alongside successes.
