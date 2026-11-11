# Arya UI and motion library

Arya 1.2.0-alpha.4's JavaScript target includes a component library, browser state/actions, a motion engine, and a built-in preview with an implementation guide. No frontend packages, CDN assets, or browser source evaluation are required. These experimental APIs require compiler 1.2.0-alpha.4 or later.

The **1.3.0-alpha.4 source candidate** adds ten components, eight reusable sections, and four complete templates. See [sections and templates](ui-patterns.md) for contracts and customization. The new APIs require this candidate compiler; the older npm archive does not include them.

## Open the live library

From this repository:

```sh
npm run ui:preview
```

Open **http://127.0.0.1:3040**:

| Page | Contents |
| --- | --- |
| `/` | Live components, Preview/Arya tabs, copyable examples, forms, state, tables, dialogs, and feedback. |
| `/sections` | Eight reusable page sections, with live examples and copyable Arya code. |
| `/templates` | Four template cards linking to complete live pages and copyable calls. |
| `/templates/landing`, `/templates/dashboard`, `/templates/settings`, `/templates/sign-in` | Full-page template previews. |
| `/motion` | All 16 presets, replay, looping, pause/resume/cancel, stagger, sequences, parallel playback, and custom keyframes. |
| `/guide` | Ten implementation steps and the complete API reference. |

Stop with Control+C. After building, use `node fixtures/examples/ui-library/serve.mjs 4000` for another port. The preview is a local server; it does not publish a website. Its profile endpoint validates and echoes data without storing it.

You can serve the preview inside your own Arya application:

```arya
use std "ui" as ui
use std "web" as web

web.serve(3000, {
  "GET /ui/": fn() { return ui.preview({basePath: "/ui"}) },
  "GET /ui/motion": fn() { return ui.preview({section: "motion", basePath: "/ui"}) },
  "GET /ui/guide": fn() { return ui.preview({section: "guide", basePath: "/ui"}) }
}, {html: false, assets: false})
```

`ui.preview` is an explicit page renderer: it does not add routes automatically. Its default form demonstrates local state. Pass `apiPath: "/your/profile/endpoint"` to connect it to a same-origin POST route accepting `{name, email, plan, updates}`. The checked-in example demonstrates server validation.

## Implement an interface

```arya
use std "ui" as ui
use std "web" as web

fn page() {
  return ui.page({
    title: "Workspace",
    theme: "auto",
    state: {name: "", notifications: true, advanced: false},
    body: ui.stack([
      ui.heading("Your workspace"),
      ui.card([
        ui.field("Your name", ui.input({id: "name", bind: "name"}), {
          hint: "How you would like to be addressed."
        }),
        ui.switch("Notifications", {bind: "notifications"}),
        ui.button("More options", {
          action: ui.toggle("advanced"),
          "aria-expanded": ui.bind("advanced", false),
          "aria-controls": "advanced"
        }),
        ui.when("advanced", ui.text("Additional settings go here."), {id: "advanced"}),
        ui.button("Continue", {disabled: ui.is("name", "")})
      ], {animate: "rise"})
    ])
  })
}

web.serve(3000, {"GET /": page}, {html: false, assets: false})
```

Components execute on the server and render escaped HTML. The included controller updates text, control properties, conditional visibility, widgets, and motion in the browser. A state change does not rerun server-side Arya functions. Use ordinary Arya functions to create your own reusable components; use `ui.request` to reach server routes for Python/database work.

For new `ui` or `desktop` projects, packing the development compiler, and the shared Electron workflow, follow [the application setup guide](ui-apps.md).

## Component conventions

- Components accept normal HTML attributes using their HTML names: `id`, `class`, `aria-live`, `required`, `maxlength`, and so on. IDs must be unique.
- `ui.button` defaults to `type: "button"`. Use `type: "submit"` inside a form. Variants: `primary`, `secondary`, `ghost`, `danger`.
- Status tones: `neutral`, `success`, `warning`, `danger`, `info`.
- `ui.field` needs a control with an ID. It associates the label and any hint/error text through `for` and `aria-describedby`.
- Tables accept column definitions and row objects; values may be primitive text or composed components. Caption and column-header semantics are built in.
- Tabs require a stable group ID and distinct item IDs. Left/Right and Home/End move focus and activate tabs; disabled tabs are skipped.
- Accordions use native `details`/`summary`. To allow only one open item, provide an ID and `multiple: false`.
- Dialogs use native `showModal()`/`close()`, focus containment, Escape, and focus return. Create one with `ui.dialog`, then use `ui.open`/`ui.close` actions.
- Tooltips attach descriptions to a component and appear on hover or keyboard focus. Give the tooltip its own ID. Essential instructions should also be visible outside a tooltip.
- Toasts support dismiss buttons, a maximum of three visible items, and bounded duration. A zero duration keeps a toast until dismissed.
- Spinners expose a status label; skeletons are decorative. CSS animations and motion playback respect reduced motion. Applications still need an accessibility review for their own content and flows.

