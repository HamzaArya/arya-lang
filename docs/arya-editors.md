# Arya in other editors

The 1.2.0-alpha.4 npm package includes an offline VSIX, file icons, Arya Dark/Light themes, semantic tokens, and generated editor adapters. Use `arya editor status` and `arya editor install` after `npm install arya-language@latest`. See the [npm/editor setup guide](editor-setup.md). Icon visibility is controlled by the selected file-icon theme; other editors need their own integration steps.

Arya source files use **`.arya`**, language ID **`arya`**, and TextMate scope **`source.arya`**. The portable language server speaks LSP over standard input/output. Opening a file in an arbitrary editor does not automatically install a new language: install the matching package or configure its file association first.

## Get the editor files

Install the published npm package and locate its bundled files:

```sh
npm install arya-language@latest
npx --no-install arya editor status
npx --no-install arya editor path
```

The package contains `dist/editor/arya-language.vsix`, `dist/editor/adapters/`, and `brand/`. From a source checkout, `npm ci` and `npm run build` produce the same kinds of editor assets. For new release packaging in a disposable checkout, follow the [release process](releasing.md); preserve already published archives.

Release packaging produces these retained files under `artifacts/`:

| Artifact | Purpose |
| --- | --- |
| `arya-editor-kit-1.2.0-alpha.4.zip` | All editor configuration files, the VSIX, CLI package, logo variants, and this guide |
| `arya-language-1.2.0-alpha.4.vsix` | Standalone extension for VS Code-compatible desktop editors |
| `arya-language-1.2.0-alpha.4.tgz` | Node package containing `arya` and `arya-lsp` commands |
| `create-arya-language-1.2.0-alpha.4.tgz` | Matching npm project initializer |
| `SHA256SUMS` | SHA-256 checksums of the compiler, creator, VSIX, and editor-kit archives |

