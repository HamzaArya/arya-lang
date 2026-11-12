"""Optional isolated VS Code host gate, using the SDK bundled in the VSIX."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
package = Path(sys.argv[1] if len(sys.argv) > 1 else root / ".build/independent/share/editor/arya-language.vsix").resolve()
application = Path(os.environ.get("ARYA_EDITOR_HOST", "/Applications/Visual Studio Code.app/Contents/MacOS/Code"))
if not application.is_file(): raise SystemExit("Set ARYA_EDITOR_HOST to the editor executable for this optional host gate.")
folder = Path(tempfile.mkdtemp(prefix="native-editor-bundled-", dir=root / ".build"))
workspace = folder / "workspace"; workspace.mkdir()
profile = folder / "profile"; (profile / "User").mkdir(parents=True)
extensions = folder / "extensions"; extensions.mkdir()
(profile / "User/settings.json").write_text(json.dumps({"workbench.startupEditor": "none",
    "security.workspace.trust.enabled": False, "extensions.autoUpdate": False, "update.mode": "none"}))
environment = dict(os.environ, ARYA_NATIVE_EDITOR_WORKSPACE=str(workspace),
                   ARYA_NATIVE_EDITOR_REPORT=str(folder / "report.json"))
for key in ["ELECTRON_RUN_AS_NODE", "VSCODE_IPC_HOOK_CLI"]: environment.pop(key, None)
launcher = Path(os.environ.get("ARYA_EDITOR_CLI", str(application.parent.parent / "Resources/app/bin/code")))
assert launcher.is_file(), "Set ARYA_EDITOR_CLI to the matching editor launcher for isolated VSIX installation."
installed = subprocess.run([str(launcher), "--user-data-dir", str(profile), "--extensions-dir", str(extensions),
    "--install-extension", str(package), "--force"], env=environment, capture_output=True, text=True, timeout=90)
(folder / "install.log").write_text(installed.stdout + installed.stderr)
assert installed.returncode == 0, f"VSIX installation failed; see {folder}"
extension = next(path for path in extensions.iterdir() if path.name.startswith("aryacode.arya-language-"))
native_version = subprocess.run([str(extension / "native/arya"), "--version"], capture_output=True, text=True,
                                env={"PATH": "/nonexistent"}, timeout=10)
assert native_version.returncode == 0 and native_version.stdout.startswith("Arya native "), native_version
command = [str(application), "--user-data-dir", str(profile), "--extensions-dir", str(extensions),
    "--extensionDevelopmentPath=" + str(extension), "--extensionTestsPath=" + str(root / "native/tests/editor-host.cjs"),
    "--skip-welcome", "--disable-workspace-trust", "--skip-release-notes", "--disable-updates", "--disable-gpu", str(workspace)]
result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=150)
(folder / "output.log").write_text(result.stdout + result.stderr)
assert result.returncode == 0, f"Bundled editor gate failed; see {folder}"
report = json.loads((folder / "report.json").read_text())
assert report["passed"], report
report.update({"bundledNativeSDK": True, "isolatedVSIXInstallation": True, "compilerOverrideConfigured": False, "evidence": str(folder)})
(root / ".build/native-editor-bundled-location.txt").write_text(str(folder) + "\n")
print(json.dumps(report))
