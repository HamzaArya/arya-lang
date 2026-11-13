# Signal Log

Summarize JSONL application logs by severity and service, count invalid input lines, and calculate average and nearest-rank p95 latency.

## Build and test

From this directory in the repository:

```sh
make check
make build
python3 smoke.py .build/app
```

`make` defaults to the repository's `../../../bin/arya`; set `ARYA=/path/to/arya` for an installed SDK. Arya and a C toolchain are needed to build; the resulting executable needs neither Python nor Node. Python 3 standard library drives integration tests only.

## Use

```sh
.build/app --help
.build/app sample.jsonl
.build/app sample.jsonl api
```

Input is one JSON object per line with `level` (`debug`, `info`, `warn`, `error`), `service`, `message`, and optional nonnegative `durationMs`. Blank lines are ignored. Invalid lines are listed by their one-based source line number. Optional second argument filters a service. JSON output is suitable for automation. Exit 1 means usage or file failure; malformed individual log lines remain in the report and do not fail the command.

## Scope and limits

Whole-file processing, 16 MiB limit; intended for local investigation, not live tailing. No timestamps or arbitrary log formats are inferred. Stateless by design.

See [REPORT.md](REPORT.md) for actual implementation and verification evidence.
