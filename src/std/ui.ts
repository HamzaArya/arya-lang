import { uiClient } from '../ui-client.js';
import { uiStyles } from '../ui-styles.js';
import { uiMotionRuntime } from './ui-motion.js';
import { uiComponentsRuntime } from './ui-components.js';
import { uiPreviewRuntime } from './ui-preview.js';
import { uiPatternsRuntime } from './ui-patterns.js';
import { uiTemplatesRuntime } from './ui-templates.js';

/** Declarative components execute on the server; bindings and actions are serialized data. */
export const uiRuntime = String.raw`
const __arya_uiNode = Symbol.for('arya.ui.node');
const __arya_uiBinding = Symbol.for('arya.ui.binding');
const __arya_uiAction = Symbol.for('arya.ui.action');
const __arya_uiMotion = Symbol.for('arya.ui.motion');
const __arya_uiOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const __arya_uiError = message => { throw Object.assign(new TypeError('ui: ' + message), { code: 'ARYA_UI' }); };
const __arya_uiObject = value => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const __arya_uiKey = (value, path = false) => {
  if (typeof value !== 'string' || value.length > 256 || !(path ? /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$/ : /^[A-Za-z_][\w-]*$/).test(value) || value.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) __arya_uiError('state keys must be simple names; bindings may read dotted paths.');
  return value;
};
const __arya_uiEscape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const __arya_uiJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
const __arya_uiData = (value, bindings = false) => {
  const seen = new Set();
  let count = 0;
  const copy = (item, depth) => {
    if (++count > 10000 || depth > 32) __arya_uiError('data exceeds the depth or item limit.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return item;
    if (bindings && item?.[__arya_uiBinding]) return { $aryaBind: __arya_uiBindingData(item) };
    if (!Array.isArray(item) && !__arya_uiObject(item) || seen.has(item)) __arya_uiError('state and action values must be finite JSON data without cycles.');
    if (!item || typeof item !== 'object') __arya_uiError('state and action values must be JSON data.');
    if (Array.isArray(item) && item.length > 10000) __arya_uiError('data arrays cannot exceed 10000 items.');
    seen.add(item);
    const result = Array.isArray(item) ? [] : Object.create(null);
    for (const key of Object.keys(item)) {
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (!property || !('value' in property) || ['__proto__', 'prototype', 'constructor'].includes(key) || bindings && key === '$aryaBind') __arya_uiError('unsafe data property: ' + key);
      result[key] = copy(property.value, depth + 1);
    }
    seen.delete(item);
    return result;
  };
  const result = copy(value, 0);
  if (__arya_mysqlBuffer.byteLength(JSON.stringify(result), 'utf8') > 1024 * 1024) __arya_uiError('data exceeds 1 MiB.');
  return result;
};
const __arya_uiOptions = (value, names, label) => {
  if (!__arya_uiObject(value)) __arya_uiError(label + ' options must be an object.');
  for (const key of Object.keys(value)) if (!names.includes(key)) __arya_uiError('unknown ' + label + ' option: ' + key);
  return value;
};
const __arya_uiBind = (key, fallback = '') => {
  __arya_uiKey(key, true);
  if (fallback !== null && !['string', 'number', 'boolean'].includes(typeof fallback) || typeof fallback === 'number' && !Number.isFinite(fallback)) __arya_uiError('binding fallback must be a finite primitive value.');
  return Object.freeze({ [__arya_uiBinding]: true, key, fallback });
};
const __arya_uiRead = (state, binding) => {
  if (binding.op === 'not') return !__arya_uiRead(state, binding.value);
  if (binding.op === 'equal') return Object.is(__arya_uiRead(state, binding.value), binding.compare);
  let value = state;
  for (const key of binding.key.split('.')) value = value != null && __arya_uiOwn(value, key) ? value[key] : undefined;
  return value ?? binding.fallback;
};
const __arya_uiText = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
${uiMotionRuntime}
const __arya_uiMakeAction = (kind, values) => Object.freeze({ [__arya_uiAction]: true, kind, ...values });
const __arya_uiActions = (value, depth = 0, budget = { count: 0 }) => {
  if (depth > 8 || ++budget.count > 1000) __arya_uiError('actions exceed the nesting or item limit.');
  if (Array.isArray(value)) { if (value.length > 100) __arya_uiError('too many actions.'); return value.map(item => __arya_uiActions(item, depth + 1, budget)); }
  if (!value?.[__arya_uiAction]) __arya_uiError('action expects a ui action or a list of actions. Server functions cannot run in the browser.');
  return Object.fromEntries(Object.entries(value));
};
const __arya_uiElement = (tag, props = {}, children = []) => {
  if (!['main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'input', 'textarea', 'select', 'option', 'label', 'form', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'pre', 'code', 'hr', 'br', 'img', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary', 'output', 'progress', 'dialog', 'fieldset', 'legend', 'figure', 'figcaption', 'blockquote', 'dl', 'dt', 'dd', 'meter'].includes(tag)) __arya_uiError('unsupported element: ' + tag);
  if (!__arya_uiObject(props)) __arya_uiError('element properties must be an object.');
  return Object.freeze({ [__arya_uiNode]: true, tag, props: Object.freeze({ ...props }), children });
};
const __arya_uiComponent = (tag, className, children, options = {}) => __arya_uiElement(tag, { ...options, class: className + (options.class ? ' ' + options.class : '') }, children);
${uiComponentsRuntime}
${uiPatternsRuntime}
const __arya_ui = Object.freeze({
  ...__arya_uiComponents,
  ...__arya_uiPatterns,
  templates: () => __arya_uiTemplateCatalog.map(item => item.name),
  template: (name, options = {}) => __arya_uiTemplate(name, options),
  bind: __arya_uiBind,
  motion: __arya_uiMotionSpec,
  element: __arya_uiElement,
  stack: (children, options = {}) => __arya_uiComponent('div', 'arya-stack', children, options),
  row: (children, options = {}) => __arya_uiComponent('div', 'arya-row', children, options),
  grid: (children, options = {}) => __arya_uiComponent('div', 'arya-grid', children, options),
  card: (children, options = {}) => __arya_uiComponent('section', 'arya-card arya-stack', children, options),
  heading: (text, options = {}) => {
    const { level = 1, ...props } = options;
    if (!Number.isInteger(level) || level < 1 || level > 6) __arya_uiError('heading level must be 1–6.');
    return __arya_uiElement('h' + level, props, text);
  },
  text: (value, options = {}) => __arya_uiElement('p', options, value),
  button: (label, options = {}) => {
    const { variant = 'primary', ...props } = options;
    if (!['primary', 'secondary', 'ghost', 'danger'].includes(variant)) __arya_uiError('button variant must be primary, secondary, ghost, or danger.');
    return __arya_uiComponent('button', 'arya-' + variant, label, { type: 'button', ...props });
  },
  input: (options = {}) => __arya_uiElement('input', { type: 'text', ...options }),
  label: (text, forId) => __arya_uiElement('label', { for: forId }, text),
  form: (children, options = {}) => __arya_uiComponent('form', 'arya-stack', children, options),
  select: (items, options = {}) => {
    if (!Array.isArray(items) || items.length > 1000) __arya_uiError('select expects up to 1000 {value, label} options.');
    return __arya_uiElement('select', options, items.map(item => { __arya_uiOptions(item, ['value', 'label'], 'select item'); return __arya_uiElement('option', { value: item.value }, item.label); }));
  },
  set: (key, value) => __arya_uiMakeAction('set', { key: __arya_uiKey(key), value: __arya_uiData(value, true) }),
  toggle: key => __arya_uiMakeAction('toggle', { key: __arya_uiKey(key) }),
  increment: (key, step = 1) => {
    if (typeof step !== 'number' || !Number.isFinite(step)) __arya_uiError('increment step must be finite.');
    return __arya_uiMakeAction('increment', { key: __arya_uiKey(key), step });
  },
  request: (path, options = {}) => {
    __arya_uiOptions(options, ['method', 'body', 'result', 'pending', 'error', 'timeoutMs'], 'request');
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\s\u0000-\u001f\u007f#]/.test(path)) __arya_uiError('request path must be an absolute same-origin path such as /api/report.');
    const method = options.method ?? 'GET', timeoutMs = options.timeoutMs ?? 10000;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || method === 'GET' && options.body !== undefined) __arya_uiError('request method must be GET, POST, PUT, PATCH, or DELETE; GET cannot have a body.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) __arya_uiError('request timeoutMs must be 1–120000.');
    const spec = { path, method, timeoutMs };
    for (const key of ['result', 'pending', 'error']) if (options[key] !== undefined) spec[key] = __arya_uiKey(options[key]);
    if (new Set(['result', 'pending', 'error'].map(key => spec[key]).filter(Boolean)).size !== ['result', 'pending', 'error'].filter(key => spec[key]).length) __arya_uiError('request result, pending, and error must use different state keys.');
    if (options.body !== undefined) spec.body = __arya_uiData(options.body, true);
    return __arya_uiMakeAction('request', spec);
  },
  page: (options = {}) => {
    __arya_uiOptions(options, ['title', 'description', 'lang', 'theme', 'state', 'body', 'css', 'nonce'], 'page');
    const state = __arya_uiData(options.state ?? {});
    if (!__arya_uiObject(state)) __arya_uiError('page state must be an object.');
    for (const key of Object.keys(state)) __arya_uiKey(key);
    const theme = options.theme ?? 'auto', lang = options.lang ?? 'en';
    if (!['dark', 'light', 'auto'].includes(theme) || typeof lang !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{0,34}$/.test(lang)) __arya_uiError('invalid page theme or language.');
    for (const key of ['title', 'description', 'css']) if (options[key] !== undefined && typeof options[key] !== 'string') __arya_uiError('page ' + key + ' must be text.');
    if (/<\/style/i.test(options.css ?? '')) __arya_uiError('page CSS cannot contain a closing style tag.');
    const nonce = options.nonce ?? __arya_randomUUID().replace(/-/g, '');
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9+/_-]{16,128}={0,2}$/.test(nonce)) __arya_uiError('nonce must be 16–128 base64 or URL-safe characters.');
    const ids = new Set(['arya-ui-state', 'arya-ui-error', 'arya-ui-toasts']);
    let nodes = 0;
    const attr = (name, value) => {
      if (value == null || value === false && !name.startsWith('aria-') && !name.startsWith('data-')) return '';
      if (value === true && ['checked', 'disabled', 'hidden', 'required', 'multiple', 'readonly', 'selected', 'open', 'autofocus', 'novalidate'].includes(name)) return ' ' + name;
      if (!['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) __arya_uiError('attribute ' + name + ' must be a finite primitive value.');
      if (['href', 'src'].includes(name) && (/^[\s\u0000-\u001f]*[^/?#]*:/i.test(String(value)) && !/^(?:https?:|mailto:|tel:)/i.test(String(value)) || /[\u0000-\u001f\u007f\\]/.test(String(value)))) __arya_uiError('unsupported URL in ' + name + '.');
      return ' ' + name + '="' + __arya_uiEscape(value) + '"';
    };
    const render = (value, depth = 0) => {
      if (++nodes > 10000 || depth > 64) __arya_uiError('page exceeds the element or nesting limit.');
      if (Array.isArray(value)) return value.map(item => render(item, depth + 1)).join('');
      if (value == null || value === false) return '';
      if (value?.[__arya_uiBinding]) return '<span data-arya-text="' + __arya_uiEscape(JSON.stringify(__arya_uiBindingData(value))) + '">' + __arya_uiEscape(__arya_uiText(__arya_uiRead(state, value))) + '</span>';
      if (!value?.[__arya_uiNode]) {
        if (!['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) __arya_uiError('children must be components, bindings, or primitive text.');
        return __arya_uiEscape(value);
      }
      let attributes = '', model;
      const bindings = {};
      for (const [name, original] of Object.entries(value.props)) {
        if (name === 'action') {
          if (!['button', 'form'].includes(value.tag)) __arya_uiError('actions are supported on buttons and forms.');
          attributes += attr('data-arya-action', JSON.stringify(__arya_uiActions(original))); continue;
        }
        if (name === 'animate') {
          const motion = __arya_uiGetMotion(original);
          attributes += attr('data-arya-motion', JSON.stringify(motion)); continue;
        }
        if (name === 'bind') {
          if (!['input', 'textarea', 'select'].includes(value.tag)) __arya_uiError('bind is supported on input, textarea, and select.');
          model = __arya_uiKey(original);
          if (value.props.type === 'radio') {
            bindings.checked = {op: 'equal', value: {key: model, fallback: ''}, compare: String(value.props.value ?? 'on')};
            if (value.props.name === undefined) attributes += attr('name', model);
          } else bindings[value.props.type === 'checkbox' ? 'checked' : 'value'] = { key: model, fallback: '' };
          attributes += attr('data-arya-model', model); continue;
        }
        if (!/^[a-z][a-z0-9-]*$/.test(name) || /^on/.test(name) || ['style', 'srcdoc', 'formaction', 'action', 'http-equiv', 'nonce'].includes(name) || name.startsWith('data-arya-')) __arya_uiError('unsupported attribute: ' + name);
        if (name === 'id') { if (typeof original !== 'string' || !original || ids.has(original)) __arya_uiError('element ids must be unique nonempty text.'); ids.add(original); }
        if (original?.[__arya_uiBinding]) {
          if (!['value', 'checked', 'disabled', 'hidden', 'title'].includes(name) && !name.startsWith('aria-')) __arya_uiError('binding is not allowed on attribute ' + name + '.');
          bindings[name] = __arya_uiBindingData(original);
          const initial = __arya_uiRead(state, original);
          attributes += attr(name, ['checked', 'disabled', 'hidden'].includes(name) ? Boolean(initial) : initial);
        } else attributes += attr(name, original);
      }
      if (model && (value.props.type !== 'radio' && value.props.value !== undefined || value.props.checked !== undefined)) __arya_uiError('use bind or a value/checked property, not both.');
      if (model && value.props.type === 'file') __arya_uiError('file inputs do not support JSON state binding.');
      if (model && value.props.type === 'password' && __arya_uiRead(state, bindings.value) !== '') __arya_uiError('password bindings must start empty; never send an existing password in page state.');
      if (model && value.tag === 'select' && value.props.multiple) __arya_uiError('bound selects support one selected value.');
      if (model && value.tag === 'input') { const name = ['checkbox', 'radio'].includes(value.props.type) ? 'checked' : 'value'; const initial = __arya_uiRead(state, bindings[name]); attributes += attr(name, name === 'checked' ? Boolean(initial) : initial); }
      if (Object.keys(bindings).length) attributes += attr('data-arya-bind', JSON.stringify(bindings));
      const voidElement = ['input', 'br', 'hr', 'img'].includes(value.tag);
      let childNodes = value.children;
      if (model && value.tag === 'select') {
        const selected = __arya_uiText(__arya_uiRead(state, bindings.value));
        const select = child => Array.isArray(child) ? child.map(select) : child?.[__arya_uiNode] && child.tag === 'option' ? __arya_uiElement('option', {...child.props, selected: __arya_uiText(child.props.value) === selected}, child.children) : child;
        childNodes = select(childNodes);
      }
      const children = model && value.tag === 'textarea' ? __arya_uiEscape(__arya_uiText(__arya_uiRead(state, bindings.value))) : render(childNodes, depth + 1);
      if (voidElement && children) __arya_uiError('void element ' + value.tag + ' cannot have children.');
      return '<' + value.tag + attributes + '>' + (voidElement ? '' : children + '</' + value.tag + '>');
    };
    const body = render(options.body ?? []);
    const policy = "default-src 'self'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
    return '<!doctype html><html lang="' + __arya_uiEscape(lang) + '" data-theme="' + theme + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + __arya_uiEscape(policy) + '"><title>' + __arya_uiEscape(options.title ?? 'Arya App') + '</title><meta name="description" content="' + __arya_uiEscape(options.description ?? '') + '"><style nonce="' + nonce + '">' + ${JSON.stringify(uiStyles)} + (options.css ?? '') + '</style></head><body><main class="arya-page"><div id="arya-ui-error" role="alert" hidden></div>' + body + '</main><script id="arya-ui-state" type="application/json" nonce="' + nonce + '">' + __arya_uiJSON({ state }) + '</script><script nonce="' + nonce + '">' + ${JSON.stringify(uiClient)} + '</script></body></html>';
  }
});
${uiTemplatesRuntime}
${uiPreviewRuntime}
`;
