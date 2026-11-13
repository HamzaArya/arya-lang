#!/usr/bin/env python3
"""Reproduce native builds and black-box app tests; Python is test tooling only."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execute(command, cwd, log, timeout=240):
    started = time.monotonic()
    with log.open("w") as output:
        output.write("command: " + json.dumps([str(x) for x in command]) + "\n")
        output.flush()
        child = subprocess.Popen(command, cwd=cwd, stdout=output,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            code = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(child.pid, signal.SIGKILL)
            code = child.wait()
        finally:
            # Smoke tests may spawn a server; clean only this test's process group.
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    return {"command": [str(x) for x in command], "exit_code": code,
            "timed_out": timed_out, "seconds": round(time.monotonic() - started, 3),
            "log": str(log.relative_to(ROOT))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--filter", default="", help="Project path substring")
    parser.add_argument("--compiler", default=str(REPO / "bin/arya"))
    parser.add_argument("--check-only", action="store_true")
    options = parser.parse_args()
    compiler = Path(options.compiler).resolve()
    catalog = json.loads((ROOT / "projects.json").read_text())
    selected = [p for p in catalog if options.filter in p["path"]]
    if not selected:
        parser.error("No matching projects")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report_dir = ROOT / "reports" / stamp
    report_dir.mkdir(parents=True)
    version = subprocess.run([str(compiler), "--version"], capture_output=True,
                             text=True, timeout=20)
    result = {"started_utc": stamp, "platform": platform.platform(),
              "compiler": str(compiler), "version": version.stdout.strip(),
              "launcher_sha256": digest(compiler), "projects": []}
    native_compiler = REPO / ".build/independent/arya"
    if compiler == (REPO / "bin/arya").resolve() and native_compiler.exists():
        result["native_compiler_sha256"] = digest(native_compiler)
    # Record actual SDK inputs, since the working tree may have unrelated changes.
    library_dir = compiler.parent / "lib"
    if compiler == (REPO / "bin/arya").resolve():
        library_dir = native_compiler.parent / "lib"
    if library_dir.exists():
        result["sdk_files_sha256"] = {str(p.relative_to(library_dir)): digest(p)
                                      for p in sorted(library_dir.rglob("*")) if p.is_file()}
    for project in selected:
        folder = ROOT / project["path"]
        label = project["path"].replace("/", "--")
        row = {"path": project["path"], "kind": project["kind"], "steps": []}
        result["projects"].append(row)
        print("VERIFY " + project["path"], flush=True)
        required = ["main.arya", "README.md", "REPORT.md", "arya.json", "smoke.py"]
        row["missing_files"] = [x for x in required if not (folder / x).is_file()]
        if row["missing_files"]:
            row["status"] = "failed"
            print("  missing: " + ", ".join(row["missing_files"]), flush=True)
            continue
        sources = sorted(p for p in folder.rglob("*") if p.is_file()
                         and not any(x in {".build", ".arya", "__pycache__"} for x in p.parts)
                         and p.suffix in {".arya", ".py", ".json"} and p.name != "data.json")
        row["inputs_sha256"] = {str(p.relative_to(folder)): digest(p) for p in sources}
        artifacts = folder / ".build"
        artifacts.mkdir(exist_ok=True)
        binary = artifacts / "verified-app"
        steps = [("check", [str(compiler), "check", "main.arya"])]
        if not options.check_only:
            steps += [("build", [str(compiler), "build", "main.arya", "-o", str(binary),
                                  "--release", "--force"]),
                      ("smoke", [sys.executable, "smoke.py", str(binary)])]
        for name, command in steps:
            evidence = execute(command, folder, report_dir / (label + "--" + name + ".log"))
            evidence["name"] = name
            row["steps"].append(evidence)
            print("  " + name + ": " + str(evidence["exit_code"]), flush=True)
            if evidence["exit_code"] != 0:
                break
        row["status"] = "passed" if len(row["steps"]) == len(steps) and all(
            x["exit_code"] == 0 for x in row["steps"]) else "failed"
        row["inputs_changed_during_verification"] = [
            name for name, expected in row["inputs_sha256"].items()
            if not (folder / name).is_file() or digest(folder / name) != expected]
        if row["inputs_changed_during_verification"]:
            row["status"] = "failed"
            print("  inputs changed during verification; rerun after edits stop", flush=True)
        if not options.check_only and binary.exists():
            row["binary_sha256"] = digest(binary)
        (report_dir / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    result["passed"] = sum(x["status"] == "passed" for x in result["projects"])
    result["failed"] = len(selected) - result["passed"]
    result["mode"] = "check-only" if options.check_only else "check-build-smoke"
    (report_dir / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"{result['passed']}/{len(selected)} passed. Evidence: {report_dir / 'results.json'}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
