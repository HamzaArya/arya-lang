# Local packaging and release process

1. Finish the milestone tests and migration notes in the [roadmap](arya-roadmap.md).
2. Update `package.json`, `src/compiler.ts` (`ARYA_VERSION`), and the portable extension version together. Keep the AryaCode product version independent.
3. Run `npm ci`, `npm run check`, `npm run package`, and `npm run test:package`.
4. Optionally run `npm run package:editors` for the VSIX and editor kit.
5. Review `artifacts/`, package contents, third-party notices, supported Node/Python versions, and platform qualification. Record archive SHA-256 alongside the release revision.
6. In AryaCode, run `node scripts/update-arya.mjs /absolute/path/to/arya-lang-<version>.tgz`, then `npm ci`, `npm run check`, `npm run build`, and desktop Arya integration tests. Commit the archive, dependency pin, lockfile, and integration changes together.
7. Create local release commits only after the checks pass. Keep repository extraction and new language features in separate commits.

Public release requires the owner's explicit decisions about the license, registry package name/ownership, and hosting remote. Do not create a remote, push a tag, or publish a package as part of local packaging. The inherited `private: true` prevents accidental `npm publish`; `UNLICENSED` is unchanged metadata, not a newly selected license.
