# Project Studio

A native macOS project application with project and task management. The shared AppKit host provides native controls, tables, dialogs, menus, search, details, CSV export and view switching. All project/task logic, validation, lifecycle, progress calculations and persistence are implemented in the compiled Arya worker. No HTTP server, HTML, web view or browser engine is used.

## Workflow

1. In **Projects**, create a project with an owner, description and active-work limit.
2. Switch to **All tasks** and create a task. Pick its project from the native project dropdown; add assignee, priority, optional due date and description.
3. Select rows to edit all project/task fields, including moving a task to another project.
4. Move tasks **Planned → Doing → Done**, or mark Doing work Blocked. Blocked can return to Doing or Planned. Done can reopen to Planned.
5. Review project task counts and completion percentages, the Overdue tasks view, or Activity history. Search filters the current native table; export uses a native Save panel.

Both Doing and Blocked tasks count against a project's active-work limit. Moving an active task to another project enforces the destination limit. Lowering a limit below existing active work is rejected. A project with tasks cannot be deleted until those tasks are moved or deleted. Native delete actions require confirmation. All edits, transitions and deletes reject stale row versions.

## Build and integration checks

```sh
make check
make build
python3 smoke.py .build/worker
```

Run these from this directory. The collection's shared builder packages AppKit and this worker into the final `.app`. Inspect the worker directly if useful:

```sh
DATA_FILE=/tmp/project-studio.json .build/worker list '{"view":"projects"}'
DATA_FILE=/tmp/project-studio.json .build/worker project-add '{"view":"projects","name":"Next release","owner":"Sam","wipLimit":"3","description":"Prepare the next release."}'
```

Commands are `project-add`, `project-edit`, `project-delete`, `task-add`, `task-edit`, `task-transition`, `task-delete` and `list`. All receive a JSON object with `view` (`projects`, `tasks`, `overdue`, `history`). Selected actions require `id` and numeric `version`. Form values are strings; due dates use YYYY-MM-DD or blank. The native project dropdown is declared with the shared `optionsView`/`valueKey`/`labelKey` field extension in `ui.json`.

Python is test tooling only; it is not an application dependency.

## Storage and limits

The host sets the per-app Application Support data path and a single-instance lock. `DATA_FILE` overrides the store for isolated testing. The worker validates the file and referential integrity before commands. It stages replacements in a private sibling directory before rename. Failed validation or writes preserve the previous file; no fsync-level power-loss guarantee is claimed.

Limits: 100 projects, 500 tasks, the latest 1000 history events, and 4 MiB of JSON. WIP limits range from 1 to 20. Overdue means an unfinished task's calendar due date is before the current UTC date. Progress is done tasks divided by all tasks, rounded to a whole percent; empty projects show 0%. History records events and selected details, not reversible snapshots. This is a local single-operator application without cloud sync, login, dependency graphs, attachments, reminders, or external issue integrations. Corrupt data is surfaced rather than reset.

See [REPORT.md](REPORT.md) for actual work and verification.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
