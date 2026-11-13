#!/bin/sh
# Run from any directory; application data stays in the selected project.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if test "$#" -lt 1; then
  echo 'Usage: ./developer-projects/run.sh TRACK/PROJECT [application arguments...]' >&2
  echo 'Example: ./developer-projects/run.sh 01-beginner/cli-expenses help' >&2
  exit 2
fi
project=$1
shift
case "$project" in
  *..*|/*|*[!a-z0-9/-]*) echo 'Invalid project name.' >&2; exit 2 ;;
esac
if test ! -f "$root/$project/main.arya"; then
  echo "Project not found: $project (see developer-projects/README.md)" >&2
  exit 2
fi
compiler=${ARYA:-$root/../bin/arya}
cd "$root/$project"
exec "$compiler" run main.arya -- "$@"
