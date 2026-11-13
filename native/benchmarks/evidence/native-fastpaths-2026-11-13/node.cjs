const rl=require('node:readline').createInterface({input:process.stdin});
function fib(n){return n<2?n:fib(n-1)+fib(n-2)}
function work(kind,n){let result=0;if(kind==='sum'){for(let i=0;i<n;i++)result+=i;return result}
if(kind==='mix'){result=1;for(let i=0;i<n;i++)result=(result*1.000001+i%97)%1000003;return result}
if(kind==='fib')return fib(n);if(kind==='records'){let rows=[];for(let i=0;i<n;i++)rows.push({index:i,balance:i*.5,type:i%2});for(const row of rows)if(row.type===1)result+=row.balance;return[rows.length,result]}
if(kind==='map'){let values=new Map;for(let i=0;i<n;i++)values.set('key:'+i,i);for(let i=0;i<n;i++)result+=values.get('key:'+i);return result}
if(kind==='json'){let value={balance:'100.005',type:'asset',items:[1,2,3]};for(let i=0;i<n;i++)result+=JSON.parse(JSON.stringify(value)).items[1];return result}
if(kind==='strings'){for(let i=0;i<n;i++)result+=(' row '+i).trim().toUpperCase().split(' ').join('-').length;return result}
let total=0n;const amount=BigInt('123456789012345678901234567890005');for(let i=0;i<n;i++)total+=amount;let text=total.toString().padStart(4,'0');return(text.slice(0,-3)+'.'+text.slice(-3)).replace(/0+$/,'').replace(/\.$/,'')}
rl.on('line',line=>{let r=JSON.parse(line),start=process.cpuUsage(),value=work(r.kind,r.n),cpu=process.cpuUsage(start);console.log(JSON.stringify({value,cpuMs:(cpu.user+cpu.system)/1000}))});
