# TextVault Manifest

Create SHA-256 integrity manifests for binary and text trees and verify added, removed and changed paths with machine-readable output.

## Build and test

From this directory in the repository:

```sh
make check
make build
python3 smoke.py .build/app
```

`make` defaults to the repository's `../../../bin/arya`; set `ARYA=/path/to/arya` for an installed SDK. Arya and a C toolchain are needed to build; the resulting executable needs neither Python nor Node. Python 3 standard library drives integration tests only.

## Use

```sh
.build/app create ./documents ../documents.manifest.json
.build/app verify ./documents ../documents.manifest.json
```

The manifest must be outside the scanned directory. Create refuses to replace an existing manifest. Verify exits 0 for a match, 2 for differences, and 1 for invalid input or I/O failures. The command reads source files and creates only the chosen manifest; it never restores, copies, or deletes source files. The output is an integrity inventory to use alongside a separate backup tool.

## Scope and limits

Uses native byte reads and SHA-256 over the original bytes, including NUL and non-UTF-8 data. Rejects symlinks and special files, files over 1 MiB, trees over 16 MiB/10000 files/32 levels, and files whose length changes during a read. No atomic tree snapshot under concurrent edits. This is manifest verification, not a backup copier.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.
