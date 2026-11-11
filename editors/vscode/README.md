# Arya Language

![Arya bridge mark](https://raw.githubusercontent.com/HamzaArya/arya-lang/main/brand/arya-logo.png)

Write `.arya` programs with JavaScript/npm libraries and a Python function bridge.
This experimental extension includes the **1.3.0-alpha.7** compiler and language
tools. The Marketplace prerelease is extension version **1.3.2**; the frozen npm
and offline editor distributions retain extension version **1.3.0**. Both carry
the same reviewed runtime and editor code.

Features include:

- Syntax highlighting, semantic colors, snippets, completion, hover, and outline.
- Syntax, lexical name, constant-write, and optional static-type diagnostics.
- Workspace go-to-definition, references, rename with capture checks, and signature help.
- Document formatting, spelling Quick Fixes, and standard-library member hints.
- **Arya: Run File**, **Arya: Check File**, and **Arya: Stop File** commands.
- **Arya Dark**, **Arya Light**, **Arya File Icons**, and an editor setup walkthrough.

```arya
use python "math" as math

fn greet(name: string): string {
  return "Hello, " + name
}

print(greet("Arya"), math.sqrt(81))
```

Run **Arya: Editor Setup Guide** after installation. **Arya: Enable File Icons**
selects the included icon set; **Arya: Choose Color Theme** opens the theme chooser.
**Arya: Open Editor Tour** opens an unsaved sample. Existing icon themes may
override the language icon. Appearance preferences change only when you choose
a theme or run the icon command.

Node.js **22.15 or newer** must be available for Run File and Check File. The
compiler is included, so these commands need no global Arya installation. Set
`aryaLanguage.nodePath` if Node is outside the editor's PATH, and
`aryaLanguage.pythonPath` for an optional Python interpreter. Python is required
only by programs that import Python modules. Dependencies are installed separately.

Run and Check require workspace trust and save the file first. Editing diagnostics
and highlighting remain available in Restricted Mode. Editor analysis does not
execute your imports. Optional static checking has bounded inference; external
npm/Python APIs remain unknown unless described by declarations. See the
[debugging guide](https://github.com/HamzaArya/arya-lang/blob/main/docs/syntax-and-debugging.md)
for source maps and current debugging limits.

The companion works independently of AryaCode. In AryaCode, built-in diagnostics
and execution controls remain in charge, while the companion supplies appearance
and semantic tokens. AryaCode pins its embedded compiler separately; installing
this extension does not update that compiler.

For offline installation, install `arya-language@1.3.0-alpha.7`, then run
`npx --no-install arya editor install`. `arya editor path` reports its bundled
VSIX. See the [editor guide](https://github.com/HamzaArya/arya-lang/blob/main/docs/arya-editors.md)
and [business APIs and tools](https://github.com/HamzaArya/arya-lang/blob/main/docs/business-applications.md).
