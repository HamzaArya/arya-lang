# Start with one useful Arya program

Arya is a good fit to evaluate for readable Node.js applications that combine npm
libraries and Python data processing. Start small before choosing it for an entire
application. This is an experimental preview, not a promise of production stability.

## First success without Python or a custom editor

Install Node.js 22.15 or newer. From a directory where you keep projects:

```sh
npm create arya-language@1.3.0-alpha.9 hello-arya -- --template cli
cd hello-arya
npm install
npm run dev -- Hamza
npm run check
npm run build
```

The CLI starter prints `Hello, Hamza!`. Open `main.arya` in any editor and change
the greeting. Run it again. The project pins the published alpha.9 compiler.
For future unpublished changes, use the [candidate/archive workflow](node-runtime.md#try-the-candidate).

Add `print(missingName)` at the end and run `npm run check`. Read the source
location and unknown-name diagnostic, remove that line, then Check again. This
shows how to recover from a mistake before introducing services or dependencies.

For editor assistance follow [editor setup](editor-setup.md). AryaCode is optional.
The published extension 1.3.4 contains compiler 1.3.0-alpha.9. Run
`npx --no-install arya editor status` to see both identities. Extension version
numbers are separate from compiler versions.

## Add one Arya module to JavaScript

Keep your existing JavaScript application. Add this `report.arya` beside its
package.json:

```arya
export fn total(values: number[]): number {
  let result: number = 0
  for value in values { result += value }
  return result
}
```

Build only that module:

```sh
npx --no-install arya check report.arya
npx --no-install arya build report.arya
```

Create `run-report.mjs`:

```js
import {total} from './.arya/build/report.arya.mjs';
console.log(total([10, 20, 30]));
```

Run `node --enable-source-maps run-report.mjs`; it prints `60`. The typed build
also emits `report.arya.d.mts`. Checking is optional and bounded; declarations
are not runtime input validation. Use [business API guidance](business-applications.md#optional-type-annotations)
for trusted JavaScript/Python boundaries. For bundling existing projects, use the
[esbuild adapter](business-applications.md#build-tests-and-tooling).

This lets you evaluate Arya without rewriting an application or replacing npm.
Rebuild after source changes. Generated output under `.arya/build` is owned by
the compiler; keep your handwritten files elsewhere.

## Try the npm and Python reporting showcase

The [reporting service](../fixtures/examples/python-web/README.md) combines input
validation, Python CSV/statistics, JavaScript SHA-256, HTTP responses, bounded
concurrency, cancellation and shutdown. Its consumer setup works without a
repository checkout. Start with standard-library Python before adding packages.

Use asynchronous/batched Python calls for servers. Calls still start fresh Python
processes and transport JSON data, not live Python objects or callbacks. Measure
your workload; batching reduces repeated startup, but this is not a claim that
Arya accelerates Python computation. See [Python lifecycle and limits](python-async.md).

## Make your everyday workflow explicit

- Check: `npx --no-install arya check main.arya`.
- Format: `npx --no-install arya fmt main.arya`; CI check: add `--check`.
- Lint: `npx --no-install arya lint main.arya`.
- Test: `npx --no-install arya test example.test.arya`, using Node's test/assert APIs.
- Build: `npx --no-install arya build main.arya`; retain the printed entry and maps.

The existing [tooling guide](business-applications.md) documents these commands.
The alpha.8 editor fixes cover open documents and bounded unfinished expressions,
not automatic discovery of every file. Exported-symbol rename is refused in the
editor until project coverage can be guaranteed.

## Deploy a simple Node API deliberately

For a CLI/API/web project, build on the intended Node version, then run the
printed JavaScript entry directly, for example:

```sh
npm ci
npm run check
npm run build
node --enable-source-maps .arya/build/main.arya.mjs
```

The generated starter's `npm start` runs the compiler and needs development
dependencies. A direct Node entry avoids that launcher requirement. Keep the
project layout, generated output/maps, HTML/public assets, and local Python files
together; install imported npm runtime packages as production dependencies.
Provide Node and the selected Python environment on the target. Do not copy only
one generated module from a multi-file application. UI/Electron starters have
additional launch/asset/runtime requirements and are separate qualification work.

Test health checks, invalid inputs, cancellation, shutdown and configuration on
the actual deployment target. Never put secrets in browser state or committed
examples. Arya executes with Node's host access and is not an untrusted-code sandbox.

## Help decide what to improve next

Report the compiler and extension versions separately, OS/Node/Python versions,
commands, the smallest failing source and expected/actual output. The
[contributing guide](../CONTRIBUTING.md) explains regression reports; send security
issues privately through [SECURITY.md](../SECURITY.md). Newcomer observations are
valuable: record time to first successful run, blockers and help required rather
than assuming that a tutorial passing automated tests means it is easy to use.
