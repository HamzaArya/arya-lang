# Arya documentation

The [advanced native call guide](native-advanced-calls.md) describes scalar
specialization, GC-root optimization, environment caching and their qualification.

Start with the [native SDK guide](native-sdk.md), [CLI commands](cli.md), [native language profile](native-profile.md), [standard library](standard-library.md), and [accounting API](accounting-engine.md). The [qualification report](native-independence-report.md) records completed gates and platform limits. [Function-call notes](native-function-calls.md) explain measured compiler optimization work.

The compiler and libraries live in `native/`. Historical JavaScript-profile documentation is preserved under [compat/node/docs](../compat/node/docs/README.md). Those guides describe the retained 1.3 implementation and its npm packages. Current native applications use the native SDK and its documented imports.

The [master plan](arya-master-plan.md) and [implementation roadmap](implementation-roadmap.md) contain broader ecosystem objectives. A roadmap item is not an implemented native API.
