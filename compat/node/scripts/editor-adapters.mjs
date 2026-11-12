import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';

/** Generate the same portable grammars for npm packages and standalone editor kits. */
export async function generateEditorAdapters(kit, keywords, builtins) {
  const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const plist = value => typeof value === 'string' ? `<string>${xml(value)}</string>` : Array.isArray(value) ? `<array>${value.map(plist).join('')}</array>` : `<dict>${Object.entries(value).map(([key, val]) => `<key>${xml(key)}</key>${plist(val)}`).join('')}</dict>`;
  const document = value => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plist(value)}</plist>\n`;
  const grammar = JSON.parse(await readFile('editors/vscode/syntaxes/arya.tmLanguage.json', 'utf8'));
  const save = async (path, text) => { const file = join(kit, 'editors', path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, text); };
  await save('textmate/Arya.tmbundle/Syntaxes/Arya.tmLanguage', document({ ...grammar, uuid: '2D53302E-20AD-46A3-93DC-3E16A0E8B88C' }));
  await save('textmate/Arya.tmbundle/info.plist', document({ name: 'Arya', description: 'Arya programming language syntax', uuid: '8A40BCEE-FF6C-4EA3-AEB9-CA00D74A2E78' }));
  await save('sublime/Arya.tmLanguage', document(grammar));
  await save('sublime/Arya.sublime-build', JSON.stringify({ cmd: ['arya', 'run', '$file'], selector: 'source.arya', file_regex: '^(.+\\.arya):([0-9]+):([0-9]+):' }, null, 2) + '\n');
  await save('sublime/Arya.sublime-settings', JSON.stringify({ tab_size: 2, translate_tabs_to_spaces: true }, null, 2) + '\n');

  const lists = { Keywords: keywords, Builtins: Object.keys(builtins), Constants: ['true', 'false', 'null'] };
  await save('kate/arya.xml', `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE language SYSTEM "language.dtd">
  <language name="Arya" version="1" kateversion="5.0" section="Sources" extensions="*.arya" mimetype="text/x-arya">
  <highlighting>
  ${Object.entries(lists).map(([name, words]) => `<list name="${name}">${words.map(word => `<item>${word}</item>`).join('')}</list>`).join('\n')}
  <contexts>
  <context name="Normal" attribute="Normal Text" lineEndContext="#stay">
  <DetectChar char="#" attribute="Comment" context="Comment"/><Detect2Chars char="/" char1="/" attribute="Comment" context="Comment"/>
  <DetectChar char="&quot;" attribute="String" context="DoubleString"/><DetectChar char="'" attribute="String" context="SingleString"/>
  <keyword String="Constants" attribute="Constant" context="#stay"/><keyword String="Keywords" attribute="Keyword" context="#stay"/><keyword String="Builtins" attribute="Function" context="#stay"/>
  <Float attribute="Number" context="#stay"/><Int attribute="Number" context="#stay"/>
  <DetectChar char="{" attribute="Operator" context="#stay" beginRegion="Block"/><DetectChar char="}" attribute="Operator" context="#stay" endRegion="Block"/>
  <AnyChar String="+-*/%=!&lt;&gt;" attribute="Operator" context="#stay"/>
  </context>
  <context name="Comment" attribute="Comment" lineEndContext="#pop"/>
  <context name="DoubleString" attribute="String" lineEndContext="#pop"><HlCStringChar attribute="Escape"/><DetectChar char="&quot;" attribute="String" context="#pop"/></context>
  <context name="SingleString" attribute="String" lineEndContext="#pop"><HlCStringChar attribute="Escape"/><DetectChar char="'" attribute="String" context="#pop"/></context>
  </contexts>
  <itemDatas>${[['Normal Text','dsNormal'],['Keyword','dsKeyword'],['Constant','dsConstant'],['Function','dsFunction'],['Number','dsDecVal'],['String','dsString'],['Escape','dsSpecialChar'],['Comment','dsComment'],['Operator','dsOperator']].map(([name, style]) => `<itemData name="${name}" defStyleNum="${style}"/>`).join('')}</itemDatas>
  </highlighting><general><keywords casesensitive="1"/><comments><comment name="singleLine" start="#"/></comments></general>
  </language>\n`);
  const keywordLists = {
    Comments: '00# 00// 01 02 03 04', 'Numbers, prefix1': '', 'Numbers, prefix2': '', 'Numbers, extras1': '', 'Numbers, extras2': '', 'Numbers, suffix1': '', 'Numbers, suffix2': '', 'Numbers, range': '',
    Operators1: '+ - * / % = ! < > ( ) [ ] , : ; .', Operators2: 'and or not', 'Folders in code1, open': '{', 'Folders in code1, middle': '', 'Folders in code1, close': '}', 'Folders in code2, open': '', 'Folders in code2, middle': '', 'Folders in code2, close': '', 'Folders in comment, open': '', 'Folders in comment, middle': '', 'Folders in comment, close': '',
    Keywords1: keywords.join(' '), Keywords2: Object.keys(builtins).join(' '), Keywords3: 'true false null', Keywords4: 'js python arya', Keywords5: '', Keywords6: '', Keywords7: '', Keywords8: '',
    Delimiters: `00" 01\\ 02" 03' 04\\ 05' 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23`,
  };
  const styles = ['DEFAULT','COMMENTS','LINE COMMENTS','NUMBERS','KEYWORDS1','KEYWORDS2','KEYWORDS3','KEYWORDS4','KEYWORDS5','KEYWORDS6','KEYWORDS7','KEYWORDS8','OPERATORS','FOLDER IN CODE1','FOLDER IN CODE2','FOLDER IN COMMENT','DELIMITERS1','DELIMITERS2','DELIMITERS3','DELIMITERS4','DELIMITERS5','DELIMITERS6','DELIMITERS7','DELIMITERS8'];
  await save('notepad-plus-plus/Arya.xml', `<?xml version="1.0" encoding="UTF-8"?>
  <NotepadPlus><UserLang name="Arya" ext="arya" udlVersion="2.1"><Settings><Global caseIgnored="no" allowFoldOfComments="no" foldCompact="no" forcePureLC="0" decimalSeparator="0"/><Prefix ${Array.from({length:8},(_,i)=>`Keywords${i+1}="no"`).join(' ')}/></Settings><KeywordLists>${Object.entries(keywordLists).map(([name,text])=>`<Keywords name="${name}">${xml(text)}</Keywords>`).join('')}</KeywordLists><Styles>${styles.map((name,index)=>`<WordsStyle name="${name}" fgColor="${name.includes('COMMENT')?'687B68':name.includes('DELIMITER')?'087F5B':name.includes('KEYWORD')?'5546C4':name==='NUMBERS'?'9B5B18':'242A35'}" bgColor="FFFFFF" fontName="" fontStyle="${name==='KEYWORDS1'?'1':'0'}" nesting="0"/>`).join('')}</Styles></UserLang></NotepadPlus>\n`);
}
