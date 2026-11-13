# Sourced by focused regression gates. Only an explicitly recorded Cygwin
# toolchain capability failure permits debug + GC stress instead of ASan/UBSan.
arya_test_second_mode=sanitized
if test "${ARYA_TEST_SANITIZERS:-required}" = unavailable; then
  case $(uname -s) in
    CYGWIN*) arya_test_second_mode=debug
      printf '%s\n' 'Cygwin toolchain lacks ASan/UBSan: running debug + GC stress; instrumentation is NOT qualified.' ;;
    *) printf '%s\n' 'Sanitizer fallback is restricted to the recorded Cygwin capability gate.' >&2; exit 1 ;;
  esac
fi
