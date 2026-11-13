# Exact decimal remainder

Status: implemented; rebuilt compiler execution pending.

The Finance and Precision calculator work reports identified a missing public native integer remainder API. Their correct workaround computed `a - truncate(a / b) * b` from three decimal operations. Both GCD helpers now call `decimal.remainder(a, b)` directly.

`decimal.remainder` accepts the existing finite decimal string format and returns a canonical exact string. `decimal.values.remainder` operates on immutable parsed decimals and returns a new parsed value. Both use libmpdec's remainder operation, with an integer quotient truncated toward zero. Nonzero results follow the dividend's sign; a zero result formats as `"0"`. Fractional operands are supported, so integer arithmetic is a subset of the same contract. Zero divisors raise `ARYA_DECIMAL_ZERO`. Invalid types, syntax, sizes, missing inputs or non-parsed values raise `ARYA_DECIMAL_INPUT`. Existing 1024-character input/output and 4096-digit context limits remain.

The runtime dispatch, optimized standard-call recognition, checker contracts, public manifest and standard-library guide include both entry points. No new expression operator or implicit number coercion was added.

`native/tests/decimal-remainder-reference.py` generates 184 independent vectors using Python integer coefficients aligned to a shared decimal scale. It does not call libmpdec or Python's decimal module. The vectors include all operand sign combinations, fractional scales, signed 64-bit boundaries, 1024-character integers, and divisors as small as three times ten to the minus 1022. The checked-in Arya vectors let the native regression run without Python installed.

`native/tests/decimal-remainder.sh` runs optimized release, optimizer-disabled reference, and sanitizer builds with garbage collection stress. It checks both APIs against every vector, parsed-operand immutability, canonical zero, fixed-scale input behavior, zero divisors, malformed/nonstring/oversized input, missing arguments, invalid opaque values and typed call rejection. An explicitly recorded Cygwin sanitizer-toolchain limitation selects debug plus GC stress there; it is not reported as sanitizer coverage.

The first 2.0.0 calculator archive predates this narrow API migration and is preserved. The final calculator rebuild must produce new evidence and a separate immutable archive after the new compiler passes its gates.
