# Install Arya's editor support from npm

The published 1.2.0-alpha.4 baseline and the 1.3.0-alpha.4 source candidate include the complete offline VSIX, `.arya` file icons, dark/light themes, syntax grammars, semantic language-server support, and portable editor adapters. Downloading the package downloads these files too, even with `--ignore-scripts`. No npm lifecycle hook installs extensions, changes editor settings, or contacts an editor marketplace.

Use `npm install --save-exact arya-language@1.2.0-alpha.4` for the recorded published baseline. `@latest` follows a mutable registry tag. For candidate-only grammar or UI additions, install the [matching compiler archive](node-runtime.md#try-the-candidate) and its bundled VSIX. Check registry tags with `npm view arya-language dist-tags`.

## Install and enable the editor extension

Install the package and enable its bundled extension:

```sh
npm install --save-exact arya-language@1.2.0-alpha.4
npx --no-install arya editor status
npx --no-install arya editor install
```

The default install target is all detected supported editors. It installs the bundled VSIX using each editor's own CLI. It supports **VS Code**, **AryaCode**, **VS Code Insiders**, **Cursor**, **VSCodium**, and **Windsurf**. It finds launchers on PATH, common Windows installation folders, and macOS Applications folders. AryaCode's app can be detected even without a shell launcher. Branded editors remain separate compatibility targets; a shared API does not imply every version/platform was tested.

For an AryaCode build whose packaged CLI has the known module-path error, the installer can use an available Code/Code Insiders/VSCodium CLI as a compatibility manager. It targets AryaCode's extension directory (from app product metadata, or your explicit `--extensions-dir`) and uses an isolated manager profile. It does not patch the application bundle or change another editor's settings. If no working manager or target directory is available, use the manual VSIX flow.

Choose a specific target when desired:

```sh
npx --no-install arya editor install --editor code
npx --no-install arya editor install --editor aryacode
npx --no-install arya editor install --editor cursor
```

For a custom installation, provide an absolute CLI path:

```sh
npx --no-install arya editor install --editor code --cli "/path/to/code"
```

Use `--force` to replace an already-installed extension of the same version. The installer does not add that flag by default. `--extensions-dir` and `--user-data-dir` select explicit isolated editor locations, useful for testing. `--json` returns structured status/results; install exits nonzero if any target fails while reporting the other results. Unsupported Windows batch launcher layouts use the manual fallback rather than shell execution.

If no supported CLI is available:

```sh
npx --no-install arya editor path
```

Copy the returned VSIX path, then use **Extensions: Install from VSIX** in your editor. The extension includes its compiler and requires no marketplace download. See [VS Code's installation documentation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix).

## Icons and colors

After installation, reload the editor and run **Arya: Editor Setup Guide** from the command palette.

- **Arya: Enable File Icons** selects **Arya File Icons**. The theme supplies the `.arya` mark and simple icons for JavaScript, TypeScript, Python, JSON, HTML, CSS, Markdown, SQL, folders, and generic files.
- **Arya: Choose Color Theme** opens the theme chooser. Select **Arya Dark**, **Arya Light**, or keep your current theme.
- **Arya: Open Editor Tour** opens an unsaved example with functions, parameters, UI components, optional access, and state. Save it in your project before running it.

Language icons are also declared through the language contribution, with separate light/dark SVGs. Existing icon themes may override that fallback; choose Arya File Icons when you want its explicit `.arya` association. The editor's normal icon-theme chooser can restore another theme at any time. [VS Code file-icon themes](https://code.visualstudio.com/api/extension-guides/file-icon-theme)

Semantic colors use actual lexical bindings: imports, function declarations, immutable function values, parameters, read-only variables, builtins, method calls, properties, and constructors. Shadowing is respected. Optional chains and UTF-16 positions are supported. Incomplete syntax falls back to TextMate highlighting. Analysis never executes imports, Python, server code, or database calls. Your existing color theme can use the standard semantic token scopes. [Semantic highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)

The TextMate grammar distinguishes parameters, aliases, object keys, methods, optional access, and view tags/attributes/class shorthand. Literal CSS/JavaScript blocks retain their embedded scopes; `css: """..."""` is recognized too. Themes include normal token rules as a fallback. [Syntax highlighting](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

## AryaCode

The same VSIX can be installed as a companion in AryaCode. When its built-in `aryacode.arya-workbench` extension is present, the companion adds semantic colors, themes, icons, and the walkthrough. It leaves built-in diagnostics and execution controls in charge rather than adding duplicate providers/buttons.

Installing the npm compiler or this companion does not replace AryaCode's embedded compiler. Updating that pin and rebuilding the app belongs to the IDE's own integration/release workflow. Use a project-local `npx --no-install arya` when you need the exact compiler installed in that project.

## Other editor families

```sh
npx --no-install arya editor status --json
```

The report includes the adapter directory, grammar, light/dark icons, guide, and VSIX. Under the adapter directory:

| Target | Files |
| --- | --- |
| Sublime Text | `editors/sublime/Arya.tmLanguage`, settings, and build command |
| TextMate / grammar-compatible editors | `editors/textmate/Arya.tmbundle` |
| Vim | `editors/vim` file detection, syntax, and indentation files |
| Neovim | Vim files plus `editors/neovim/arya.lua` LSP setup |
| Emacs / Eglot | `editors/emacs/arya-mode.el` |
| Kate | `editors/kate/arya.xml` |
| Notepad++ | `editors/notepad-plus-plus/Arya.xml` |
| Nano | `editors/nano/arya.nanorc` |
| Helix | `editors/helix/languages.toml` recognition/LSP configuration; no dedicated Tree-sitter grammar |
| Another LSP client | `arya-lsp --stdio`, language ID `arya`, extension `.arya` |

These adapters require each editor's own installation/configuration steps; they are not silently copied into user profiles. Semantic tokens are available to LSP clients that support them. Other editors' file icons depend on their own APIs or icon systems; `brand/` contains the SVG assets. Native JetBrains/Zed plugins, arbitrary editor support, marketplace publication, and operating-system file associations are separate integrations. See [the broader editor guide](arya-editors.md).

## Try a development package from this checkout

Use a separate preview directory so published archives are preserved:

```sh
npm run check
mkdir -p .build/editor-preview
npm pack --ignore-scripts --pack-destination .build/editor-preview
```

Install the generated `.tgz` in a test project, then run `npx --no-install arya editor install`. `npm run build` already generates `dist/editor/arya-language.vsix` and the portable adapters, so a consumer does not need the repository or VSCE.

Before publishing, bump the language/package/compiler versions through the release workflow and produce new retained artifacts. Publishing a new version and intentionally assigning the `latest` tag is a separate operation; these local changes do not move npm tags or publish a marketplace extension.

## Verification

`npm run check` covers grammar scopes, lexical semantic tokens, UTF-16 encoding, passive LSP behavior, package assets, installer detection, literal argument handling, isolated profiles, and failures. On a machine with the supported apps installed, `npm run test:editors` installs into temporary profiles and runs real VS Code/AryaCode extension-host checks. It verifies file recognition, semantic token roles, both color themes, file-icon selection, and the editor tour. It writes evidence under `.build/evidence/` and does not change normal user settings.
