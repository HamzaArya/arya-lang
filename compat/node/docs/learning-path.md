# Learn Arya by building a task report

This path starts with one file and finishes with three Arya modules using a JavaScript standard-library API. You need Node.js 22.15 or later, npm, and an npm installation of Arya 1.2.0-alpha.4. Python and third-party npm packages are not required. This is a runnable learning path; external learner observations are tracked separately in the [community-review process](community-review.md).

## Install into a fresh folder

Create a folder called `arya-learning` and open a terminal there. Create `package.json` with:

```json
{"private": true}
```

Install the pinned compiler:

```sh
npm install --save-exact arya-language@1.2.0-alpha.4
npx --no-install arya --version
```

For offline use, replace the registry package with the actual path to its retained `arya-language-1.2.0-alpha.4.tgz` archive and add `--offline --ignore-scripts --no-audit --no-fund`. All `npx` commands below use `--no-install`, so a misspelled command cannot silently download another package. See [installation and upgrades](installing.md) for runtime checks, Windows path examples, and troubleshooting.

## 1. Run one file

Save this as `hello.arya`:

```arya
let name = "Arya"
const tasks = ["Learn variables", "Write a function", "Build a project"]
print("Hello, " + name + "!")
print("Total tasks:", len(tasks))
```

Check and run it:

```sh
npx --no-install arya check hello.arya
npx --no-install arya run hello.arya
```

Check prints `Check OK` and the source filename. Run prints:

```text
Hello, Arya!
Total tasks: 3
```

`let` allows replacing a binding's value. `const` keeps the binding fixed. The task list is still mutable; const does not freeze its contents. `len` counts the list items, and `print` writes them to the terminal.

**Exercise:** add a fourth string to the list, and predict the new count before running. The count should be 4. Then restore the original three items.

## 2. Group data and count completed tasks

Replace `hello.arya` with:

```arya
fn countDone(items) {
  let count = 0
  for item in items {
    if item.done { count += 1 }
  }
  return count
}

const items = [
  {title: "Learn variables", done: true},
  {title: "Write a function", done: true},
  {title: "Build a project", done: false},
]

print("Completed:", countDone(items), "of", len(items))
```

Run the same Check and Run commands. The output is:

```text
Completed: 2 of 3
```

Each object combines a title and completion flag. The loop gives `item` one object at a time; the counter increments only when its `done` property is true. The function returns the total. The loop's `item` binding is local to the loop.

**Exercise:** change the last task's flag to true. The result should be `Completed: 3 of 3`. Restore it to false before continuing.

## 3. Split the project into modules

A project has one entry file. Its directory is the project root; relative Arya imports must stay within that directory. Dependencies can live in subfolders and import one another. One command checks, builds, or runs the reachable graph.

Copy the completed reference project from the installed compiler package:

```sh
node --input-type=module -e "import { cp } from 'node:fs/promises'; await cp('node_modules/arya-language/fixtures/arya/modules/tasks', 'practice', { recursive: true });"
```

It creates:

```text
practice/
  main.arya
  lib/
    tasks.arya
    report.arya
```

| File | Responsibility |
| --- | --- |
| [main.arya](../fixtures/arya/modules/tasks/main.arya) | Creates the task data and prints the report |
| [lib/tasks.arya](../fixtures/arya/modules/tasks/lib/tasks.arya) | Exports counting functions |
| [lib/report.arya](../fixtures/arya/modules/tasks/lib/report.arya) | Formats the result and calls Node's path API |

`main.arya` starts with:

```arya
use arya "./lib/tasks.arya" as tasks
use arya "./lib/report.arya" as report
```

The aliases are namespaces. `tasks.countRemaining(items)` calls an exported function; unexported names remain local to their module. Write the `.arya` extension explicitly. `report.arya` also imports `tasks.arya`, but the compiler builds the shared dependency once, and Node evaluates that module once for this graph.

`report.arya` includes a JavaScript import:

```arya
use js "node:path" as path

export fn projectName(filename) {
  return path.basename(filename)
}
```

`node:path` comes with Node. No `npm install` is needed for it. Arya passes an ordinary string to its JavaScript API and uses the result directly. This interop does not serialize values through JSON.

## 4. Check, build, and run the graph

From the `arya-learning` folder:

```sh
npx --no-install arya check practice/main.arya
npx --no-install arya build practice/main.arya
npx --no-install arya run practice/main.arya
```

Expected Run output:

```text
Completed: 2 of 3
Remaining: 1
Project: tasks.arya
```

Check follows the imports and validates syntax and lexical names without executing module code. Build writes generated modules and adjacent source maps under `practice/.arya/build`. The built entry can be launched directly:

```sh
node --enable-source-maps practice/.arya/build/main.arya.mjs
```

The output is the same. Keep source and generated files in their project layout; rebuild after moving the project. Edit `.arya` files rather than generated `.mjs` files.

**Exercise A:** add a fourth unfinished task to `practice/main.arya`. Expect `Completed: 2 of 4` and `Remaining: 2`.

**Exercise B:** mark “Build a project” as complete. Expect `Completed: 3 of 4` and `Remaining: 1`.

**Exercise C:** export another function from `lib/tasks.arya` that returns the number of all tasks. Call it from `main.arya`. Run Check before Run, then compare the function's result with `len(items)`.

## 5. Diagnose a source error

These exercises intentionally fail. They are not part of the completed reference project.

Change a call from `tasks.countRemaining(items)` to `taks.countRemaining(items)`. Check should report `Unknown name 'taks'` at that token and may suggest `tasks`. Correct it before continuing. Check validates the alias, not whether every property exists on a JavaScript object.

Try adding:

```arya
const total = 1
total += 1
```

Check rejects the write to const. Replace const with let if changing that binding is intended, then remove this temporary exercise.

For a runtime-location exercise, create `practice/lib/broken.arya`:

```arya
export fn fail() {
  const item = null
  return item.name
}
```

Add these top-level statements to `practice/main.arya`:

```arya
use arya "./lib/broken.arya" as broken
broken.fail()
```

Check passes because the names are declared. Run fails with TypeError and a mapped frame at `broken.arya:3:15`, plus a caller frame in `main.arya`. That identifies the original property access without opening generated JavaScript. Remove the two temporary entry statements afterward.

## Common problems

| Observation | Action |
| --- | --- |
| `npx` cannot find Arya | Confirm you are in the folder containing the local `node_modules` installation; rerun the archive install command there. |
| An Arya module is missing | Check the importing file's relative path and explicit `.arya` extension. |
| An import escapes the project root | Keep Arya sources below the entry file's directory, or move the entry to their common parent. |
| A cycle reports `a.arya → b.arya → a.arya` | Move shared functions into a third module that both can import without importing its callers. |
| `Unknown name` | Check spelling, scope, parameters, and import aliases. Use the reported original token range. |
| `Cannot assign to const` | Use a mutable let binding where replacement is intended. Mutating a const object's properties is allowed. |
| A declared binding throws ReferenceError when run | Delay the read until its declaration initializes it; lexical resolution does not execute or simulate program flow. |
| The stack shows generated output during standalone execution | Put `--enable-source-maps` before the generated entry path. |

The finished task project is intentionally small: it stores its data in source and prints a report. For Python work, use the [interop examples](interop.md) and batch a collection into one helper call. For precise language behavior, consult the [specification](arya-specification.md). Learners can record confusing steps and expected-versus-observed results using the [review template](community-review.md); this guide does not claim that an external review has already occurred.
