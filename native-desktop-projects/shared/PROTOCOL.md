# Native AppKit / Arya application contract

The shared Objective-C AppKit host renders native controls; each app's native Arya worker owns all domain validation, mutations, persistence and snapshots. No HTTP, HTML, browser engine, Electron, Node or Python runtime.

Each project: main.arya, ui.json, smoke.py, README.md, REPORT.md, optional sample files. main.arya receives args[0] command and args[1] JSON object string. DATA_FILE environment is the absolute store path; parent exists. Print exactly one JSON response on stdout; expected failures {ok:false,message:"Human explanation"} (exit0), unexpected startup failures may exit nonzero. Success {ok:true,message:"Saved",rows:[flat records],summary:"Human readable summary"}. Every command receives body.view; returns rows/summary for that view AFTER operation. Command "list" returns current snapshot. No HTTP. Dates use YYYY-MM-DD. Exact money stays strings.

ui.json schema:
{
 "id":"study-desk", "name":"Study Desk", "subtitle":"Plan focused work and keep useful notes.",
 "views":[{"id":"sessions","label":"Study sessions","columns":[{"key":"title","label":"Subject","width":250},{"key":"status","label":"Status","width":120}]}],
 "actions":[{"label":"New session","command":"add","view":"sessions","selection":false,"fields":[{"key":"title","label":"Subject","type":"text","required":true},{"key":"minutes","label":"Minutes","type":"text","default":"25"}]}]
}

Actions are scoped by view (omit view for all). selection:true needs a selected table row, and includes body.id plus body.version when present. Fields preload from selected row by key, or optional source key, otherwise default (empty string). type supports text, multiline, choice (choices:[{value,label}]); all field values delivered as strings. No-field action immediately invokes command; destructive:true triggers native confirmation. Backend MUST validate id/version independently of caller and preserve state on failed writes. Commands "list" and action.command are the only app calls. Host adds view to all payloads; can add query but apps need not use it (search filters rendered rows locally).

Built-in native features: view switcher, search, table selection/detail pane, refresh, native edit dialogs, Cmd-Q/Cmd-C/Cmd-V, export current view to CSV via Save panel, reveal data folder, About window; single-instance data-file lock. DATA_FILE override isolates testing. Host owns UI; worker owns application correctness. JSON snapshots persist under ~/Library/Application Support/Arya Native/<app-id>/data.json by default, not inside .app.

smoke.py takes argv[1] compiled Arya executable. Python is test tooling only. Invoke worker with [binary, command, json.dumps(body)] and isolated DATA_FILE. Tests must cover meaningful full operations, edits/deletes/conflicts, validation, persistence across separate processes, corrupt stored data, failed-write rollback where supported. Build with ../../bin/arya build main.arya -o .build/worker --release --force from an individual project directory. Root builds/packages the final .apps.

Scope: macOS ARM64 native AppKit. Only one process per store. Persist through temporary file+rename; refuse corrupt state instead of resetting it. Bound persisted bytes and rows. Do not add web/desktop/ui imports; no web server. Do not change existing compiler/runtime or earlier apps. Report actual friction and exact limits, not invented human experience.

Dynamic choice fields may specify optionsView, valueKey and labelKey. The host calls list for that view before displaying the dialog and uses the returned rows. Optional dynamic choices include an Unassigned/empty value; required ones do not. Failed form submissions reopen with the original values and error explanation so users can correct them.
