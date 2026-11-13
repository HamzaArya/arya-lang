# Guarded native `Number(toFixed())` lowering

Arya Ledger's aging and allocation calculations repeatedly use
`Number(value.toFixed(2))`. The ordinary implementation computes the exact fixed
decimal string, allocates managed UTF-16 storage, allocates an ASCII conversion
buffer, and parses the text back into a binary64 Number. The string is temporary,
but allocation, encoding, parsing, and collection still cost time.

The compiler now recognizes the direct builtin expression and preserves its
observable behavior while avoiding the temporary string. This is a generic
language optimization; Ledger sources, accounting rules, rounding boundaries,
addition order, and row order remain unchanged. `Number` still uses binary64. This
optimization does not turn floating-point money into exact decimal money; use the
decimal/accounting libraries when that is the intended data model.

## Implementation and compatibility

`native/compiler/compiler.arya` recognizes one argument to the unshadowed native
`Number` builtin when that argument is a direct `.toFixed(...)` call, including a
literal `["toFixed"]` key. `--no-data-opt` disables the lowering. Optional calls,
dynamic property keys, aliases, and shadowed `Number` retain their ordinary
lowering.

Evaluation remains: capture the outer callee, evaluate the receiver and key,
resolve the method, evaluate every argument (including spread/extra arguments and
awaits), invoke the inner call, then invoke the outer call. Values stay in the
generated caller's GC roots. Separate prepare/finish helpers preserve the inner
and outer source locations and separate call-depth checks. Custom methods,
getters, and coercing precision values use the originally resolved ordinary
callee. A runtime code-pointer and discriminator check also rejects a replaced
outer builtin.

For an eligible finite numeric receiver below `1e21` and numeric/default precision
from 0 through 18, a shared exact integer helper computes the same rounded
coefficient as ordinary `toFixed`. If that helper cannot fit its intermediate
product in 64 bits, the complete ordinary implementation runs. There are then two
allocation-free conversion paths:

1. For a coefficient at most `2^53`, both the signed coefficient and `10^precision`
   are exactly representable in binary64 (`5^18` needs only 42 significant bits).
   One correctly rounded division therefore rounds the same rational number as
   parsing the exact fixed string. This path requires nearest rounding,
   `FLT_EVAL_METHOD == 0`, no fast-math compilation, and a locale whose decimal
   point is `.`. The sign is applied before division, preserving negative zero
   when a negative nonzero value rounds to zero. Input negative zero still
   becomes positive zero, as ordinary `toFixed` does.
2. Other eligible coefficients, rounding modes, or locales render the identical
   ASCII decimal into a bounded stack buffer and call the existing `strtod`.
   There is no lossy conversion of a wide coefficient into a double.

Larger precisions, wide intermediates, nonfinite or large receivers, and coercing
precision arguments keep the existing string-returning method plus ordinary
Number conversion. The optimization preserves current locale-dependent parsing
behavior; it does not define new locale semantics. It uses portable C and the C
floating-point environment rather than handwritten assembly.

## Measured isolated result

The retained quiet comparison on 2026-11-13 used macOS 26.5.2 arm64, release native
binaries, and the same `native/benchmarks/fixed-number.arya` source. Each process
warmed 2,000 calls and collected before timing 100,000 scale-2 calls using process
CPU time. Three process samples were discarded, then nine samples were retained
per variant with alternating order. All variants produced the identical
checksum. No other agent builds or timing loops ran during the retained window.

| Variant | Median CPU | Median absolute deviation |
| --- | ---: | ---: |
| Frozen pre-change compiler/runtime | 33.843 ms | 0.522 ms |
| Fusion using exact stack ASCII plus `strtod` | 16.160 ms | 0.042 ms |
| Fusion with guarded exact division and stack fallback | 14.025 ms | 0.057 ms |

The final variant reduced this kernel's median CPU time by 58.6%, and improved
another 13.2% over the stack-only implementation. A separate runtime-counter
experiment found exactly 30,000 fewer allocation calls for 10,000 eligible
conversions: three temporary allocations avoided per call. These are isolated
kernel results; they exclude startup, parsing, IPC, and Ledger's other work and
are not a whole-application speed claim or a comparison with Node.

Raw samples, compiler/source/binary hashes, and retained checksums are in
[the numeric comparison](benchmarks/ledger-fastpaths-2026-11-13/fixed-number-comparison.json).
The initial stack-only experiment is also retained. One later trial overlapped
another build and was explicitly discarded before the quiet comparison.

Reproduce the kernel with two already built native compilers:

```sh
python3 native/benchmarks/fixed-number.py \
  --compiler baseline=/absolute/path/to/baseline-sdk/arya \
  --compiler candidate=/absolute/path/to/candidate-sdk/arya \
  --output .build/fixed-number-comparison
```

Use `--prepare-only` to build outside a quiet timing window, followed by the same
command with `--no-build` during that window. The driver needs Python; both Arya
programs execute with `PATH=/nonexistent` and need no Node installation.

## Verification

`native/tests/fixed-number.sh` checks optimized/reference output in release and
ASan/UBSan builds with GC stress. It covers 207 language assertions, signed zero,
extreme/subnormal inputs, every relevant fallback family, receiver/argument
ordering, mutation, getters, extra/spread arguments, awaits, source locations,
and recursion-depth boundaries. A generated-C probe compares 19,728 bitwise cases
under all four standard floating-point rounding modes, verifies a non-dot locale
when available, and checks replacement builtin/method guards. Both modes passed
on this arm64 host; the non-dot locale was available and passed.

`native/tests/fixed-number-reference.py` independently derives coefficients from
Python integer ratios and converts the exact decimal to binary64. Its 8,059
seeded cases cover every precision from 0 through 100, random binary64 bit
patterns, ordinary monetary values, signed zero, extreme values, half ties, and
both sides of coefficient boundaries. It compares native results with
`Object.is`, including NaN and signed-zero behavior, in optimized and reference
builds. Python is test tooling, not a runtime dependency.

```sh
ARYA_NATIVE_BIN=/absolute/path/to/sdk/arya sh native/tests/fixed-number.sh
ARYA_NATIVE_BIN=/absolute/path/to/sdk/arya python3 native/tests/fixed-number-reference.py
ARYA_NATIVE_BIN=/absolute/path/to/sdk/arya python3 native/tests/fixed-number-reference.py --sanitize
ARYA_NATIVE_BIN=/absolute/path/to/sdk/arya python3 native/tests/number-format-reference.py
```

The ordinary formatter oracle remains separate because extracting its common
coefficient helper must preserve standalone string formatting; all 3,354 seeded
string-formatting cases passed on the isolated final compiler. This change adds
no syntax and intentionally changes no language results. Other architectures,
C libraries, and locale installations need their own qualification; guards
retain the exact stack or ordinary fallback where the division proof does not
apply.
