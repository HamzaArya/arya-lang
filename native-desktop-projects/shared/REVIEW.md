# Independent native-host review

Reviewed 2026-11-13. Read-only review of `NativeHost.m` and `build.py`, plus isolated AppKit probes. The reviewer changed neither implementation. This is an AI-agent review, not a claim of a human audit or complete GUI certification.

## Confirmed popup bug and verified correction

Original construction used `NSPopUpButton addItemWithTitle:` and later mapped the selected index back to the unmodified options array. Actual AppKit execution with labels `Release`, `Release`, `Maintenance` produced only **two** menu items. Selecting original index 2 returned **-1**. Thus repeated project names could return the wrong project ID or an empty value.

The corrected host creates a distinct `NSMenuItem` for every option, stores the actual option value in `representedObject`, adds it through `input.menu`, and reads `selectedItem.representedObject` on submission. A compiled AppKit probe using that exact construction produced:

```text
fixed-items=3 default-index=0
index=0 title=Release value=project-a
index=1 title=Release value=project-b
index=2 title=Maintenance value=project-c
```

This verifies distinct options and values despite duplicate display labels.

## Packaging publication order

Originally, the builder removed the previous delivered `.app` before protocol checking and final source-hash checking. A failed check therefore replaced a working bundle with an unqualified one.

The reviewed correction runs codesign verification, the bundle protocol check, and source-hash checks inside the staging directory before publication. It moves the prior bundle into a private backup, renames the candidate into place, and restores the backup if that rename fails. This correction was verified by source inspection; the reviewer did not inject filesystem failures or replace delivered applications.

## Form/refresh race

Source review found that the original host cleared `busy` before opening an edit or destructive-confirmation sheet. File → Refresh remained callable. A form save could then overlap that refresh, or confirmation could silently lose its action because `invoke` returned while busy. This was a source-level finding, not a reproduced GUI race.

The reviewed correction tracks `editing` throughout forms and destructive confirmation. Refresh, invoke, action clicks, view switching, export and termination check that state. Sheet completion clears it before invoking work; retrying a failed form restores it. No claim of interactive race stress testing is made.

## Multiline controls and compilation

An actual AppKit probe created the same zero-frame `NSTextView` inside a 450×92 scroll view. AppKit sized the text view correctly:

```text
scroll={{0, 0}, {450, 92}} text={{0, 0}, {450, 86}} widthTracks=1 verticalResizable=1 horizontalResizable=0
```

No multiline sizing defect was found in this probe. The final reviewed host passed `clang -fobjc-arc -fmodules -Wall -Wextra -fsyntax-only` with exit 0. Full native-window workflows, packaged-app protocol tests, and worker behavior remain covered by their separate QA reports.

## Reviewed source identity

- NativeHost.m SHA-256: `8ab8ce0ba10aeaa861ff39fd32f004196f4f971bc448e11d59addce2a0ac7460`
- build.py SHA-256: `cbf28d230e7de65235f4d9855bb93c8b73e25248be44e5ed980bf68da960fc98`

## Later integration finding

After this independent review, native GUI testing found a populated-table row-count transition exception. Root corrected table reload ordering and cell-delegate bounds, then retested populated view switching. See `../reports/native-gui-qa.md` and final `../reports/acceptance.json`; the reviewed hash above intentionally identifies the earlier reviewed snapshot.
