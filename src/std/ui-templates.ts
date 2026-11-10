import {uiTemplateCatalog} from '../ui-catalog.js';

/** Templates render complete documents; defaults demonstrate UI, not hosted services. */
export const uiTemplatesRuntime = String.raw`
const __arya_uiTemplateCatalog = ${JSON.stringify(uiTemplateCatalog)};
const __arya_uiTemplate = (name, options = {}) => {
  const descriptor = __arya_uiTemplateCatalog.find(item => item.name === name);
  if (!descriptor) __arya_uiError('unknown template. Use landing, dashboard, settings, or sign-in.');
  const shared = ['title', 'description', 'theme', 'lang', 'css', 'nonce', 'state', 'brand', 'body'];
  const specific = {
    landing: ['nav', 'hero', 'features', 'pricing', 'testimonials', 'faq', 'cta', 'footer'],
    dashboard: ['heading', 'navigation', 'actions', 'metrics', 'columns', 'rows', 'activity'],
    settings: ['heading', 'submitAction'],
    'sign-in': ['heading', 'submitAction', 'helpHref'],
  };
  __arya_uiOptions(options, [...shared, ...specific[name]], 'template ' + name);
  const {brand = 'Northstar', body = [], state = {}, ...config} = options, ui = __arya_ui;
  if (typeof brand !== 'string' || !brand.trim()) __arya_uiError('template brand must be nonempty text.');
  const suppliedState = __arya_uiData(state);
  if (!__arya_uiObject(suppliedState)) __arya_uiError('template state must be an object.');
  const initial = {}, content = [];
  if (name === 'landing') {
    const features = options.features ?? [{title: 'One shared workspace', description: 'Keep your projects, people, and decisions together.', icon: '01'}, {title: 'Less repetitive work', description: 'Build a workflow that gives your team time back.', icon: '02'}, {title: 'Room to grow', description: 'Start small and shape the experience around your needs.', icon: '03'}];
    const plans = options.pricing ?? [{title: 'Personal', price: '$0', interval: '/ month', features: ['A place to begin', 'Your own workspace'], action: ui.link('Explore the details', '#questions')}, {title: 'Team', price: '$19', interval: '/ month · sample price', description: 'Example content. Connect your own billing.', features: ['Shared projects', 'Team workflows'], highlighted: true, action: ui.link('Ask a question', '#questions')}];
    content.push(ui.navbar({brand, href: '#top', links: [{label: 'Features', href: '#features'}, {label: 'Pricing', href: '#pricing'}, {label: 'Questions', href: '#questions'}], ...options.nav}), ui.hero({id: 'top', eyebrow: 'A LITTLE MORE SPACE TO DO YOUR BEST WORK', title: 'Good work starts with a clear workspace.', description: 'A calmer home for your projects. Bring your team together and move the work forward.', actions: [ui.link('Explore features', '#features'), ui.link('See plans', '#pricing')], ...options.hero}), ui.features(features, {title: 'Everything you need. Space to focus.', id: 'features'}), ui.pricing(plans, {title: 'Choose your starting point.', id: 'pricing'}));
    if (options.testimonials !== undefined) content.push(ui.testimonials(options.testimonials, {title: 'From your community'}));
    content.push(ui.faq(options.faq ?? [{question: 'Can I customize this page?', answer: 'Yes. Replace these sections, links, and sample prices with your own content.'}, {question: 'Does this include a hosted service?', answer: 'This template supplies the interface. Your application supplies storage, accounts, and billing.'}], {id: 'questions'}));
    if (options.cta !== undefined) content.push(ui.cta(options.cta));
    content.push(body, ui.footer({brand, description: 'Make a little room for better work.', links: [{label: 'Back to top', href: '#top'}], ...options.footer}));
  } else if (name === 'dashboard') {
    const metrics = __arya_uiItems(options.metrics ?? [{label: 'Active projects', value: 12, hint: 'Example workspace'}, {label: 'Completed tasks', value: 48, hint: 'This month'}, {label: 'Team members', value: 8, hint: 'Working together'}], 'dashboard metrics', 12);
    content.push(ui.navbar({brand, links: options.navigation ?? [{label: 'Overview', href: '#overview', current: true}, {label: 'Projects', href: '#projects'}, {label: 'Activity', href: '#activity'}], actions: options.actions ?? [ui.button('Create project', {variant: 'secondary', action: ui.toast('Preview only. Connect your project creation action.')})]}), ui.section([ui.text('WORKSPACE OVERVIEW', {class: 'arya-eyebrow'}), ui.heading(options.heading ?? 'A clear view of your work.'), ui.text('A snapshot of your projects and the people moving them forward.', {class: 'arya-muted'})], {id: 'overview'}), ui.grid(metrics.map(item => { __arya_uiOptions(item, ['label', 'value', 'hint'], 'dashboard metric'); return ui.card(ui.stat(item.label, item.value, {hint: item.hint})); })), ui.card([ui.heading('Projects', {level: 2}), ui.table(options.columns ?? [{key: 'name', label: 'Project'}, {key: 'owner', label: 'Owner'}, {key: 'status', label: 'Status'}], options.rows ?? [{name: 'Website refresh', owner: 'Design', status: ui.badge('In progress', {tone: 'info'})}, {name: 'Customer research', owner: 'Product', status: ui.badge('Review', {tone: 'warning'})}], {caption: 'Workspace projects'})], {id: 'projects'}), ui.card([ui.heading('Recent activity', {level: 2}), ui.timeline(options.activity ?? [{title: 'Your workspace is ready', time: 'Today', body: 'This is sample activity. Supply records from your own application.'}])], {id: 'activity'}), body);
  } else if (name === 'settings') {
    Object.assign(initial, {name: '', email: '', notifications: true});
    content.push(ui.navbar({brand, links: [{label: 'Profile', href: '#profile', current: true}]}), ui.container(ui.stack([ui.heading(options.heading ?? 'Make yourself at home.'), ui.text('Update your profile and choose how you hear from us.', {class: 'arya-muted'}), ui.card(ui.form([ui.field('Display name', ui.input({id: 'settings-name', bind: 'name', required: true, maxlength: 80, autocomplete: 'name'})), ui.field('Email address', ui.input({id: 'settings-email', type: 'email', bind: 'email', required: true, autocomplete: 'email'})), ui.switch('Email notifications', {bind: 'notifications'}), ui.button('Save changes', {type: 'submit'}), ui.text(ui.bind('result.message', ''), {role: 'status', 'aria-live': 'polite'}), ui.text(ui.bind('problem', ''), {role: 'alert'})], {action: options.submitAction ?? ui.toast('Preview only. Changes were not saved.')}), {id: 'profile'}), body]), {size: 'sm'}));
  } else {
    Object.assign(initial, {email: '', password: '', remember: false});
    content.push(ui.container(ui.stack([ui.text(brand, {class: 'arya-brand'}), ui.heading(options.heading ?? 'Welcome back.'), ui.text('Use your account to continue.', {class: 'arya-muted'}), ui.card(ui.form([ui.field('Email address', ui.input({id: 'signin-email', type: 'email', bind: 'email', required: true, autocomplete: 'username'})), ui.field('Password', ui.input({id: 'signin-password', type: 'password', bind: 'password', required: true, autocomplete: 'current-password'})), ui.checkbox('Remember me', {bind: 'remember'}), ui.button('Sign in', {type: 'submit'}), ui.text(ui.bind('result.message', ''), {role: 'status', 'aria-live': 'polite'}), ui.text(ui.bind('problem', ''), {role: 'alert'})], {action: options.submitAction ?? ui.toast('Preview only. Sign-in is not connected.')})), options.helpHref === undefined ? null : ui.link('Need help signing in?', options.helpHref), ui.text('Preview only. Sign-in is not connected.', {class: 'arya-muted'}), body]), {size: 'sm'}));
  }
  return ui.page({title: config.title ?? descriptor.title + ' · ' + brand, description: config.description ?? descriptor.description, theme: config.theme ?? 'auto', lang: config.lang ?? 'en', css: config.css ?? '', ...(config.nonce === undefined ? {} : {nonce: config.nonce}), state: {...initial, ...suppliedState}, body: ui.stack(content, {class: 'arya-template arya-template-' + name})});
};
`;
