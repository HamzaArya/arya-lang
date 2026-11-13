# Diagnostic Clang phase profile

These six traces investigate the previously recorded hello build increase from 1049.765 to 1290.739 ms. They were collected **after** the Node comparison completed, using unchanged generated C copied from the toolchain benchmark. Each variant was compiled three times in alternating sequential order, with its own frozen SDK's libmpdec and the original C11 `-O2 -ffp-contract=off` flags, adding only Clang time tracing. This measures native C compilation/linking; it does not include Arya's frontend or C emission.

| Diagnostic span | Before median ms | After median ms |
| --- | ---: | ---: |
| Clang frontend | 159.061 | 236.257 |
| Clang backend | 956.319 | 991.005 |
| Optimizer (inside backend) | 552.276 | 589.569 |
| Code generation passes (inside backend) | 401.163 | 361.256 |
| `arm_neon.h` source span (inside frontend) | absent | 77.875 |
| Complete Clang compiler span | 1269.115 | 1230.206 |
| Driver wall time, including linker | 1342.370 | 1295.896 |

The candidate directly records `arm_neon.h` source spans of 86.519, 75.872 and 77.875 ms. No baseline trace includes it. This establishes a new header-processing cost, consistent with the 77.196 ms difference between frontend medians. It does **not** explain the entire earlier approximately 241 ms full-build increase: overall diagnostic wall-time ranges overlap and the candidate median is lower in this small instrumented run. The first baseline frontend sample was 301.503 ms, substantially above the other two; it is retained, not discarded. Backend and code-generation variation also remain visible.

Trace durations are nested wall-time spans, not additive process-CPU measurements. Differences of phase medians do not sum to the median total difference. Apple Clang emits header `Source` events as matching async `b`/`e` timestamp pairs; the analysis reconstructs those spans instead of treating absent `dur` fields as zero or using the misleadingly small `Total Source` aggregate. Tracing, caches, scheduling and the limited sample count prevent treating these numbers as an uninstrumented release performance regression estimate.

Both diagnostic builds reproduced the corresponding executable sizes, 367368 and 383976 bytes. Section listings are retained, but no allocation of the size increase to individual source changes is claimed. A separate controlled experiment would be needed to establish how conditional inclusion or a compiled runtime library affects build time and binary size; neither architecture was changed here.

[Exact commands, hashes, timestamps and environment](commands-and-environment.json) identify all inputs and outputs. [Analysis with every sample and header span](analysis.json), `before-0.json` through `before-2.json`, and `after-0.json` through `after-2.json` preserve the raw phase evidence. Source snapshots are `before.c` and `after.c`; stderr retains the existing macOS context-switch deprecation warnings. The actual profile commands include `-ftime-trace=<trace.json> -ftime-trace-granularity=500`. These results are separate from the earlier release benchmark.
