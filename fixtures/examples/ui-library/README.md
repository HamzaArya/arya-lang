# Arya UI library preview

From the repository root:

```sh
npm run ui:preview
```

Open **http://127.0.0.1:3040**:

- `/` — interactive components with Preview/Arya tabs and copyable code.
- `/motion` — 16 presets, replay controls, pause/resume/cancel, stagger, sequences, and custom keyframes.
- `/guide` — a step-by-step implementation guide and the complete API reference.

Stop with Control+C. To choose a different port after building:

```sh
node fixtures/examples/ui-library/serve.mjs 4000
```

The pages come from the library's `ui.preview` function. `main.arya` adds an actual validated JSON endpoint for the profile demo; it echoes the profile without storing it. No frontend dependency, asset download, or external account is needed.

To add the guide to your own app, serve `ui.preview({section: "guide", basePath: "/ui"})` from `/ui/guide`, and add `/ui/` and `/ui/motion` routes for the other sections. `apiPath` optionally connects the gallery form to a same-origin POST endpoint. Without it, the form demonstrates local browser state.

These experimental APIs require Arya 1.2.0-alpha.4 or later. See [the UI application guide](../../../docs/ui-apps.md) and [the full library reference](../../../docs/ui-library.md).
