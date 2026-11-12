# Native data performance

Native Arya uses guarded number/boolean specialization, rooted dynamic calls, statement temporary reuse, pooled literals, validated field offsets, immediate built-in calls, parser-local JSON key reuse, indexed Map/Set lookups and explicit list reservation. These optimizations retain native source errors and collector roots. Comparison flags include --no-call-opt, --no-advanced-call-opt and --no-data-opt.

The qualified single-host accounting measurement used an Apple M1 with 8 GiB RAM, release C11 (-O2, floating-point contraction disabled), exact line-v1 half-even amounts and 100000 identical input rows. Each fresh process prepared a batch and calculated it five times. Three interleaved process samples produced these medians:

| Implementation | Prepare ms | Five calculations ms | Process ms | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| Native Arya | 13.60 | 20.03 | 45.42 | 14.50 |
| Retained Node BigInt | 137.64 | 49.23 | 243.32 | 60.70 |
| Retained Node native addon | 141.21 | 21.40 | 216.37 | 59.56 |

Twenty fresh hello-world processes had median startup of 4.77 ms for native Arya and 39.90 ms for Node. The native hello executable was 366968 bytes; the accounting executable was 574456 bytes. SDK/dependency sizes are separate. These measurements were made while development qualification work was active, so they do not establish a universal speed ranking or performance for other applications/platforms.

The raw report is docs/benchmarks/2.0.0-alpha.2-accounting-qualified.json in the source repository. Reproduce with the optional native/tests/benchmark-accounting.py controller; Node is needed only when explicitly selecting that comparison. Core builds and applications do not use it.
