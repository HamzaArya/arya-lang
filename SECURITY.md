# Security reporting

Report vulnerabilities privately to **[hamzaarya123@gmail.com](mailto:hamzaarya123@gmail.com)**, the maintainer's established reporting address. Include the affected source/release, platform, a small reproduction, and the impact. Reporting is handled on a best-effort basis; no response deadline, bounty or supported stable line is promised.

Native Arya is an alpha implementation. Core runtime and library gates include address/undefined-behavior sanitizers, collector stress, native source bootstrapping, exact financial reference tests and malformed HTTP inputs. These checks do not establish that the implementation is free of defects. macOS leak detection has not been qualified.

The security library uses vendored OpenSSL EVP/RAND/scrypt. Dependency versions, integrity values and licenses are in `native/PROVENANCE.json` and `native/THIRD-PARTY-NOTICES.txt`. Financial values use exact strings, checked line bounds and explicit rounding; application authorization, audit policy and data migrations remain application responsibilities.

The native HTTP server implements bounded HTTP/1; use an appropriate TLS termination layer for public HTTPS deployment. Python bridging executes explicitly selected Python code with the application's privileges. Generated native executables and compilation of untrusted projects require ordinary operating-system isolation. Language analysis does not execute imports, and editor Run requires workspace trust.

Historical Node security information is retained in [compat/node/SECURITY.md](compat/node/SECURITY.md). Existing installed releases are not silently replaced by this checkout.
