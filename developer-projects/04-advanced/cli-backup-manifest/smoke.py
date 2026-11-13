#!/usr/bin/env python3
import hashlib, json, pathlib, subprocess, sys, tempfile
exe=str(pathlib.Path(sys.argv[1]).resolve())
def run(*args,code=0):
 result=subprocess.run([exe,*map(str,args)],capture_output=True,text=True,timeout=10)
 assert result.returncode==code,(result.returncode,result.stdout,result.stderr)
 return result

with tempfile.TemporaryDirectory() as root:
 root=pathlib.Path(root);tree=root/"tree";tree.mkdir();(tree/"nested").mkdir()
 (tree/"a.txt").write_text("hello\n");(tree/"nested/b.txt").write_text("سلام\n")
 manifest=root/"manifest.json";sentinel=root/"sentinel";sentinel.write_text("untouched")
 (root/"manifest.json.tmp").symlink_to(sentinel)
 run("create",tree,manifest)
 assert sentinel.read_text()=="untouched" and not list(root.glob("*.arya-*"))
 assert json.loads(run("verify",tree,manifest).stdout)["ok"]
 run("create",tree,manifest,code=1)
 (tree/"a.txt").write_text("changed\n");(tree/"nested/b.txt").unlink();(tree/"new.txt").write_text("new")
 difference=json.loads(run("verify",tree,manifest,code=2).stdout)
 assert difference["changed"]==["a.txt"] and difference["removed"]==["nested/b.txt"] and difference["added"]==["new.txt"]
 (tree/"link").symlink_to(root/"manifest.json");run("create",tree,root/"bad.json",code=1);(tree/"link").unlink()
 run("create",tree,tree/"inside.json",code=1)
 payload = bytes(range(256)) + b"abc\x00def\xff\xfe"
 (tree/"binary").write_bytes(payload);run("create",tree,root/"binary.json")
 saved=json.loads((root/"binary.json").read_text())
 entry=next(item for item in saved["files"] if item["path"]=="binary")
 assert entry["bytes"]==len(payload) and entry["sha256"]==hashlib.sha256(payload).hexdigest()
 assert json.loads(run("verify",tree,root/"binary.json").stdout)["ok"]
 (tree/"binary").write_bytes(payload[:-1]+b"X")
 assert json.loads(run("verify",tree,root/"binary.json",code=2).stdout)["changed"]==["binary"]
 (tree/"binary").unlink();manifest.write_text("{broken");run("verify",tree,manifest,code=1)
 assert "TextVault" in run("--help").stdout
print("PASS: nested Unicode text, SHA-256 create/verify, change/add/remove, overwrite refusal, symlink refusal, inside-tree output, binary byte oracle and corruption detection, malformed manifest")
