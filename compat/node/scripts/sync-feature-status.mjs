import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const features = JSON.parse(await readFile('docs/feature-status.json', 'utf8'));
const ids = new Set();
for (const feature of features) {
  if (
    !feature.id ||
    ids.has(feature.id) ||
    !feature.name ||
    !feature.scope ||
    !['published', 'unreleased', 'planned'].includes(feature.status) ||
    (feature.status === 'published' && !feature.since)
  )
    throw new Error('Invalid or duplicate feature status.');
  ids.add(feature.id);
  const guide = resolve('docs', feature.guide);
  if (!guide.startsWith(resolve('docs') + '/'))
    throw new Error('Feature guide must remain in docs.');
  await stat(guide);
}
const labels = {
  published: 'Published',
  unreleased: 'Unreleased source',
  planned: 'Planned / unqualified',
};
const start = '<!-- feature-status:start -->',
  end = '<!-- feature-status:end -->';
let failed = false;
for (const filename of ['docs/README.md', 'docs/tooling-evidence.md']) {
  const rows = features.map((feature) => {
    const guide = relative(dirname(resolve(filename)), resolve('docs', feature.guide))
      .split('\\')
      .join('/');
    return `| [${feature.name}](${guide}) | ${labels[feature.status]}${feature.since ? ' since ' + feature.since : ''} | ${feature.scope} |`;
  });
  const replacement = [
    start,
    '| Feature | Availability | Scope |',
    '| --- | --- | --- |',
    ...rows,
    end,
  ].join('\n');
  const source = await readFile(filename, 'utf8'),
    a = source.indexOf(start),
    b = source.indexOf(end);
  if (a < 0 || b < a || source.indexOf(start, a + start.length) !== -1)
    throw new Error('Missing or duplicate feature-status markers in ' + filename);
  const updated = source.slice(0, a) + replacement + source.slice(b + end.length);
  if (source === updated) continue;
  if (process.argv.includes('--check')) {
    console.error(filename + ': stale feature status; run npm run docs:sync');
    failed = true;
  } else await writeFile(filename, updated);
}
if (failed) process.exitCode = 1;
