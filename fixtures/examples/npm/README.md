# An npm project using Arya

Copy this entire directory into a new writable project directory. It contains a small local npm dependency so the example can be installed and tested without registry access. The `use js` import uses the npm package name, just as it would for an installed third-party package.

From that copied directory:

```sh
npm install --ignore-scripts --no-audit --no-fund
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/arya-language-<version>.tgz
npx --no-install arya check main.arya
npx --no-install arya run main.arya
```

Use the actual compiler archive filename from the Arya build. Output:

```text
local npm package 42 6
```

The first install creates `node_modules/arya-sample-math` from `vendor/math`. The second installs the packaged compiler locally. After installation, execution needs no network access. `main.arya` remains the source; generated output lives under `.arya/build`.

For an external package, install its documented version with npm, then replace the package specifier and calls. Arya does not install dependencies or verify a library's API during Check. A namespace property that is absent reads as undefined; trying to call it throws a mapped runtime TypeError.
