# Exact binary64 fixed formatting

This records the earlier helper implementation and its measurements. The later [runtime optimization report](native-fastpaths.md) covers the subsequent integer fallback through 100 places and the new compiler's independent verification; the earlier timings below remain unchanged.

`number.toFixed(places)` formats the stored binary64 value. It does not make
ordinary numbers suitable for exact monetary arithmetic: use `std "decimal"`,
`money`, or `accounting` when exact decimal input is required.

## Finding and implementation

The previous native implementation formatted every finite number below `1e21`
with `snprintf("%.1074f")`, parsed that long exact string with libmpdec, then
rescaled and formatted it again. Even a two-place output required constructing
and parsing more than a thousand fractional digits. This preserved binary64
rounding semantics but imposed avoidable conversion and allocation costs.

The new common path extracts the IEEE-754 significand and exponent. It computes
the exact rational value multiplied by `10^places` using a checked unsigned
128-bit coefficient, powers of five, and binary shifts. The discarded remainder
determines rounding without an intermediate floating-point multiplication.
The result is written directly as UTF-16 text.

The path handles precisions 0–18 when its coefficient fits. Larger precisions,
unsupported widths, or compilers without 128-bit integer support retain the
existing libmpdec implementation. NaN, infinities, values at or above `1e21`,
precision coercion and errors retain their previous dispatch. Negative zero
formats without a minus; negative nonzero values rounded to zero retain it.
For example, `1.005.toFixed(2)` remains `"1.00"`, and `0.1.toFixed(18)` remains
`"0.100000000000000006"`.

This change introduces no dependency, syntax, public type, or rounding-policy
change. It does not introduce fast-math, SIMD, handwritten assembly, or a new
financial calculation policy.

## Controlled evidence

The isolated comparison used the retained baseline compiler's emitted C and
replaced only the number-formatting helper/method. Both executables used the
same static SDK and `-std=c11 -O2 -ffp-contract=off`. Nine alternating fresh-process
samples warmed each loop before measuring process CPU; compilation, process
startup and output are excluded. Every sample checksum matched an independent
Python integer-ratio oracle. Python controls the experiment only.

On the macOS ARM64 development host, the measured medians were:

| Workload | Before CPU ms | After CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| 40000 calls, two places | 635.947 | 83.804 | 7.59 |
| 40000 calls, eighteen places | 617.003 | 75.759 | 8.14 |
| 4000 calls, one hundred places | 56.112 | 53.433 | 1.05 |

The fallback sample ranges overlap; no fallback improvement is claimed. Host
background load was high and is retained alongside raw samples and exact C,
binary, compiler and source hashes in the
[isolated report](benchmarks/2.0.0-alpha.2-number-format-isolated-2026-11-13.json).
These are formatting microbenchmarks, not general application or platform claims.

The completed integrated comparison used the frozen baseline SDK and the final
self-hosted compiler, rather than substituting C functions. Nine alternating
samples produced:

| Workload | Before CPU ms | Integrated after CPU ms | Before / after |
| --- | ---: | ---: | ---: |
| 40000 calls, two places | 516.929 | 63.966 | 8.08 |
| 40000 calls, eighteen places | 486.883 | 61.401 | 7.93 |
| 4000 calls, one hundred places | 53.641 | 50.925 | 1.05 |

All checksums matched. The host ran macOS 26.5.2 ARM64 and Apple clang 21.0.0.
The main test suite and a separate clean source build were active in the
background; one-minute load averages were 8.45 at the start and 7.97 at the end.
This integrated run supplements the isolated comparison, which identifies the
effect of the formatting change alone. The fallback ranges still overlap and
do not demonstrate an improvement. Raw samples, environment, build observations
and artifact hashes are in the
[integrated report](benchmarks/2.0.0-alpha.2-number-format-integrated-2026-11-13.json).
The experiment was recorded on November 13 in the host's Asia/Kabul timezone
(November 12 UTC). Build and startup timings are outside this kernel measure;
no claim about those costs follows from it.

Separate instrumented processes include 2000 warmup calls plus 40000 measured
calls. Wrapper `calloc` calls fell from 462194 to 420194 for precision two and
eighteen: exactly one temporary allocation removed per format. Managed object
counts, collection counts and tracked peak live memory were unchanged. The
one-hundred-place fallback retained its counts. The counters exclude libmpdec
and stdio malloc/realloc traffic. Single-process RSS observations were similar,
so no material peak-RSS improvement is claimed. See the
[allocation report](benchmarks/2.0.0-alpha.2-number-format-allocation-2026-11-13.json).

## Checks and reproduction

The focused fixture covers ties, signed zero, subnormals, width overflow,
precision coercion, errors and fallback. It runs in release and ASan/UBSan modes
with collector stress and `PATH=/nonexistent`. An optional independent oracle
checks 3354 seeded cases using Python's arbitrary-size integer ratios, including
all precisions 0–100, nonzero amounts and neighbors of powers of two. No expected
result is computed by the native algorithm or libmpdec.

```sh
make native
sh native/tests/number-format.sh
python3 native/tests/number-format-reference.py
python3 native/tests/number-format-reference.py --sanitize
python3 native/benchmarks/number-format.py \
  --compiler before:/absolute/path/to/retained-sdk/arya \
  --compiler after:.build/independent/arya \
  --output .build/number-format-new-run.json
```

Use a new output path; the controller refuses to overwrite prior evidence.
The local before SDK for this experiment is
`.build/professional-tofixed/baseline-sdk`. The baseline independent oracle and
isolated candidate release/sanitizer fixture passed. The final integrated
compiler also passed the focused release/sanitizer fixture and all 3354
independent cases in both release and ASan/UBSan modes under collector stress.
Its SHA-256 was
`6d20a40c5d45733d48313392f2c764e505b231b384aa3ae724f4e1adf6743ae2`.
Local logs are retained as `format-fixture.log`, `format-reference-release.log`
and `format-reference-sanitize.log` under
`.build/professionalization-2026-11-12/`.
macOS leak detection is disabled for the sanitizer checks and is not claimed.

The remaining formatting costs include managed result strings, method dispatch
and general fallback conversion. Their optimization needs separate evidence and
the same exact binary64 rounding contract.
