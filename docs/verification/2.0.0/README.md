# Arya 2.0.0 verification

Stable 2.0.0 platform qualification is complete for macOS ARM64, Linux x64 and
Windows x64 with Cygwin. The current SDK generation comes from source
`ce80487668e082ffd263c5239d737de7074e4dc4` and
[run 43495958933](https://github.com/HamzaArya/arya-lang/actions/runs/43495958933).
Its native SDKs, direct platform GUI controls and real installer workflows passed
their recorded gates. Both actual VS Code host packages and all twelve fresh
AppKit application bundles were qualified on macOS; the application build is
[run 43496335481](https://github.com/HamzaArya/arya-lang/actions/runs/43496335481).

See [current editor/distribution identities](generation-2/distribution.md),
[current application evidence](generation-2/application-release.md),
[platform history](platform-qualification.md) and [current progress](progress.json).
Final artifact assembly and release/portfolio publication are recorded separately
in the progress and [release report](../../native-release-2.0.0.md).
The earlier [Windows crypto-link failure](windows-crypto-link-failure.json) and
other failed attempts remain in the evidence. Historical alpha records and the
previous 2.0.0 artifact generation do not qualify these replacement payloads.
