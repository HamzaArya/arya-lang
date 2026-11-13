#!/usr/bin/env python3
"""Optional controller guardrails: preserve evidence, reject drift and contention."""
import fcntl
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

controller = Path(__file__).parents[1] / "benchmarks/journal.py"
guard = runpy.run_path(str(controller))


class Guardrails(unittest.TestCase):
    def command(self, *args):
        return subprocess.run([sys.executable, str(controller), *map(str, args)],
                              capture_output=True, text=True, timeout=15)

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as work:
            out = Path(work)
            marker = out / "historical.json"
            marker.write_text("retain this evidence\n")
            result = self.command("build", "--before-compiler", "/missing-before", "--after-compiler", "/missing-after", "--out", out)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("FileExistsError", result.stderr)
            self.assertEqual(marker.read_text(), "retain this evidence\n")
            self.assertEqual(list(out.iterdir()), [marker])

    def test_changed_stdlib_is_rejected_before_measurement(self):
        with tempfile.TemporaryDirectory() as work:
            out = Path(work)
            compiler = out / "arya"
            compiler.write_text("same compiler binary")
            (out / "stdlib").mkdir()
            library = out / "stdlib/accounting.arya"
            library.write_text("original library")
            identities = guard["sdk_files"](compiler)
            self.assertIn(str(library), identities)
            (out / "artifacts.json").write_text(json.dumps(dict(identities=identities)))
            library.write_text("changed semantics")
            result = self.command("measure", "--out", out)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Benchmark input changed:", result.stderr)
            self.assertFalse((out / "started.json").exists())
            self.assertFalse((out / "results.json").exists())

    def test_cross_directory_timing_lock(self):
        with tempfile.TemporaryDirectory() as work:
            out = Path(work)
            (out / "artifacts.json").write_text('{"identities": {}}')
            (out / "workloads.json").write_text("[]")
            (out / "oracle.py").write_text("def oracle(case): return {}\n")
            with guard["timing_lock"]():
                result = self.command("measure", "--out", out)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("holds the timing lock", result.stderr)
            self.assertFalse((out / "started.json").exists())

    def test_started_run_is_never_reused(self):
        with tempfile.TemporaryDirectory() as work:
            out = Path(work)
            (out / "started.json").write_text("incomplete historical run\n")
            result = self.command("measure", "--out", out)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Timing already started here", result.stderr)
            self.assertEqual((out / "started.json").read_text(), "incomplete historical run\n")


if __name__ == "__main__":
    unittest.main()
