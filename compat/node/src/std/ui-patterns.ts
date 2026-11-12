/** Reusable page building blocks use the same escaped renderer and action model. */
export const uiPatternsRuntime = String.raw`
const __arya_uiSectionHead = (title, description) => title == null && description == null ? null : __arya_uiComponent('header', 'arya-stack arya-section-head', [title == null ? null : __arya_ui.heading(title, {level: 2}), description == null ? null : __arya_ui.text(description, {class: 'arya-muted'})]);
const __arya_uiNavItems = (items, label) => __arya_uiItems(items, label, 30).map(item => {
  __arya_uiOptions(item, ['label', 'href', 'current', 'disabled'], label + ' item');
  if (typeof item.href !== 'string' || !item.href || item.current !== undefined && typeof item.current !== 'boolean' || item.disabled !== undefined && typeof item.disabled !== 'boolean') __arya_uiError(label + ' items need an href and optional boolean current/disabled.');
  return __arya_uiElement('li', {}, item.disabled ? __arya_uiElement('span', {'aria-disabled': true}, item.label) : __arya_ui.link(item.label, item.href, item.current ? {'aria-current': 'page'} : {}));
});
const __arya_uiPatterns = {
  container: (children, options = {}) => {
    const {size = 'lg', ...props} = options;
    if (!['sm', 'md', 'lg', 'full'].includes(size)) __arya_uiError('container size must be sm, md, lg, or full.');
    return __arya_uiComponent('div', 'arya-container arya-container-' + size, children, props);
  },
  buttonGroup: (children, options = {}) => { const {label = 'Actions', ...props} = options; return __arya_uiComponent('div', 'arya-button-group', children, {role: 'group', 'aria-label': label, ...props}); },
  image: (src, alt, options = {}) => {
    const {caption, ...props} = options;
    if (typeof src !== 'string' || !src || typeof alt !== 'string') __arya_uiError('image needs a source and explicit alternative text (empty for decoration).');
    for (const key of ['width', 'height']) if (props[key] !== undefined && (!Number.isInteger(props[key]) || props[key] < 1 || props[key] > 20000)) __arya_uiError('image dimensions must be integers from 1–20000.');
    return __arya_uiComponent('figure', 'arya-image', [__arya_uiElement('img', {loading: 'lazy', decoding: 'async', ...props, src, alt}), caption == null ? null : __arya_uiElement('figcaption', {class: 'arya-muted'}, caption)]);
  },
  descriptionList: (items, props = {}) => __arya_uiComponent('dl', 'arya-description-list', __arya_uiItems(items, 'description list', 100).map(item => { __arya_uiOptions(item, ['term', 'detail'], 'description item'); return __arya_uiElement('div', {}, [__arya_uiElement('dt', {}, item.term), __arya_uiElement('dd', {}, item.detail)]); }), props),
  timeline: (items, props = {}) => __arya_uiComponent('ol', 'arya-timeline', __arya_uiItems(items, 'timeline', 100).map(item => {
    __arya_uiOptions(item, ['title', 'body', 'time'], 'timeline item');
    return __arya_uiElement('li', {}, [item.time == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, item.time), __arya_uiElement('strong', {}, item.title), item.body == null ? null : __arya_uiElement('div', {class: 'arya-muted'}, item.body)]);
  }), props),
  steps: (items, options = {}) => {
    const {current = 0, label = 'Progress', ...props} = options;
    __arya_uiItems(items, 'steps', 20);
    if (!items.length || !Number.isInteger(current) || current < 0 || current >= items.length) __arya_uiError('steps current must select an existing zero-based item.');
    return __arya_uiComponent('ol', 'arya-steps', items.map((item, index) => {
      __arya_uiOptions(item, ['title', 'description'], 'step');
      return __arya_uiElement('li', {class: index < current ? 'arya-step-complete' : '', ...(index === current ? {'aria-current': 'step'} : {})}, [__arya_uiElement('span', {class: 'arya-step-number', 'aria-hidden': true}, index < current ? '✓' : index + 1), __arya_uiElement('div', {class: 'arya-stack'}, [__arya_uiElement('strong', {}, item.title), item.description == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, item.description)])]);
    }), {'aria-label': label, ...props});
  },
  pagination: (items, options = {}) => {
    const {label = 'Pagination', ...props} = options;
    if (__arya_uiItems(items, 'pagination', 50).filter(item => item?.current).length > 1) __arya_uiError('pagination has at most one current item.');
    return __arya_uiComponent('nav', 'arya-pagination', __arya_uiElement('ul', {}, __arya_uiNavItems(items, 'pagination')), {'aria-label': label, ...props});
  },
  segmented: (items, options = {}) => {
    const {id, bind, label = 'Choose an option', ...props} = options;
    __arya_uiTarget(id); __arya_uiKey(bind); __arya_uiItems(items, 'segmented', 20);
    const values = new Set();
    if (!items.length) __arya_uiError('segmented needs at least one option.');
    return __arya_uiComponent('fieldset', 'arya-segmented', [__arya_uiElement('legend', {class: 'arya-sr-only'}, label), __arya_uiElement('div', {}, items.map((item, index) => {
      __arya_uiOptions(item, ['value', 'label', 'disabled'], 'segmented item');
      if (typeof item.value !== 'string' || values.has(item.value) || item.disabled !== undefined && typeof item.disabled !== 'boolean') __arya_uiError('segmented values must be distinct text, with optional boolean disabled.');
      values.add(item.value);
      return __arya_ui.radio(item.label, item.value, {id: id + '-' + index, bind, disabled: item.disabled ?? false});
    }))], {...props, id});
  },
  search: (options = {}) => {
    const {id, bind, label = 'Search', placeholder = 'Search…', ...props} = options;
    __arya_uiTarget(id); if (bind !== undefined) __arya_uiKey(bind);
    return __arya_uiComponent('div', 'arya-search', [__arya_ui.label(label, id), __arya_uiElement('div', {class: 'arya-row'}, [__arya_ui.input({...props, id, type: 'search', placeholder, ...(bind === undefined ? {} : {bind})}), bind === undefined ? null : __arya_ui.button('Clear', {variant: 'ghost', action: __arya_ui.set(bind, ''), 'aria-label': 'Clear ' + label})])]);
  },
  meter: (value, options = {}) => {
    const {min = 0, max = 100, low, high, optimum, label = 'Usage', ...props} = options;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || !value?.[__arya_uiBinding] && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) __arya_uiError('meter needs a finite increasing range and a value within it (or a binding).');
    for (const item of [low, high, optimum]) if (item !== undefined && (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max)) __arya_uiError('meter thresholds must be within its range.');
    if (low !== undefined && high !== undefined && low > high) __arya_uiError('meter low cannot exceed high.');
    return __arya_uiComponent('meter', 'arya-meter', [], {...props, min, max, low, high, optimum, value, 'aria-label': label});
  },
  navbar: (options = {}) => {
    const {brand = 'Workspace', href = '/', links = [], actions = [], label = 'Main navigation', ...props} = options;
    return __arya_uiComponent('header', 'arya-navbar', [__arya_ui.link(brand, href, {class: 'arya-brand'}), __arya_uiElement('nav', {'aria-label': label}, __arya_uiElement('ul', {}, __arya_uiNavItems(links, 'navbar'))), __arya_uiComponent('div', 'arya-row arya-navbar-actions', actions)], props);
  },
  hero: (options = {}) => {
    const {eyebrow, title, description, actions = [], media, align = 'left', ...props} = options;
    if (title == null || !['left', 'center'].includes(align)) __arya_uiError('hero needs a title and left/center alignment.');
    return __arya_uiComponent('section', 'arya-hero arya-hero-' + align + (media == null ? '' : ' arya-hero-split'), [__arya_uiComponent('div', 'arya-stack arya-hero-copy', [eyebrow == null ? null : __arya_ui.text(eyebrow, {class: 'arya-eyebrow'}), __arya_ui.heading(title), description == null ? null : __arya_ui.text(description, {class: 'arya-muted'}), __arya_ui.row(actions)]), media == null ? null : __arya_uiComponent('div', 'arya-hero-media', media)], props);
  },
  features: (items, options = {}) => {
    const {title, description, ...props} = options;
    return __arya_uiComponent('section', 'arya-pattern arya-stack', [__arya_uiSectionHead(title, description), __arya_ui.grid(__arya_uiItems(items, 'features', 30).map(item => {
      __arya_uiOptions(item, ['title', 'description', 'icon'], 'feature');
      return __arya_ui.card([item.icon == null ? null : __arya_uiElement('span', {class: 'arya-feature-icon', 'aria-hidden': true}, item.icon), __arya_ui.heading(item.title, {level: 3}), __arya_ui.text(item.description, {class: 'arya-muted'})], {class: 'arya-feature'});
    }))], props);
  },
  pricing: (items, options = {}) => {
    const {title, description, ...props} = options;
    return __arya_uiComponent('section', 'arya-pattern arya-stack', [__arya_uiSectionHead(title, description), __arya_ui.grid(__arya_uiItems(items, 'pricing', 12).map(item => {
      __arya_uiOptions(item, ['title', 'price', 'interval', 'description', 'features', 'action', 'highlighted'], 'pricing plan');
      if (item.highlighted !== undefined && typeof item.highlighted !== 'boolean') __arya_uiError('pricing highlighted must be boolean.');
      return __arya_ui.card([item.highlighted ? __arya_ui.badge('Recommended', {tone: 'info'}) : null, __arya_ui.heading(item.title, {level: 3}), item.description == null ? null : __arya_ui.text(item.description, {class: 'arya-muted'}), __arya_uiElement('p', {class: 'arya-price'}, [__arya_uiElement('strong', {}, item.price), item.interval == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, item.interval)]), __arya_ui.list(item.features ?? []), item.action], {class: 'arya-pricing-card' + (item.highlighted ? ' arya-highlighted' : '')});
    }))], props);
  },
  testimonials: (items, options = {}) => {
    const {title, description, ...props} = options;
    return __arya_uiComponent('section', 'arya-pattern arya-stack', [__arya_uiSectionHead(title, description), __arya_ui.grid(__arya_uiItems(items, 'testimonials', 30).map(item => {
      __arya_uiOptions(item, ['quote', 'name', 'role', 'initials'], 'testimonial');
      return __arya_uiComponent('figure', 'arya-card arya-stack arya-testimonial', [__arya_uiElement('blockquote', {}, item.quote), __arya_uiElement('figcaption', {class: 'arya-row'}, [item.initials == null ? null : __arya_ui.avatar(item.initials, {label: item.name}), __arya_ui.stack([__arya_uiElement('strong', {}, item.name), item.role == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, item.role)])])]);
    }))], props);
  },
  faq: (items, options = {}) => {
    const {title = 'Frequently asked questions', description, ...props} = options;
    return __arya_uiComponent('section', 'arya-pattern arya-stack', [__arya_uiSectionHead(title, description), __arya_ui.accordion(__arya_uiItems(items, 'faq', 50).map(item => { __arya_uiOptions(item, ['question', 'answer', 'open'], 'faq item'); return {title: item.question, body: item.answer, open: item.open ?? false}; }), props)]);
  },
  cta: (options = {}) => {
    const {title, description, actions = [], ...props} = options;
    if (title == null) __arya_uiError('cta needs a title.');
    return __arya_uiComponent('section', 'arya-cta arya-card', [__arya_uiSectionHead(title, description), __arya_ui.row(actions)], props);
  },
  footer: (options = {}) => {
    const {brand, description, links = [], copyright, label = 'Footer navigation', ...props} = options;
    return __arya_uiComponent('footer', 'arya-footer arya-stack', [__arya_ui.row([__arya_ui.stack([brand == null ? null : __arya_uiElement('strong', {class: 'arya-brand'}, brand), description == null ? null : __arya_ui.text(description, {class: 'arya-muted'})]), __arya_uiElement('nav', {'aria-label': label}, __arya_uiElement('ul', {}, __arya_uiNavItems(links, 'footer')))]), copyright == null ? null : __arya_uiElement('small', {class: 'arya-muted'}, copyright)], props);
  },
};
`;
