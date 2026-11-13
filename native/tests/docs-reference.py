"""Optional offline documentation checks; not a native build dependency.

Checks current guides/navigation, local Markdown targets and heading anchors,
and the public library catalog against the authoritative native manifest.
Historical release/report data is not rewritten. External URLs are not fetched.
The SDK mode audits the installed documentation layout independently of sources.
"""
import argparse
import html
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


def prose(source):
    """Remove fenced code while preserving line positions for diagnostics."""
    result, fence = [], None
    for line in source.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
            result.append("")
        elif marker:
            fence = marker[1]
            result.append("")
        else:
            result.append(line)
    return "\n".join(result)


def targets(source):
    """Yield inline links/images and reference definitions outside code."""
    source = prose(source)
    # Removing an inline-code label still leaves [](...), which is a valid
    # target to check. Literal Markdown examples inside code are excluded.
    source = re.sub(r"(`+)(.*?)\1", lambda m: " " * len(m[0]), source)
    for match in re.finditer(r"\[[^\]\n]*\]\(", source):
        at, start, depth = match.end(), match.end(), 1
        if at < len(source) and source[at] == "<":
            end = source.find(">", at + 1)
            if end != -1:
                yield source[at + 1:end], source.count("\n", 0, start) + 1
            continue
        while at < len(source):
            char = source[at]
            if char == "\\" and at + 1 < len(source):
                at += 2
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    break
            elif char.isspace() and depth == 1:
                break  # An optional quoted link title follows the target.
            at += 1
        if at > start:
            yield source[start:at], source.count("\n", 0, start) + 1
    for match in re.finditer(r"^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>]+)>|(\S+))", source, re.M):
        yield match[1] or match[2], source.count("\n", 0, match.start()) + 1


def anchors(source):
    source = prose(source)
    found = set(re.findall(r"\b(?:id|name)=[\"']([^\"']+)[\"']", source))
    seen = {}
    lines = source.splitlines()
    for index, line in enumerate(lines):
        match = re.match(r"^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$", line)
        heading = match[1] if match else None
        if heading is None and index and re.fullmatch(r" {0,3}(?:=+|-+)\s*", line) and lines[index - 1].strip():
            heading = lines[index - 1].strip()
        if heading is None:
            continue
        heading = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", heading)
        heading = html.unescape(re.sub(r"<[^>]+>", "", heading)).lower()
        slug = "".join(char for char in heading if char.isalnum() or char in "_- " or char == "\t")
        slug = slug.replace(" ", "-").replace("\t", "-")
        count = seen.get(slug, 0)
        seen[slug] = count + 1
        found.add(slug if count == 0 else f"{slug}-{count}")
    return found


def current_guides(root):
    files = [root / name for name in ("README.md", "CONTRIBUTING.md", "CHANGELOG.md")]
    files.extend(sorted((root / "docs").glob("*.md")))
    files.extend(sorted((root / "docs/tasks").glob("*.md")))
    files.extend(sorted((root / "docs/maintenance").rglob("*.md")))
    files.extend(root / name for name in ("docs/history/README.md", "docs/releases/README.md"))
    return list(dict.fromkeys(files))


def check_links(files, issues, label):
    checked, cache = 0, {}
    for file in files:
        if not file.is_file():
            issues.append(f"{label}: missing guide {file}")
            continue
        for raw, line in targets(file.read_text(encoding="utf-8")):
            raw = re.sub(r"\\([\\()\[\] <>])", r"\1", html.unescape(raw))
            url = urlsplit(raw)
            if url.scheme or url.netloc:
                continue
            target = (file.parent / unquote(url.path)).resolve() if url.path else file.resolve()
            checked += 1
            if not target.exists():
                issues.append(f"{label}: {file}:{line}: missing local target {raw}")
            elif url.fragment and target.is_file() and target.suffix.lower() == ".md":
                if target not in cache:
                    cache[target] = anchors(target.read_text(encoding="utf-8"))
                if unquote(url.fragment) not in cache[target]:
                    issues.append(f"{label}: {file}:{line}: missing heading anchor {raw}")
    return checked


def check_catalog(manifest_path, catalog_path, issues, label):
    for required in (manifest_path, catalog_path):
        if not required.is_file():
            issues.append(f"{label}: missing catalog input {required}")
    if not manifest_path.is_file() or not catalog_path.is_file():
        return 0
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as error:
        issues.append(f"{label}: cannot read manifest {manifest_path}: {error}")
        return 0
    expected = {name: set(info["members"]) for name, info in manifest["libraries"].items()}
    if manifest.get("publicNativeModules") != len(expected):
        issues.append(f"{label}: publicNativeModules differs from manifest library count")
    actual, inside = {}, False
    for line in prose(catalog_path.read_text(encoding="utf-8")).splitlines():
        if not line.strip().startswith("|"):
            if inside and actual:
                break
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells[0].lower() == "module":
            inside = True
            continue
        if not inside or len(cells) < 2 or re.fullmatch(r"[-: ]+", cells[0]):
            continue
        names = re.findall(r"`([^`]+)`", cells[0])
        if len(names) != 1:
            issues.append(f"{label}: catalog module must have one explicit name: {cells[0]}")
            continue
        name = names[0]
        if name in actual:
            issues.append(f"{label}: duplicate module catalog row {name}")
        actual[name] = set(re.findall(r"`([^`]+)`", cells[1]))
    for name in sorted(expected.keys() | actual.keys()):
        if name not in expected:
            issues.append(f"{label}: catalog module absent from manifest: {name}")
        elif name not in actual:
            issues.append(f"{label}: module missing from catalog: {name}")
        elif actual[name] != expected[name]:
            missing = sorted(expected[name] - actual[name])
            extra = sorted(actual[name] - expected[name])
            issues.append(f"{label}: {name} catalog differs; missing={missing}, extra={extra}")
    return len(expected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--sdk", type=Path, help="Also check an extracted/staged SDK")
    parser.add_argument("--sdk-only", action="store_true", help="Skip source-checkout checks; requires --sdk")
    parser.add_argument("--json-output", type=Path, help="Write the full result, including every issue")
    args = parser.parse_args()
    if args.sdk_only and args.sdk is None:
        parser.error("--sdk-only requires --sdk")
    issues, results = [], {}
    if not args.sdk_only:
        root = args.root.resolve()
        files = current_guides(root)
        results["repository"] = {"guides": len(files), "localLinks": check_links(files, issues, "repository"),
            "modules": check_catalog(root / "native/manifest.json", root / "docs/standard-library.md", issues, "repository")}
    if args.sdk:
        sdk = args.sdk.resolve()
        files = sorted((sdk / "docs").rglob("*.md"))
        if not files:
            issues.append(f"SDK: no Markdown guides under {sdk / 'docs'}")
        files.extend(sdk / name for name in ("README.md", "CONTRIBUTING.md", "CHANGELOG.md") if (sdk / name).is_file())
        results["sdk"] = {"guides": len(files), "localLinks": check_links(files, issues, "SDK"),
            "modules": check_catalog(sdk / "manifest.json", sdk / "docs/standard-library.md", issues, "SDK")}
    result = {"passed": not issues, "scope": "Offline local targets, Markdown heading anchors and manifest/catalog equality; external URLs and runtime examples are not executed.", "results": results, "issues": issues}
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "results": results, "issueCount": len(issues)}))
    for issue in issues[:20]:
        print(issue, file=sys.stderr)
    if len(issues) > 20:
        print(f"... {len(issues) - 20} further issues; use --json-output for the full list", file=sys.stderr)
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
