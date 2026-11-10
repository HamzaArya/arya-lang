import {uiPatternPreviewRuntime} from './ui-pattern-preview.js';
import { uiCatalog } from '../ui-catalog.js';

/** These are executable Arya examples as well as the guide's copyable source. */
export const uiGuideExamples = [
  {title: '1. Import the library and serve a page', text: 'A page is an ordinary Arya value. Each visitor receives an independent copy of its initial state.', code: `use std "ui" as ui
use std "web" as web

fn page() {
  return ui.page({
    title: "My first app",
    state: {count: 0},
    body: ui.card([
      ui.heading("Hello, Arya."),
      ui.text(ui.bind("count"), {role: "status", "aria-live": "polite"}),
      ui.button("Add one", {action: ui.increment("count")})
    ])
  })
}

web.serve(3000, {"GET /": page}, {html: false, assets: false})`},
  {title: '2. Compose reusable components', text: 'Use ordinary functions to build your own components. Layouts wrap and grids collapse automatically on smaller screens.', code: `fn metric(label, value) {
  return ui.card([
    ui.stat(label, value, {hint: "Updated just now"}),
    ui.badge("Healthy", {tone: "success"})
  ])
}

ui.grid([
  metric("Active projects", 12),
  metric("Completed tasks", 48)
])`},
  {title: '3. Bind inputs and conditional content', text: 'Declare name and advanced in page state. Bindings update existing controls and text; conditions do not execute browser source strings.', code: `ui.stack([
  ui.field("Your name", ui.input({id: "name", bind: "name"}), {
    hint: "This value stays in your browser."
  }),
  ui.text(ui.bind("name", "Guest")),
  ui.switch("Advanced options", {bind: "advanced"}),
  ui.when("advanced", ui.text("More options are visible.")),
  ui.button("Continue", {disabled: ui.is("name", "")})
])`},
  {title: '4. Send form data to an API', text: 'Set initial state to {name: "", busy: false, result: null, problem: ""}. Forms use native constraint validation before running the submit action.', code: `ui.form([
  ui.field("Name", ui.input({id: "profile-name", bind: "name", required: true})),
  ui.button("Save profile", {type: "submit", disabled: ui.bind("busy", false)}),
  ui.text(ui.bind("result.message", "Ready to save."), {role: "status", "aria-live": "polite"}),
  ui.text(ui.bind("problem"), {role: "alert"})
], {action: ui.request("/api/profile", {
  method: "POST", body: {name: ui.bind("name")},
  result: "result", pending: "busy", error: "problem"
})})`},
  {title: '5. Validate on the server', text: 'Keep Python, database access, and credentials on the server. Put this route alongside your page route; a UI request sends JSON to it. The example echoes a result and does not persist data.', code: `use std "web" as web
use std "validate" as validate

const profile = validate.object({name: validate.string({min: 1, max: 80, trim: true})})
web.serve(3000, {
  "POST /api/profile": web.route(fn(request) {
    return {message: "Saved for " + request.body.name}
  }, {body: profile})
}, {html: false, assets: false})`},
  {title: '6. Add motion and playback controls', text: 'A component can animate on load, hover/focus, press, or first visibility. Finite animate actions wait for completion by default. Infinite motion defaults to wait:false.', code: `ui.stack([
  ui.card([ui.heading("Your report", {level: 2})], {
    id: "report", animate: ui.motion("rise", {duration: 600, trigger: "visible"})
  }),
  ui.row([
    ui.button("Replay", {action: ui.animate("report", "rise")}),
    ui.button("Pause", {action: ui.pause("report")}),
    ui.button("Resume", {action: ui.resume("report")}),
    ui.button("Reset", {action: ui.cancel("report")})
  ])
])`},
  {title: '7. Compose keyframes, sequences, and parallel motion', text: 'An action list runs in order. parallel runs a group together. Cancelling awaited motion stops the containing sequence. Stagger applies to a target’s direct children.', code: `const lift = ui.keyframes([
  {opacity: 0, transform: "translateY(24px) rotate(-3deg)"},
  {opacity: 1, transform: "translateY(0) rotate(0deg)"}
], {duration: 700, easing: "smooth"})

ui.button("Play sequence", {action: [
  ui.animate("intro", lift),
  ui.parallel([
    ui.animate("cards", ui.motion("rise", {stagger: 90})),
    ui.animate("summary", "scale")
  ]),
  ui.toast("Ready to explore.", {tone: "success"})
]})`},
] as const;

