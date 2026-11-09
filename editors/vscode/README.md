# Arya Language

![Arya bridge mark](media/arya-logo.png)

Readable `.arya` programs with JavaScript/npm libraries and a Python function bridge.

This extension recognizes Arya files and provides syntax highlighting, snippets, multiple syntax/name/const-write diagnostics, keyword/builtin completion, builtin hover help, a top-level outline, and same-file lexical go-to-definition. Editor features do not execute your imports. It works independently of the AryaCode IDE; AryaCode bundles the same compiler package and resolver.

```arya
use python "math" as math

fn greet(name) {
  return "Hello, " + name
}

print(greet("Arya"), math.sqrt(81))
```

Install this local VSIX using **Extensions: Install from VSIX**, then open a `.arya` file. Node.js 22.15 or newer must be available to use **Arya: Run File** and **Arya: Check File**. Check validates syntax, lexical names, and const writes. The compiler is included; no global Arya installation is needed for these commands. Configure `aryaLanguage.nodePath` if Node is not on the editor's PATH, and `aryaLanguage.pythonPath` for an optional Python interpreter. Python is needed only for programs that import Python modules.

Run commands require workspace trust and save the source file first. **Arya: Stop File** ends a running task. Diagnostics and syntax highlighting remain available in Restricted Mode. This extension does not install npm or Python dependencies automatically.

Arya currently compiles to JavaScript ES modules. Python calls transport JSON-compatible arguments and results using a fresh process per call. There is no static type checking, dependency API completion, formatting, native compilation, or source-level debugger yet. This local package has not been published to an extension marketplace.
