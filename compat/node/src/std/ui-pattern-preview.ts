import {uiTemplateCatalog} from '../ui-catalog.js';

/** Copyable examples are compiled and rendered by the conformance suite. */
export const uiPatternExamples = [
  {id: 'workflow', title: 'A clear path forward', group: 'components', description: 'Progress, activity, and labelled values with semantic HTML.', code: `ui.stack([
  ui.steps([{title: "Details"}, {title: "Review"}, {title: "Finish"}], {current: 1}),
  ui.descriptionList([{term: "Workspace", detail: "Northstar"}, {term: "Plan", detail: "Team"}]),
  ui.timeline([{title: "Workspace created", time: "Today", body: "Ready for your first project."}]),
  ui.pagination([{label: "Previous", href: "?page=1", disabled: true}, {label: "1", href: "?page=1", current: true}, {label: "2", href: "?page=2"}])
])`},
  {id: 'workspace-controls', title: 'Small controls. Useful details.', group: 'components', description: 'Native radio selection, a clearable search, and a bound measurement.', code: `ui.stack([
  ui.segmented([{value: "personal", label: "Personal"}, {value: "team", label: "Team"}], {id: "workspace-mode", bind: "plan", label: "Workspace type"}),
  ui.search({id: "project-search", bind: "query", label: "Find a project"}),
  ui.meter(ui.bind("capacity", 65), {label: "Storage used"}),
  ui.buttonGroup([ui.button("Save", {action: ui.toast("Preview saved.")}), ui.button("Cancel", {variant: "secondary"})], {label: "Edit actions"})
])`},
  {id: 'navigation-section', title: 'Navigation that fits', group: 'sections', description: 'Brand, wrapping links, and room for your primary action.', code: `ui.navbar({brand: "Northstar", href: "#", links: [{label: "Overview", href: "#", current: true}, {label: "Projects", href: "#"}], actions: [ui.button("New project", {action: ui.toast("Connect your creation flow.")})]})`},
  {id: 'hero-section', title: 'Start with a clear introduction', group: 'sections', description: 'A spacious hero with optional media and ordinary action components.', code: `ui.hero({eyebrow: "YOUR NEXT CHAPTER", title: "A little more room for good work.", description: "Bring your projects and people together.", actions: [ui.link("Explore the library", "#features-section")], media: ui.card([ui.stat("Projects shipped", 24), ui.badge("Ready for what is next", {tone: "success"})])})`},
  {id: 'features-section', title: 'Explain what matters', group: 'sections', description: 'Feature cards share consistent spacing, headings, and responsive layout.', code: `ui.features([{icon: "01", title: "One workspace", description: "Keep the work together."}, {icon: "02", title: "Fewer repeated steps", description: "Make room for the important parts."}], {title: "Built for everyday work."})`},
  {id: 'pricing-section', title: 'Present a simple choice', group: 'sections', description: 'Sample plans with features and application-owned checkout actions.', code: `ui.pricing([{title: "Personal", price: "$0", interval: "/ month", features: ["Your own workspace", "A place to start"], action: ui.link("Learn more", "#faq-section")}, {title: "Team", price: "$19", interval: "/ month · sample", features: ["Shared projects", "Team workflows"], highlighted: true, action: ui.button("Choose team", {action: ui.toast("Connect your billing flow.")})}], {title: "Choose your starting point."})`},
  {id: 'quotes-section', title: 'Let your community speak', group: 'sections', description: 'Attributed quotes, initials, and readable content. These quotes are fictional examples.', code: `ui.testimonials([{quote: "Everything has a place. We can focus on the work.", name: "Samira", role: "Example team member", initials: "SA"}], {title: "Good work, together."})`},
  {id: 'faq-section', title: 'Make the next step obvious', group: 'sections', description: 'Native disclosures keep answers accessible without another dependency.', code: `ui.faq([{question: "Can I customize these sections?", answer: "Yes. Use normal Arya values, components, and functions.", open: true}, {question: "Where does the data live?", answer: "In your application. Connect server routes for persistence."}], {title: "A few helpful answers."})`},
  {id: 'cta-section', title: 'One considered next step', group: 'sections', description: 'A compact call to action for a page or a product flow.', code: `ui.cta({title: "Ready for your next project?", description: "Start with the pieces that fit your work.", actions: [ui.button("Get started", {action: ui.toast("Your next step goes here.")})]})`},
  {id: 'footer-section', title: 'Finish with useful links', group: 'sections', description: 'A quiet footer with navigation and your own attribution.', code: `ui.footer({brand: "Northstar", description: "A calmer place for your work.", links: [{label: "Guide", href: "/guide"}, {label: "Templates", href: "/templates"}], copyright: "Your team · Your work"})`},
] as const;

