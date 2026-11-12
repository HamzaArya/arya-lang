#!/bin/sh
# Bootstrap-only link adapter for the shipped native decimal SDK.
set -eu
: "${ARYA_NATIVE_LIBDIR:?native library directory required}"
exec "${ARYA_C_COMPILER:-cc}" -I "$ARYA_NATIVE_LIBDIR" "$@" "$ARYA_NATIVE_LIBDIR/libmpdec.a" -lm
