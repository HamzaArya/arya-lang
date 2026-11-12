# Security reporting and supported releases

Arya is an experimental language preview.

<!-- release-status:start -->
Published experimental preview: **1.3.0-alpha.9**, compiler and creator on npm’s `next` channel; editor extension **1.3.4**. The recorded release passed **12** Linux/Windows/macOS jobs on Node 22.15.0, 22, 24, 26. See the [publication record](docs/releases/1.3.0-alpha.9-publication.json). This evidence describes the published artifacts; subsequent source changes require separate qualification.
<!-- release-status:end -->

The active preview line receives best-effort security fixes from **Hamza Arya**; users of earlier previews should upgrade to a reviewed version containing an applicable fix. The [stable release plan](docs/stable-release-plan.md) requires a maintained-line and support-period decision before stable publication. No stable release, fixed maintenance period, or response-time guarantee is declared yet.

## Report a vulnerability privately

Email **[hamzaarya123@gmail.com](mailto:hamzaarya123@gmail.com)**, the private reporting contact selected by Hamza Arya on 9 November 2026. The project homepage is [hamzaarya.com](https://hamzaarya.com), and the source repository is [HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang).

Include the exact Arya/npm package version and archive checksum, Node/Python versions, operating system/architecture, a minimal reproducer, expected and actual behavior, and whether the issue affects compilation, editor analysis, generated execution, filesystem containment, maps, or a language bridge. Describe the trust boundary that is crossed. Remove unrelated credentials and personal source code from logs and maps. Coordinate disclosure privately with the maintainer rather than posting exploitable details publicly before triage.

Reports are handled on a best-effort basis. This policy does not promise an initial-response deadline, a fix deadline, an embargo duration, a bounty, or encrypted email support. The maintainer will determine mitigation and release handling from the report. A future stable release must separately publish its maintained lines and support periods.

## Execution and qualification scope

Check/editor analysis is intended to remain non-executing. Arya Run and generated JavaScript execute program code under Node and may access the host's files, processes, and network; Python calls execute the selected Python code. Arya is not a sandbox for untrusted programs. Embedders such as AryaCode retain their workspace-trust and process policy.

Published version evidence is linked above. New compiler or native runtime changes require their own platform, runtime and artifact checks; prior publication results do not qualify changed bytes. The optional accounting kernel introduces a native buffer boundary whose bounds, exact arithmetic and malformed-input behavior are tested separately. This prototype is not a production financial security audit. External learner results remain pending. Publishing an Apache-2.0 alpha does not declare stability or a stable security-maintenance commitment. See the [compatibility policy](docs/compatibility-policy.md) and [release-readiness record](docs/release-readiness.md).
