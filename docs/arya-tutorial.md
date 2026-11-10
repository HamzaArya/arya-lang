# Learn Arya: your first programs

This tutorial teaches the current Arya language, developed in this standalone repository. Start with no programming experience: run a lesson, read its output, change one thing, and run it again. You do not need to know JavaScript or Python before lessons 1–4.

Arya is the language. AryaCode is the editor. Save your code in a file ending in `.arya`. The current compiler turns that code into JavaScript and runs it with Node.js. Later lessons show how the same Arya program can use JavaScript libraries and call Python functions.

The [language reference](arya-language.md) explains usage; the [core specification](arya-specification.md) defines precise rules and limitations. This tutorial gives you an order to learn them in.

## Start without an editor checkout

Install the compiler in a new directory:

```sh
npm init -y
npm install --save-exact arya-language@1.2.0-alpha.4
```

Save the first lesson below as `main.arya`, then run `npx --no-install arya check main.arya` and `npx --no-install arya run main.arya`. Use any text editor; [editor setup](editor-setup.md) enables the bundled extension and icons. Python is needed only for Python examples.

## Use the checked-in lessons in AryaCode

1. Restart the refreshed AryaCode app if it is already open.
2. Use **File → Open Folder** and choose this repository's `fixtures/arya` folder.
3. Trust this folder so the editor can run its examples.
4. In Explorer, open `learn/01-hello.arya`.
5. Click the play button for **AryaCode: Run Current File**. You can also find that command in the Command Palette or press **Control+F5**, including on macOS. If your keyboard uses F5 for a media control, use the Command Palette.
6. Read the program's output in the terminal panel below the editor. Save with **Command+S** on macOS or **Ctrl+S** elsewhere after changing code.

Keep the folder open: the current Run action expects a saved file inside the first local workspace folder. You do not need to install a separate Arya editor extension or npm packages for these lessons. The Python lesson needs Python; the local bundled app selects its available Python runtime for you.

For a new program, use Explorer's **New File** button, name it `practice.arya`, and save it inside this folder. Edit `.arya` source files; files under `.arya/build` or `.arya/run` are generated output.

Prefer a terminal? From the **arya-lang repository root**, run:

```sh
npm run arya -- run fixtures/arya/learn/01-hello.arya
```

Replace the filename to run a different lesson. These repository commands need Node and the repository's npm dependencies. On a fresh checkout, run `npm ci` and `npm run build` first. The checkout does not install a global command automatically. To use `arya` directly or work in another editor, use the [npm installation guide](installing.md).

## Lesson 1: print a message and remember a value

Open [01-hello.arya](../fixtures/arya/learn/01-hello.arya):

```arya
let name = "Hamza"
print("Hello, " + name + "!")

let lessons = 1
lessons += 1
print("Lessons completed:", lessons)
```

Your program prints:

```text
Hello, Hamza!
Lessons completed: 2
```

`let` creates a variable: a name that remembers a value. Here, `name` remembers some text. Quotes distinguish text such as `"Hamza"` from the name of a variable. `print(...)` displays values in the terminal. The `+` operator joins strings, while `lessons += 1` adds one to a number already stored in a variable. With commas, `print` separates its values with spaces.

Each statement normally goes on its own line; you do not need a semicolon. A line starting with `#` is a comment for readers and does not execute.

**Your turn:** change the name to `"World"` and change the increment to `lessons += 3`. Predict both lines before running. You should see `Hello, World!` and `Lessons completed: 4`.

## Lesson 2: make a decision

Open [02-decisions.arya](../fixtures/arya/learn/02-decisions.arya):

```arya
let score = 82
const passingScore = 60

if score >= 90 {
  print("Excellent")
} else if score >= passingScore {
  print("Passed")
} else {
  print("Try again")
}

let submitted = true
if submitted and score >= passingScore {
  print("Lesson complete")
}
```

Output:

```text
Passed
Lesson complete
```

`if` chooses a block of code based on a condition. Braces `{ ... }` mark that block. The first successful branch in the `if`/`else if`/`else` chain runs. `const` declares a binding you cannot reassign; `let` allows reassignment. `true` and `false` are boolean values—write them without quotes.

