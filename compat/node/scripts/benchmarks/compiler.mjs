import {performance} from 'node:perf_hooks';
export function measure(api) {
  const source = Array.from({length:200},(_,i)=>`export fn item${i}(n: number): number => n + ${i}`).join('\n');
  const documents = Array.from({length:200},(_,i)=>({uri:`file:///bench/item${i}.arya`,source:`export fn item(n: number): number => n + ${i}`}));
  documents.push({uri:'file:///bench/main.arya',source:'use arya "./item0.arya" as lib\nexport const value = lib.item(2)'});
  const sample = (action, count) => {
    for(let i=0;i<5;i++)action(i);
    const timings=[];
    for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<count;i++)action(i+round*count);timings.push((performance.now()-start)/count);}
    timings.sort((a,b)=>a-b);return Number(timings[3].toFixed(4));
  };
  const cache=api.createWorkspaceAnalysisCache();cache.analyze(documents);
  const analyzeMs=sample(()=>api.analyzeSource(source),10);
  const compileMs=sample(()=>api.compile(source),5);
  const unchangedWorkspaceMs=sample(()=>cache.analyze(documents),100);
  let change=0;
  const singleModuleEditMs=sample(()=>{documents[100]={...documents[100],source:`export fn item(n: number): number => n + ${change++}`};cache.analyze(documents);},20);
  const analysis=cache.analyze(documents);
  const cachedReferencesMs=sample(()=>api.referencesInWorkspace(documents,documents[200].uri,documents[200].source.lastIndexOf('item'),analysis),100);
  const outputBytes=Buffer.byteLength(api.compile('use std "list" as list\nprint(list.sum([1,2,3]))').code);
  return {analyzeMs,compileMs,unchangedWorkspaceMs,singleModuleEditMs,cachedReferencesMs,listProgramBytes:outputBytes};
}
