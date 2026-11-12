# UI components, sections, and templates

These additions require the **1.3.0-alpha.4 source candidate**. Build this checkout or install its matching archive; the published 1.2.0-alpha.4 npm package contains the original UI library. See [candidate setup](node-runtime.md#try-the-candidate).

Components are small building blocks, sections combine them into reusable parts of a page, and templates return complete HTML documents. They share the existing light/dark/auto themes, escaped rendering, state/actions, and motion API. No frontend dependency or CDN is added.

## Explore and copy

Run `npm run ui:preview` and open **http://127.0.0.1:3040**. The `/` gallery includes the new controls; `/sections` shows eight sections with Preview/Arya tabs; `/templates` links to four live pages with copyable calls. `/guide` includes implementation steps and the complete reference.

Live templates: `/templates/landing`, `/templates/dashboard`, `/templates/settings`, and `/templates/sign-in`. The preview server explicitly registers these routes. `ui.preview` and `ui.template` render pages; they do not register routes in your application.

## Compose a page from sections

```arya
use std "ui" as ui
use std "web" as web

fn home() => ui.page({
  title: "My workspace",
  body: ui.stack([
    ui.navbar({brand: "My workspace", href: "/", links: [
      {label: "Features", href: "#features"}
    ]}),
    ui.hero({
      eyebrow: "MAKE ROOM FOR GOOD WORK",
      title: "Bring your projects together.",
      description: "A clear place to start your next idea.",
      actions: [ui.link("Explore features", "#features")],
      animate: ui.motion("rise", {duration: 500})
    }),
    ui.features([
      {title: "One workspace", description: "Keep the work together.", icon: "01"},
      {title: "Useful defaults", description: "Start with the parts you need.", icon: "02"}
    ], {id: "features", title: "Built around your work."}),
    ui.faq([{question: "Can I customize it?", answer: "Yes. Use normal Arya components."}]),
    ui.cta({title: "Ready to begin?", actions: [ui.link("Contact us", "mailto:hello@example.com")]}),
    ui.footer({brand: "My workspace", copyright: "Your team · Your work"})
  ])
})

web.serve(3000, {"GET /": home}, {html: false, assets: false})
```

Sections accept ordinary HTML props such as `id`, `class`, and `animate` alongside their content options. Navbar/footer links are `{label, href, current?, disabled?}`. Actions are ordinary components such as `ui.button` or `ui.link`. Hero alignment is `left` or `center`; `media` accepts a component. Feature icons are text or components, not icon-library names.

Pricing cards contain `{title, price, interval?, description?, features?, action?, highlighted?}`. Price is display content; it does not start a checkout. Testimonials contain `{quote, name, role?, initials?}`; provide your own real attributed quotes. FAQ items contain `{question, answer, open?}`; options `id` and `multiple: false` enable an exclusive accordion. The gallery's prices, identities, and quotes are examples.

## Start with a complete template

```arya
use std "ui" as ui
use std "web" as web

web.serve(3000, {
  "GET /": fn() => ui.template("dashboard", {
    brand: "My workspace",
    heading: "Your work, at a glance.",
    metrics: [{label: "Open tasks", value: 12, hint: "Across your team"}],
    rows: [{name: "Website", owner: "Design", status: "In progress"}],
    activity: [{title: "Project created", time: "Today", body: "Ready for the next step."}]
  })
}, {html: false, assets: false})
```

`ui.templates()` returns a fresh list of template names. `ui.template(name, options)` returns a complete document; serve it directly rather than nesting it in `ui.page`.

All templates accept `brand`, `title`, `description`, `theme`, `lang`, `css`, `nonce`, `state`, and `body`. Brand must be nonempty text. `body` appends components after the template content (before the landing footer). `state` merges with fresh template defaults on each render. Existing state/escaping/ID limits apply; unknown template options produce `ARYA_UI`.

| Template | Additional options |
| --- | --- |
| `landing` | `nav`, `hero`, `features`, `pricing`, `testimonials`, `faq`, `cta`, `footer`. Nav/hero/footer objects override their section defaults; the other list options replace their sample items. Testimonials and CTA are rendered when supplied. |
| `dashboard` | `heading`, `navigation`, `actions`, `metrics`, `columns`, `rows`, `activity`. Metrics use `{label, value, hint?}`; table columns/rows and timeline activity use the component contracts. Pass empty rows for the table's empty state. |
| `settings` | `heading`, `submitAction`. Default state: `{name: "", email: "", notifications: true}`. |
| `sign-in` | `heading`, `submitAction`, `helpHref`. Default state: `{email: "", password: "", remember: false}`. Password state must start empty. |

Settings and sign-in display optional `result.message` and `problem` state values. In a route handler with `use std "ui" as ui` imported, return the following template and implement its same-origin POST endpoint:

```arya
ui.template("settings", {
  state: {name: "Samira", email: "samira@example.com", notifications: true},
  submitAction: ui.request("/api/profile", {
    method: "POST",
    body: {name: ui.bind("name"), email: ui.bind("email"), notifications: ui.bind("notifications")},
    result: "result", error: "problem"
  })
})
```

The default submit actions show explicit preview notifications. They do not save settings or authenticate users. Your application implements authentication, sessions, authorization, persistence, billing, and API validation. For sign-in, a custom request body can read `email`, `password`, and `remember`; use HTTPS in deployment and keep credentials out of initial page state and logs. [Server routes and validation](services.md) and [UI actions](ui-library.md#state-conditions-and-forms) explain integration.

## Additional components

| Component | Contract |
| --- | --- |
| `ui.container(children, {size})` | Center content at `sm` (32rem), `md` (48rem), `lg` (68rem, default), or `full`. Width remains constrained by the page/parent. |
| `ui.buttonGroup(children, {label})` | Wrap related actions in a labelled group. Label defaults to Actions. |
| `ui.image(src, alt, {caption, width, height, ...props})` | Responsive, lazy-loaded image with an optional caption. Explicit alt text is required; use empty text for decoration. Optional intrinsic dimensions are integers 1–20,000. Props apply to the image. Serve the asset yourself; existing URL/CSP rules apply. |
| `ui.descriptionList([{term, detail}], props)` | Semantic description list, up to 100 entries. Values can be components. |
| `ui.timeline([{title, body, time}], props)` | Ordered activity, up to 100 entries; body/time are optional display content. |
| `ui.steps([{title, description}], {current, label})` | One to 20 steps, zero-based current index. This is a progress display; your application controls navigation and validation. |
| `ui.pagination([{label, href, current, disabled}], {label})` | Up to 50 application-provided page links; at most one current item. Disabled items render noninteractive text. It does not fetch or split data. |
| `ui.segmented([{value, label, disabled}], {id, bind, label})` | One to 20 unique string choices in a labelled native radio group. Requires a group ID and a top-level state key. Native radio keyboard navigation applies; disabled choices are skipped. |
| `ui.search({id, bind, label, placeholder, ...props})` | A visible label and search input; binding adds a Clear action. Filtering/request behavior belongs to the application. |
| `ui.meter(value, {min, max, low, high, optimum, label})` | A native measurement, default range 0–100. Static values/thresholds must be finite and within range; low cannot exceed high. A state binding is accepted for value; the browser clamps it to the meter's range. Use progress for task completion. |

Steps, sections, and composed controls wrap on small screens. Themes, visible focus, native controls, and existing reduced-motion behavior are preserved. Test your own content, keyboard flow, routes, and deployed accessibility requirements.