| Write | Meaning |
| --- | --- |
| `score = 82` | Store a value in an existing variable |
| `score == 82` | Compare values for equality |
| `score != 82` | Compare values for inequality |
| `score >= 60` | Greater than or equal to |
| `score < 60` | Less than |
| `submitted and score >= 60` | Both conditions must succeed |
| `submitted or score >= 60` | At least one must succeed |
| `not submitted` | Reverse the condition |

`==` uses strict equality: `"82"` and `82` are different values. Use `number("82")` when you want to convert numeric text into a number.

`and` and `or` return one of their operands. This makes `let title = "" or "Untitled"` a useful fallback: `title` becomes `"Untitled"`. An empty list or object counts as true. Unary operators bind before powers in Arya: `-2 ** 2` is `4`; write `-(2 ** 2)` for `-4`.

**Your turn:** try scores `95`, `60`, and `40`. Then keep the score at `82` and change `submitted` to `false`. The final message should disappear, while `Passed` still prints.

## Lesson 3: work with a list and repeat an action

Open [03-lists-and-loops.arya](../fixtures/arya/learn/03-lists-and-loops.arya):

```arya
let names = ["Hamza", "Arya", "Python"]
print("First name:", names[0])
print("Names:", len(names))

for name in names {
  print("Hello, " + name)
}

let total = 0
for value in range(1, 6) {
  total += value
}
print("Total:", total)
```

Output:

```text
First name: Hamza
Names: 3
Hello, Hamza
Hello, Arya
Hello, Python
Total: 15
```

Square brackets create a list. Positions start at **zero**, so `names[0]` is the first item. `len(names)` counts the items. A `for` loop takes one item at a time and runs the block for it.

`range(1, 6)` supplies `1, 2, 3, 4, 5`: the end is excluded. `range(3)` supplies `0, 1, 2`. The running `total` starts at zero and adds each number.

**Your turn:** add a fourth name to the list. Then change the range so it adds the numbers 1 through 10. The total should become `55`; the range should end at `11`.

## Lesson 4: write a reusable function and group related values

Open [04-functions-and-objects.arya](../fixtures/arya/learn/04-functions-and-objects.arya):

```arya
fn area(width, height) {
  return width * height
}

let room = {name: "Studio", width: 4, height: 3}
print(room.name + " area:", area(room.width, room.height))

room.width = 5
print("Updated area:", area(room.width, room.height))
```

Output:

```text
Studio area: 12
Updated area: 15
```

`fn` defines a function. Its parameters, `width` and `height`, receive values when you call it. `return` sends a result back to the caller. `area(4, 3)` therefore produces `12`. Writing a function definition does not run its body; calling it does.

Keep a returned value on the same line as `return`. A newline immediately after `return` returns no value (undefined). Function declarations can be called earlier in their enclosing scope; variables must finish initialization before a call reads them. A closure can refer to a variable declared later, provided you call it after that declaration runs.

The `room` object groups related values under property names. The colon in `width: 4` associates the name with its value, and `room.width` reads it. Braces after `if` or `fn` enclose code; braces used as a value after `=` can create an object.

**Your turn:** write a second function, `perimeter(width, height)`, which returns `2 * (width + height)`. Call it after the room's width changes to 5. Its result should be `16`.

## Lesson 5: use an existing JavaScript library

Open [05-javascript.arya](../fixtures/arya/learn/05-javascript.arya):

```arya
use js "node:path" as path

print("File:", path.basename("/projects/hello.arya"))

let doubled = [1, 2, 3].map(fn(value) {
  return value * 2
})
print("Doubled:", JSON.stringify(doubled))
```

Output:

```text
File: hello.arya
Doubled: [2,4,6]
```

Read the import as: “Use the JavaScript module named `node:path`, and call it `path` in this file.” `path.basename(...)` then calls one of its functions. `node:` libraries come with Node; they do not need an npm install.

