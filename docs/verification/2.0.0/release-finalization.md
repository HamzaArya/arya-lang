# Arya 2.0.0 final assembly sequence

This is the remaining sequence after every platform gate passes and the final
release documentation is committed. It is preparation guidance, not evidence
that assembly or publication has happened. Preserve the original qualified SDKs,
earlier application archives and all failed-attempt logs.

The Cygwin crypto linker correction requires a second qualification generation.
Use `.build/release-2.0.0/generation-2/final/`, `generation-2/assembled/` and
`generation-2/evidence/`. The earlier `final/` directory and its SDK/application/
editor records remain historical evidence. Do not substitute their compiler pins
for the new qualification or overwrite their payloads. The generation-two local
asset plan is `.build/release-distribution/generation-2-asset-plan.json`.

## Freeze inputs

Create a reviewed freeze commit, called **M1** below, containing the stable
qualification metadata and the accurately unpublished state at assembly time.
Record its full commit and tree IDs and require a clean working tree, including
untracked files outside ignored build directories.
Tag `v2.0.0` at M1; never move that tag to incorporate later delivery evidence.
Add the
qualified Windows SDK pins only after its complete native gates pass. Keep the
macOS and Linux original compiler/source identities in
[sdk-assembly-inputs.json](sdk-assembly-inputs.json). The Linux original installer
hash belongs to that original snapshot; the current installer is separately
qualified by [linux-installer-recheck.json](linux-installer-recheck.json).
Require the checkout's installer to match that recheck before copying it into
the final Linux SDK. The final macOS installer is exercised locally below.

Rebuild all twelve applications using the newly qualified macOS SDK and the
existing strict application controller. Repackage the bundled Mac VSIX with that
compiler. Retain the portable VSIX's exact bytes only after verifying its adapter
inputs remain unchanged. Exercise both actual editor hosts against the new SDK.
Preserve the earlier results under their original identities. Once those new
packages pass, later SDK metadata-only changes do not require another application
or editor package rebuild when protected payload bytes remain identical. Do not
build a Windows/Linux bundled VSIX on the Mac; the portable VSIX uses each
separately installed native SDK.

## Assemble and archive SDKs

Use a fresh assembly parent and one exact directory name per target. For example,
from the frozen repository checkout. Set `qualified_macos_sdk` and
`qualified_linux_sdk` to the exact newly verified extracted SDK paths recorded
in the generation-two evidence; the controller must match the new pinned profiles:

```sh
task_root="$PWD"
assembly_root="$task_root/.build/release-2.0.0/generation-2/assembled"
python3 docs/verification/2.0.0/reassemble-qualified-sdk.py \
  --platform darwin-arm64 \
  --sdk "${qualified_macos_sdk:?Set the newly qualified macOS SDK path}" \
  --destination "$assembly_root/arya-native-2.0.0-darwin-arm64"
python3 docs/verification/2.0.0/reassemble-qualified-sdk.py \
  --platform linux-x64 \
  --sdk "${qualified_linux_sdk:?Set the newly qualified Linux SDK path}" \
  --destination "$assembly_root/arya-native-2.0.0-linux-x64"
```

Use the same controller with `--platform windows-cygwin-x64` and its verified
extracted SDK path once available. Its profile must pin the native-tested
installer. Assembly verifies all protected payload bytes, original checksum
inventories, selected build inputs and the before/after packaging source snapshot.
Do not execute the Linux or Windows compiler on the Mac. Inspect each
`ASSEMBLY-INFO.json`; require the intended installer identities and preserve the
original `BUILD-INFO.txt` and `SOURCE-SHA256SUMS` unchanged.

Create each `.tar.gz` with `COPYFILE_DISABLE=1 tar -czf` from its assembly parent,
keeping the exact SDK root directory name. Write to a private temporary archive
first. Verify archive paths, regular files, executable modes and every file hash
against the assembled SDK, then publish the archive into the local final
directory with an exclusive hard link. Refuse an existing archive. Generate its
binary-mode sidecar with the retained checksum writer. This packaging step never
uses the incomplete local `.build/independent` bootstrap.

## Final macOS installation smoke

Use a new disposable directory and retain command output, exit status, compiler,
installer, source and executable hashes. Exercise the actual final assembled SDK
with HOME unset and spaces/apostrophe in its installation path:

