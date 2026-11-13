# TextVault Manifest: developer report

Date: 2026-11-13. Track: 04-advanced. This is an AI-simulated developer exercise, not a claim that a human developer performed the work.

## Intended result

Create SHA-256 integrity manifests for UTF-8 text trees and verify added, removed and changed paths with machine-readable output.

## Work record

1. Read native language/SDK standard-library contracts and the native project creator. Selected native Arya modules for the application, with a Python-only integration driver.
2. Implemented the domain operations, input validation and explicit error behavior. Added standalone build/run documentation.
3. Ran `arya check main.arya`; corrected issues described below.
4. Built `--release` and ran `python3 smoke.py .build/app`; actual result is appended after the run.

## Friction and decisions

A general binary backup implementation is blocked by the public text-only file-read API. Narrowed the app explicitly to text-tree integrity instead of silently hashing transformed binary content. Initial check also required explicit nullable argument fallbacks and a null guard for file metadata.

Native builds emit existing macOS `getcontext`, `makecontext`, and `swapcontext` deprecation warnings from the runtime. These do not by themselves fail the build; no runtime/compiler files were changed.

The first integration run caught a real containment bug: temporary paths used `/var` while `realPath` returned `/private/var`, so a manifest inside the tree passed a lexical prefix check. The manifest parent is now canonicalized before comparison. The same test remains a regression check.

Source review found that `fs.publish` creates an exclusive hard link and does not remove its source. Replaced the predictable temporary filename with a private mkdtemp directory and a finally cleanup. Added a sentinel-symlink regression assertion to prove unrelated preexisting `.tmp` paths remain untouched.

## Boundaries / where a developer would stop

UTF-8 text files only: native public fs currently exposes text reads, so binary backup integrity was deliberately not promised. Rejects NUL content and byte-length mismatches, symlinks and special files, files over 1 MiB, trees over 16 MiB/10000 files/32 levels. No atomic tree snapshot under concurrent edits. This is manifest verification, not a backup copier.

The app remains implemented within this stated scope. No app has been abandoned. Features beyond these boundaries are explicitly deferred, not reported as completed.

## Verification evidence

Final native check, release build and integration smoke test passed on macOS ARM64. The evidence records compiler/SDK and input hashes.

- [Machine-readable run](../../reports/20261113T133508.368270Z/results.json).
- [check output](../../reports/20261113T133508.368270Z/04-advanced--cli-backup-manifest--check.log): exit 0.
- [build output](../../reports/20261113T133508.368270Z/04-advanced--cli-backup-manifest--build.log): exit 0.
- [smoke output](../../reports/20261113T133508.368270Z/04-advanced--cli-backup-manifest--smoke.log): exit 0.

Native app code and integration-test hashes match the final run. The browser interaction review is coordinated by the root agent and reported separately; HTTP page rendering is included in GUI smoke tests. No application was abandoned.

## 2.0.0 issue resolution

The language now exposes `fs.readBytesSync` and `security.hashBytes`. TextVault uses these APIs to hash original file bytes, including NUL and invalid UTF-8, so the earlier text-only language blocker is resolved. The smoke test independently checks the binary digest against Python hashlib and detects binary corruption. The existing size, path, symlink and exclusive-publication constraints remain. This extends integrity manifests; it does not add file copying or restoration. Current release validation is recorded in the repository's 2.0.0 release report.