export const uiPatternPreviewRuntime = String.raw`
const __arya_uiPatternExamples = ${JSON.stringify(uiPatternExamples)};
const __arya_uiPatternSample = id => {
  const ui = __arya_ui;
  switch (id) {
    case 'workflow': return ui.stack([ui.steps([{title: 'Details'}, {title: 'Review'}, {title: 'Finish'}], {current: 1}), ui.descriptionList([{term: 'Workspace', detail: 'Northstar'}, {term: 'Plan', detail: 'Team'}]), ui.timeline([{title: 'Workspace created', time: 'Today', body: 'Ready for your first project.'}]), ui.pagination([{label: 'Previous', href: '?page=1', disabled: true}, {label: '1', href: '?page=1', current: true}, {label: '2', href: '?page=2'}])]);
    case 'workspace-controls': return ui.stack([ui.segmented([{value: 'personal', label: 'Personal'}, {value: 'team', label: 'Team'}], {id: 'workspace-mode', bind: 'plan', label: 'Workspace type'}), ui.search({id: 'project-search', bind: 'query', label: 'Find a project'}), ui.meter(ui.bind('capacity', 65), {label: 'Storage used'}), ui.buttonGroup([ui.button('Save', {action: ui.toast('Preview saved.')}), ui.button('Cancel', {variant: 'secondary'})], {label: 'Edit actions'})]);
    case 'navigation-section': return ui.navbar({brand: 'Northstar', href: '#', links: [{label: 'Overview', href: '#', current: true}, {label: 'Projects', href: '#'}], actions: [ui.button('New project', {action: ui.toast('Connect your creation flow.')})]});
    case 'hero-section': return ui.hero({eyebrow: 'YOUR NEXT CHAPTER', title: 'A little more room for good work.', description: 'Bring your projects and people together.', actions: [ui.link('Explore the library', '#features-section')], media: ui.card([ui.stat('Projects shipped', 24), ui.badge('Ready for what is next', {tone: 'success'})])});
    case 'features-section': return ui.features([{icon: '01', title: 'One workspace', description: 'Keep the work together.'}, {icon: '02', title: 'Fewer repeated steps', description: 'Make room for the important parts.'}], {title: 'Built for everyday work.'});
    case 'pricing-section': return ui.pricing([{title: 'Personal', price: '$0', interval: '/ month', features: ['Your own workspace', 'A place to start'], action: ui.link('Learn more', '#faq-section')}, {title: 'Team', price: '$19', interval: '/ month · sample', features: ['Shared projects', 'Team workflows'], highlighted: true, action: ui.button('Choose team', {action: ui.toast('Connect your billing flow.')})}], {title: 'Choose your starting point.'});
    case 'quotes-section': return ui.testimonials([{quote: 'Everything has a place. We can focus on the work.', name: 'Samira', role: 'Example team member', initials: 'SA'}], {title: 'Good work, together.'});
    case 'faq-section': return ui.faq([{question: 'Can I customize these sections?', answer: 'Yes. Use normal Arya values, components, and functions.', open: true}, {question: 'Where does the data live?', answer: 'In your application. Connect server routes for persistence.'}], {title: 'A few helpful answers.'});
    case 'cta-section': return ui.cta({title: 'Ready for your next project?', description: 'Start with the pieces that fit your work.', actions: [ui.button('Get started', {action: ui.toast('Your next step goes here.')})]});
    case 'footer-section': return ui.footer({brand: 'Northstar', description: 'A calmer place for your work.', links: [{label: 'Guide', href: '/guide'}, {label: 'Templates', href: '/templates'}], copyright: 'Your team · Your work'});
  }
};
const __arya_uiTemplateGallery = (path, demo) => __arya_ui.stack(${JSON.stringify(uiTemplateCatalog)}.map(item => demo('template-' + item.name, item.title, item.description, [__arya_ui.card([__arya_ui.text('NORTHSTAR / ' + item.name.toUpperCase(), {class: 'arya-eyebrow'}), __arya_ui.heading(item.title, {level: 2}), __arya_ui.text(item.description, {class: 'arya-muted'}), __arya_ui.link('Open ' + item.title + ' ↗', path + '/templates/' + item.name)]), __arya_ui.text('Customizable full-page HTML. Sample data and form actions are explicit.', {class: 'arya-muted'})], 'ui.template("' + item.name + '", {brand: "My workspace", theme: "auto"})')));
`;