const previewStyles = String.raw`
main.arya-page { width:100%; max-width:none; padding:0; } .kit-shell { display:grid; grid-template-columns:235px minmax(0,1fr); min-height:100vh; } .kit-sidebar { position:sticky; top:0; height:100vh; padding:2rem 1.65rem; border-right:1px solid var(--line); display:flex; flex-direction:column; gap:2rem; background:var(--surface); } .kit-brand { font-size:1.7rem; font-weight:780; letter-spacing:-.09em; text-decoration:none; color:var(--ink); } .kit-brand span { color:var(--accent); } .kit-brand small { margin-left:.8rem; font-size:.7rem; letter-spacing:0; font-weight:500; color:var(--muted); } .kit-nav { display:flex; flex-direction:column; gap:.35rem; } .kit-nav a { display:block; padding:.65rem .8rem; border-radius:.4rem; color:var(--muted); text-decoration:none; font-size:.85rem; } .kit-nav a[aria-current="page"] { color:var(--ink); background:var(--bg); font-weight:650; } .kit-sidebar .kit-bottom { margin-top:auto; font-size:.72rem; color:var(--muted); } .kit-content { width:100%; max-width:1240px; margin:0 auto; padding:2rem clamp(1.25rem,4vw,4.5rem) 5rem; min-width:0; } .kit-top { justify-content:space-between; padding-bottom:2.2rem; border-bottom:1px solid var(--line); margin-bottom:3rem; } .kit-top button { font-size:.75rem; padding:.45rem .7rem; } .kit-hero { gap:1.4rem; margin-bottom:3rem; } .kit-hero h1 { font-size:clamp(2.5rem,5.2vw,4.6rem); font-weight:550; max-width:18ch; line-height:1.06; } .kit-hero>p { max-width:44rem; font-size:.95rem; } .kit-summary { grid-template-columns:repeat(3,minmax(0,1fr)); padding:1.5rem 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); margin-bottom:3rem; } .kit-summary .arya-stat-value { font-size:1.65rem; } .kit-summary .arya-muted { font-size:.75rem; } .kit-section { gap:1.4rem; margin-bottom:2.5rem; scroll-margin-top:2rem; } .kit-section>h2 { font-size:1.8rem; font-weight:550; } .kit-demo { padding:1.5rem; min-width:0; background:var(--surface); } .kit-demo>h3 { font-size:1rem; font-weight:650; letter-spacing:-.02em; margin:0; } .kit-demo>p { font-size:.8rem; } .kit-demo .arya-tabs { margin-top:.25rem; } .kit-demo [role="tabpanel"] { padding:.5rem 0; } .kit-example-head { justify-content:space-between; } .kit-example-head button { padding:.3rem .65rem; font-size:.7rem; } .kit-example-head small { color:var(--muted); font: .7rem ui-monospace,monospace; } .kit-live { min-height:8rem; justify-content:center; } .kit-counter { font-size:2.5rem; font-weight:600; font-variant-numeric:tabular-nums; } .kit-motion-grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr)); } .kit-motion-card { padding:1.1rem; } .kit-motion-stage { display:flex; align-items:center; justify-content:center; height:9rem; border:1px solid var(--line); border-radius:.65rem; background:var(--bg); overflow:hidden; } .kit-motion-object { display:flex; align-items:center; justify-content:center; width:3.6rem; height:3.6rem; border-radius:1rem; background:var(--accent); color:var(--button-ink); font-size:1.8rem; font-weight:750; letter-spacing:-.1em; box-shadow:0 .5rem 1.5rem #0001; } .kit-motion-label { justify-content:space-between; } .kit-motion-label strong { font-size:.85rem; } .kit-motion-card button { padding:.45rem .7rem; font-size:.75rem; } .kit-transport { padding:1.25rem; border:1px solid var(--line); border-radius:.75rem; } .kit-orbit { display:flex; align-items:center; justify-content:center; width:5rem; height:5rem; border:1px solid var(--accent); border-radius:1.25rem; color:var(--accent); font-size:2.5rem; margin:1rem auto; } .kit-stagger { display:grid; grid-template-columns:repeat(4,1fr); gap:.7rem; } .kit-stagger>div { border-radius:.5rem; padding:1rem; text-align:center; background:var(--accent); color:var(--button-ink); font-size:.75rem; font-weight:650; } .kit-guide-step { margin-bottom:1.5rem; } .kit-guide-step>h2 { font-size:1.3rem; letter-spacing:-.025em; } .kit-guide-step>p { font-size:.9rem; max-width:50rem; } .kit-guide-nav { display:flex; gap:.75rem; flex-wrap:wrap; margin:1rem 0 2rem; font-size:.8rem; } .kit-guide-nav a { color:var(--muted); } .kit-reference th,.kit-reference td { font-size:.75rem; } .kit-reference td:nth-child(2) { font-family:ui-monospace,monospace; } .kit-reference .arya-badge { font-size:.65rem; } .kit-footer { margin-top:4rem; padding-top:1.25rem; border-top:1px solid var(--line); justify-content:space-between; color:var(--muted); font-size:.7rem; }
@media(max-width:900px) { .kit-shell { grid-template-columns:190px minmax(0,1fr); } .kit-sidebar { padding:1.5rem 1rem; } .kit-content { padding-left:1.5rem; padding-right:1.5rem; } }
@media(max-width:680px) { .kit-shell { display:block; } .kit-sidebar { position:static; height:auto; padding:1rem 1.25rem; border-right:0; border-bottom:1px solid var(--line); gap:.8rem; } .kit-nav { flex-direction:row; flex-wrap:wrap; gap:.25rem; } .kit-nav a { padding:.4rem .65rem; font-size:.75rem; } .kit-sidebar>.arya-badge,.kit-bottom { display:none; } .kit-content { padding:1.5rem 1.25rem 3rem; } .kit-top { margin-bottom:2rem; padding-bottom:1.2rem; } .kit-hero { margin-bottom:2rem; } .kit-summary { gap:.7rem; } .kit-summary .arya-stat-value { font-size:1.35rem; } .kit-stagger { gap:.35rem; } .kit-stagger>div { padding:1rem .3rem; } }
`;