Raw HTML strings are displayed as text. Inline event attributes, raw style attributes, executable elements, unsafe URL schemes, and reserved `data-arya-*` attributes are rejected. Customize via `page.css` and normal component classes.

## State, conditions, and forms

`ui.bind("result.message", "Waiting…")` reads a state path and falls back only for null/missing values. It preserves zero, false, and empty text. `ui.is("plan", "team")` compares a binding to a finite primitive; `ui.not("expanded")` inverts truthiness. Conditions compose: `ui.not(ui.is("plan", "team"))`.

`ui.when(condition, children, props)` toggles the existing content's `hidden` property. It accepts a key string or a binding/condition. It does not create/destroy a component tree or run server closures.

Control bindings write top-level keys:

| Control | State value |
| --- | --- |
| Text input, textarea, select | Text; bound selects support a single value. |
| Number or range input | Finite number; empty/invalid number input becomes null. |
| Checkbox or switch | Boolean. |
| Radio | The selected option's string value; controls sharing `bind` form a group. |
| Password input | Browser-entered text; the initial binding must be empty. Never prepopulate a password in page state. |

File inputs do not use JSON state binding. A bind replaces a control's `value`/`checked` configuration; radio options additionally specify their own value. Initial select and textarea values render on the server as well as in the client.

Bindings also work for `disabled`, `hidden`, `checked`, `value`, `title`, and `aria-*`. Use explicit labels, visible focus, and live status regions for results.

Actions are descriptors: `ui.set`, `ui.toggle`, `ui.increment`, `ui.request`, `ui.open`, `ui.close`, `ui.toast`, `ui.theme`, `ui.copy`, and motion actions. A list runs sequentially; `ui.parallel(actions)` runs a group concurrently and drains it before reporting failure. Server functions cannot be passed as browser actions.

`ui.request` sends a JSON body with resolved bindings. It accepts GET/POST/PUT/PATCH/DELETE, a same-origin path, optional distinct `result`/`pending`/`error` state keys, and a 1–120,000 ms deadline (10 seconds by default). It rejects redirects and reports HTTP/network/JSON/deadline errors. Repeated actions on the same busy form or button are suppressed. Validate on the server with `web.route` and `validate`; browser constraints alone are insufficient. See the built-in guide's form/route examples.

`ui.copy` copies component text through the browser clipboard API, which requires HTTPS/localhost and permission. Code blocks remain selectable when clipboard access is denied. Themes last for the current page visit; no storage is written automatically.

## Motion

The component/action fragments below assume `use std "ui" as ui`. Place components in a page body and actions on a button/form; the complete interface example above shows the surrounding application.

Available presets:

`fade`, `rise`, `slide`, `scale`, `pulse`, `drop`, `slide-right`, `fade-out`, `zoom-out`, `bounce`, `shake`, `flip`, `spin`, `wiggle`, `blur`, `float`.

```arya
ui.card([
  ui.heading("Your report", {level: 2}),
  ui.text("Ready to explore.")
], {id: "report", animate: ui.motion("rise", {
  duration: 600, delay: 100, easing: "smooth", trigger: "visible"
})})
```