JavaScript libraries load before the program's statements execute. The alias is available after its `use js` statement. Arya selects a library's non-nullish default export, otherwise its namespace. For an intentional null default, read `alias.default`; the alias itself is the namespace.

The list's JavaScript `.map(...)` method calls the Arya function once for each value and builds a new list from its results. A function passed to another function is called a **callback**. This is also how many JavaScript frameworks ask you to handle events or requests. `JSON.stringify(...)` turns a list or object into JSON text so its structure is easy to see.

**Your turn:** make the callback multiply by 3. The new list should be `[3,6,9]`.

For a third-party npm library, install it in your own project first. For example, create a fresh folder from a terminal in a location of your choice:

```sh
mkdir my-arya-app
cd my-arya-app
npm init -y
npm install express
```

Open `my-arya-app` as a folder in AryaCode, copy the existing [express.arya](../fixtures/arya/express.arya) example into it, and use **Run Current File**. Visit `http://localhost:3000`, then use **AryaCode: Stop Current File** when finished. The package's `package.json` keeps this installation inside your new project. Do not use `npm run arya` in this new project unless you configure that script; the repository-specific script lives in `arya-lang`.

## Lesson 6: call Python from Arya

Open [06-python.arya](../fixtures/arya/learn/06-python.arya):

```arya
use python "math" as math
use python "../statistics_helper.py" as statistics

print("Square root:", math.sqrt(81))
let report = statistics.summarize([10, 20, 30])
print("Count:", report.count)
print("Mean:", report.mean)

try {
  math.sqrt(-1)
} catch error {
  print("Caught:", error.message)
}
```

Output:

```text
Square root: 9
Count: 3
Mean: 20
Caught: Python: ValueError: math domain error
```

`math` is a Python standard library module. `statistics_helper.py` is an ordinary Python file already included in these examples. Its `summarize` function receives your list and returns a dictionary with a count and mean. The bridge turns that dictionary into a JavaScript-style object, so Arya can read `report.mean`.

`../` means “one folder above this source file.” If you move the lesson, copy the helper too and adjust the path. Module import paths are relative to the `.arya` source file.

The deliberately invalid `math.sqrt(-1)` call raises a Python error. `try` runs code that may fail; `catch error` receives the error and lets the program handle it. Without that block, the unhandled error would stop the program.

**Your turn:** change the square-root input to `144` and the list to `[5, 10, 15, 20]`. You should get a square root of `12`, a count of `4`, and a mean of `12.5`.

For Python keyword arguments, the bridge uses `.with`: the first value is the list of positional arguments and the second is the object of keyword arguments. The included helper supports this call:

```arya
use python "../statistics_helper.py" as statistics
print(statistics.round_mean.with([[1, 2, 4]], {digits: 2}))
```

That prints `2.33`. Pass ordinary numbers, strings, booleans, null, lists, and JSON-compatible objects. Each call starts a fresh Python process: it does not preserve Python variables across calls or pass live Python objects and callbacks. In the CLI, Python must be available as `python3` (`python` on Windows), or selected through `ARYA_PYTHON`. See the reference for editor interpreter settings and bridge limits.

NaN and infinities cannot cross this bridge. Negative zero sent to Python becomes zero; large Python integers can lose precision on return. Encode exact large integers or decimals as strings when that matters. Calls block for at most 30 seconds and have 8 MiB output buffers; batch repeated work into one helper call. The proxy reserves `then` and `with`, so Python members with those names require a helper under another public name.

## Lesson 7: wait for asynchronous work

Open [07-async.arya](../fixtures/arya/learn/07-async.arya):

```arya
use js "node:timers/promises" as timers

async fn greetLater(name) {
  await timers.setTimeout(100)
  return "Hello, " + name
}

print("Waiting...")
let greeting = await greetLater("Hamza")
print(greeting)
```

The output is `Waiting...`, then `Hello, Hamza` after about 100 milliseconds. A promise represents a result that may arrive later. `async fn` creates a function whose call returns a promise; `await` waits for the result before this part of the program continues. You can use `await` at the top level or inside an `async fn`, but not inside a regular `fn`.

You will use this pattern for many JavaScript network and file APIs. It does not make the current Python bridge asynchronous; those calls block until Python returns.

