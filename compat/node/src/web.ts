import type * as Ast from './ast.js';
import type { Token } from './compiler.js';

/** The view parser uses the language parser for embedded Arya expressions. */
export interface ViewCursor {
  readonly current: Token;
  take(): Token;
  is(text: string): boolean;
  match(text: string): boolean;
  expect(text: string): void;
  separators(): void;
  expression(): { node: Ast.Expression };
  fail(message: string, token: Token): never;
}

const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const forbiddenAttributes = /^(?:on|srcdoc$)/i;

/** Parse the opening `{` of a contextual `view { ... }` expression. */
export function parseView(cursor: ViewCursor): { children: Ast.ViewNode[]; expressions: Ast.Expression[]; html: boolean } {
  const expressions: Ast.Expression[] = [];
  let depth = 0;
  const fail = (message: string, token = cursor.current): never => cursor.fail(message, token);
  const lines = () => { while (cursor.current.kind === 'newline') cursor.take(); };
  const name = (attribute = false, preserveCase = false): { text: string; end: number; token: Token } => {
    const token = cursor.current;
    if (token.kind !== 'word') fail(attribute ? 'Expected an HTML attribute name.' : 'Expected an HTML element name.');
    cursor.take();
    let text = token.text, end = token.end;
    while ((cursor.is('-') || (attribute && cursor.is(':'))) && cursor.current.start === end) {
      const separator = cursor.take();
      const part = cursor.current;
      if (!['word', 'number'].includes(part.kind) || part.start !== separator.end || !/^[A-Za-z0-9_]+$/.test(part.text)) fail('Complete the HTML name after ' + separator.text + '.', part);
      text += separator.text + cursor.take().text; end = part.end;
    }
    if (!(attribute ? /^[A-Za-z_][A-Za-z0-9_:.-]*$/ : /^[A-Za-z][A-Za-z0-9_-]*$/).test(text)) fail('Invalid HTML name: ' + text, token);
    return { text: preserveCase ? text : text.toLowerCase(), end, token };
  };
  const dynamic = (): Ast.ViewNode => {
    cursor.expect('('); lines();
    const value = cursor.expression(); expressions.push(value.node);
    lines(); cursor.expect(')');
    return {kind: 'text', value: value.node};
  };
  const children = (): Ast.ViewNode[] => {
    cursor.expect('{'); cursor.separators();
    const items: Ast.ViewNode[] = [];
    while (!cursor.is('}')) {
      if (cursor.current.kind === 'eof') fail("Expected '}' to close the view element.");
      if (cursor.current.kind === 'string') {const token = cursor.take(); items.push({kind: 'text', value: {kind: 'literal', token, value: token.text}});}
      else if (cursor.is('(')) items.push(dynamic());
      else items.push(element());
      cursor.separators();
    }
    cursor.expect('}');
    return items;
  };
  const element = (): Ast.ViewNode => {
    if (++depth > 64) fail('View elements are nested too deeply. Split the page into smaller views.');
    try {
      const tag = name();
      const attributes: {name: string; value: Ast.Expression}[] = [], names = new Set<string>();
      // Adjacency distinguishes attributes from parenthesized text: p(title="x") versus p (value).
      if (cursor.is('(') && cursor.current.start === tag.end) {
        cursor.take(); lines();
        while (!cursor.is(')')) {
          const attribute = name(true);
          if (forbiddenAttributes.test(attribute.text)) fail('Inline event and srcdoc attributes are unavailable; use a literal script element for browser code.', attribute.token);
          if (names.has(attribute.text)) fail('Duplicate HTML attribute: ' + attribute.text, attribute.token);
          names.add(attribute.text);
          cursor.expect('='); lines();
          const value = cursor.expression(); expressions.push(value.node);
          attributes.push({name: attribute.text, value: value.node});
          lines();
          if (!cursor.match(',')) break;
          lines();
        }
        cursor.expect(')');
      }
      const classes: string[] = [];
      while (cursor.current.kind === 'word') classes.push(name(true, true).text);
      if (classes.length) {
        if (names.has('class')) fail('Choose a class attribute or shorthand classes for this element.', tag.token);
        attributes.push({name: 'class', value: {kind: 'literal', token: tag.token, value: classes.join(' ')}});
      }
      const content: Ast.ViewNode[] = [];
      if (tag.text === 'script' || tag.text === 'style') {
        if (cursor.current.kind !== 'string') fail('A ' + tag.text + ' element requires a literal string; use triple quotes for multiline code.');
        const literal = cursor.take();
        if (new RegExp('</' + tag.text + '(?:[\\s/>]|$)', 'i').test(literal.text)) fail('A ' + tag.text + ' literal cannot contain its closing HTML tag.', literal);
        return {kind: 'element', tag: tag.text, attributes, children: [], raw: literal.text};
      }
      if (cursor.is('{')) content.push(...children());
      else if (cursor.current.kind === 'string') {const token = cursor.take(); content.push({kind: 'text', value: {kind: 'literal', token, value: token.text}});}
      else if (cursor.is('(')) content.push(dynamic());
      if (voidElements.has(tag.text) && content.length) fail('The void HTML element ' + tag.text + ' cannot contain children.', tag.token);
      return {kind: 'element', tag: tag.text, attributes, children: content};
    } finally { depth--; }
  };
  const root = children();
  const html = root.some(item => item.kind === 'element' && item.tag === 'html');
  if (html && (root.length !== 1 || (root[0]?.kind !== 'element' || root[0].tag !== 'html'))) fail('An html element must be the only root in a view.');
  return {children: root, html, expressions};
}

/** Browser markup helpers are emitted only for programs containing a view. */
export const webRuntime = String.raw`
const __arya_text = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const __arya_attributes = attributes => attributes.map(([name, value]) => {
  if (!/^[a-z_][a-z0-9_:.-]*$/i.test(name) || /^(?:on|srcdoc$)/i.test(name)) throw new TypeError('Invalid view attribute: ' + name);
  if (value === false || value === null || value === undefined) return '';
  if (['href','src','action','formaction','poster','xlink:href'].includes(name)) {
    const normalized = String(value).replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
    if (scheme && !['http','https','mailto','tel'].includes(scheme[1])) throw new TypeError('Unsupported URL scheme in view attribute: ' + name);
  }
  return ' ' + name + (value === true ? '' : '="' + __arya_text(value) + '"');
}).join('');
const __arya_element = (tag, attributes, children) => {
  const opening = '<' + tag + __arya_attributes(attributes) + '>';
  if (['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag)) return opening;
  return opening + children.join('') + '</' + tag + '>';
};
const __arya_rawElement = (tag, attributes, source) => {
  if (new RegExp('</' + tag + '(?:[\\s/>]|$)', 'i').test(source)) throw new TypeError('A raw view element cannot contain its closing HTML tag.');
  return '<' + tag + __arya_attributes(attributes) + '>' + source + '</' + tag + '>';
};`;