| Timing option | Default | Accepted values |
| --- | --- | --- |
| `duration` | 400 | Integer milliseconds, 0–60,000. |
| `delay` | 0 | Integer milliseconds, 0–60,000. |
| `stagger` | 0 | Integer milliseconds, 0–60,000; a positive value animates direct children with increasing delays. |
| `repeat` | 1 | Integer 1–100, or `"infinite"`; infinite playback requires positive duration. |
| `easing` | `"smooth"` | `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `smooth`, `snappy`. |
| `direction` | `"normal"` | `normal`, `reverse`, `alternate`, `alternate-reverse`. |
| `fill` | `"none"` | `none`, `forwards`, `backwards`, `both`. |
| `trigger` | `"load"` | `load`, `hover` (also focus), `press` (also Enter/Space), `visible` (first viewport entry). |

`animate` properties use triggers. Explicit `ui.animate(id, motion)` actions play immediately regardless of trigger. Target IDs omit `#`.

```arya
ui.row([
  ui.button("Play", {action: ui.animate("report", "rise")}),
  ui.button("Pause", {action: ui.pause("report")}),
  ui.button("Resume", {action: ui.resume("report")}),
  ui.button("Reset", {action: ui.cancel("report")})
])
```

Finite animation actions wait for completion by default, making sequences ordinary action lists. Use `{wait: false}` as the third argument for fire-and-continue playback. Infinite playback defaults to false and cannot be awaited. Starting a new animation on the same target replaces its previous group. Cancelled awaited motion stops the containing sequence. Cancel removes filled effects and restores the underlying styles. Filled effects remain controllable after completion.

```arya
ui.button("Play entrance", {action: [
  ui.animate("intro", "rise"),
  ui.parallel([
    ui.animate("cards", ui.motion("rise", {stagger: 80})),
    ui.animate("summary", "scale")
  ]),
  ui.toast("Ready.", {tone: "success"})
]})
```

Custom animations use 2–32 keyframe objects:

```arya
const entrance = ui.keyframes([
  {opacity: 0, transform: "translateY(24px) rotate(-3deg)"},
  {opacity: 1, transform: "translateY(0) rotate(0deg)"}
], {duration: 700, easing: "smooth"})

ui.button("Animate", {action: ui.animate("report", entrance)})
```

Allowed properties: `opacity`, `transform`, `filter`, `backgroundColor`, `color`, `borderRadius`, `boxShadow`, `letterSpacing`, `offset`. Opacity/offset are 0–1; explicit offsets must be ordered. CSS values are bounded strings without URL/declaration injection. This is a focused keyframe API, not an unrestricted CSS parser.

Playback uses the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API). It skips motion and cancels active/filled effects when [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) is requested. Sequences still advance when motion is skipped. Hidden content remains readable rather than depending on a finished entrance effect. Timeline editing, physics, canvas rendering, drag gestures, and automatic route transitions are not supplied.

## Themes and limits