**Your turn:** change `100` to `1000` and observe the longer pause. The output text should remain the same.

## Lesson 8: pass input when starting a program

Open [08-arguments.arya](../fixtures/arya/learn/08-arguments.arya):

```arya
let name = "friend"
if len(args) > 0 {
  name = args[0]
}
print("Hello, " + name)
```

The editor's ordinary Run button supplies no extra arguments, so it prints `Hello, friend`. From the **arya-lang repository root**, try:

```sh
npm run arya -- run fixtures/arya/learn/08-arguments.arya -- Hamza
```

Now it prints `Hello, Hamza`. `args` is a list of strings passed at startup. The first `--` sends the following arguments through npm; the second separates the source filename from your program's arguments. Put a multi-word argument in quotes:

```sh
npm run arya -- run fixtures/arya/learn/08-arguments.arya -- "Arya learner"
```

**Your turn:** pass your own name. Later, convert numeric arguments with `number(...)` before doing arithmetic. Arya 0.1 has no builtin `input()` prompt; command-line arguments are a simple way to start accepting input.

## Lesson 9: build a small task-list program

Run [09-task-list.arya](../fixtures/arya/learn/09-task-list.arya). It combines lists, objects, functions, loops, and conditions:

```arya
let tasks = [
  {title: "Learn variables", done: true},
  {title: "Write a function", done: true},
  {title: "Build a web app", done: false},
]

fn countDone(items) {
  let count = 0
  for item in items {
    if item.done {
      count += 1
    }
  }
  return count
}

for item in tasks {
  let marker = "[ ]"
  if item.done {
    marker = "[x]"
  }
  print(marker + " " + item.title)
}
print("Completed:", countDone(tasks), "of", len(tasks))
```

Output:

```text
[x] Learn variables
[x] Write a function
[ ] Build a web app
Completed: 2 of 3
```

This program stores tasks in its source; it has no database or interactive editing yet. Each run starts again from the list you wrote.

**Your project:** add a fourth task, mark the web-app task as done, and print the number remaining using `len(tasks) - countDone(tasks)`. If the new task is unfinished, you should see `Completed: 3 of 4` and one remaining task.

## Next: run the web app

Open [web.arya](../fixtures/arya/web.arya) from the parent examples folder and click **Run Current File**. Visit `http://localhost:3000` in your browser, then click **Say hello** on the page. The browser requests `/api/hello`; an Arya callback handles that request through Node's HTTP library and sends JSON back.

Change the message in `response.end(JSON.stringify(...))`, save, stop the running file with **AryaCode: Stop Current File**, and run it again. Reload the page and click the button. The server does not reload itself when code changes. Only run one example on port 3000 at a time; stop `express.arya` first if it is running.

That example shows how to reuse a JavaScript library from Arya. The 1.2 preview also supplies a dedicated `view` syntax for HTML and literal CSS/browser JavaScript in one file; see the [web guide](arya-web.md) and `fixtures/web/studio.arya`. The original example continues to use ordinary HTML strings.

## Run, check, and build

From the repository root:

| Command | What happens |
| --- | --- |
| `npm run arya -- run fixtures/arya/learn/01-hello.arya` | Compiles and runs the program |
| `npm run arya -- check fixtures/arya/learn/01-hello.arya` | Checks syntax, lexical names, and const writes without running code or imports |
| `npm run arya -- build fixtures/arya/learn/01-hello.arya` | Writes a JavaScript `.mjs` file without running it |

The editor's **Build / Check Current File** compiles to `.arya/run`; the CLI's `build` writes to `.arya/build`. Check now catches unknown lexical names and reassignment of const bindings, including import aliases. It reports independent errors together. A successful check does not prove that your dependencies are installed, that a property exists, or that a declared binding is initialized when you use it. Check/Build/Run also follow `use arya` dependencies without executing them during checking, reject cycles and missing direct namespace exports, and publish the complete generated graph only after validation. Runtime stacks map to original `.arya` locations in every module in `arya run` and AryaCode. For standalone generated modules, enable Node source maps with `node --enable-source-maps generated.mjs`. Interactive Arya debugging is not available yet.

