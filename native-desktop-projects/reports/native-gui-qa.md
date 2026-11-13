# Native AppKit interaction verification

Date: 2026-11-13. Platform: macOS 26.5.2 ARM64. All interactions used the computer-use tool against the actual packaged AppKit applications. This is AI-driven testing of native windows, not a human-subject study.

| App | Observed native workflow | Result |
| --- | --- | --- |
| Study Desk | Created a session through a native sheet. Invalid duration 0 showed a useful error and retained the subject and notes; corrected to 30, saved, selected the table row and completed it. Native Save dialog exported CSV; file contents matched. Reopened the final bundle and confirmed persistence, then switched the populated table to Notes. | Pass |
| Stockroom | Created QA-NOTEBOOK at unit price 4.25, selected it, received 10 units with a reason. Summary and table showed 42.50 valuation and In stock. Reopened the final bundle, confirmed persistence, switched from populated Products to Stock movements and observed the saved audit row. | Pass |
| Harbor Support Desk | Created a ticket with customer/owner/priority. Selected it, opened Change status, chose Investigating using the native dropdown keyboard navigation and saved. Table showed Investigating and two history events. A submission that retained Open was rejected without losing its note. | Pass |
| Project Studio | Created a project. Initial populated-table navigation exposed the host range exception described below. After fixing/repackaging, reopened with persisted project, switched to All tasks, opened New task and observed the dynamically loaded project name. Saved an assigned task, then switched back to Projects and saw task count 1. | Pass after fix |
| Incident Center | Created an incident while the service catalogue was empty; optional native service dropdown offered Unassigned. Saved it and switched the populated table to Activity timeline, which displayed the creation event and owner. | Pass |
| Ledger Studio | Created cash and bank accounts through native forms. Switched the populated account table to Journals. Dynamic debit/credit choices displayed both code/name labels. Posted 125.50 between the selected accounts and observed the journal and equal debit/credit totals. | Pass |

## Native host defect discovered and corrected

Switching Project Studio from a populated Projects table to All tasks initially left only one new column and the old toolbar. The macOS log recorded `NSRangeException`. The host had emptied its data array while AppKit still retained the previous table row count and requested a view for an old row during column reconstruction.

The host now deselects/reloads the empty table before replacing columns, and the cell delegate safely handles an index outside the current snapshot. Fresh bundles were built with that fix. Project Studio then passed populated-view switching in both directions; Study Desk, Stockroom, Incident Center and Ledger Studio also passed switching from populated tables in the corrected host. No persisted data was lost.

## Other GUI/tool observations

- The first app-selection request timed out even though the app had launched. Selecting the running app by bundle ID succeeded.
- Native accessibility clicks that opened sheets often returned AXError.failure even though the sheet opened. The next state read confirmed the actual result before further actions. These tooling exceptions were not counted as application failures.
- One status-menu accessibility click did not change the selected item. Keyboard Down/Return selected the visible intended item; the subsequent native result confirmed it.
- Screenshots of the form and main window were inspected. Main windows resize and table/detail areas scroll. This was a desktop test on the available display, not an exhaustive accessibility, localization or screen-size audit.
- All six application test sessions were closed. The exclusively QA-created default stores were checked for their expected record counts and moved into [gui-data](gui-data), together with the CSV export, leaving new app launches empty. [Archive log](gui-data/archive-log.json) records exactly what was moved.

The initial Study Desk/Stockroom/support workflows preceded the populated-view fix; their controls and worker contracts were unchanged. Final Study Desk and Stockroom bundles were reopened and navigation-tested afterward. Final host source and delivered file hashes are recorded in [acceptance.json](acceptance.json). Detailed engine workflows are separately verified by each project's `smoke.py`; native interaction checks do not claim to exercise every operation.
