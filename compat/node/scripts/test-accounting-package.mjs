import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd(),
  require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:accounting-package.');
const portableOnly = process.argv.includes('--portable-only');
if (process.argv.slice(2).some((arg) => arg !== '--portable-only'))
  throw new Error('Use --portable-only to verify just the portable archive.');
const variants = portableOnly ? [false] : [false, true];
const { buildProject, writeProject } = require('../dist/project.cjs');
const records = [];
function run(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
for (const native of variants) {
  const filename = `arya-accounting-${manifest.version}${native ? '-' + process.platform + '-' + process.arch : ''}.tgz`;
  const archive = resolve('artifacts', filename);
  const temp = await mkdtemp(join(tmpdir(), 'arya-accounting-install-'));
  try {
    await writeFile(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run(
      [
        npm,
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        join(temp, 'empty-cache'),
        archive,
      ],
      temp,
    );
    const installed = join(temp, 'node_modules/arya-accounting');
    const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(pkg.version, manifest.version);
    assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
    assert.equal(Object.keys(pkg.optionalDependencies ?? {}).length, 0);
    assert.equal(pkg.scripts?.install, undefined);
    assert.equal(pkg.scripts?.postinstall, undefined);
    for (const name of ['compiler.cjs', 'cli.cjs', 'lsp.cjs'])
      await assert.rejects(stat(join(installed, 'dist', name)), { code: 'ENOENT' });
    for (const name of ['kernel.h', 'addon.cc', 'kernel-test.cc', 'build.mjs'])
      assert.ok((await stat(join(installed, 'native/accounting', name))).isFile());
    const consumer = `
      const assert = require('node:assert/strict');
      const a = require('arya-accounting');
      assert.equal(a.backendInfo().nativeAvailable, ${native});
      const plan = a.prepareInvoices([{price:'1.2345',quantity:'2',discountRate:'0.125',taxRate:'0.07125'}],
        {currency:'AFN',scale:2,priceScale:4,rounding:'half-even'});
      const result = plan.calculate({backend:${JSON.stringify(native ? 'native' : 'js')}});
      assert.equal(result.total,'2.31');
      assert.equal(result.backend,${JSON.stringify(native ? 'native' : 'js')});
      assert.ok(Object.isFrozen(result));
      const ledger = a.ledgerBatch([{account:'cash',debit:'0.30',credit:'0'},
        {account:'sales',debit:'0',credit:'0.30'}],{currency:'AFN',scale:2});
      assert.equal(ledger.balanced,true);
      assert.equal(ledger.difference,'0.00');
      plan.calculateAsync().then(r => assert.equal(r.total,'2.31')).catch(e => {console.error(e);process.exitCode=1;});
    `;
    run(['-e', consumer], temp, { ARYA_ACCOUNTING_DISABLE_NATIVE: '0' });
    run(
      [
        '-e',
        `const a=require('arya-accounting');if(a.backendInfo().nativeAvailable)process.exit(1);if(a.invoiceBatch([{price:'0.1'},{price:'0.2'}],{currency:'AFN',scale:2,rounding:'half-even'}).total!=='0.30')process.exit(2);`,
      ],
      temp,
      { ARYA_ACCOUNTING_DISABLE_NATIVE: '1' },
    );
    assert.equal(
      run(
        [
          '--input-type=module',
          '-e',
          `import {invoiceBatch} from 'arya-accounting';console.log(invoiceBatch([{price:'0.1'},{price:'0.2'}],{currency:'AFN',scale:2,rounding:'half-even'}).total)`,
        ],
        temp,
      ),
      '0.30\n',
    );
    await writeFile(
      join(temp, 'types.cts'),
      `
      import {prepareInvoices, prepareLedger} from 'arya-accounting';
      const plan = prepareInvoices([{price:'1'}],{currency:'AFN',scale:2,rounding:'half-even'});
      const result: string = plan.calculate().total;
      plan.calculateAsync({signal:new AbortController().signal});
      // @ts-expect-error Decimal inputs must be strings.
      prepareInvoices([{price:0.1}],{currency:'AFN',scale:2,rounding:'half-even'});
      // @ts-expect-error Unsupported backend.
      plan.calculate({backend:'fast'});
      // @ts-expect-error Prepared metadata is immutable.
      plan.currency = 'USD';
      // @ts-expect-error Calculated results are immutable.
      plan.calculate().total = '0';
      const ledger = prepareLedger([{account:'cash',debit:'1',credit:'0'}],{currency:'AFN',scale:2}).calculate();
      // @ts-expect-error Nested account results are immutable.
      ledger.accounts[0]!.debit = '0';
    `,
    );
    await writeFile(
      join(temp, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          types: [],
          lib: ['ES2022', 'DOM'],
        },
        files: ['types.cts'],
      }),
    );
    run([resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], temp);
    const arya = join(temp, 'main.arya');
    await writeFile(
      arya,
      'use js "arya-accounting" as accounting\nconst result = accounting.invoiceBatch([{price: "0.10"}, {price: "0.20"}], {currency: "AFN", scale: 2, rounding: "half-even"})\nprint(result.total)',
    );
    const executable = await writeProject(await buildProject(arya));
    assert.equal(run([executable], temp), '0.30\n');
    records.push({ filename, native, node: process.version, passed: true });
    console.log(
      `${filename}: offline install, CJS/ESM, exact results, fallback, declarations and Arya consumer passed.`,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
await writeFile('.build/accounting-package-results.json', JSON.stringify(records, null, 2) + '\n');
