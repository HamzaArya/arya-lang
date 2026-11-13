# Native dependency review, 2026-11-13

This review checked Arya's pinned dependencies against official release notes
and security pages. It did not identify a newer released version or an
unaddressed published advisory requiring an immediate upgrade in the five
components below. This is a dated review of published upstream information,
not a source audit or a guarantee that these dependencies have no defects.
OpenSSL is reviewed separately in [native security and debugging](native-security-debugging.md).

| Component in Arya | Upstream evidence | Result for this checkout |
| --- | --- | --- |
| mpdecimal 4.0.1 | The official [changelog](https://www.bytereef.org/mpdecimal/changelog.html) still lists 4.0.1 first. Its changes concern build/install portability; 4.0.0 already contains the documented arithmetic-status and exact-conversion fixes. | Retain the existing pin. Decimal limits, rounding policy and error handling remain responsibilities of Arya's wrapper. |
| PCRE2 10.49 | [10.49](https://github.com/PCRE2Project/pcre2/releases/tag/pcre2-10.49) is the latest release and fixes GHSA-r9hj-j2rw-4q3m, an out-of-bounds write with attacker-controlled expressions and a growable JIT stack. [10.48](https://github.com/PCRE2Project/pcre2/releases/tag/pcre2-10.48) includes the preceding 2026 security fixes. | The pinned release includes those fixes. `native/bootstrap/regex-sdk.sh` also builds the 16-bit library with `--disable-jit`; the affected growable-JIT-stack configuration is not enabled. Retain the pin and bounded matching. |
| Ada 4.0.0 | The [latest release](https://github.com/ada-url/ada/releases/tag/v4.0.0) includes input-length bounds, URL component offset hardening, IDNA fixes and a malformed-UTF-8 URLPattern denial-of-service fix. Its [security page](https://github.com/ada-url/ada/security) lists no published GitHub advisories. | Retain the release. All three vendored source/header files match their manifest SHA-256 values. An empty advisory list is not evidence of absence of vulnerabilities. |
| llhttp 9.4.3 | The [latest release](https://github.com/nodejs/llhttp/releases/tag/release/v9.4.3) rejects empty `Transfer-Encoding`. Its [security policy](https://github.com/nodejs/llhttp/security) directs reports through Node.js HackerOne and says repository issues generally do not receive CVEs. | Retain the release. All four generated C/header files match their manifest SHA-256 values. Searching only CVE identifiers or GitHub advisories would miss relevant llhttp fixes. |
| Ryu commit `4c0618b0e44f7ef027ebae05d2cc7812048f7c8f` | The [pinned commit](https://github.com/ulfjack/ryu/commit/4c0618b0e44f7ef027ebae05d2cc7812048f7c8f) was also upstream `master` when checked through GitHub's API. The [security page](https://github.com/ulfjack/ryu/security) lists no published advisory or security policy. | All nine vendored source/license files were fetched from the pinned upstream commit over HTTPS and compared byte-for-byte successfully. Arya uses `d2s.c` with `RYU_OPTIMIZE_SIZE` for shortest binary64 conversion. No revision change is indicated. |

`native/PROVENANCE.json` records release/archive identities and the Ada/llhttp
file hashes. The local file checks above establish consistency with that
manifest; only the Ryu check additionally fetched every vendored file from its
upstream pin during this review. The committed PCRE2 archive also matched its
manifest hash; the build verifies this hash before extraction. Existing extracted build directories are reusable
caches; a fresh source build remains the stronger check of the full path from
archive to linked library.

The Node.js organization hosting llhttp does not make its checked-in C output
depend on Node.js at build or runtime. Upstream development generators and
GitHub Actions are distinct from Arya's distributed build. Ada still requires
a C++ toolchain when building its static library, PCRE2 and libmpdec require C
and their supplied configure/build tools, and the application links their
native implementations. License texts and notices remain in `native/vendor`.

Continued maintenance should check upstream release notes and security policies,
refresh pinned hashes deliberately, run malformed-input and sanitizer coverage
against wrappers, and repeat the fresh-source qualification after upgrades.
The scope here excludes unpublished reports, every open issue, and independent
cryptographic or parser audits.
