/** Composed components share the ordinary element renderer and its escaping rules. */
export const uiComponentsRuntime = String.raw`
const __arya_uiTone = (options, fallback = 'neutral') => {
  const {tone = fallback, ...props} = options;
  if (!['neutral', 'success', 'warning', 'danger', 'info'].includes(tone)) __arya_uiError('tone must be neutral, success, warning, danger, or info.');
  return {tone, props};
};
const __arya_uiItems = (items, label, maximum = 1000) => {
  if (!Array.isArray(items) || items.length > maximum) __arya_uiError(label + ' expects up to ' + maximum + ' items.');
  return items;
};
const __arya_uiBindingData = binding => Object.fromEntries(Object.entries(binding));
const __arya_uiCondition = value => {
  if (typeof value === 'string') return __arya_uiBind(value);
  if (!value?.[__arya_uiBinding]) __arya_uiError('condition expects a state key or ui.bind/ui.is/ui.not.');
  return value;
};
const __arya_uiNot = value => Object.freeze({[__arya_uiBinding]: true, op: 'not', value: __arya_uiBindingData(__arya_uiCondition(value))});
const __arya_uiComponents = {
  is: (value, compare) => {
    if (compare !== null && !['string', 'number', 'boolean'].includes(typeof compare) || typeof compare === 'number' && !Number.isFinite(compare)) __arya_uiError('ui.is compares a finite primitive value.');
    return Object.freeze({[__arya_uiBinding]: true, op: 'equal', value: __arya_uiBindingData(__arya_uiCondition(value)), compare});
  },
  not: __arya_uiNot,
  when: (condition, children, props = {}) => __arya_uiElement('div', {...props, hidden: __arya_uiNot(condition)}, children),
  section: (children, props = {}) => __arya_uiComponent('section', 'arya-stack', children, props),
  divider: (props = {}) => __arya_uiComponent('hr', 'arya-divider', [], props),
  link: (label, href, props = {}) => __arya_uiComponent('a', 'arya-link', label, {...props, href}),
  code: (source, options = {}) => {
    const {language = 'arya', ...props} = options;
    if (typeof source !== 'string' || typeof language !== 'string') __arya_uiError('code expects source text and an optional language label.');
    const tokens = [], pattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|#[^\n]*|\b(?:use|std|as|const|keep|let|fn|task|async|await|return|give|if|when|else|otherwise|for|each|in|true|false|null|try|catch|finally|guard|while|break|continue|throw|export|new|and|or|not)\b|\b\d+(?:\.\d+)?\b/g;
    let offset = 0;
    if (language === 'arya') for (const match of source.matchAll(pattern)) {
      tokens.push(source.slice(offset, match.index));
      const value = match[0], kind = /^["']/.test(value) ? 'string' : /^(?:#|\/\/)/.test(value) ? 'comment' : /^\d/.test(value) ? 'number' : 'keyword';
      tokens.push(__arya_uiElement('span', {class: 'arya-code-' + kind}, value)); offset = match.index + value.length;
    }
    tokens.push(source.slice(offset));
    return __arya_uiComponent('pre', 'arya-code', __arya_uiElement('code', {'data-language': language}, tokens), props);
  },
  preview: options => __arya_uiPreview(options),
  badge: (label, options = {}) => { const {tone, props} = __arya_uiTone(options); return __arya_uiComponent('span', 'arya-badge arya-tone-' + tone, label, props); },
  alert: (title, message, options = {}) => {
    const {tone, props} = __arya_uiTone(options, 'info');
    return __arya_uiComponent('div', 'arya-alert arya-stack arya-tone-' + tone, [__arya_uiElement('strong', {}, title), __arya_uiElement('div', {}, message)], {role: tone === 'danger' ? 'alert' : 'status', ...props});
  },
  stat: (label, value, options = {}) => {
    const {hint, ...props} = options;
    return __arya_uiComponent('div', 'arya-stat arya-stack', [__arya_uiElement('span', {class: 'arya-muted'}, label), __arya_uiElement('strong', {class: 'arya-stat-value'}, value), hint == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, hint)], props);
  },
  avatar: (initials, options = {}) => { const {label = initials, ...props} = options; return __arya_uiComponent('span', 'arya-avatar', initials, {role: 'img', 'aria-label': label, ...props}); },
  textarea: (props = {}) => __arya_uiElement('textarea', {rows: 4, ...props}),
  slider: (props = {}) => __arya_uiElement('input', {min: 0, max: 100, step: 1, ...props, type: 'range'}),
  checkbox: (label, props = {}) => __arya_uiComponent('label', 'arya-check', [__arya_uiElement('input', {...props, type: 'checkbox'}), __arya_uiElement('span', {}, label)]),
  radio: (label, value, props = {}) => { if (typeof value !== 'string') __arya_uiError('radio value must be text.'); return __arya_uiComponent('label', 'arya-check', [__arya_uiElement('input', {...props, type: 'radio', value}), __arya_uiElement('span', {}, label)]); },
  switch: (label, props = {}) => __arya_uiComponent('label', 'arya-check arya-switch', [__arya_uiElement('input', {...props, type: 'checkbox', role: 'switch'}), __arya_uiElement('span', {}, label)]),
  field: (label, control, options = {}) => {
    const {hint, error, ...props} = options;
    if (!control?.[__arya_uiNode] || !['input', 'textarea', 'select'].includes(control.tag) || typeof control.props.id !== 'string' || !control.props.id) __arya_uiError('field needs an input, textarea, or select with an id.');
    const id = control.props.id, descriptions = [control.props['aria-describedby'], hint == null ? null : id + '-hint', error == null ? null : id + '-error'].filter(Boolean).join(' ');
    const input = __arya_uiElement(control.tag, {...control.props, ...(descriptions ? {'aria-describedby': descriptions} : {}), ...(typeof error === 'string' && error ? {'aria-invalid': true} : {})}, control.children);
    return __arya_uiComponent('div', 'arya-field arya-stack', [__arya_uiElement('label', {for: id}, label), input, hint == null ? null : __arya_uiElement('small', {id: id + '-hint', class: 'arya-muted'}, hint), error == null ? null : __arya_uiElement('small', {id: id + '-error', class: 'arya-field-error', role: 'alert'}, error)], props);
  },
  progress: (value, options = {}) => { const {max = 100, label = 'Progress', ...props} = options; if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) __arya_uiError('progress max must be positive.'); return __arya_uiComponent('progress', 'arya-progress', [], {...props, max, value, 'aria-label': label}); },
  spinner: (options = {}) => { const {label = 'Loading', ...props} = options; return __arya_uiComponent('span', 'arya-spinner', __arya_uiElement('span', {class: 'arya-sr-only'}, label), {role: 'status', ...props}); },
  skeleton: (options = {}) => { const {lines = 3, ...props} = options; if (!Number.isInteger(lines) || lines < 1 || lines > 12) __arya_uiError('skeleton lines must be 1–12.'); return __arya_uiComponent('div', 'arya-skeleton arya-stack', Array.from({length: lines}, () => __arya_uiElement('span', {}, [])), {'aria-hidden': true, ...props}); },
  empty: (title, message, action = null) => __arya_uiComponent('div', 'arya-empty arya-stack', [__arya_uiElement('strong', {}, title), __arya_uiElement('p', {class: 'arya-muted'}, message), action]),
  list: (items, props = {}) => __arya_uiComponent('ul', 'arya-list', __arya_uiItems(items, 'list').map(item => __arya_uiElement('li', {}, item)), props),
  table: (columns, rows, options = {}) => {
    __arya_uiItems(columns, 'table columns', 30); __arya_uiItems(rows, 'table rows');
    if (!columns.length) __arya_uiError('table needs at least one column.');
    const names = new Set();
    for (const column of columns) { __arya_uiOptions(column, ['key', 'label'], 'table column'); if (typeof column.key !== 'string' || !column.key || names.has(column.key)) __arya_uiError('table columns need unique keys.'); names.add(column.key); }
    const {caption, empty = 'No records yet.', ...props} = options;
    return __arya_uiComponent('div', 'arya-table-wrap', __arya_uiElement('table', {}, [caption == null ? null : __arya_uiElement('caption', {}, caption), __arya_uiElement('thead', {}, __arya_uiElement('tr', {}, columns.map(column => __arya_uiElement('th', {scope: 'col'}, column.label)))), __arya_uiElement('tbody', {}, rows.length ? rows.map(row => { if (!__arya_uiObject(row)) __arya_uiError('table rows must be objects.'); return __arya_uiElement('tr', {}, columns.map(column => __arya_uiElement('td', {}, __arya_uiOwn(row, column.key) ? row[column.key] : ''))); }) : __arya_uiElement('tr', {}, __arya_uiElement('td', {colspan: columns.length}, empty)))]), props);
  },
  breadcrumbs: (items, props = {}) => __arya_uiComponent('nav', 'arya-breadcrumbs', __arya_uiElement('ol', {}, __arya_uiItems(items, 'breadcrumbs', 20).map((item, index) => { __arya_uiOptions(item, ['label', 'href'], 'breadcrumb'); return __arya_uiElement('li', {}, item.href ? __arya_uiElement('a', {href: item.href, ...(index === items.length - 1 ? {'aria-current': 'page'} : {})}, item.label) : __arya_uiElement('span', index === items.length - 1 ? {'aria-current': 'page'} : {}, item.label)); })), {'aria-label': 'Breadcrumb', ...props}),
  tabs: (items, options = {}) => {
    const {id, label = 'Sections', active, ...props} = options;
    __arya_uiTarget(id); __arya_uiItems(items, 'tabs', 30);
    const keys = new Set();
    for (const item of items) { __arya_uiOptions(item, ['id', 'label', 'body', 'disabled'], 'tab'); __arya_uiTarget(item.id); if (keys.has(item.id)) __arya_uiError('tab ids must be unique.'); keys.add(item.id); if (item.disabled !== undefined && typeof item.disabled !== 'boolean') __arya_uiError('tab disabled must be a boolean.'); }
    const selected = active ?? items.find(item => !item.disabled)?.id;
    if (!selected || !items.some(item => item.id === selected && !item.disabled)) __arya_uiError('tabs need an enabled active item.');
    return __arya_uiComponent('div', 'arya-tabs', [__arya_uiElement('div', {role: 'tablist', 'aria-label': label}, items.map(item => __arya_uiElement('button', {id: id + '-tab-' + item.id, type: 'button', role: 'tab', disabled: item.disabled ?? false, 'aria-selected': item.id === selected, 'aria-controls': id + '-panel-' + item.id, tabindex: item.id === selected ? 0 : -1}, item.label))), items.map(item => __arya_uiElement('div', {id: id + '-panel-' + item.id, role: 'tabpanel', 'aria-labelledby': id + '-tab-' + item.id, tabindex: 0, hidden: item.id !== selected}, item.body))], {...props, id});
  },
  accordion: (items, options = {}) => {
    const {multiple = true, ...props} = options;
    if (typeof multiple !== 'boolean' || !multiple && !props.id) __arya_uiError('exclusive accordions need an id and multiple:false.');
    return __arya_uiComponent('div', 'arya-accordion', __arya_uiItems(items, 'accordion', 50).map(item => { __arya_uiOptions(item, ['title', 'body', 'open'], 'accordion item'); return __arya_uiElement('details', {open: item.open ?? false, ...(!multiple ? {name: props.id} : {})}, [__arya_uiElement('summary', {}, item.title), __arya_uiElement('div', {class: 'arya-stack'}, item.body)]); }), props);
  },
  dialog: (id, title, children, options = {}) => {
    __arya_uiTarget(id);
    const {description, ...props} = options;
    return __arya_uiComponent('dialog', 'arya-dialog', [__arya_uiElement('header', {class: 'arya-row'}, [__arya_uiElement('h2', {id: id + '-title'}, title), __arya_ui.button('Close', {variant: 'ghost', 'aria-label': 'Close dialog', action: __arya_ui.close(id)})]), description == null ? null : __arya_uiElement('p', {id: id + '-description', class: 'arya-muted'}, description), __arya_uiElement('div', {class: 'arya-stack'}, children)], {...props, id, 'aria-labelledby': id + '-title', ...(description == null ? {} : {'aria-describedby': id + '-description'})});
  },
  tooltip: (label, child, options = {}) => {
    const {id, ...props} = options; __arya_uiTarget(id);
    if (!child?.[__arya_uiNode]) __arya_uiError('tooltip needs a component child.');
    const target = __arya_uiElement(child.tag, {...child.props, 'aria-describedby': [child.props['aria-describedby'], id].filter(Boolean).join(' ')}, child.children);
    return __arya_uiComponent('span', 'arya-tooltip', [target, __arya_uiElement('span', {id, role: 'tooltip'}, label)], props);
  },
  open: id => __arya_uiMakeAction('open', {target: __arya_uiTarget(id)}),
  close: id => __arya_uiMakeAction('close', {target: __arya_uiTarget(id)}),
  copy: id => __arya_uiMakeAction('copy', {target: __arya_uiTarget(id)}),
  theme: value => { if (!['light', 'dark', 'auto', 'toggle'].includes(value)) __arya_uiError('theme expects light, dark, auto, or toggle.'); return __arya_uiMakeAction('theme', {value}); },
  toast: (message, options = {}) => {
    __arya_uiOptions(options, ['tone', 'duration'], 'toast'); const {tone} = __arya_uiTone(options);
    const duration = options.duration ?? 3500;
    if (typeof message !== 'string' || message.length > 2000 || !Number.isInteger(duration) || duration < 0 || duration > 60000) __arya_uiError('toast expects text and a 0–60000 ms duration.');
    return __arya_uiMakeAction('toast', {message, tone, duration});
  },
  presets: () => Object.keys(__arya_uiPresets),
  keyframes: __arya_uiKeyframes,
  animate: (target, motion = 'rise', options = {}) => {
    __arya_uiOptions(options, ['wait'], 'animate'); const spec = __arya_uiGetMotion(motion);
    const wait = options.wait ?? spec.repeat !== 'infinite';
    if (typeof wait !== 'boolean' || wait && spec.repeat === 'infinite') __arya_uiError('infinite animations require wait:false.');
    return __arya_uiMakeAction('animate', {target: __arya_uiTarget(target), motion: Object.fromEntries(Object.entries(spec)), wait});
  },
  pause: id => __arya_uiMakeAction('pause', {target: __arya_uiTarget(id)}),
  resume: id => __arya_uiMakeAction('resume', {target: __arya_uiTarget(id)}),
  cancel: id => __arya_uiMakeAction('cancel', {target: __arya_uiTarget(id)}),
  parallel: actions => { __arya_uiItems(actions, 'parallel actions', 100); return __arya_uiMakeAction('parallel', {actions: __arya_uiActions(actions)}); },
};
`;
