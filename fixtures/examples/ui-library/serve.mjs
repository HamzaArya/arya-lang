import { once } from 'node:events';
import { start, stop } from './.arya/build/main.arya.mjs';

const server = start(Number(process.argv[2] ?? 3040));
await once(server, 'listening');
console.log('Arya UI library: http://127.0.0.1:' + server.address().port);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => stop(server).catch(error => { console.error(error); process.exitCode = 1; }));
}
