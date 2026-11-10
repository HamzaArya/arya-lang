# Arya UI: web and desktop estimate calculator

This Arya 1.2.0-alpha.4 JavaScript-profile example uses `.arya` components, responsive layouts, form bindings, API requests, server validation, result/error states, and reduced-motion-aware animation presets.

From the repository root:

```sh
npm run build
node dist/cli.cjs build fixtures/examples/ui/main.arya
node fixtures/examples/ui/serve.mjs
```

Open `http://127.0.0.1:3000`. Stop with Control+C. A different port can be passed to `serve.mjs`.

To open the same app as a desktop GUI after compiling:

```sh
npm exec --yes --package=electron@45.2.3 -- electron fixtures/examples/ui/desktop.cjs
```

Electron requires a platform binary and a desktop session. Closing the window stops the server and quits. No installer is generated. The backend exports `start(port)` and `stop(server)` so the browser launcher and desktop wrapper share one implementation. Python and database work can be added inside the validated server route; page state is public data.

For portable project creation and the complete component/action API, see [the UI guide](../../../docs/ui-apps.md).
