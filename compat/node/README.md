# Retained Arya 1.3 compatibility implementation

This directory preserves the Node compiler/runtime, npm creator, accounting addon loader, editor implementation, tests and supporting files from before the native-primary conversion. The original working files, including uncommitted changes, were moved without changing their bytes. [ARCHIVE.json](ARCHIVE.json) records source/document hashes and original paths. Existing dependency/build caches were also moved and remain ignored by Git.

The original [README](README-1.3.md), [documentation](docs/README.md), [changelog](CHANGELOG.md) and npm manifests describe this compatibility implementation. Its old workflows are retained here as historical files, outside GitHub's active workflow directory. Working with this tree is an explicit choice; the root Makefile, native compiler, standard libraries and generated applications do not use it or silently fall back to it.

Previously qualified/published archives in the repository's root `artifacts` directory remain unchanged. Existing Arya Ledger installations use their own pinned packages; no application, installed dependency, database or data was upgraded by moving this source. New native integrations can use the root SDK and its JSON-lines financial worker.
