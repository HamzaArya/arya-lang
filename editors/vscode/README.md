# Arya Language

![Arya bridge mark](https://raw.githubusercontent.com/HamzaArya/arya-lang/main/brand/arya-logo.png)

Readable `.arya` programs with JavaScript/npm libraries and a Python function bridge.

This extension recognizes Arya files and provides syntax highlighting, snippets, multiple syntax/name/const-write diagnostics, keyword/builtin completion, builtin hover help, a top-level outline, and same-file lexical go-to-definition. Editor features do not execute your imports. It works independently of the AryaCode IDE. AryaCode pins its embedded compiler separately; installing this companion does not upgrade that compiler.

The source extension carries language version **1.3.0-alpha.4** and supports pipelines, concise/default/rest functions, spreads, guards, indexed loops, and finally cleanup. Syntax snippets, keyword hover, and list-library member hints cover the new forms. Use a matching compiler; see the [flow syntax guide](https://github.com/HamzaArya/arya-lang/blob/main/docs/flow-syntax.md).

The extension includes **Arya Dark**, **Arya Light**, **Arya File Icons**, a setup walkthrough, and lexical semantic colors. Imports, parameters, constants, functions, methods, properties, and constructors get distinct roles; optional access and shadowing are supported. View tags/attributes, literal CSS/JavaScript blocks, and `css: """..."""` receive richer grammar scopes. Your existing theme can also use semantic colors.

Run **Arya: Editor Setup Guide** after installation. **Arya: Enable File Icons** selects the included icon set; **Arya: Choose Color Theme** opens the normal theme chooser; **Arya: Open Editor Tour** opens an unsaved sample. Existing icon themes may override the language's fallback icon. The extension does not change appearance preferences until you choose a theme or run its icon command.

The npm package bundles this VSIX and its assets. After `npm install --save-exact arya-language@1.2.0-alpha.4` for the recorded baseline (or a matching candidate archive), `npx --no-install arya editor install` installs into detected supported editors without a marketplace download. `arya editor path` reports the VSIX for manual installation. The companion also works in AryaCode: its built-in diagnostics and execution controls remain in charge, while this extension provides appearance and semantic tokens.

```arya
use python "math" as math

fn greet(name) {
  return "Hello, " + name
}

print(greet("Arya"), math.sqrt(81))
```

Install this local VSIX using **Extensions: Install from VSIX**, then open a `.arya` file. Node.js 22.15 or newer must be available to use **Arya: Run File** and **Arya: Check File**. Check validates syntax, lexical names, and const writes. The compiler is included; no global Arya installation is needed for these commands. Configure `aryaLanguage.nodePath` if Node is not on the editor's PATH, and `aryaLanguage.pythonPath` for an optional Python interpreter. Python is needed only for programs that import Python modules.

Run commands require workspace trust and save the source file first. **Arya: Stop File** ends a running task. Diagnostics and syntax highlighting remain available in Restricted Mode. This extension does not install npm or Python dependencies automatically.

Arya currently compiles to JavaScript ES modules. Direct Python calls transport JSON-compatible data synchronously. The `python` standard library provides async calls, bound imports, per-batch processing, and managed client lifecycle; no static Python API introspection is performed.

The extension and LSP provide documented standard-library member hints and local MySQL pool/transaction completions after a dot, plus mysqlconnect, mysqlrows, mysqltransaction, validateschema, webroute, logcreate, and webshutdown snippets. Runtime schema APIs, operational HTTP helpers, immutable local logger instances, and Python clients also have completion hints. Python snippets are pythonasync, pythonclient, pythoncall, and pythonmap. These hints do not inspect arbitrary npm or Python dependencies. The language supports ??, optional member/call access, and multiline chains, with updated highlighting. The extension and LSP offer spelling Quick Fixes based on current lexical diagnostics; ambiguous names and constant writes are not automatically rewritten. See the [debugging guide](https://github.com/HamzaArya/arya-lang/blob/main/docs/syntax-and-debugging.md). Static type checking, formatting, and source-level debugging remain unavailable. The current extension uses the Node.js runtime; target/C compiler settings are retired. This local package has not been published to an extension marketplace.

The current source also includes member hints for reusable UI sections and full-page templates. Snippets `uihero`, `uitemplate`, `uisettings`, and `uisegmented` demonstrate them. These UI additions require compiler 1.3.0-alpha.4.
