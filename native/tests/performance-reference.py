"""Optional controller for exact-input cache and validation regressions."""
from pathlib import Path
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = Path(sys.argv[1] if len(sys.argv) > 1 else root / ".build/independent/arya").resolve()

with tempfile.TemporaryDirectory(prefix="native-performance-reference-", dir=root / ".build") as temporary:
    work = Path(temporary)
    counter = work / "compilations"
    wrapper = work / "cc"
    wrapper.write_text("#!/bin/sh\nprintf 'compile\\n' >> " + shlex.quote(str(counter)) +
                       "\nexec " + shlex.quote(shutil.which("cc")) + ' "$@"\n')
    wrapper.chmod(0o755)
    environment = dict(os.environ, ARYA_CC=str(wrapper))

    def run(arguments, expected=None, failure=False):
        result = subprocess.run([str(compiler), *map(str, arguments)], capture_output=True,
                                text=True, env=environment, timeout=120)
        assert (result.returncode != 0) if failure else (result.returncode == 0), result.stderr
        if expected is not None:
            assert result.stdout.strip() == expected, (result.stdout, result.stderr)
        return result

    def count():
        return len(counter.read_text().splitlines()) if counter.exists() else 0

    main = work / "main.arya"
    helper = work / "helper.arya"
    original = 'use arya "./helper.arya" as helper\nprint(helper.value)\n'
    main.write_text(original)
    helper.write_text("export const value = 1\n")
    run(["run", main, "--debug"], "1")
    run(["run", main, "--debug"], "1")
    assert count() == 1
    output = work / ".arya/native/main"
    saved = json.loads(Path(str(output) + ".BUILD").read_text())
    assert saved["nativeBuild"] == 2 and len(saved["inputs"]) == 2
    helper.write_text("export const value = 2\n")
    run(["run", main, "--debug"], "2")
    assert count() == 2, "Changed imported source reused an old executable"
    main.write_text(original + "missing()\n")
    run(["run", main, "--debug"], failure=True)
    assert count() == 2
    main.write_text(original)
    run(["run", main, "--debug"], "2")
    assert count() == 2, "A failed check damaged the previous valid cache"
    cfile = Path(str(output) + ".c")
    cfile.write_text(cfile.read_text() + "\n/* changed */\n")
    run(["run", main, "--debug"], "2")
    assert count() == 3, "Changed generated C reused"
    run(["run", main, "--debug", "--no-data-opt"], "2")
    run(["run", main, "--debug", "--no-data-opt"], "2")
    assert count() == 4, "Optimization flags were omitted from the cache key"

    first = work / "first.arya"
    second = work / "second.arya"
    first.write_text("export const value = 3\n")
    second.write_text("export const value = 4\n")
    alias = work / "alias.arya"
    alias.symlink_to(first.name)
    main.write_text('use arya "./alias.arya" as helper\nprint(helper.value)\n')
    run(["run", main, "--debug"], "3")
    assert count() == 5
    alias.unlink()
    alias.symlink_to(second.name)
    run(["run", main, "--debug"], "4")
    run(["run", main, "--debug"], "4")
    assert count() == 6, "Changed symlink resolution reused an old dependency"

    invalid = work / "invalid.arya"
    for source, message in [
        ("missing()\n", "Unknown or unsupported"),
        ("const value = 1\nvalue = 2\n", "Cannot assign to const"),
        ("fn sample() { return 1; missing() }\n", "Unknown or unsupported"),
        ('use arya "./helper.arya" as helper\nprint(helper.absent)\n', "does not export"),
        ('const value: number = "wrong"\n', "Type mismatch"),
    ]:
        invalid.write_text(source)
        result = run(["check", invalid], failure=True)
        assert message in result.stderr, (source, result.stderr)
        assert not invalid.with_suffix(".c").exists()

print("performance reference: dependency contents, flags, symlinks, artifacts and validation passed")
