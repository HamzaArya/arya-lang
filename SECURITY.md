# Security reporting and supported releases

Arya is an experimental language preview. The active experimental source line (`1.3.0-alpha.3` candidate; npm release `1.2.0-alpha.4`) receives best-effort security fixes from **Hamza Arya**; users of earlier previews should upgrade to the latest reviewed preview when a fix is available. No stable release, fixed maintenance period, or response-time guarantee is declared.

## Report a vulnerability privately

Email **[hamzaarya123@gmail.com](mailto:hamzaarya123@gmail.com)**, the private reporting contact selected by Hamza Arya on 9 November 2026. The project homepage is [hamzaarya.com](https://hamzaarya.com), and the source repository is [HamzaArya/arya-lang](https://github.com/HamzaArya/arya-lang).

Include the exact Arya/npm package version and archive checksum, Node/Python versions, operating system/architecture, a minimal reproducer, expected and actual behavior, and whether the issue affects compilation, editor analysis, generated execution, filesystem containment, maps, or a language bridge. Describe the trust boundary that is crossed. Remove unrelated credentials and personal source code from logs and maps. Coordinate disclosure privately with the maintainer rather than posting exploitable details publicly before triage.

Reports are handled on a best-effort basis. This policy does not promise an initial-response deadline, a fix deadline, an embargo duration, a bounty, or encrypted email support. The maintainer will determine mitigation and release handling from the report. A future stable release must separately publish its maintained lines and support periods.

## Execution and qualification scope

Check/editor analysis is intended to remain non-executing. Arya Run and generated JavaScript execute program code under Node and may access the host's files, processes, and network; Python calls execute the selected Python code. Arya is not a sandbox for untrusted programs. Embedders such as AryaCode retain their workspace-trust and process policy.

The published 1.2.0-alpha.4 release has local macOS arm64 qualification, with exact evidence in its [publication record](docs/releases/1.2.0-alpha.4-publication.json). Linux/Windows and external learner results remain pending; their absence must not be presented as verified support. Publishing an Apache-2.0 alpha does not declare 1.0 stability or a stable security-maintenance commitment. See the [compatibility policy](docs/compatibility-policy.md) and [release-readiness record](docs/release-readiness.md).
