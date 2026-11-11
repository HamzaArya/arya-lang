# Arya UI library preview

From the repository root:

```sh
npm run ui:preview
```

Open **http://127.0.0.1:3040**:

- `/` — interactive components with Preview/Arya tabs and copyable code.
- `/sections` — eight reusable page sections and their Arya source.
- `/templates` — landing, dashboard, settings, and sign-in templates. Open `/templates/<name>` for a live full-page example.
- `/motion` — 16 presets, replay controls, pause/resume/cancel, stagger, sequences, and custom keyframes.
- `/guide` — a step-by-step implementation guide and the complete API reference.

Stop with Control+C. To choose a different port after building:

```sh
node fixtures/examples/ui-library/serve.mjs 4000
```

The pages come from the library's `ui.preview` function. `main.arya` adds an actual validated JSON endpoint for the profile demo; it echoes the profile without storing it. No frontend dependency, asset download, or external account is needed.

To add the guide to your own app, serve `ui.preview({section: "guide", basePath: "/ui"})` from `/ui/guide`, and add `/ui/` and `/ui/motion` routes for the other sections. `apiPath` optionally connects the gallery form to a same-origin POST endpoint. Without it, the form demonstrates local browser state.

The original component/motion APIs require Arya 1.2.0-alpha.4 or later. The added controls, sections, and templates require the **1.3.0-alpha.4 source candidate**. Settings/sign-in previews do not persist data or authenticate; pass a custom submitAction and implement its server route. See [section/template contracts](../../../docs/ui-patterns.md). See [the UI application guide](../../../docs/ui-apps.md) and [the full library reference](../../../docs/ui-library.md).
