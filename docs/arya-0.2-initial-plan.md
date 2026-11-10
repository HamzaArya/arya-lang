# Initial Arya 0.2 plan

> Historical initial plan. This records the original 0.2 proposal; current features and commands are in the [documentation index](README.md).

Start with one failing program. When you run it through either the CLI or AryaCode, the stack trace should tell you which line in the original .arya file failed. Use that as the first milestone for Arya 0.2, then build toward Arya 1.0 as a documented language people can install, learn, and use for their own projects.
Step 1 · Make runtime errors point to .arya
1. Reproduce the problem in a test
Create a fixture called runtime-error.arya:
fn fail() {
  const item = null
  return item.name
}
fail()
Run arya run runtime-error.arya in an integration test. Assert that the process exits with a nonzero status, reports a TypeError, and includes a stack frame for runtime-error.arya:3. Once column mappings are in place, assert runtime-error.arya:3:15, the start of name. Also check that the caller frame points to line 5. Match those parts of the trace so the test can run across operating systems and Node versions.
2. Keep track of where the generated code came from
In packages/arya/src/compiler.ts, start with the token positions the compiler already records. When the compiler emits JavaScript for return item.name, it needs to remember where return, item, and name came from in the Arya source. Record each mapping when you know the fragment’s final position in the generated file, after accounting for the built-in runtime and any Python bridge code added above it.

Start with statement-level mappings to get the right line. Then map expressions, especially calls, property accesses, and indexing, so two expressions on the same line can point to different columns. Try this with the current parser. If composing nested JavaScript strings makes mappings hard to preserve, move those parts of the parser to a small syntax tree whose nodes carry source positions.
3. Write the map and enable it in both runners
Have arya build and the run paths emit a standard source map alongside the generated .mjs. Use a source-map library to encode the positions, resolve the original source path relative to the map file, and add a sourceMappingURL comment to the generated module. Keep the map inside the same generated-output directory and apply AryaCode’s existing path containment checks to it.

In packages/arya/src/cli.ts and packages/services/src/language-runner.ts, pass --enable-source-maps before the generated module path. Program arguments still go after the module path. For a manual check, run node --enable-source-maps path/to/generated.mjs. Node.js source-map flag
4. Verify the cases that can shift a location
- A multiline expression and two expressions on the same line.
- A failure after await.
- An Arya source file in a path with spaces, with a Unicode character before an error on the same line.
- A built-in or Python bridge failure. Check that the stack includes the correct Arya caller frame, even if the underlying error originates in runtime code.
- The same fixture run through arya run, AryaCode, and a standalone build launched with Node.
Done when the fixture reports the correct .arya file, line, and column through both user-facing runners, and the existing tests pass. This milestone delivers readable stack traces. Breakpoints and stepping can follow as a separate debugger project.
Steps 2–6 · Finish Arya 0.2
Step	What to build	How you know it’s done
2. Specify the current language	Write a compact reference for precedence, scope, equality, truthiness, built-ins, Node globals, and JS/Python interop. Decide whether -2 ** 2 should stay 4 or become -4, and document any behavior change.	Each rule that can surprise a user has a runnable example or a conformance test.
3. Improve arya check	Add lexical name resolution. Report unknown names and assignments to const. Account for documented host globals, nested scopes, and closures. Reuse the resulting symbol information for go-to-definition if it fits the release.	A misspelled variable and an illegal const write fail before execution. Valid shadowing and closure examples pass.
4. Add Arya-to-Arya imports	Support relative .arya imports and existing exports. Compile dependencies from one entry point and preserve source maps for every module. For 0.2, I’d reject cycles with a diagnostic that shows the import chain.	A multi-file program builds and runs with one command. An error in a helper points to the helper’s .arya file. Missing files and cycles produce clear diagnostics.
5. Harden interop and ship examples	Verify what happens when Python receives or returns values outside the bridge’s JSON contract. Test a missing interpreter, a timeout, and oversized output. Include a small npm example and a Python example that processes a batch in one call.	A new user can follow the examples, and common bridge failures explain what went wrong.
6. Release 0.2	Document installation, supported Node and Python versions, and changes from 0.1. Test the packaged CLI in a clean environment. Keep the Arya language version and AryaCode product version clearly labeled.	Someone with no checkout of the repository can install Arya, run a multi-file example, and trace an intentional error back to its source.


I’d keep JavaScript-compatible values as the default direction and keep the persistent Python worker, type system, and native backend outside 0.2. The release has a clear scope with stack traces, better checks, and multi-file programs.
Steps 7–9 · Take Arya to 1.0
7. Give people a way to learn it. Write a short tutorial that starts with a single file and ends with a small project using imports and one interop feature. If you want Arya’s Afghan identity to show up in how people learn it, publish beginner material in Dari and Pashto where you have fluent reviewers. If you want programmers to write identifiers in those scripts, scope that separately. The report says identifiers are currently ASCII-only, so this would require lexer, diagnostics, and editor tests, including right-to-left text.
8. Get feedback from people using it. Invite a small group of learners and developers, including people from the Afghan programming community, to build a project from the published instructions. Track where they get stuck installing, understanding a rule, or diagnosing a bug. Use those observations to decide whether the next investment should be formatting, editor recovery, better diagnostics, or faster Python calls.
9. Define and ship the stable release. Settle the license and distribution terms, publish a versioned specification and compatibility policy, and verify that the installer, examples, and test suite work on every platform you commit to supporting. Treat 1.0 as complete when people can install Arya independently, build a small project, and upgrade with clear expectations about which behavior is stable.
For launch, “an Afghan programming language” gives Arya a clear identity. If you want to use “the first Afghan programming language” as a public claim, verify it separately and define what qualifies. The audit establishes Arya’s design and implementation. It doesn’t establish historical priority.