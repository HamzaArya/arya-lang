import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, extname, isAbsolute, relative, resolve} from 'node:path';

// Repository links only: no network access, generated files, or package installs.
const root = process.cwd();
const omitted = new Set(['node_modules', 'dist', '.build', 'artifacts', '.arya', '__pycache__', 'media']);
const documents = [];
async function collect(path) {
  let info;
  try { info = await stat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (info.isDirectory()) {
    for (const entry of await readdir(path, {withFileTypes: true})) {
      if (!omitted.has(entry.name) && !entry.isSymbolicLink()) await collect(resolve(path, entry.name));
    }
  } else if (extname(path) === '.md') documents.push(path);
}
for (const path of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'SECURITY.md', 'docs', 'fixtures', 'editors', 'packages', 'brand']) await collect(resolve(root, path));
if (!documents.length) throw new Error('No repository documentation found.');
const withoutCode = source => source.replace(/\r\n/g, '\n').replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, block => block.replace(/[^\n]/g, ' '));
const anchors = new Map();
async function fragments(path) {
  if (anchors.has(path)) return anchors.get(path);
  const source = withoutCode(await readFile(path, 'utf8'));
  const ids = new Set(), counts = new Map();
  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const id = match[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1').replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(id) ?? 0;
    ids.add(count ? id + '-' + count : id); counts.set(id, count + 1);
  }
  for (const match of source.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  anchors.set(path, ids); return ids;
}
const failures = [];
let links = 0;
for (const path of documents.sort()) {
  const source = withoutCode(await readFile(path, 'utf8'));
  const targets = [...source.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g), ...source.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|[^\s]+)/gm)];
  for (const match of targets) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    links++;
    const label = relative(root, path) + ':' + (source.slice(0, match.index).split('\n').length);
    try {
      const [filename, fragment] = target.split('#');
      const destination = filename ? resolve(dirname(path), decodeURIComponent(filename.split('?')[0])) : path;
      const local = relative(root, destination);
      if (local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local)) throw new Error('link leaves the repository');
      await stat(destination);
      if (fragment && extname(destination) === '.md' && !(await fragments(destination)).has(decodeURIComponent(fragment))) throw new Error('heading/anchor does not exist');
    } catch (error) { failures.push(label + ': ' + target + ' (' + (error.code === 'ENOENT' ? 'target does not exist' : error.message) + ')'); }
  }
}
if (failures.length) {
  console.error(failures.join('\n')); process.exitCode = 1;
} else console.log(`Documentation OK: ${documents.length} Markdown files, ${links} local links and fragments.`);
