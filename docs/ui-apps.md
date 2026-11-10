# Arya UI applications

Arya 1.2.0-alpha.4 includes `use std "ui"` for the JavaScript target. Write styled components, browser state, form actions, JSON requests, and animation presets in `.arya`. Use the same interface as a web application or in an optional Electron desktop window.

These experimental APIs require 1.2.0-alpha.4 or later. The existing HTML/CSS/JavaScript `web` starter remains available for applications that need their own frontend framework or browser code.

For the full component and animation library, run `npm run ui:preview` and open **http://127.0.0.1:3040**. The preview has live examples, a motion lab, and an embedded implementation guide. See the [full library reference](ui-library.md) for tabs, dialogs, tables, feedback, conditional bindings, playback controls, custom keyframes, and all public APIs. `ui.preview()` also renders the preview pages inside an Arya app.

## Create an app

Create an app directly from npm:

```sh
npm create arya-language@latest my-ui -- --template ui
cd my-ui
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. The starter includes an estimate calculator with a bound form, server validation, a JSON endpoint, loading/error state, and entrance animations. No frontend package or bundler is required. Restart after editing source; hot reload is not included.

Use `--template desktop` instead of `--template ui` to generate an Electron application. `npm run dev` builds Arya and opens its window. `npm run web` starts the same app in a browser. The desktop starter pins Electron, which downloads its platform binary on installation or first use. It requires a desktop environment. Node.js 22.15 or later is required for the creator and compiler.

The templates pin the matching compiler from npm. For offline use, pass `--compiler /path/to/arya-language-1.2.0-alpha.4.tgz`; the creator checks its UI capability metadata and copies it to `vendor/`. Electron still needs its own package and platform binary. Keep the generated lockfile.

To try the checked-in example without creating a project, see [the example](../fixtures/examples/ui/README.md).

## A small interactive app

```arya
use std "web" as web
use std "ui" as ui

fn counter() {
  return ui.page({
    title: "My counter",
    state: {count: 0},
    body: ui.card([
      ui.heading("An app in Arya"),
      ui.text(ui.bind("count"), {role: "status", "aria-live": "polite"}),
      ui.row([
        ui.button("Add one", {action: ui.increment("count")}),
        ui.button("Reset", {variant: "secondary", action: ui.set("count", 0)})
      ])
    ], {animate: "rise"})
  })
}

web.serve(3000, {"GET /": counter}, {html: false, assets: false})
say("Open http://127.0.0.1:3000")
```

Components run on the server and produce HTML. A small included browser controller handles state and actions. Each page load receives an independent copy of state; state updates do not rerun Arya functions. Bindings update text and control properties without replacing the DOM or evaluating source strings. Page state is public browser data: keep database credentials and Python/database operations in server routes.

## Components and layout

| Function | Purpose |
| --- | --- |
| `ui.page({title, description, lang, theme, state, body, css, nonce})` | Complete HTML document; `theme` is `auto` (default), `light`, or `dark`. |
| `ui.stack(children, props)` | Vertical layout. |
| `ui.row(children, props)` | Wrapping horizontal layout. |
| `ui.grid(children, props)` | Responsive columns that collapse on narrow screens. |
| `ui.card(children, props)` | Bordered panel with vertical spacing. |
| `ui.heading(text, {level: 1, ...props})` | Semantic heading, levels 1–6. |
| `ui.text(value, props)` | Paragraph containing escaped text, components, or a binding. |
| `ui.button(label, {variant: "primary", action, ...props})` | Button; variant can be `secondary`; default type is `button`. |
| `ui.label(text, inputId)` | Label with a `for` association. |
| `ui.input({type: "text", bind, ...props})` | Form input with optional two-way binding. |
| `ui.select([{value, label}], {bind, ...props})` | Selection control. |
| `ui.form(children, {action, ...props})` | Form with a submit action and native browser constraint validation. |
| `ui.element(tag, props, children)` | Supported semantic HTML tags, including lists, tables, textarea, details, and progress. |

`props` accept HTML attribute names such as `id`, `class`, `required`, `min`, `aria-live`, and `data-*`. `animate` and `action` are declarative descriptors. Inline event attributes, raw style attributes, executable elements, and unsafe URL schemes are rejected. Raw HTML strings are displayed as text. Use `ui.element` to compose reusable components in ordinary Arya functions.

The built-in stylesheet includes `arya-muted` and `arya-eyebrow` classes. Customize the page with `css`, a trusted CSS string, and the variables `--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, and `--button-ink`. Closing style tags are rejected. Labels, semantic elements, visible keyboard focus, responsive layouts, and reduced-motion defaults are included; applications still need their own accessibility review.

## State and form actions

`ui.bind("name", fallback)` reads state and keeps text synchronized. Dotted paths such as `ui.bind("result.message", "Waiting…")` read nested JSON results. Defaults apply to null/missing values and preserve `0`, `false`, and empty text.

`ui.input({bind: "name"})`, `ui.select(..., {bind: "name"})`, and `ui.element("textarea", {bind: "name"})` update a top-level state key. Number and range inputs produce numbers, or null for empty/invalid values. Checkboxes produce booleans. Radio controls share a selected string value. Password bindings must start empty. File inputs cannot use JSON binding. Do not provide both `bind` and `value`/`checked` on a control.