export const uiPreviewRuntime = String.raw`
${uiPatternPreviewRuntime}
const __arya_uiPreview = (options = {}) => {
  __arya_uiOptions(options, ['section', 'basePath', 'apiPath'], 'preview');
  const section = options.section ?? 'components';
  if (!['components', 'sections', 'templates', 'motion', 'guide'].includes(section)) __arya_uiError('preview section must be components, sections, templates, motion, or guide.');
  const base = options.basePath ?? '/';
  if (typeof base !== 'string' || !/^\/(?!\/)/.test(base) || /[\\\s?#\u0000-\u001f]/.test(base)) __arya_uiError('preview basePath must be an absolute local path.');
  const path = base === '/' ? '' : base.replace(/\/$/, '');
  if (options.apiPath !== undefined) __arya_ui.request(options.apiPath, {method: 'POST'});
  const ui = __arya_ui, catalog = ${JSON.stringify(uiCatalog)}, guides = ${JSON.stringify(uiGuideExamples)};
  const code = (id, source) => ui.stack([
    ui.row([ui.element('small', {}, 'ARYA'), ui.button('Copy code', {variant: 'ghost', action: [ui.copy(id), ui.toast('Code copied.', {tone: 'success'})]})], {class: 'kit-example-head'}),
    ui.code(source, {id})
  ]);
  const demo = (id, title, description, children, source) => ui.card([
    ui.heading(title, {level: 3}), ui.text(description, {class: 'arya-muted'}),
    ui.tabs([{id: 'preview', label: 'Preview', body: ui.stack(children, {class: 'kit-live'})}, {id: 'code', label: 'Arya', body: code(id + '-source', source)}], {id: id + '-tabs', label: title + ' example'})
  ], {class: 'kit-demo', id});
  const patternDemos = group => __arya_uiPatternExamples.filter(item => item.group === group).map(item => demo(item.id, item.title, item.description, [__arya_uiPatternSample(item.id)], item.code));
  const sections = () => ui.stack([heading('02 / PAGE SECTIONS', 'Good pages start with good pieces.', 'Compose navigation, heroes, features, plans, quotes, FAQs, calls to action, and footers. Each section is ordinary Arya code.'), ...patternDemos('sections')]);
  const templates = () => ui.stack([heading('03 / FULL-PAGE TEMPLATES', 'Start a few steps ahead.', 'Four complete pages you can make your own. Open a live template or copy its Arya call. Sample data and unconnected services stay explicit.'), ui.alert('Requires source candidate 1.3.0-alpha.3', 'Build this checkout or use a matching candidate archive. The older published npm package does not include these templates.'), __arya_uiTemplateGallery(path, demo)]);
  const heading = (label, title, description) => ui.stack([ui.text(label, {class: 'arya-eyebrow'}), ui.heading(title), ui.text(description, {class: 'arya-muted'})], {class: 'kit-hero'});
  const components = () => ui.stack([
    heading('01 / COMPONENT LIBRARY', 'Less setup. More possibility.', 'Thoughtful components, useful defaults, and clear Arya code. Explore the live examples, then take the parts your application needs.'),
    ui.grid([ui.stat('Component APIs', catalog.filter(item => ['Layout', 'Typography', 'Forms', 'Data', 'Feedback', 'Navigation'].includes(item[1]) && !['page', 'preview', 'element', 'toast'].includes(item[0])).length), ui.stat('Motion presets', ui.presets().length), ui.stat('Frontend packages', 0)], {class: 'kit-summary'}),
    ...patternDemos('components'),
    ui.section([
      ui.heading('Make the everyday feel effortless.', {level: 2}),
      ui.grid([
        demo('buttons', 'Buttons & actions', 'A clear action, a quiet alternative, or a considered warning.', [ui.row([ui.button('Create project', {action: ui.toast('Your new project is ready.', {tone: 'success'})}), ui.button('Secondary', {variant: 'secondary', action: ui.toast('Secondary action selected.')}), ui.button('Remove', {variant: 'danger', action: ui.open('remove-dialog')})]), ui.row([ui.button('Ghost action', {variant: 'ghost', action: ui.toast('A little less emphasis.')}), ui.button('Unavailable', {disabled: true})])], 'ui.button("Create project", {action: ui.toast("Ready.", {tone: "success"})})\nui.button("Secondary", {variant: "secondary"})\nui.button("Remove", {variant: "danger", action: ui.open("confirm")})'),
        demo('state', 'State that stays simple', 'A counter and a conditional section. No browser source strings.', [ui.text(ui.bind('count'), {class: 'kit-counter', role: 'status', 'aria-live': 'polite'}), ui.row([ui.button('Add one', {action: ui.increment('count')}), ui.button('Reset', {variant: 'secondary', action: ui.set('count', 0)})]), ui.switch('Show details', {bind: 'details'}), ui.when('details', ui.text('This section follows a boolean binding.', {class: 'arya-muted'}), {id: 'conditional-demo'})], 'ui.text(ui.bind("count"))\nui.button("Add one", {action: ui.increment("count")})\nui.switch("Show details", {bind: "details"})\nui.when("details", ui.text("More information."))')
      ])
    ], {class: 'kit-section'}),
    ui.section([
      ui.heading('Forms with room to breathe.', {level: 2}),
      ui.grid([
        demo('forms', 'A useful form', 'Labels, hints, validation, and a result that stays in view.', [ui.form([
          ui.field('Full name', ui.input({id: 'demo-name', bind: 'name', required: true, maxlength: 80, placeholder: 'Your name'}), {hint: 'How you would like to be addressed.'}),
          ui.field('Email address', ui.input({id: 'demo-email', type: 'email', bind: 'email', required: true, placeholder: 'you@example.com'})),
          ui.field('Workspace', ui.select([{value: 'personal', label: 'Personal'}, {value: 'team', label: 'Team'}, {value: 'company', label: 'Company'}], {id: 'demo-plan', bind: 'plan'})),
          ui.checkbox('Send me product updates', {bind: 'updates'}),
          ui.button('Preview save', {type: 'submit', disabled: ui.bind('busy', false)}),
          ui.text(ui.bind('result.message', 'Ready when you are.'), {role: 'status', 'aria-live': 'polite', id: 'form-result'}), ui.text(ui.bind('problem'), {role: 'alert'})
        ], {action: options.apiPath ? ui.request(options.apiPath, {method: 'POST', body: {name: ui.bind('name'), email: ui.bind('email'), plan: ui.bind('plan'), updates: ui.bind('updates')}, result: 'result', pending: 'busy', error: 'problem'}) : [ui.set('result', {message: 'Your local preview has been updated.'}), ui.toast('Preview updated.', {tone: 'success'})]})], 'ui.form([\n  ui.field("Name", ui.input({id: "name", bind: "name", required: true})),\n  ui.button("Save", {type: "submit", disabled: ui.bind("busy", false)})\n], {action: ui.request("/api/profile", {\n  method: "POST", body: {name: ui.bind("name")},\n  result: "result", pending: "busy", error: "problem"\n})})'),
        demo('controls', 'Comfortable controls', 'A range, progress, switches, and multiline text share page state.', [ui.field('Monthly capacity', ui.slider({id: 'capacity', bind: 'capacity'}), {hint: 'Drag the slider or use your arrow keys.'}), ui.row([ui.badge('Capacity'), ui.text(ui.bind('capacity'))]), ui.progress(ui.bind('capacity'), {label: 'Monthly capacity'}), ui.switch('Notifications', {bind: 'notifications'}), ui.row([ui.radio('Personal', 'personal', {bind: 'plan'}), ui.radio('Team', 'team', {bind: 'plan'})]), ui.field('Project notes', ui.textarea({id: 'notes', bind: 'notes', placeholder: 'A little context goes a long way.'}))], 'ui.field("Capacity", ui.slider({id: "capacity", bind: "capacity"}))\nui.progress(ui.bind("capacity"), {label: "Capacity"})\nui.switch("Notifications", {bind: "notifications"})\nui.textarea({id: "notes", bind: "notes"})')
      ])
    ], {class: 'kit-section'}),
    ui.section([
      ui.heading('Information, with a little hierarchy.', {level: 2}),
      demo('data', 'Data & identity', 'Readable tables, compact status, and a few numbers that matter.', [ui.grid([ui.stat('Active projects', 12, {hint: 'Across your workspace'}), ui.stat('Tasks completed', 48, {hint: 'This month'}), ui.row([ui.avatar('HA', {label: 'Hamza Arya'}), ui.stack([ui.element('strong', {}, 'Your workspace'), ui.badge('All systems ready', {tone: 'success'})])])]), ui.table([{key: 'project', label: 'Project'}, {key: 'owner', label: 'Owner'}, {key: 'status', label: 'Status'}], [{project: 'Workspace', owner: 'Design team', status: ui.badge('Active', {tone: 'success'})}, {project: 'Activity report', owner: 'Engineering', status: ui.badge('Review', {tone: 'warning'})}], {caption: 'Example projects'})], 'ui.stat("Active projects", 12, {hint: "This month"})\nui.avatar("HA", {label: "Hamza Arya"})\nui.badge("Active", {tone: "success"})\nui.table([{key: "name", label: "Project"}], [{name: "Workspace"}], {caption: "Projects"})')
    ], {class: 'kit-section'}),
    ui.section([
      ui.heading('Give every interaction an answer.', {level: 2}),
      ui.grid([
        demo('feedback', 'Feedback & loading', 'Inline messages, quiet placeholders, and dismissible toasts.', [ui.alert('Everything is up to date.', 'Your latest changes are ready.', {tone: 'success'}), ui.row([ui.spinner({label: 'Loading your projects'}), ui.text('Preparing your workspace…', {class: 'arya-muted'})]), ui.skeleton({lines: 2}), ui.button('Show notification', {variant: 'secondary', action: ui.toast('Your changes have been saved.', {tone: 'success'})})], 'ui.alert("Saved", "Your changes are ready.", {tone: "success"})\nui.spinner({label: "Loading projects"})\nui.skeleton({lines: 2})\nui.button("Notify", {action: ui.toast("Saved.", {tone: "success"})})'),
        demo('navigation', 'Navigation & disclosure', 'Use arrow keys in tabs. Open details with the keyboard.', [ui.breadcrumbs([{label: 'Workspace', href: '#data'}, {label: 'Settings'}]), ui.accordion([{title: 'Can I reuse these components?', body: ui.text('Yes. Compose them in ordinary Arya functions.')}, {title: 'Does this work on desktop?', body: ui.text('The same interface can run inside the Electron starter.')}]), ui.row([ui.button('Open dialog', {action: ui.open('welcome-dialog')}), ui.tooltip('Dialogs support Escape and return focus to the opener.', ui.button('Helpful hint', {variant: 'secondary'}), {id: 'dialog-hint'})])], 'ui.accordion([{title: "More details", body: ui.text("Hello.")}])\nui.button("Open", {action: ui.open("welcome")})\nui.dialog("welcome", "Welcome", [ui.text("Your content here.")])\nui.tooltip("A helpful description", ui.button("Help"), {id: "help-tip"})'),
        demo('empty', 'Empty states & lists', 'Keep a blank surface useful, with a clear next step.', [ui.empty('A fresh start.', 'Your first project belongs here.', ui.button('Create a project', {action: ui.toast('You are ready to begin.')})), ui.list(['Readable defaults', 'Keyboard-friendly controls', 'Components you can compose'])], 'ui.empty("No projects yet", "Start with your first idea.",\n  ui.button("Create project", {action: ui.open("create")})\n)\nui.list(["One useful thing", "Another useful thing"])')
      ])
    ], {class: 'kit-section'})
  ]);
  const motion = () => ui.stack([
    heading('02 / MOTION LIBRARY', 'A little movement. A clear intention.', 'Replay a preset, build a sequence, or shape your own keyframes. Motion respects reduced-motion preferences, including changes during playback.'),
    ui.alert('Try the controls.', 'Hover or focus a sample, or select Replay. Your system’s reduced-motion setting takes priority.', {tone: 'info'}),
    ui.grid(ui.presets().map(preset => ui.card([
      ui.row([ui.element('strong', {}, preset), ui.badge('700 ms')], {class: 'kit-motion-label'}),
      ui.element('div', {class: 'kit-motion-stage'}, ui.element('div', {class: 'kit-motion-object', id: 'motion-' + preset, tabindex: 0, 'aria-label': preset + ' sample', animate: ui.motion(preset, {duration: 700, trigger: 'hover'})}, 'a.')),
      ui.button('Replay ' + preset, {variant: 'secondary', action: ui.animate('motion-' + preset, ui.motion(preset, {duration: 700}), {wait: false})})
    ], {class: 'kit-motion-card'})), {class: 'kit-motion-grid'}),
    ui.section([
      ui.heading('Control the whole performance.', {level: 2}),
      ui.grid([
        ui.card([ui.heading('Playback', {level: 3}), ui.text('Run a loop, pause it, resume it, or restore its original styles.', {class: 'arya-muted'}), ui.element('div', {class: 'kit-orbit', id: 'orbit'}, '✦'), ui.row([ui.button('Play loop', {id: 'play-loop', action: ui.animate('orbit', ui.motion('spin', {duration: 2400, easing: 'linear', repeat: 'infinite'}))}), ui.button('Pause', {id: 'pause-loop', variant: 'secondary', action: ui.pause('orbit')}), ui.button('Resume', {id: 'resume-loop', variant: 'secondary', action: ui.resume('orbit')}), ui.button('Cancel', {id: 'cancel-loop', variant: 'ghost', action: ui.cancel('orbit')})]), code('loop-source', 'ui.animate("orbit", ui.motion("spin", {\n  duration: 2400, easing: "linear", repeat: "infinite"\n}))\nui.pause("orbit")\nui.resume("orbit")\nui.cancel("orbit")')]),
        ui.card([ui.heading('Stagger & sequence', {level: 3}), ui.text('Animate direct children together, with a little space between each start.', {class: 'arya-muted'}), ui.element('div', {id: 'stagger-group', class: 'kit-stagger'}, ['01', '02', '03', '04'].map(label => ui.element('div', {}, label))), ui.element('div', {id: 'sequence-summary', class: 'kit-transport'}, 'One coherent finish.'), ui.row([ui.button('Play sequence', {id: 'play-sequence', action: [ui.animate('stagger-group', ui.motion('rise', {duration: 450, stagger: 100})), ui.animate('sequence-summary', 'pulse'), ui.toast('Sequence completed.', {tone: 'success'})]}), ui.button('Play together', {id: 'play-parallel', variant: 'secondary', action: ui.parallel([ui.animate('stagger-group', ui.motion('rise', {stagger: 80})), ui.animate('sequence-summary', 'scale')])}), ui.button('Stop sequence', {id: 'stop-sequence', variant: 'ghost', action: [ui.cancel('stagger-group'), ui.cancel('sequence-summary')]})]), code('sequence-source', 'ui.button("Play", {action: [\n  ui.animate("cards", ui.motion("rise", {stagger: 100})),\n  ui.animate("summary", "pulse"),\n  ui.toast("Ready.")\n]})')])
      ])
    ], {class: 'kit-section'}),
    ui.card([ui.heading('Your own keyframes', {level: 2}), ui.text('Use validated transforms, opacity, colors, filters, and spacing. Choose easing, direction, fill, repeat, and trigger without adding another package.', {class: 'arya-muted'}), ui.element('div', {id: 'custom-motion', class: 'kit-orbit'}, 'a.'), ui.button('Play custom motion', {id: 'play-custom', action: ui.animate('custom-motion', ui.keyframes([{transform: 'translateX(-30px) rotate(-12deg)', opacity: .2}, {transform: 'translateX(0) rotate(0deg)', opacity: 1}], {duration: 850, easing: 'snappy'}))}), code('keyframes-source', guides[6].code)])
  ]);
  const guide = () => ui.stack([
    heading('03 / IMPLEMENTATION GUIDE', 'From the first import to a working app.', 'Start small, compose your own components, then add state and server actions. Every example below uses the same library as this preview.'),
    ui.alert('Use a matching compiler.', 'This preview includes source candidate 1.3.0-alpha.3 additions. Build the checkout or use a matching archive. The older npm release includes the original component and motion APIs.', {tone: 'info'}),
    ui.element('nav', {'aria-label': 'Guide sections', class: 'kit-guide-nav'}, guides.map((item, index) => ui.link(item.title.split('. ')[0] + '. ' + item.title.split('. ').slice(1).join('. '), '#step-' + (index + 1)))),
    ...guides.map((item, index) => ui.card([ui.heading(item.title, {level: 2}), ui.text(item.text, {class: 'arya-muted'}), code('guide-source-' + index, item.code)], {class: 'kit-guide-step', id: 'step-' + (index + 1)})),
    ui.card([ui.heading('8. Run on the web or desktop', {level: 2}), ui.text('The generated ui project starts a Node server. The desktop project runs the same interface in an isolated Electron window. Restart after source changes. Installers, signing, and automatic updates need a separate distribution setup.', {class: 'arya-muted'}), ui.code('npm create arya-language@latest my-app -- --template ui\ncd my-app\nnpm install\nnpm run dev', {language: 'shell'}), ui.text('Choose --template desktop instead for a desktop window. Its npm run web script serves the same app in a browser.', {class: 'arya-muted'})], {class: 'kit-guide-step'}),
    ui.card([ui.heading('9. Make it your own', {level: 2}), ui.text('Use page theme: light, dark, or auto. Override --bg, --surface, --ink, --muted, --line, --accent, and --button-ink in page css. Component class attributes let you scope your styles. Keep keyboard focus visible and give inputs labels.', {class: 'arya-muted'}), code('theme-source', 'ui.page({\n  title: "My app", theme: "light",\n  css: ":root { --accent: #215c47; --button-ink: #fff; }",\n  body: ui.card([ui.heading("Make it yours.")])\n})')], {class: 'kit-guide-step'}),
    ui.card([ui.heading('10. Start with sections or a full page', {level: 2}), ui.text('Compose ui.hero, ui.features, ui.pricing, and the other sections inside ui.page. ui.template returns a complete document, so serve it directly. Override sample content and connect submitAction to your own validated routes.'), code('patterns-guide-source', 'ui.template("dashboard", {\n  brand: "My workspace",\n  metrics: [{label: "Open tasks", value: 12}],\n  rows: []\n})'), ui.link('Explore sections', path + '/sections'), ui.link('Open the templates', path + '/templates')], {class: 'kit-guide-step'}),
    ui.section([ui.heading('The complete API at a glance.', {level: 2}), ui.text('Snippets assume use std "ui" as ui unless they show their own imports. Components render on the server; actions run in the browser. State is public JSON. No server closures or arbitrary source evaluation are sent to the client.', {class: 'arya-muted'}), ui.table([{key: 'group', label: 'Group'}, {key: 'signature', label: 'API'}, {key: 'description', label: 'Purpose'}], catalog.map(item => ({group: ui.badge(item[1]), signature: 'ui.' + item[2], description: item[3]})), {caption: catalog.length + ' documented APIs', class: 'kit-reference'})], {id: 'api-reference', class: 'kit-section'})
  ]);
  return ui.page({title: 'Arya UI — ' + section, theme: 'light', css: ${JSON.stringify(previewStyles)}, state: {query: '', count: 0, details: false, name: '', email: '', plan: 'personal', updates: true, capacity: 65, notifications: true, notes: '', busy: false, result: null, problem: ''}, body: ui.element('div', {class: 'kit-shell'}, [
    ui.element('aside', {class: 'kit-sidebar'}, [ui.element('a', {class: 'kit-brand', href: path + '/'}, ['arya', ui.element('span', {}, '.'), ui.element('small', {}, 'UI LIBRARY')]), ui.badge('ALPHA PREVIEW', {tone: 'success'}), ui.element('nav', {class: 'kit-nav', 'aria-label': 'Library'}, [['components', 'Components', '/'], ['sections', 'Page sections', '/sections'], ['templates', 'Templates', '/templates'], ['motion', 'Motion library', '/motion'], ['guide', 'Implementation guide', '/guide']].map(([key, label, suffix]) => ui.element('a', {href: path + suffix, ...(section === key ? {'aria-current': 'page'} : {})}, label))), ui.text('Readable code. Useful interfaces. Made with Arya.', {class: 'kit-bottom'})]),
    ui.element('div', {class: 'kit-content'}, [ui.row([ui.breadcrumbs([{label: 'Library', href: path + '/'}, {label: ({components: 'Components', sections: 'Sections', templates: 'Templates', motion: 'Motion', guide: 'Guide'})[section]}]), ui.button('Switch theme', {id: 'switch-theme', variant: 'secondary', action: ui.theme('toggle')})], {class: 'kit-top'}), ({components, sections, templates, motion, guide})[section](), ui.row([ui.text('ARYA UI / A LIBRARY TO BUILD WITH'), ui.link('Read the implementation guide ↗', path + '/guide')], {class: 'kit-footer'})]),
    ui.dialog('welcome-dialog', 'A little space to focus.', [ui.text('Native dialogs keep focus inside, support Escape, and return focus when closed.'), ui.button('Continue', {action: [ui.close('welcome-dialog'), ui.toast('You are ready to continue.', {tone: 'success'})]})], {description: 'One clear step at a time.'}),
    ui.dialog('remove-dialog', 'Remove this draft?', [ui.text('This is a preview. No files or records will be removed.'), ui.row([ui.button('Keep draft', {variant: 'secondary', action: ui.close('remove-dialog')}), ui.button('Remove draft', {variant: 'danger', action: [ui.close('remove-dialog'), ui.toast('Demo draft removed.', {tone: 'success'})]})])])
  ])});
};
`;
