import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticTokens, encodeSemanticTokens, semanticTokenTypes, semanticTokenModifiers} from '../src/semantic-tokens.js';

test('semantic colors follow lexical bindings, immutable functions, imports, and shadowed parameters', () => {
  const source = `use std "ui" as ui
const name = "Arya"
const greet = fn(person) { return person + name }
fn outer(name) {
  let count = 0
  count += 1
  return ui.text(greet(name))
}
print(name)
`;
  const tokens = semanticTokens(source);
  const at = (position: number) => tokens.find(token => token.start === position)!;
  assert.equal(at(source.indexOf('ui\n')).type, 'namespace');
  assert.ok(at(source.indexOf('name =')).modifiers.includes('readonly'));
  assert.equal(at(source.indexOf('greet =')).type, 'function');
  assert.equal(at(source.indexOf('person)')).type, 'parameter');
  assert.equal(at(source.indexOf('name) {')).type, 'parameter');
  assert.equal(at(source.lastIndexOf('name))')).type, 'parameter');
  assert.equal(at(source.indexOf('text(')).type, 'method');
  assert.ok(at(source.indexOf('count +=')).modifiers.includes('modification'));
  assert.ok(at(source.indexOf("print(")).modifiers.includes('defaultLibrary'));
  assert.ok(at(source.lastIndexOf('name)')).modifiers.includes('readonly'));
});

test('optional chains, computed indexes, constructors, and Unicode use precise UTF-16 ranges', () => {
  const source = "use js \"node:buffer\" as data\nconst emoji = \"🌉\"; const key = \"name\"; const value = data?.Buffer?.from(\"hi\").length\nconst item = new data.Buffer(4)\nprint(data[key])";
  const tokens = semanticTokens(source);
  const at = (word: string, last = false) => tokens.find(token => token.start === (last ? source.lastIndexOf(word) : source.indexOf(word)))!;
  assert.equal(at('Buffer?').type, 'property');
  assert.equal(at('from(').type, 'method');
  assert.equal(at('length').type, 'property');
  assert.equal(at('Buffer(', true).type, 'class');
  assert.equal(at('key]').type, 'variable');
  assert.ok(at('key]').modifiers.includes('readonly'));
  const value = at('value =');
  assert.equal(value.character, source.split('\n')[1]!.indexOf('value'));
  assert.equal(value.length, 'value'.length);
  const encoded = encodeSemanticTokens(tokens);
  let line = 0, character = 0;
  for (let i = 0; i < encoded.length; i += 5) {
    const delta = encoded[i]!; line += delta; character = delta ? encoded[i + 1]! : character + encoded[i + 1]!;
    const token = tokens[i / 5]!;
    assert.equal(line, token.line); assert.equal(character, token.character);
    assert.equal(semanticTokenTypes[encoded[i + 3]!], token.type);
    for (const modifier of token.modifiers) assert.ok(encoded[i + 4]! & 1 << semanticTokenModifiers.indexOf(modifier));
  }
});

test('semantic analysis is passive and does not color string/comment text or unresolved names', () => {
  const source = 'use python "module_that_must_not_import_182" as py\nconst text = "say py.fn()"\n# say py.fn()\npy.execute()\nmissing()';
  const tokens = semanticTokens(source);
  assert.ok(tokens.some(token => token.start === source.indexOf('execute')));
  assert.ok(!tokens.some(token => source.slice(token.start, token.start + token.length) === 'missing'));
  assert.ok(!tokens.some(token => token.line === 2));
  assert.ok(!tokens.some(token => token.start > source.indexOf('"say') && token.start < source.indexOf('"\n#')));
  assert.deepEqual(semanticTokens('const incomplete = ('), []);
});
