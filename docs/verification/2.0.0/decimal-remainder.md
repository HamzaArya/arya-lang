# Exact decimal remainder

Status: preliminary local regression passed; final SDK qualification pending.

The Finance and Precision calculator work reports identified a missing public native integer remainder API. Their correct workaround computed `a - truncate(a / b) * b` from three decimal operations. Both GCD helpers now call `decimal.remainder(a, b)` directly.

`decimal.remainder` accepts the existing finite decimal string format and returns a canonical exact string. `decimal.values.remainder` operates on immutable parsed decimals and returns a new parsed value. Both use libmpdec's remainder operation, with an integer quotient truncated toward zero. Nonzero results follow the dividend's sign; a zero result formats as `"0"`. Fractional operands are supported, so integer arithmetic is a subset of the same contract. Zero divisors raise `ARYA_DECIMAL_ZERO`. Invalid types, syntax, sizes, missing inputs or non-parsed values raise `ARYA_DECIMAL_INPUT`. Existing 1024-character input/output and 4096-digit context limits remain.

The runtime dispatch, optimized standard-call recognition, checker contracts, public manifest and standard-library guide include both entry points. No new expression operator or implicit number coercion was added.

`native/tests/decimal-remainder-reference.py` generates 184 independent vectors using Python integer coefficients aligned to a shared decimal scale. It does not call libmpdec or Python's decimal module. The vectors include all operand sign combinations, fractional scales, signed 64-bit boundaries, 1024-character integers, and divisors as small as three times ten to the minus 1022. The checked-in Arya vectors let the native regression run without Python installed.

`native/tests/decimal-remainder.sh` runs optimized release, optimizer-disabled reference, and sanitizer builds with garbage collection stress. It checks both APIs against every vector, parsed-operand immutability, canonical zero, fixed-scale input behavior, zero divisors, malformed/nonstring/oversized input, missing arguments, invalid opaque values and typed call rejection. An explicitly recorded Cygwin sanitizer-toolchain limitation selects debug plus GC stress there; it is not reported as sanitizer coverage.

The first 2.0.0 calculator archive predates this narrow API migration and is preserved. The final calculator rebuild must produce new evidence and a separate immutable archive after the new compiler passes its gates.

## Initial fixture correction

The first Linux and macOS CI builds rejected the typed fixture before execution: vector indexing has type `string | undefined`, while `decimal.remainder` correctly requires strings. The fixture now asserts each vector has three fields and binds explicit string fallbacks before the API calls. An absent field still fails validation or the expected-result assertion. This was a test typing error, not an observed native remainder result failure; runtime qualification remained pending until the corrected fixture ran.

## Preliminary native execution

The corrected fixture passed **869 checks in each of optimized release, optimizer-disabled reference, and ASan/UBSan builds**, all with garbage collection stress. All typed-negative call checks passed too. The native compiler used was the completed local bootstrap `stage1`, SHA-256 `da60e17ea3169986c23a6362ccf627be8150014821bb0047a1d1917ffd90c942`. The full later bootstrap stages were stopped separately because of disk pressure, so this is explicitly preliminary API validation rather than final SDK self-hosting qualification. Log: `.build/release-2.0.0/decimal-remainder-stage1.log`.
