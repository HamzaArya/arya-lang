# Browser interaction evidence

Date: 2026-11-13. Target: Microsoft Edge on macOS ARM64, using native accessibility controls through the computer-use tool. Each server used isolated temporary data and a loopback port. This is AI-driven interaction testing, not human-subject testing.

## Observed workflows

| GUI | Browser actions and observed result | Status |
| --- | --- | --- |
| Study Planner | Entered “Review Arya modules”; Add session displayed 25 remaining minutes and ID 1; Toggle completed displayed Completed and 0 remaining minutes. | Passed |
| Habit Garden | Created “Read one chapter”; entered ID 1 and clicked Check in / undo; displayed one check-in dated 2026-11-13. | Passed |
| Harbor Support | Final verified executable: created “Export button fails” for Local customer with Normal priority and details; reloaded and saw the saved card at Revision 1; Move to Investigating displayed the saved-change confirmation. | Passed |
| Flowboard | Created “Ship release notes”, assigned Local maintainer and details; reloaded, moved it to Doing, reloaded; observed Doing with one task and Revision 2. | Passed |
| Incident console | Created “API latency elevated” for Local operations; submitted an investigating update; refreshed the board and observed the saved title, owner, priority, status and history. | Passed |
| Statement reconciliation | Submitted provided mismatch: one match, one exception, difference 5.00; changed books to match statement and resubmitted: two matches, no exceptions, difference 0.00. | Passed |

Screenshots of Study Planner and Habit Garden were inspected in the tool output: labels, form controls, status text and content were visible without overlapping panels at the available desktop viewport. All six GUIs also have HTTP/HTML/escaping tests. This is not a mobile or cross-browser qualification, and it does not exercise every possible interactive path.

The first five workflows used development release executables; final release verification separately covers the final source, including byte limits, explicit server roots, stricter stored-state checks and normalized reconciliation totals. Those changes did not replace the GUI actions described above. The support workflow used its latest verified executable.

## Tooling problems and recovery

- The browser tab access host was unavailable. Inventory showed a working native Microsoft Edge app, so verification continued through native accessibility controls.
- The Edge bundle identifier was ambiguous because updater copies shared the ID. Selecting `/Applications/Microsoft Edge.app` resolved it.
- Some native key-entry attempts lost focus or reported a changed UI. Refreshed accessibility state and `setValue` were used; final app states, rather than attempted clicks, determine the results above.
- One native-control service startup request failed transiently; re-reading the app succeeded and verification continued.
- Later native accessibility calls occasionally timed out or were aborted before dispatch. A repeated support update from a stale card returned HTTP 409; its version protection remained active. Creation, persisted card content and the successful move confirmation were observed; automated tests cover the full transition and stale-write contract.
- No GUI implementation was abandoned because of these tooling errors.
