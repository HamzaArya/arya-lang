import { once } from 'node:events';
import { start, stop } from './.arya/build/main.arya.mjs';

const port = Number(process.argv[2] ?? 3000);
const server = start(port);
await once(server, 'listening');
console.log('Arya UI: http://127.0.0.1:' + server.address().port);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => stop(server).catch(error => { console.error(error); process.exitCode = 1; }));
}
