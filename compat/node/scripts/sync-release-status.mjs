import {readFile,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
const configuration=JSON.parse(await readFile('docs/release-status.json','utf8'));
const recordPath=resolve('docs',configuration.publicationRecord), record=JSON.parse(await readFile(recordPath,'utf8'));
const compiler=record.packages.find(pkg=>pkg.name==='arya-language');
if(!compiler || compiler.version!==record.version || !record.ci || record.ci.matrixConclusion!=='success')throw new Error('Release status requires a matching verified publication record.');
const start='<!-- release-status:start -->',end='<!-- release-status:end -->';
let failed=false;
for(const filename of ['README.md','docs/stable-release-plan.md','docs/release-readiness.md','SECURITY.md']){
  const link=relative(dirname(resolve(filename)),recordPath).split('\\').join('/');
  const replacement=`${start}\nPublished experimental preview: **${record.version}**, compiler and creator on npm’s \`${compiler.distTags.next===record.version?'next':'latest'}\` channel; editor extension **${record.extension.version}**. The recorded release passed **${record.ci.matrixJobs}** ${record.ci.platforms.join('/')} jobs on Node ${record.ci.nodeVersions.join(', ')}. See the [publication record](${link}). This evidence describes the published artifacts; subsequent source changes require separate qualification.\n${end}`;
  const source=await readFile(filename,'utf8'),a=source.indexOf(start),b=source.indexOf(end);
  if(a<0||b<a)throw new Error(`Missing release-status markers in ${filename}`);
  const updated=source.slice(0,a)+replacement+source.slice(b+end.length);
  if(updated===source)continue;
  if(process.argv.includes('--check')){console.error(`${filename}: generated release status is stale; run npm run docs:sync`);failed=true;}
  else await writeFile(filename,updated);
}
if(failed)process.exitCode=1;
