#!/usr/bin/env node
// Optional, database-free host-boundary and worker-throughput measurements.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const types = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'otherIncome', 'otherExpense'];
if (process.argv[2] === '--peer') {
  const [, , , app, binary, size] = process.argv;
  const workers = require(join(app, 'backend/src/services/aryaWorkerPool.js'));
  const pool = new workers.AryaWorkerPool({size: Number(size), nativeExecutable: binary === 'node' ? null : binary});
  workers.runAryaTask = pool.run.bind(pool);
  if (pool.runPreparedReport) workers.runPreparedReportTask = pool.runPreparedReport.bind(pool);
  const reports = require(join(app, 'backend/src/services/reportPreparation.service.js'));
  const oracle = require(join(app, 'backend/src/arya/generated/report-preparation.cjs'));
  const lines = createInterface({input: process.stdin});
  for await (const line of lines) {
    const {count, jobs = 1, boundary = 'route'} = JSON.parse(line);
    const rows = Array.from({length: count}, (_, index) => ({accountId: index + 1, code: String(index), name: `Account ${index}`, index,
      type: types[index % types.length], balance: index % 5 ? '100.005' : '-20.035'}));
    const payload = {types, rows: rows.map(({index, type, balance}) => ({index, type, balance}))};
    const expected = boundary === 'route' ? reports.groupReportRowsByType(rows, types) : oracle.groupByType(payload.rows, types);
    const start = performance.now();
    const results = await Promise.all(Array.from({length: jobs}, () => boundary === 'route'
      ? reports.groupReportRowsByTypeAsync(rows, types) : pool.runPreparedReport
        ? pool.runPreparedReport(payload) : pool.run('report-groups', payload)));
    const wallMs = performance.now() - start;
    for (const result of results) assert.deepEqual(result, expected);
    process.stdout.write(JSON.stringify({wallMs, jobs, jobsPerSecond: jobs * 1000 / wallMs}) + '\n');
  }
  await pool.close();
} else {
  const out = resolve(process.argv[2]);
  const app = resolve(process.argv[3] || '../accounting-database');
  const sessionOption = process.argv.indexOf('--session-name');
  const sessionName = sessionOption < 0 ? 'report-routes' : process.argv[sessionOption + 1];
  const beforeApp = resolve(process.env.ARYA_BENCH_BASELINE_LEDGER || app);
  class Peer {
    constructor(application, binary, size) {
      this.child = spawn(process.execPath, [import.meta.filename, '--peer', application, binary, String(size)]);
      this.pending = [];
      this.errors = '';
      this.child.stderr.on('data', chunk => this.errors += chunk);
      createInterface({input: this.child.stdout}).on('line', line => this.pending.shift()?.resolve(JSON.parse(line)));
      this.exited = new Promise((resolveExit, reject) => {
        this.child.on('error', reject);
        this.child.on('close', code => {
          const error = new Error(`route peer exited ${code}: ${this.errors}`);
          for (const request of this.pending.splice(0)) request.reject(error);
          if (code) reject(error); else resolveExit();
        });
      });
    }
    request(value) { return new Promise((resolveResult, reject) => { this.pending.push({resolve: resolveResult, reject}); this.child.stdin.write(JSON.stringify(value) + '\n'); }); }
    async close() { this.child.stdin.end(); await this.exited; }
  }
  const raw = [], throughput = [];
  const labels = ['before', 'after', 'node'];
  for (let session = 0; session < 2; session++) {
    const peers = Object.fromEntries(labels.map(name => [name, new Peer(name === 'before' ? beforeApp : app, name === 'node' ? 'node' : join(out, name, 'worker'), 1)]));
    try {
      for (const count of [1000, 10000]) for (let sample = -3; sample < 9; sample++) {
        for (const name of (sample + session) % 2 ? [...labels].reverse() : labels) {
          const result = await peers[name].request({count});
          if (sample >= 0) raw.push({session, sample, rows: count, name, ...result});
        }
      }
    } finally { for (const peer of Object.values(peers)) await peer.close(); }
  }
  // Eight concurrent requests exercise every configured slot; totals include
  // admission, snapshots, queueing and result delivery, with checked outputs.
  for (const size of process.argv.includes('--latency-only') ? [] : [1, 2, 4]) {
    const peer = new Peer(app, join(out, 'after/worker'), size);
    try {
      for (let sample = -1; sample < 3; sample++) {
        const result = await peer.request({count: 10000, jobs: 8, boundary: 'pool'});
        if (sample >= 0) throughput.push({size, sample, rows: 10000, ...result});
      }
    } finally { await peer.close(); }
  }
  const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
  const summary = [];
  for (const rows of [1000, 10000]) for (const name of labels) {
    const values = raw.filter(row => row.rows === rows && row.name === name).map(row => row.wallMs);
    summary.push({rows, name, medianMs: quantile(values, .5), p95Ms: quantile(values, .95)});
  }
  const report = {boundary: 'Database-free report service: host preparation, actual inline/worker selection, calculation, result validation and sorting. Three warmups, nine samples/session, two sessions. Input generation and oracle checks excluded. Small reports follow the existing inline JavaScript route.',
    application: app, baselineApplication: beforeApp, sourceIdentity: JSON.parse(readFileSync(join(out, 'ledger-source.json'), 'utf8')), raw, summary,
    throughputBoundary: 'Native pool with eight concurrent 10000-row requests; one warmup and three measured batches per size. Snapshot/admission and result delivery included. Process startup excluded after warmup.', throughput};
  writeFileSync(join(out, sessionName + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({summary, throughput}, null, 2));
}
