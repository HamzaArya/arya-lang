#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
cc=${CC:-cc}
flags=${CFLAGS:--O2}
output=${ARYA_NATIVE_LIBDIR:-"$root/.build/independent/lib"}
mkdir -p .build/gui "$output"
case $(uname -s) in
  Darwin) "$cc" -fobjc-arc $flags -Wall -Wextra -c native/gui/appkit.m -o .build/gui/platform.o
    printf '%s\n' '-framework' 'Cocoa' > .build/gui/gui-link-flags ;;
  Linux) command -v pkg-config >/dev/null || { printf '%s\n' 'native-gui requires pkg-config and GTK 3 development files.' >&2; exit 1; }
    pkg-config --exists gtk+-3.0 || { printf '%s\n' 'native-gui requires GTK 3 development files (libgtk-3-dev on Debian/Ubuntu).' >&2; exit 1; }
    "$cc" -std=c11 $flags -Wall -Wextra $(pkg-config --cflags gtk+-3.0) -c native/gui/gtk.c -o .build/gui/platform.o
    pkg-config --libs gtk+-3.0 | tr ' ' '\n' | sed '/^$/d' > .build/gui/gui-link-flags ;;
  CYGWIN*|MINGW*|MSYS*) "$cc" -std=c11 $flags -Wall -Wextra -c native/gui/win32.c -o .build/gui/platform.o
    printf '%s\n' '-lcomctl32' '-lgdi32' '-luser32' > .build/gui/gui-link-flags ;;
  *) printf '%s\n' 'native-gui supports AppKit (macOS), GTK 3 (Linux) and Win32 (Windows/Cygwin).' >&2; exit 1 ;;
esac
ar rcs .build/gui/libarya-gui.a .build/gui/platform.o
cp .build/gui/libarya-gui.a "$output/libarya-gui.a"
cp .build/gui/gui-link-flags "$output/gui-link-flags"
