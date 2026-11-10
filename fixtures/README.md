# Arya examples

These examples target **1.3.0-alpha.3**. From the repository root, run `npm ci` and `npm run build`, then use `node dist/cli.cjs run path/to/main.arya`. Individual examples state their version requirements. Flow syntax requires alpha.2 or later; added UI sections/templates require alpha.3. The older npm baseline supports the earlier examples. Keep companion files together when copying an example.

| Example | Entry / instructions | Additional requirements |
| --- | --- | --- |
| Data pipelines | [Ranking, guards, indexed loops, and async Python](examples/data-flow/README.md) | Current source candidate; Python only for python.arya |
| First programs | [Nine lessons](arya/learn/01-hello.arya) and [tutorial](../docs/arya-tutorial.md) | Python for lesson 6 |
| Task report | [Multi-file project](arya/modules/tasks/main.arya) and [learning path](../docs/learning-path.md) | None |
| JavaScript/npm | [Local package](examples/npm/README.md) | Run its npm install |
| Python batch | [Batch processing](examples/python-batch/README.md) | Python 3 |
| Python API | [Reporting service](examples/python-web/README.md) | Python 3 |
| HTML-first web app | [Studio/web examples](web/README.md) | Python for the optional Python endpoint |
| Service | [Validation, logs, request IDs](examples/service/README.md) | None |
| MySQL task API | [Database example](examples/mysql/README.md) | MySQL, mysql2, credentials/schema |
| UI and desktop | [Estimate calculator](examples/ui/README.md) | Electron for a desktop window |
| UI library preview | [Components, motion, guide](examples/ui-library/README.md) | None |
| Debugging | [Expressions and diagnostics](examples/debugging/README.md) | None |

Most servers default to port 3000; run one at a time or select another port as documented. Stop with Control+C. The UI library preview uses port 3040.

Error, rejection, and conformance fixtures support the test suite. Some intentionally fail Check or execution; use the guides above for standalone learning examples.