Use `theme: "auto"`, `"light"`, or `"dark"` on `ui.page`; `ui.theme("toggle")` changes it from an action. Theme variables are `--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, and `--button-ink`. Add application CSS through `page.css` and component class attributes.

Page state is public JSON sent to the browser. Keep credentials and privileged work in server routes. State/action data rejects cycles, accessors, functions, nonfinite numbers, and prototype keys; it has a 1 MiB UTF-8 limit, a depth limit of 32, and 10,000-item bounds. Pages allow up to 10,000 rendered nodes and nesting depth 64. Tables allow up to 30 columns and 1000 rows. Action lists have depth/item limits. `$aryaBind` is reserved in action value templates.

Pages include a nonce-based script/style policy. Native [dialogs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) provide modal focus behavior; tabs follow the [WAI tab pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). These are component defaults, not a claim of application-wide accessibility or security certification.

## Verification

Run `npm run check` for runtime/component validation, initial HTML/escaping, guide compilation, reference coverage, routes, and existing language regressions. Optional real-runtime checks:

```sh
ARYA_TEST_BROWSER=/path/to/chrome node --test .build/tests/ui-library-browser.test.cjs
ARYA_TEST_ELECTRON=/path/to/electron node --test .build/tests/ui-desktop.test.cjs
```

Run `npm test` first to compile the test files. Chrome uses a temporary profile. The gallery test exercises tabs by keyboard, dialogs/focus/Escape, form submission, radio/select synchronization, range/progress, themes, copy actions with a test clipboard, sequences/cancellation/parallel playback, custom frames, reduced motion, mobile overflow, and CSP. No browser download occurs in these opt-in tests.

## API reference

The same catalog supplies the built-in guide and editor hints. All public functions are listed below.

### Layout

| API | Purpose |
| --- | --- |
| `ui.page({title, state, body, theme, css})` | Render a complete interactive HTML document. |
| `ui.preview({section, basePath, apiPath})` | Render the component gallery, motion lab, or implementation guide. |
| `ui.element(tag, props = {}, children = [])` | Compose an escaped semantic HTML element. |
| `ui.section(children, props = {})` | Group a semantic section with vertical spacing. |
| `ui.stack(children, props = {})` | Arrange components vertically. |
| `ui.row(children, props = {})` | Arrange a wrapping horizontal layout. |
| `ui.grid(children, props = {})` | Arrange responsive columns. |
| `ui.card(children, props = {})` | Create a padded, bordered surface. |
| `ui.divider(props = {})` | Separate content with a semantic horizontal rule. |

### Typography

| API | Purpose |
| --- | --- |
| `ui.heading(text, {level = 1, ...props})` | Create a heading from level 1 to 6. |
| `ui.text(value, props = {})` | Display escaped text, components, or a state binding. |
| `ui.link(label, href, props = {})` | Create a styled navigation link. |
| `ui.code(source, {language = "arya", ...props})` | Display escaped, selectable source code with Arya highlighting. |

### Forms

| API | Purpose |
| --- | --- |
| `ui.button(label, {variant, action, ...props})` | Primary, secondary, ghost, or danger button; defaults to type button. |
| `ui.input({type = "text", bind, ...props})` | Create an optionally bound input. |
| `ui.label(text, inputId)` | Associate a visible label with an input. |
| `ui.form(children, {action, ...props})` | Handle a form submit action with browser constraint validation. |
| `ui.select([{value, label}], {bind, ...props})` | Create a selection control. |
| `ui.textarea({rows = 4, bind, ...props})` | Create a multiline text control. |
| `ui.field(label, control, {hint, error, ...props})` | Compose an associated label, control, hint, and error. Control needs an id. |
| `ui.checkbox(label, {bind, ...props})` | Create a labelled boolean checkbox. |
| `ui.radio(label, value, {bind, ...props})` | Create a labelled radio choice; sharing bind creates a group. |
| `ui.switch(label, {bind, ...props})` | Create a labelled boolean switch. |
| `ui.slider({min = 0, max = 100, step = 1, bind, ...props})` | Create a numeric range input. |

### Data

| API | Purpose |
| --- | --- |
| `ui.badge(label, {tone = "neutral", ...props})` | Display a compact neutral/success/warning/danger/info label. |
| `ui.stat(label, value, {hint, ...props})` | Display a metric with an optional explanation. |
| `ui.avatar(initials, {label, ...props})` | Display initials with an accessible label. |
| `ui.progress(value, {max = 100, label, ...props})` | Display native determinate progress, optionally bound to state. |
| `ui.list(items, props = {})` | Display up to 1000 list items. |
| `ui.table([{key, label}], rows, {caption, empty, ...props})` | Render an accessible, horizontally scrollable data table. |

### Feedback

| API | Purpose |
| --- | --- |
| `ui.alert(title, message, {tone = "info", ...props})` | Display inline status or error feedback. |
| `ui.empty(title, message, action = null)` | Create an empty state with an optional action. |
| `ui.spinner({label = "Loading", ...props})` | Display an accessible busy indicator. |
| `ui.skeleton({lines = 3, ...props})` | Display a decorative loading placeholder. |
| `ui.tooltip(text, child, {id, ...props})` | Add hover/focus help and an accessible description. |
| `ui.toast(message, {tone = "neutral", duration = 3500})` | Action: show dismissible text feedback; duration 0 stays until dismissed. |

### Navigation

| API | Purpose |
| --- | --- |
| `ui.breadcrumbs([{label, href}], props = {})` | Render breadcrumb navigation with a current-page label. |
| `ui.tabs([{id, label, body, disabled}], {id, label, active})` | Render keyboard-accessible tabs with roving focus. |
| `ui.accordion([{title, body, open}], {multiple = true, ...props})` | Render native details/summary disclosure panels. |
| `ui.dialog(id, title, children, {description, ...props})` | Render a native modal dialog with an included close action. |

### Actions

| API | Purpose |
| --- | --- |
| `ui.open(dialogId)` | Action: open a native modal dialog. |
| `ui.close(dialogId)` | Action: close a dialog and restore focus. |
| `ui.copy(componentId)` | Action: copy component text on HTTPS/localhost, subject to clipboard permission. |
| `ui.theme("light" \| "dark" \| "auto" \| "toggle")` | Action: change the page theme for the current visit. |
| `ui.parallel(actions)` | Run actions concurrently and wait for them as a group. |

### State

| API | Purpose |
| --- | --- |
| `ui.bind(statePath, fallback = "")` | Read browser state, including dotted JSON result paths. |
| `ui.is(statePathOrBinding, primitive)` | Compare state without evaluating source strings. |
| `ui.not(statePathOrBinding)` | Invert a binding as a boolean. |
| `ui.when(condition, children, props = {})` | Show or hide existing components from a state condition. |
| `ui.set(key, value)` | Action: assign JSON data or a value containing bindings. |
| `ui.toggle(key)` | Action: toggle a boolean state value. |
| `ui.increment(key, step = 1)` | Action: add a finite number to numeric state. |
| `ui.request(path, {method, body, result, pending, error, timeoutMs})` | Action: call a same-origin JSON API with bounded time and busy/error state. |

### Motion

The component/action fragments below assume `use std "ui" as ui`. Place components in a page body and actions on a button/form; the complete interface example above shows the surrounding application.

| API | Purpose |
| --- | --- |
| `ui.presets()` | Return the available animation preset names. |
| `ui.motion(preset = "rise", timing = {})` | Create a preset animation with timing, trigger, repeat, and stagger controls. |
| `ui.keyframes(frames, timing = {})` | Create an animation from 2–32 validated keyframe objects. |
| `ui.animate(componentId, motion = "rise", {wait})` | Action: play/replay animation; await finite playback by default. |
| `ui.pause(componentId)` | Action: pause active animations for a target. |
| `ui.resume(componentId)` | Action: resume paused animations. |
| `ui.cancel(componentId)` | Action: cancel active/filled effects and restore underlying styles. |

### Additional components, sections, and templates (source candidate)

Requires 1.3.0-alpha.4. See [the complete contracts](ui-patterns.md).

| API | Purpose |
| --- | --- |
| `ui.container(children, {size = "lg", ...props})` | Center content with sm, md, lg, or full width. |
| `ui.buttonGroup(children, {label = "Actions", ...props})` | Group related actions with an accessible label. |
| `ui.image(src, alt, {caption, width, height, ...props})` | Render a responsive lazy-loaded image and optional caption. |
| `ui.descriptionList([{term, detail}], props = {})` | Render semantic labelled values. |
| `ui.timeline([{title, body, time}], props = {})` | Render an ordered activity timeline. |
| `ui.steps([{title, description}], {current = 0, label, ...props})` | Display a zero-based current step; navigation stays with the application. |
| `ui.pagination([{label, href, current, disabled}], {label, ...props})` | Render page links with current-page and disabled semantics. |
| `ui.segmented([{value, label, disabled}], {id, bind, label, ...props})` | Render a labelled native radio group bound to a state key. |
| `ui.search({id, bind, label = "Search", placeholder, ...props})` | Render a labelled search input with an optional state-clearing action. |
| `ui.meter(value, {min = 0, max = 100, low, high, optimum, label, ...props})` | Display a native measurement, optionally bound to state. |
| `ui.navbar({brand, href, links, actions, label, ...props})` | Compose a responsive brand, navigation links, and actions. |
| `ui.hero({eyebrow, title, description, actions, media, align, ...props})` | Create a landing introduction with optional media. |
| `ui.features([{title, description, icon}], {title, description, ...props})` | Compose a responsive feature-card section. |
| `ui.pricing([{title, price, interval, description, features, action, highlighted}], options = {})` | Compose pricing cards; checkout belongs to the application. |
| `ui.testimonials([{quote, name, role, initials}], options = {})` | Compose attributed quotes and optional avatars. |
| `ui.faq([{question, answer, open}], {title, description, id, multiple, ...props})` | Compose a heading and native disclosure answers. |
| `ui.cta({title, description, actions, ...props})` | Compose a call-to-action surface. |
| `ui.footer({brand, description, links, copyright, label, ...props})` | Compose footer navigation and attribution. |
| `ui.templates()` | List the available full-page template names. |
| `ui.template(name, options = {})` | Render a customizable landing, dashboard, settings, or sign-in page. |
