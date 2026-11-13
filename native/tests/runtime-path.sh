#!/bin/sh
# Cygwin build_env supplies its DLL directory to the Windows loader when the
# POSIX PATH is empty, while retaining the empty PATH in the Cygwin child.
# This avoids relocating cygwin1.dll or exposing interpreter executables.
arya_test_prepare_runtime_path() {
  arya_test_runtime_path=/nonexistent
  case $(uname -s) in CYGWIN*) arya_test_runtime_path=;; esac
}
