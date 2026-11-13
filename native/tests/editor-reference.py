"""Optional isolated VS Code host gate for a bundled or portable native VSIX."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
arguments = argparse.ArgumentParser(description=__doc__)
arguments.add_argument("package", nargs="?", default=root / ".build/independent/share/editor/arya-language.vsix", type=Path)
arguments.add_argument("--portable-bin", type=Path, help="Directory containing an installed arya command for a portable VSIX")
options = arguments.parse_args()
package = options.package.resolve()
mode = "portable" if options.portable_bin else "bundled"

def captured(command, log, **options):
    try:
        result = subprocess.run(command, capture_output=True, text=True, **options)
    except subprocess.TimeoutExpired as error:
        decode = lambda value: value.decode(errors="replace") if isinstance(value, bytes) else value or ""
        log.write_text(decode(error.stdout) + decode(error.stderr) + f"\nTimed out after {error.timeout} seconds.\n")
        raise RuntimeError(f"Editor process timed out; see {log}") from error
    log.write_text(result.stdout + result.stderr)
    return result

application = Path(os.environ.get("ARYA_EDITOR_HOST", "/Applications/Visual Studio Code.app/Contents/MacOS/Code"))
if not application.is_file(): raise SystemExit("Set ARYA_EDITOR_HOST to the editor executable for this optional host gate.")
# VS Code's Unix-domain IPC socket has a short absolute-path limit on macOS.
# Retain evidence under .build while keeping the isolated profile path compact.
folder = Path(tempfile.mkdtemp(prefix=f"editor-{mode[0]}-", dir=root / ".build"))
workspace = folder / "workspace"; workspace.mkdir()
profile = folder / "profile"; (profile / "User").mkdir(parents=True)
extensions = folder / "extensions"; extensions.mkdir()
(profile / "User/settings.json").write_text(json.dumps({"workbench.startupEditor": "none",
    "security.workspace.trust.enabled": False, "extensions.autoUpdate": False, "update.mode": "none"}))
environment = dict(os.environ, ARYA_NATIVE_EDITOR_WORKSPACE=str(workspace),
                   ARYA_NATIVE_EDITOR_REPORT=str(folder / "report.json"), ARYA_NATIVE_EDITOR_MODE=mode)
if options.portable_bin:
    environment["PATH"] = str(options.portable_bin.resolve()) + os.pathsep + environment.get("PATH", "")
    environment["ARYA_NATIVE_EDITOR_BIN"] = str(options.portable_bin.resolve())
    # The real `code` CLI sets this flag. Without it, a direct macOS app launch
    # replaces PATH with the user's login-shell environment, outside this test's
    # isolated installation. Exercise the documented command-line launch route.
    environment["VSCODE_CLI"] = "1"
for key in ["ELECTRON_RUN_AS_NODE", "VSCODE_IPC_HOOK_CLI"]: environment.pop(key, None)
launcher = Path(os.environ.get("ARYA_EDITOR_CLI", str(application.parent.parent / "Resources/app/bin/code")))
assert launcher.is_file(), "Set ARYA_EDITOR_CLI to the matching editor launcher for isolated VSIX installation."
installed = captured([str(launcher), "--user-data-dir", str(profile), "--extensions-dir", str(extensions),
    "--install-extension", str(package), "--force"], folder / "install.log", env=environment, timeout=90)
assert installed.returncode == 0, f"VSIX installation failed; see {folder}"
extension = next(path for path in extensions.iterdir() if path.name.startswith("aryacode.arya-language-"))
if options.portable_bin:
    assert not (extension / "native").exists(), "Portable package unexpectedly contains a bundled SDK"
    compiler = options.portable_bin.resolve() / "arya"
else:
    compiler = extension / "native/arya"
native_version = subprocess.run([str(compiler), "--version"], capture_output=True, text=True,
                                env={"PATH": "/nonexistent"}, timeout=10)
assert native_version.returncode == 0 and native_version.stdout.startswith("Arya native "), native_version
command = [str(application), "--user-data-dir", str(profile), "--extensions-dir", str(extensions),
    "--extensionDevelopmentPath=" + str(extension), "--extensionTestsPath=" + str(root / "native/tests/editor-host.cjs"),
    "--skip-welcome", "--disable-workspace-trust", "--skip-release-notes", "--disable-updates", "--disable-gpu", str(workspace)]
result = captured(command, folder / "output.log", env=environment, timeout=150)
assert result.returncode == 0, f"{mode.capitalize()} editor gate failed; see {folder}"
report = json.loads((folder / "report.json").read_text())
assert report["passed"], report
report.update({"bundledNativeSDK": mode == "bundled", "portableInstalledSDK": mode == "portable",
    "launchEnvironment": "CLI with installed SDK on PATH" if mode == "portable" else "direct editor executable",
    "isolatedVSIXInstallation": True, "compilerOverrideConfigured": False,
    "compilerVersion": native_version.stdout.strip(), "compilerSHA256": hashlib.sha256(compiler.read_bytes()).hexdigest(),
    "packageSHA256": hashlib.sha256(package.read_bytes()).hexdigest(), "evidence": str(folder)})
(folder / "report.json").write_text(json.dumps(report, indent=2) + "\n")
(root / f".build/native-editor-{mode}-location.txt").write_text(str(folder) + "\n")
print(json.dumps(report))