The kit is an Apache-2.0 development preview, with `LICENSE`, `NOTICE`, and retained third-party notices. The npm package is `arya-language`; historical archives are available in [GitHub prereleases](https://github.com/HamzaArya/arya-lang/releases). The alpha.4 npm publication did not create a new GitHub release. The VSIX is installed manually; Open VSX, VS Code Marketplace, other editor registries, and operating-system file-association databases are separate publication targets.

Extract the ZIP into a stable location. Paths such as `editors/vim` below refer to folders inside that extracted kit. The build also leaves an unpacked kit in `.build/arya-editor-kit` for local use.

## Compiler and portable language server

Node.js 22.15+ is required. To make the commands available to other editors:

```sh
npm install -g /absolute/path/to/arya-language-1.2.0-alpha.4.tgz
arya --version
```

Use the actual path to your downloaded or built package. Your npm executable directory must be on PATH. A project-local alternative is `npm install /absolute/path/to/arya-language-1.2.0-alpha.4.tgz`, followed by `npx --no-install arya run main.arya`; point the editor at that installation's executable or its absolute `dist/lsp.cjs` path.

Editors start the server with `arya-lsp --stdio`. It waits for protocol messages, so starting it interactively in a terminal does not display a prompt. From the source checkout, an equivalent server command after `npm run build` is:

```sh
node /absolute/path/to/arya-language/dist/lsp.cjs --stdio
```

The server provides incremental document synchronization, multiple syntax/name/const-write diagnostics with UTF-16 source ranges, semantic tokens, spelling code actions, completion for documented standard APIs and keywords/builtins/top-level declarations, builtin hover, top-level document symbols, and same-file lexical go-to-definition. It uses the same parser and lexical resolver as AryaCode. It never imports or executes project code during analysis. LSP standardizes the connection between a language tool and its editor; each editor still needs its language/file-type configuration. [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)

## Coverage

| Editor family | What the kit supplies | Qualification |
| --- | --- | --- |
| AryaCode | Built-in highlighting, snippets, diagnostics, completion, hover, outline, Run/Build/Stop, and language file icon | Desktop integration tests |
| VS Code, VSCodium, Cursor, Windsurf | A standalone VSIX with editor features and Run/Check/Stop | Alpha.4 tested in real VS Code and AryaCode hosts on macOS. Other branded products/platforms remain separate compatibility targets |
| Sublime Text | TextMate grammar, indentation settings, and build command | Grammar tested with the TextMate tokenizer; application integration not tested locally |
| TextMate | `.tmbundle` with file association and grammar | Bundle structurally validated; application integration not tested locally |
| JetBrains IDEs with TextMate Bundles | The same `.tmbundle` for recognition and highlighting | Uses the documented TextMate importer; no native JetBrains language plugin |
| Vim | File detection, syntax rules, and file-local comment/indent settings | Headless Vim checks |
| Neovim | Vim runtime plus a Neovim 0.11+ LSP configuration | Configuration supplied; Neovim application testing pending |
| Emacs | `arya-mode` and an optional Eglot server registration | Configuration supplied; Emacs application testing pending |
| Kate/KWrite | Syntax definition with comments, strings, keywords, numbers, and folding | XML structurally validated; application testing pending |
| Notepad++ | Importable User Defined Language | XML structurally validated; Windows application testing pending |
| nano | Basic regex highlighting and comment configuration | Configuration supplied; nano application testing pending |
| Helix | `.arya` association and language-server configuration | No dedicated Tree-sitter grammar, so native syntax highlighting is not supplied |
| Other LSP/TextMate editors | Reusable server and grammar | Requires that editor's own adapter/configuration |

There is no guarantee that every editor or version accepts these integrations. Zed's native extension/Tree-sitter route, a dedicated Helix grammar, native JetBrains language tooling, and editors without a language-extension mechanism are not implemented. GitHub/GitLab highlighting also requires separate upstream language registration; a local editor kit does not change their registries.

## VS Code-compatible editors

Run **Extensions: Install from VSIX**, select `arya-language-1.2.0-alpha.4.vsix`, and reopen an `.arya` file. VS Code's CLI can also install it with `code --install-extension /absolute/path/to/arya-language-1.2.0-alpha.4.vsix`. Forks may use a different CLI name. [VS Code VSIX installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix)

The extension includes its compiler and does not need the global Arya package. Node must be available for execution. Set `aryaLanguage.nodePath` if needed; set `aryaLanguage.pythonPath` for an optional Python bridge interpreter. Syntax/editor features work without an installed system Node runtime because they run in the editor's extension host. Running/checking source files requires a trusted local workspace. Use **Arya: Run File**, **Arya: Check File**, and **Arya: Stop File**.

AryaCode already includes language providers. The companion extension can be installed there for semantic colors, themes, file icons, and the setup guide. It detects the built-in workbench and leaves its diagnostics and execution controls in charge. This does not replace AryaCode's embedded compiler.

## Sublime Text

Use **Preferences → Browse Packages**. Create an `Arya` folder there and copy the contents of `editors/sublime` into it. Reopen an `.arya` file. The grammar declares the extension, so saved `.arya` files select Arya syntax. With the CLI package on PATH, **Tools → Build** runs the current file. Use the editor's build-cancel action for a long-running program.

Sublime accepts both `.tmLanguage` and `.sublime-syntax` definitions. This package uses the shared TextMate grammar. [Sublime syntax documentation](https://www.sublimetext.com/docs/syntax.html)

## TextMate and JetBrains

For TextMate, install `editors/textmate/Arya.tmbundle` using its bundle installation flow.

In JetBrains IDEs that include the TextMate Bundles plugin, enable that plugin, open **Settings → Editor → TextMate Bundles**, add the `Arya.tmbundle` folder, and enable it. This supplies syntax recognition/highlighting; it does not supply a native compiler, refactoring engine, or language server integration. [JetBrains TextMate setup](https://www.jetbrains.com/help/idea/textmate-bundles.html)

## Vim

Vim 8+ can load the runtime as a package. Copy the entire `editors/vim` folder to `~/.vim/pack/arya/start/arya`. Alternatively, add its absolute path to `runtimepath` in your vimrc. Enable `filetype plugin on` and `syntax enable`, then reopen an `.arya` file.

The runtime adds `filetype=arya`, language colors, `#` comment insertion, and two-space editing defaults. It does not overwrite your vimrc or configure an LSP client automatically. With the CLI installed, `:!arya run %:S` runs the current saved file with Vim's shell-escaped filename.

## Neovim

Copy `editors/vim` to `~/.local/share/nvim/site/pack/arya/start/arya` on the usual Unix setup, or use your configured package location. That supplies detection and highlighting.

For Neovim 0.11+, load `editors/neovim/arya.lua` from your Lua configuration after placing `arya-lsp` on PATH. It configures the built-in language client using `vim.lsp.config` and `vim.lsp.enable`; older versions need their corresponding LSP setup. [Neovim LSP documentation](https://neovim.io/doc/user/lsp.html)

## Emacs

Add the following to your init file, using the path where you kept the kit:

```elisp
(load-file "/absolute/path/to/editor-kit/editors/emacs/arya-mode.el")
```

Reopen an `.arya` file to enable `arya-mode`. The mode provides font-lock syntax colors, comment syntax, and two-space tab width. If Eglot is installed (built into modern Emacs) and `arya-lsp` is on PATH, run `M-x eglot` in that buffer. The mode registers Arya's server with Eglot when Eglot loads. [Eglot server configuration](https://www.gnu.org/software/emacs/manual/html_node/eglot/Setting-Up-LSP-Servers.html)

## Kate/KWrite

Copy `editors/kate/arya.xml` into your user syntax-definition directory, commonly `~/.local/share/org.kde.syntax-highlighting/syntax/` on Linux. Restart Kate/KWrite and reopen the file. The definition declares `*.arya` and includes brace folding. Data directories may differ on other platforms; use your application's syntax-definition location. [KDE syntax-definition format](https://docs.kde.org/stable5/en/kate/katepart/highlight.html)

## Notepad++

Open **Language → User Defined Language → Define your language**, choose **Import**, and select `editors/notepad-plus-plus/Arya.xml`. Restart Notepad++ if necessary. `.arya` is registered in the definition. This is syntax coloring/folding only; no compiler or LSP plugin is bundled. [Notepad++ UDL documentation](https://npp-user-manual.org/docs/user-defined-language-system/)

## nano

Add `include "/absolute/path/to/editor-kit/editors/nano/arya.nanorc"` to your nanorc. Reopen an `.arya` file. This supplies basic regex colors, not semantic language analysis.

## Helix and other LSP clients

Merge `editors/helix/languages.toml` into your user `languages.toml`; preserve your other configured languages. It declares the `.arya` extension, language ID, comments, indentation, and `arya-lsp` command. A dedicated Tree-sitter grammar is not included, so this configuration enables recognition and LSP features without claiming syntax highlighting. [Helix language configuration](https://docs.helix-editor.com/languages.html)

For another client, configure the extension `arya`, language ID `arya`, command `arya-lsp`, and argument `--stdio`. Install the TextMate grammar separately if that editor supports it. Python and npm libraries are still installed in their ordinary environments; the editor configuration does not install those dependencies.