```sh
final_sdk="$assembly_root/arya-native-2.0.0-darwin-arm64"
smoke_root="$task_root/.build/release-2.0.0/generation-2/final-mac-install"
test ! -e "$smoke_root" && test ! -L "$smoke_root"
install_prefix="$smoke_root/Mac's SDK prefix"
project_dir="$smoke_root/CLI project with spaces"
env -u HOME sh "$final_sdk/install.sh" "$final_sdk" --prefix "$install_prefix"
installed_arya="$install_prefix/bin/arya"
env -i PATH=/nonexistent "$installed_arya" --version
env -u ARYA_NATIVE_LIBDIR -u ARYA_C_COMPILER \
  "$installed_arya" create "$project_dir" --template cli
env -i PATH=/nonexistent "$installed_arya" check "$project_dir/main.arya" --json
env -u ARYA_NATIVE_LIBDIR -u ARYA_C_COMPILER \
  "$installed_arya" build "$project_dir/main.arya" \
  -o "$smoke_root/native CLI program" --release
env -i PATH=/nonexistent "$smoke_root/native CLI program" 19.95 3
env -i PATH=/nonexistent "$smoke_root/native CLI program" 9007199254740993.01 3
```

Require exact output `Total: 59.85` and `Total: 27021597764222979.03`, respectively,
with trailing newlines. Require the newly qualified macOS compiler SHA-256 from
the frozen generation-two SDK profile, correct managed
launcher target and matching installed SDK payload. No library/compiler override
may supply missing SDK files. The existing actual editor-host checks remain
applicable to their unchanged VSIX bytes.

## Source archive and release inventory

From the same frozen source checkout, first record `git rev-parse HEAD` and
`git rev-parse HEAD^{tree}` and assert that both equal M1's recorded identities.
Require empty `git status --porcelain` output immediately
before staging. The generated files under ignored `.build` are expected and
are not release source edits.

```sh
ARYA_PACKAGE_DIRECTORY="$task_root/.build/release-2.0.0/generation-2/final" \
  sh native/bootstrap/source-package.sh
python3 docs/verification/2.0.0/write-release-checksums.py \
  --directory "$task_root/.build/release-2.0.0/generation-2/final" \
  --plan "$task_root/.build/release-distribution/generation-2-asset-plan.json"
```

Verify the source archive's complete checksum coverage, pinned native build
inputs, installer, documentation catalog and absence of generated build caches.
Repeat the commit, tree and clean-tree assertions immediately after
staging. The external final delivery inventory must bind the source archive's
filename, byte count and SHA-256, its internal `SHA256SUMS` digest and complete
verified file count to M1's full commit and tree IDs, together with both clean-tree
assertions. Verify archived source inputs against the recorded checkout and
identify generated README/checksum files separately. This evidence supplies the
source checkout identity without modifying
the qualified source packaging helper or adding a generated Git dependency to
the archive. Retain the verification log; do not claim that the archive embeds a
commit field it does not contain.
Do not repeat a compiler bootstrap just to check an unchanged source archive.
The final upload set is **17 files**: three SDK archives, one source archive, two
application ZIPs, two VSIX files, each payload's conventional `.sha256` sidecar,
and the global `SHA256SUMS`. Use the explicit `uploadFiles` list in the local
asset plan. Do not blindly upload the entire staging directory: the retained
calculator short-name checksum alias and local proof JSON are not in that set.

## Workspace SDK promotion

After the final macOS smoke passes, record an inventory of the complete existing
`.build/independent` directory and confirm no owned build is using it. Prepare a
new sibling directory from the complete final macOS SDK and verify all files.
Rename the old directory on the same volume into a new historical release backup,
then rename the prepared SDK into `.build/independent`. If the second rename
fails, restore the old directory; never delete either copy as a recovery shortcut.
Record both paths, inventories, compiler hashes and the original CI build origin.

Verify `./bin/arya --version` and a check through the source launcher. This is a
promotion of the qualified CI SDK, not a completed local compiler bootstrap. The
SDK does not contain `arya.c` or `stage2.c`; never copy those files from the failed
old bootstrap to invent convergence evidence. A later source rebuild can produce
fresh generated C for the ordinary `stage-sdk.sh`/`native-package` workflow.

## Publication and portfolio

Review the final versioned release body and qualification record. Tag the exact
reviewed M1 source commit and attach the explicit immutable asset set to `v2.0.0`.
The release body must identify M1 and the source archive binding, while preserving
each SDK compiler's original qualified build origin. A later additive commit
**M2** on main records final artifact identities, public verification and deployment
outcomes. Link its immutable evidence from the release body when available. M2
does not change the tag, rebuild the payloads or relabel their source identities;
the archived unpublished flag describes the assembly-time state.
After publication, retrieve every public asset, including all eight sidecars,
and compare the actual bytes with the local inventory. Only then generate the
portfolio manifest with `--published` and actual measured file identities.

The portfolio branch is based on published main `631d3ec`; recheck remote main
immediately before deployment and preserve later changes if it advances. Use the
clean task worktree, build the final manifest-driven site, verify `/arya/` and the
static download route, and inspect a real browser click to the download page plus
desktop/mobile layout. Push a fast-forward main update to trigger the existing
Hostinger Git deployment. Verify the live page, manifest, CSS, release links and
checksum links after the deployment completes. The existing Git deployment
supplies the hosting route; no FTP upload is involved.
