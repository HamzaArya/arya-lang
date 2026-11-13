# Direct native GUI

`use std "gui" as gui` creates OS widgets directly from Arya. Business logic,
state and the asynchronous event loop stay in the compiled Arya executable.
There is no browser, HTTP server, WebKit, JavaScript renderer or subprocess
application host in this path. The older `std desktop` webview API remains
available separately for compatibility.

## Build and run

```sh
make native native-gui
./bin/arya run native/examples/native-task-desk.arya
# Or create a new direct-native order-total project:
./bin/arya create my-native-app --template native-gui
./bin/arya run my-native-app/main.arya
```

The example is a native task editor with search, title/notes editing, completion,
explicit saving, confirmed deletion and validated JSON persistence. It writes
`native-task-desk.json` in the working directory; set `DATA_FILE` to choose a
file. Save errors appear in the window and do not replace the in-memory task
list. Corrupt or non-regular storage fails at startup. Run one instance per data
file; this example does not implement multi-process editing or autosave.

| Backend | Build prerequisite | Qualification |
| --- | --- | --- |
| macOS AppKit | Xcode command-line tools, Cocoa system framework | Full native SDK and direct GUI gate passed on macOS 15 ARM64 in [run 43470021848](https://github.com/HamzaArya/arya-lang/actions/runs/43470021848) |
| Linux GTK 3 | C11 compiler, `pkg-config`, GTK 3 development files (`libgtk-3-dev` on Debian/Ubuntu), graphical display | Native GTK library compiled in the Linux SDK; final direct GUI execution gate pending |
| Windows Win32 | Cygwin with `gcc-core`/`gcc-g++`; Windows system GUI libraries | Direct Win32 action probe and SDK bootstrap passed on Windows; full public GUI/distribution gates pending. Cygwin remains required |

`make native-sdk` includes the native GUI archive and platform linker flags.
GTK applications need the matching GTK runtime libraries on the destination.
Windows/Cygwin applications need the Cygwin runtime in addition to the system
Win32 libraries. Missing GUI SDK files produce an explicit compiler error.

## API

```arya
use std "gui" as gui
const window = gui.window({title: "Counter", width: 480, height: 260})
window.add({id: "count", type: "label", text: "0", x: 24, y: 24, width: 400, height: 28})
window.add({id: "increment", type: "button", text: "Add one", x: 24, y: 72, width: 160, height: 36})
let count = 0
while true {
  const event = await window.nextEvent()
  if event == null or event.type == "close" { break }
  if event.id == "increment" and event.type == "click" {
    count += 1
    window.set("count", {text: str(count)})
  }
}
window.close()
```

`gui.platform()` returns `appkit`, `gtk3` or `win32` without opening a window.
`gui.window(options?)` defaults to title `Arya` and content size 800×600. Width
must be 240–8192 and height 160–8192. Native windows are resizable. Calls belong
on the process GUI thread; Arya's cooperative tasks share that thread.

`window.add(spec)` requires `id`, `type`, `x`, `y`, `width`, `height`. IDs are
1–64 ASCII letters, digits, underscores or hyphens and must be unique within a
window. Coordinates start at the top left of the content area; x/y are 0–16384,
width/height 1–16384. Geometry uses each toolkit's logical coordinate units;
font metrics and native control minimum sizes vary between OSes.

| Type | Properties | User events |
| --- | --- | --- |
| `label` | `text` | none |
| `button` | `text` | `click` |
| `input` | `text` | `change`, Enter produces `submit` |
| `textarea` | `text` | `change`; Enter inserts a newline |
| `checkbox` | `text`, `checked` | `change` |
| `select` | `items`, `index` | `change` |
| `list` | `items`, `index` | `change` |
| `progress` | `value` (finite number 0–1) | none |

All controls accept `enabled` (default true). Text defaults to empty;
checkboxes default to unchecked, progress to zero, and lists/selects to no
selection. `items` is an array of at most 1000 strings, each at most 1024 UTF-16
units. Duplicate labels remain distinct by zero-based `index`. Index -1 means
no selection. Replacing `items` clears selection unless the same call supplies
an `index`. Titles are bounded at 1024 UTF-16 units, control text at 16384.
Native editing/paste truncates at the text limit. Embedded NUL is rejected.

`window.set(id, patch)` changes allowed properties for that control. A geometry
change supplies all four geometry fields. Every field is validated before any
widget is changed; invalid combinations throw and preserve the previous state.
Programmatic changes do not generate user `change` events.

`window.get(id)` returns `{text, checked, index, value, width, height}`. Only
properties meaningful for that control carry data; index defaults to -1 and
checked/value to false/zero. Selected list/select text is returned in `text`.
Native multiline text can contain platform-specific CRLF; normalize when
storing a cross-platform newline convention.

`await window.nextEvent()` pumps native OS events cooperatively and returns
`{type, id, text, checked, index, value, width, height}`. `click`, `change` and
`submit` identify their control. `resize` and `close` have an empty id; resize
width/height describe content dimensions. The state is a snapshot when the
event was queued; use `get` for current state. Closing the window produces one
`close` event, then `null` after queued events drain. `close()` is idempotent;
control operations on a closed window throw `GuiError`.

Each window permits one waiting `nextEvent` call. An event loop must continue
pumping for responsive controls. Long synchronous calculations should yield or
run outside the UI process. Adjacent `change`/`resize` observations for the same
control may coalesce. A full 256-event queue rejects new events and the next
poll throws `GuiError`; read current control state before resuming. This makes
missed events visible. Disposal closes windows and frees queues/controls.

## Bounded scope and testing

The first direct API provides eight controls and explicit layout. It does not
provide browser rendering, declarative layout, multicolumn tables, file-picker
APIs, custom drawing, rich text, drag/drop or application menu customization.
Native accessibility behavior is inherited from the OS controls; exhaustive
screen-reader and high-DPI qualification is not claimed by the local tests.

```sh
make native-gui-test
# Linux CI with a virtual graphical display:
xvfb-run -a sh native/tests/gui.sh
```

The gate checks public types, creates all eight real controls, exercises native
state, Unicode, duplicate labels, invalid mutation preservation and lifecycle
under GC stress. On macOS it also invokes actual AppKit button/input/select/
textarea actions in a native harness. A harness action is automated testing,
not a claim of human user testing. See [the implementation report](native-gui-report.md).
