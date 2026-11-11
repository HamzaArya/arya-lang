# Arya web examples

Build the compiler from the repository root with `npm run build`, then run:

```sh
npm run arya -- run fixtures/web/studio.arya
```

Open `http://localhost:3000`. Stop the server with Control+C. Supply another port after `--`, for example `npm run arya -- run fixtures/web/studio.arya -- 3100`.

The default project separates its files:

```text
studio.arya        Server tasks and API routes
index.html         HTML shell with div#root
public/styles.css  Browser styles
public/app.js      Renders the app inside #root
```

The calculator works without third-party dependencies. Its optional `/api/python` endpoint uses an async-bound Python `statistics` import, needs Python installed, and passes request cancellation to Python without blocking other JavaScript requests. Browser JavaScript communicates with Arya routes through HTTP; it does not capture server variables.

`inline.arya` demonstrates the optional inline `view` syntax and explicitly disables the HTML requirement with `{html: false}`. `database.arya` is an API-only MySQL/Python/file example; install `mysql2` in the source project's dependency tree, configure its `DB_*` environment variables, and provide a running MySQL server before using `/report`.

The browser script mounts all interface content inside div#root. To create an independent project, use `npm create arya-language@1.2.0-alpha.4 my-app -- --template web`, then run `npm install` and `npm run dev` inside it. You can also run `npm install` and `npm run dev` in this example directory to use its pinned alpha.4 compiler. See the [web guide](../../docs/arya-web.md).
