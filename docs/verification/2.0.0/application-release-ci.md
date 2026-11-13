# Native application release build controller

Local disk pressure interrupted a compiler bootstrap. The application release
workflow reuses the already qualified macOS SDK, then builds the twelve desktop
applications sequentially on an ARM64 macOS runner. It never rebuilds the SDK
and does not publish a GitHub release or change qualification status.

## Inputs and checks

The initial input is desktop qualification run `43470021848`, source commit
`0dc38b789df2840aa2977769065479c578e70649`. Its successful macOS job is
`132039162194`; the SDK artifact is `14061468049`. The controller independently
looks up that job and artifact before downloading anything.

1. Require the exact repository, workflow path, source commit and successful
   macOS job. Reject an expired or ambiguous SDK artifact.
2. Verify the downloaded ZIP against GitHub's SHA-256 digest and byte count,
   then verify the SDK archive's checksum. Reject archive traversal, links and
   duplicate paths before extraction.
3. Verify every SDK file, exact checksum coverage, compiler identity and recorded
   stage-two/stage-three C convergence.
4. Match compiler, runtime, standard-library, vendor, Python-worker, native
   backend and bootstrap build inputs against the checkout. Test, documentation
   and packaging-only differences are retained in the evidence. A new or changed
   native build input rejects reuse of that SDK.
5. Pass the extracted native executable explicitly to each app builder. Record
   its exact hash, run all six desktop suites and all six calculator suites,
   verify native host/worker protocols, and check the packaged ARM64 executables.
6. Package into `.build/release-2.0.0/final/`, preserving prior bundles, archives
   and evidence. Extract each ZIP and verify its file hashes, executable bits and
   signatures. Keep application bundle minimum macOS 26.0 and version 2.0.0.

These checks qualify automated application behavior and packaging. They do not
claim manual GUI interaction, Developer ID signing or notarization.

## Initial trigger and evidence

`.github/workflows/native-application-release.yml` has a narrow release-branch
push trigger, so the first run does not require changing `main`. It also declares
manual inputs for selecting a later qualification run and commit. GitHub documents
the default-branch restriction for the manual UI and API/CLI dispatch availability
after an initial run in its [workflow dispatch reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

The job permits at most 60 minutes waiting for an SDK and has a 90-minute overall
limit. Application archive uploads require success. Detailed evidence is uploaded
even on failure, including compiler, smoke-test and protocol logs produced before
the failure. The controller records its checked-out commit separately from the
SDK qualification commit.

`python3 native/tests/release-apps-reference.py` passed four isolated rejection
test groups: SDK corruption/identity mismatch, native source drift, unsafe archive
entries, and failed or mismatched qualification artifacts. These tests run no
compiler, GUI or network request. Actual twelve-application CI execution remains
pending until the workflow is committed and pushed.
