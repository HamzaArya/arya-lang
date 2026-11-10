# Create Arya

Interactive starters for web apps, API servers, CLI tools, native CLI programs, UI apps, and Electron desktop apps.

Create a project using the published creator and compiler preview:

```sh
npm create arya-language@latest my-app
cd my-app
npm install
npm run dev
```

For automation, add `-- --template web`, `api`, `cli`, `native`, `ui`, or `desktop` to the npm create command.
The web starter uses one index.html with div#root. Browser JavaScript renders the app
inside that element and calls Arya server functions through HTTP.

Generated projects include a pinned compiler dependency and dev/start/check/build npm
scripts. Native programs additionally require a C11 build toolchain. This is a project
creator with a Vite-style workflow; it does not install Vite or provide hot module replacement.

For offline use, install the local creator archive and run:

```sh
npx --no-install create-arya-language my-app --compiler /path/to/arya-language-1.2.0-alpha.4.tgz
```

The compiler archive is copied into vendor/ and referenced by a relative file dependency,
so the generated folder can be transferred to another machine before npm install.
No automatic dependency installation or npm publication occurs during project creation.