Bindings also work on `value`, `checked`, `disabled`, `hidden`, `title`, and `aria-*` properties. Element IDs are static and unique. Use `role="status"` and `aria-live="polite"` for asynchronous results.

Actions run after a button click or form submission:

- `ui.set("name", value)` assigns JSON data or a value containing bindings.
- `ui.increment("count", step)` adds a finite number; step defaults to 1.
- `ui.toggle("expanded")` toggles a boolean value.
- A list, such as `[ui.set("count", 0), ui.set("message", "Reset")]`, executes sequentially and stops after a failed request or cancelled awaited animation.
- `ui.request(path, options)` calls a same-origin JSON endpoint.

Actions are data, not server closures. Passing `fn() { ... }` as an action produces `ARYA_UI`. Put server logic behind a route and call it with a request:

```arya
ui.form([
  ui.label("Hours", "hours"),
  ui.input({id: "hours", type: "number", min: 0, required: true, bind: "hours"}),
  ui.button("Calculate", {type: "submit", disabled: ui.bind("busy", false)}),
  ui.text(ui.bind("result.message", "Waiting…"), {role: "status", "aria-live": "polite"}),
  ui.text(ui.bind("problem"), {role: "alert"})
], {action: ui.request("/api/calculate", {
  method: "POST",
  body: {hours: ui.bind("hours")},
  result: "result",
  pending: "busy",
  error: "problem",
  timeoutMs: 10000
})})
```

Request methods: `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE`. GET has no body. Request bodies resolve bindings at the time of the action and are encoded as JSON. `result`, `pending`, and `error` name distinct top-level state keys. Pending/error handling is optional. HTTP failures, invalid JSON, network errors, and deadlines produce an error message; pending state clears in all cases. Without an error key, an included `role="alert"` region displays failures. The default deadline is 10 seconds, configurable from 1–120,000 ms. Requests use same-origin credentials, reject redirects, and suppress repeat actions on the same busy control/form. Cancellation stops the fetch; server work should honor `request.signal`.

Browser constraints improve usability; validate API input on the server with `web.route` and `validate`. The starter demonstrates both. Use the existing [async Python](python-async.md) and [MySQL](mysql.md) APIs inside those routes. The UI does not import Python, database drivers, or Node into the browser.

## Animations

Add `{animate: "rise"}` to any component. Core presets include `fade`, `rise`, `slide`, `scale`, and `pulse`; `ui.presets()` lists all 16 available names. To change timing:

```arya
ui.card([
  ui.heading("Your report", {level: 2}),
  ui.text("Ready to share.")
], {animate: ui.motion("rise", {duration: 500, delay: 120, repeat: 1})})
```

Durations and delays are integer milliseconds from 0–60,000; repeats are 1–100 or "infinite". The library also includes custom keyframes, triggers, stagger, sequences, and playback controls; see the full library reference. Animations run on page initialization using the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate). They are skipped when reduced motion is requested, and active animations cancel if that preference changes. This follows the browser's [reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion). No animation package is required. Timeline editing, physics, drag interactions, and route transitions are outside this initial API.

## Desktop behavior and distribution

The desktop entry imports the compiled Arya module, starts its exported `start(0)` on loopback with an ephemeral port, and loads that origin in a native Electron window. It disables Node integration, enables context isolation and renderer sandboxing, denies new windows/permissions, and blocks navigation away from the app origin. These choices follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). No preload bridge or arbitrary IPC interface is added. Privileged work stays behind validated Arya server routes. The local HTTP service is still reachable by other processes on the same machine; applications with sensitive operations need authentication and authorization appropriate to their data.

Closing the window quits the app on all platforms. The wrapper calls the exported `stop(server)`, which drains HTTP work using `web.shutdown` with a five-second deadline. Extend that function to close Python clients, database pools, or other resources through the shutdown cleanup hook as your app grows. The template uses no such resources by default.

`npm run build` compiles Arya; it does **not** create a desktop installer. OS installers, icons, code signing, notarization, auto-updates, and cross-platform packaging require a separate distribution setup. Keep Electron current before distributing. The starter runs the Arya backend on Node.js inside Electron. It is a desktop application workflow; operating-system installers remain a separate packaging step.

Pages carry a nonce-based Content Security Policy for their included scripts and styles. Text, attributes, and embedded state are escaped. State/action JSON rejects cycles, functions, accessors, nonfinite numbers, and prototype keys, with depth/item/size limits. `$aryaBind` is reserved in action JSON templates. These guardrails do not replace application authorization, route validation, or review of custom CSS and content.

## Verification

`npm run check` tests rendering, escaping, data bounds, state/actions, request errors, reduced motion, and scaffolding. Optional integration checks use installed runtimes and temporary profiles:

```sh
ARYA_TEST_BROWSER=/path/to/chrome node --test .build/tests/ui-browser.test.cjs
ARYA_TEST_ELECTRON=/path/to/electron node --test .build/tests/ui-desktop.test.cjs
```

Run `npm test` first to compile these test files. Neither opt-in test downloads a runtime. The browser check exercises the generated form and real Arya routes under CSP; the desktop check verifies renderer isolation, navigation/window restrictions, the form, and server shutdown.