For example, `let greeting = "hello"; print(greetng)` fails Check with `Unknown name 'greetng'. Did you mean 'greeting'?`. Correct the spelling before running. `const count = 1; count += 1` also fails Check; use `let count = 1` if you intend to replace its value. Updating `const item = {count: 1}; item.count += 1` is allowed because it changes the object. In an editor, go-to-definition follows a local name to its declaration, including captured parameters and variables; library properties do not have lexical targets.

## When something goes wrong

| Symptom | What to try |
| --- | --- |
| The file is shown as Plain Text | Check that its name ends in `.arya`, then restart the updated AryaCode app if needed. |
| Run asks for a local workspace | Save your file inside the folder opened in AryaCode. |
| Run says the workspace is untrusted | Use **Manage Workspace Trust** for your own lesson folder. |
| A red underline says `Expected '}'` | Close the block opened by an earlier `{`. |
| `Expected a name` | Write a variable name after `let` or a function name after `fn`. Avoid keywords as names. |
| `Unknown name` | Check spelling, capitalization, and the scope of the declaration. Use an explicit import or `globalThis` for optional host extensions. |
| `Cannot assign to const` | Use `let` if you intend to replace that binding's value. Const objects can still be mutated through properties. |
| `ReferenceError` before a declaration initializes | Move execution after initialization; a closure may capture a later name but must read it after initialization. |
| A library/module cannot be found | Check the import spelling, local file path, and selected interpreter or project dependencies. |
| Python cannot start in the CLI | Install/select Python or use the bundled runtime through AryaCode's Run action. |
| `EADDRINUSE` when starting a web example | Stop the other example on port 3000, or choose a different port and use it in your browser. |
| `arya: command not found` | Use the repository's `npm run arya -- ...` command, or install the editor kit's compiler package and add npm's executable directory to PATH. |

To read an error such as `practice.arya:3:12`, open `practice.arya` at line 3, column 12. For syntax problems, start with the first reported error, fix it, save, and run again.

When these lessons feel comfortable, use the [reference](arya-language.md) for `while`, `break`, `continue`, exports, additional operators, and bridge details. JavaScript/npm and JSON-compatible Python calls are the working bridges today. Command-line applications use the same Node.js runtime; see [runtime and migration](node-runtime.md). Other direct language bridges remain unsupported.

## Continue with a multi-file project

Follow the [task-report learning path](learning-path.md) to split a working program into `main.arya`, `lib/tasks.arya`, and `lib/report.arya`. Use `use arya "./lib/tasks.arya" as tasks` and named `export fn`/`export const`/`export let` declarations. Run the entry once; Arya checks/builds every dependency and writes a map beside every generated module. Imports stay inside the canonical entry directory; use a root-level entry when modules live in sibling folders. Cycles are rejected with an import chain.

The [interop guide](interop.md) lists stable Python error codes and two complete projects: a reproducible local npm dependency and one-call Python batching. Catch `error.code` for reliable categorization instead of matching platform-specific process messages. `ARYA_PYTHON_TIMEOUT` means reduce or split the work; `ARYA_PYTHON_OUTPUT_LIMIT` means reduce logging/results; `ARYA_PYTHON_PROTOCOL` means malformed or corrupted worker stdout. Regular Python logging goes to stderr. Exact large numbers should travel as strings.

For release/install commands and an offline path, see [installation](installing.md). The [community review protocol](community-review.md) is ready for real learner sessions; external observations have not yet been collected.

## Build an application next

Try the [project creator](project-creator.md), [async Python guide](python-async.md), [MySQL example](../fixtures/examples/mysql/README.md), or [UI/animation library](ui-library.md). Use the [debugging guide](syntax-and-debugging.md) for optional access, nullish defaults, code frames, and spelling fixes.

For the current source candidate, continue with [readable application syntax](flow-syntax.md): pipelines, concise functions, guarded exits, indexed iteration, cleanup, and a runnable ranking example. The older npm compiler does not include those additions.
