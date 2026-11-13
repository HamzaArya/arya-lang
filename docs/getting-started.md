# Your first Arya project

Complete [installation](installing.md) and put the intended SDK on PATH. `command -v arya` shows which compiler these commands will use. A C11 toolchain is needed for `run`, `build` and `test`; the compiled program then runs directly.

## Create, check, test and run

```sh
arya create prices --template cli
cd prices
arya check main.arya
arya test main.test.arya
arya run main.arya -- 19.95 3
arya build main.arya -o ./prices --release
./prices 19.95 3
```

Both execution commands print `Total: 59.85`. The generated project contains `main.arya`, `main.test.arya`, `arya.json`, a Makefile and a README. Application arguments follow `--` when using `arya run`; a compiled executable receives them directly.

The starter uses exact decimal strings for amounts. Ordinary `number` values are binary64, so choose the data model deliberately:

```arya
use std "decimal" as decimal

fn total(price: string, quantity: string): string {
  return decimal.quantize(decimal.multiply(price, quantity), 2, "half-even")
}

print(total("9007199254740993.01", "3"))
```

This prints `27021597764222979.03`. For currency-tagged amounts, journals and financial reports, use the [standard library](standard-library.md) and [accounting API](accounting-engine.md).

## Split a project into modules

Create `lib/prices.arya` beneath the project directory:

```arya
use std "decimal" as decimal

export fn total(price: string, quantity: string): string {
  return decimal.quantize(decimal.multiply(price, quantity), 2, "half-even")
}
```

Then `main.arya` can import it explicitly:

```arya
use arya "./lib/prices.arya" as prices
print(prices.total("19.95", "3"))
```

Run `arya check main.arya`, then `arya run main.arya`. Imports stay within the entry file's project directory and reject module cycles. `export fn`, `export const` and other supported exports expose the module's public bindings. Native imports use `std`, `arya` or the explicit Python bridge; npm imports belong to the historical Node implementation.

## Compose records

The 2.0.0 SDK supports shorthand fields, string computed keys and record spread:

```arya
const currency = "AFN"
const defaults = {currency, scale: 0}
const roundingKey: string = "rounding"
const options = {...defaults, [roundingKey]: "half-even", scale: 2}
print(JSON.stringify(options))
```

`{currency}` means `{currency: currency}`. The spread copies the record's own stored fields into a new record, and later fields replace earlier values; `options` has scale `2` while `defaults` retains scale `0`. This is a shallow copy, and computed keys must be strings. Read the [language reference](arya-language.md) for the complete contracts and diagnostics. Older alpha.2 SDK archives do not contain this syntax.

## Everyday workflow

| Task | Command |
| --- | --- |
| Check without running imports | `arya check main.arya` |
| Machine-readable diagnostics | `arya check main.arya --json` |
| Format source | `arya fmt main.arya` |
| Verify formatting | `arya fmt main.arya --check` |
| Additional diagnostics | `arya lint main.arya` |
| Debug/sanitizer build | `arya build main.arya -o ./prices-debug --debug --sanitize` |
| Replace your existing release output | `arya build main.arya -o ./prices --release --force` |

`arya run` reuses its compiler-owned output when source, dependencies and build inputs are unchanged. An explicit output path is protected against accidental replacement; `--force` makes replacement intentional. The [CLI reference](cli.md) documents options and native tooling.

## Choose another application template

| Template | Create command | Result |
| --- | --- | --- |
| Command line | `arya create my-cli --template cli` | An exact-decimal CLI and native tests |
| HTTP API | `arya create my-api --template api` | Validated native HTTP endpoints |
| Website | `arya create my-web --template web` | Native HTTP backend with browser assets |
| UI | `arya create my-ui --template ui` | Declarative browser UI with native routes |
| Native GUI | `arya create my-desktop --template native-gui` | Direct AppKit, GTK 3 or Win32 controls with an exact-decimal form |
| macOS webview | `arya create my-desktop --template desktop` | AppKit/WebKit window with native routes |

For direct native software, run `arya create my-desktop --template native-gui`, enter the folder and run `arya build main.arya -o my-desktop --release`. Launch that executable to use the native order-total form. The [GUI guide](native-gui.md) covers controls, events, dependencies and the larger persistent Task Desk example.

Network starters handle shutdown signals. Browser content can include HTML, CSS and JavaScript; the Arya compiler and native server do not execute through Node. Desktop has additional macOS requirements, and the native HTTP server is not a complete TLS deployment solution.

Read [the language reference](arya-language.md) for syntax and types, [the native profile](native-profile.md) for compatibility and resource limits, and [the SDK guide](native-sdk.md) for editors and deployment. The runnable [journal report](../native/examples/journal-report.arya) and [security/debugging guide](native-security-debugging.md) show larger examples.
