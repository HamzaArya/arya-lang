# Native learner review kit

This kit is ready for five recruited developers. Use participant identifiers P01–P05 and synthetic examples. Sessions have not yet been run. Use the qualified macOS ARM64 SDK for a consistent baseline; other platform release qualification is separate work.

Invite developers with varied language experience, including someone who builds accounting or business applications. Allow 40 minutes per session. Ask participants to explain what they expect before running code and to describe confusing messages as they encounter them. The moderator should record help rather than silently correcting the task.

## Preparation

Provide the native `2.0.0-alpha.2` SDK, the SDK guide, and a C11 compiler for application builds. Node/npm are not required. Confirm that `arya --version` prints `Arya native 2.0.0-alpha.2`. In a source checkout, use `./bin/arya` as the command below.

Copy [starter.arya](../native/examples/learner-review/starter.arya) into an empty writable directory. Keep answers and moderator notes out of the participant's initial instructions.

## Participant tasks

1. Run `arya check starter.arya`, then `arya run starter.arya`. Explain how monetary values are represented. Change the default quantity to four and run it again.
2. Build with `arya build starter.arya -o total --release`. Run `./total 9007199254740993.01 3`. Explain why converting the price to an ordinary `number` would change the guarantee.
3. Temporarily annotate `price` as `number`, then use `arya check` to find and correct the mismatch. Record which part of the diagnostic helped and whether the file location was clear.
4. Using the SDK guide, create a CLI project in a new directory and find its build, check and test commands. Run its check and test commands. Explain what the project needs to build and what the compiled program needs to run.

Allow five minutes at the end for these questions: Which term or command was hardest to understand? What did the compiler explain well? What would prevent you from using Arya for a small real application? Which missing capability matters most?

## Moderator answers and scoring

The initial total is `59.85`; four items total `79.80`. The large calculation is exactly `27021597764222979.03`. Monetary inputs stay decimal strings, and arithmetic uses `std "decimal"` with explicit rounding. The temporary numeric annotation must be restored to `string`; a successful correction should not introduce binary floating-point amount conversion.

Record each task as independent success, success with help, or incomplete. Record elapsed time, number of hints, exact output, diagnostic code/location, and the participant's explanation. Separate observed behavior from the moderator's interpretation.

| Participant | Run/edit | Exact build | Diagnostic fix | New project | Hints/time | Main obstacle |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | Pending | Pending | Pending | Pending | Pending | Pending |
| P02 | Pending | Pending | Pending | Pending | Pending | Pending |
| P03 | Pending | Pending | Pending | Pending | Pending | Pending |
| P04 | Pending | Pending | Pending | Pending | Pending | Pending |
| P05 | Pending | Pending | Pending | Pending | Pending | Pending |

The initial usability target is at least four of five participants completing run/edit and exact build without verbal help, and every completed monetary task producing the exact result. Prioritize repeated blockers and wrong financial explanations over cosmetic preferences. Preserve unsuccessful attempts so changes can be checked against the original problem.
