import type {Plugin} from 'esbuild';
import {createHash} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {createProjectBuilder, writeProject} from './project.js';
/** Build-time adapter. esbuild controls bundling and final ESM/CJS format. */
export function aryaPlugin(options:{projectRoot:string}):Plugin {
  const root=resolve(options.projectRoot), builder=createProjectBuilder({projectRoot:root});
  return {name:'arya',setup(build) {
    build.onResolve({filter:/\.arya$/},args=>({path:resolve(args.resolveDir||root,args.path),namespace:'arya'}));
    build.onLoad({filter:/.*/,namespace:'arya'},async args=>{
      const canonicalRoot=await realpath(root);
      const outputDirectory=join(canonicalRoot,'.arya','esbuild',createHash('sha256').update(args.path).digest('hex').slice(0,16));
      const project=await builder.build(args.path,{outputDirectory});
      await writeProject(project);
      const entry=project.modules.find(m=>m.filename===project.entry)!;
      return {contents:entry.compilation.code,loader:'js',resolveDir:dirname(project.entryOutput),watchFiles:project.modules.map(m=>m.filename)};
    });
  }};
}
