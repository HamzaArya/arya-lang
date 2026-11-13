# Stockroom

A native macOS desktop application with AppKit controls and native Arya application logic. Its views are **Products and Stock movements**. The shared host renders a normal desktop window, tables, native dialogs and menus; `main.arya` is the standalone native worker. No HTTP server, HTML, browser engine, Node or Python runs the application.

## Features

- Create and edit products with normalized unique SKU, location, description, exact unit price and reorder threshold.
- Receive or issue stock with a date and required reason/reference; prevent negative inventory.
- See stock counts, low-stock markers, exact per-product valuation and total inventory value.
- Review an append-only movement history with units and running balances.
- Delete only zero-stock products; preserve their audit history and allow a new product to reuse the SKU with a new identity.
- Search the native tables, inspect record details and export the current view to CSV through the shared host.

## Use the native application

Open the `Stockroom.app` bundle produced by the collection's root packaging command. See the collection README for bundle locations and the shared host build. The bundle contains the host, matching compiled worker and `ui.json`.

Choose **New product**, enter a unique SKU and product details, then save. New products start at zero stock. Select a product and use **Receive stock** or **Issue stock**, entering units and a reason/reference. A blank movement date defaults to today in UTC. Select **Edit product** to update details or the unit price; stock quantity changes only through movements.

**Stock movements** shows newest posted movements first. Historical names/SKUs remain as they were when the movement was posted. The current product valuation uses its current unit price. All prices belong to one currency chosen by the user; there is no currency conversion, tax calculation or purchase-order integration.

The host provides view switching, native search, row selection/details, edit forms, confirmed deletion, refresh, CSV export, reveal-data-folder, About and normal copy/paste/quit shortcuts. The worker rejects stale record versions so a failed or outdated edit cannot overwrite another saved change.

## Build and test the worker

From this project directory:

```sh
../../bin/arya check main.arya
mkdir -p .build
../../bin/arya build main.arya -o .build/worker --release --force
python3 smoke.py .build/worker
```

The existing native Arya SDK and C compiler build the worker. Python 3 is only the test controller. To inspect its machine interface directly:

```sh
DATA_FILE=/tmp/stockroom-inspection.json .build/worker list '{"view":"products"}'
```

The worker receives `COMMAND JSON_OBJECT` and prints exactly one JSON response. Expected failures return `{ok:false,message:...}` with exit status 0, as required by the desktop host protocol. Successful replies contain `ok`, `message`, `rows` and `summary` for the requested view after the action.

`list`, `product-add`, `product-edit`, `product-delete`, `receive`, `issue`.

Product fields: `{sku,name,location,unitPrice,reorder,description}`. Movement fields: `{units,date,reason}`. Selection actions additionally require displayed `id` and `version`. `body.view` is `products` or `movements`. SKU comparison is uppercase; allowed characters are letters, digits, dots, underscores and hyphens. Prices are decimal strings.

## Data and limits

The native host stores JSON under `~/Library/Application Support/Arya Native/stockroom/data.json`. `DATA_FILE` overrides this location for isolated testing; the parent directory must exist. The standalone worker defaults to `data.json` in its working directory. Existing invalid data fails visibly and is never silently replaced.

Mutations write a sibling temporary file and rename it only after validation. Failed persistence returns an error and preserves the prior store. The host provides a single-instance data-file lock; direct worker calls must use one writer at a time. Atomic replacement is not a power-loss/fsync guarantee. Keep backups of important data.

1000 live products, 10000 movement records, at most 1000000 units per product. Unit prices allow 12 whole digits and two decimal places. Product descriptions: 4000 characters; movement reasons: 500. The persisted JSON is capped at 2 MiB. The worker validates loaded records before returning a snapshot. The target is macOS ARM64 with the local AppKit host; other platforms are outside this package.

See [REPORT.md](REPORT.md) for actual implementation steps, test results and limits.

Storage API update (2026-11-13): saves use the native `fs.writeTextAtomicSync` operation. Existing or dangling store symlinks and nonregular files are rejected before loading; a predictable `.tmp` file is never used. Successful replacements use private owner-only file permissions. This is atomic visibility, without an fsync/power-loss guarantee or a multi-process lock. Build with the updated Arya SDK that provides this API.
