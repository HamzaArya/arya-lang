#!/usr/bin/env python3
"""Exercise the native stdio server without Node, npm, or a C compiler in PATH."""
import json
import os
import pathlib
import select
import subprocess
import sys
import tempfile
import time

binary = pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix="arya-native-lsp-") as temporary:
    root = pathlib.Path(temporary)
    main = root / "main.arya"
    library = root / "lib.arya"
    source = 'use arya "./lib.arya" as lib\nfn local(n: number): number => n + 2\nconst value: number = lib.total(2)\nconst unused = 1\nprint(local(value))\n'
    library_source = 'export fn total(n: number): number => n + 1\n'
    main.write_text(source)
    library.write_text(library_source)
    error_file = root / "stderr.log"
    with error_file.open("wb") as errors:
        server = subprocess.Popen([str(binary), "lsp", "--stdio"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=errors, env={"PATH": "/nonexistent", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"})
        buffer = bytearray()
        notifications = []
        sequence = 0

        def send(method, params=None, identifier=None):
            message = {"jsonrpc": "2.0", "method": method, "params": params or {}}
            if identifier is not None:
                message["id"] = identifier
            payload = json.dumps(message, ensure_ascii=False).encode()
            server.stdin.write(b"Content-Length: " + str(len(payload)).encode() + b"\r\n\r\n" + payload)
            server.stdin.flush()

        def receive():
            deadline = time.monotonic() + 30
            while True:
                separator = buffer.find(b"\r\n\r\n")
                if separator >= 0:
                    length = int(buffer[:separator].decode().split(":", 1)[1].strip())
                    if len(buffer) >= separator + 4 + length:
                        payload = bytes(buffer[separator + 4:separator + 4 + length])
                        del buffer[:separator + 4 + length]
                        return json.loads(payload)
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([server.stdout], [], [], remaining)[0]:
                    raise AssertionError("native LSP response timed out: " + error_file.read_text())
                chunk = os.read(server.stdout.fileno(), 65536)
                if not chunk:
                    raise AssertionError("native LSP exited: " + error_file.read_text())
                buffer.extend(chunk)

        def request(method, params=None, allow_error=False):
            global sequence
            sequence += 1
            send(method, params, sequence)
            while True:
                response = receive()
                if "method" in response:
                    notifications.append(response)
                    continue
                assert response.get("id") == sequence, response
                if not allow_error:
                    assert "error" not in response, response
                return response if allow_error else response["result"]

        def point(text, needle, extra=0):
            at = text.index(needle) + extra
            previous = text.rfind("\n", 0, at) + 1
            return {"line": text.count("\n", 0, at), "character": len(text[previous:at].encode("utf-16-le")) // 2}

        uri = main.as_uri()
        params = lambda needle, extra=0: {"textDocument": {"uri": uri}, "position": point(source, needle, extra)}
        try:
            initialized = request("initialize", {"rootUri": root.as_uri(), "capabilities": {}})
            assert initialized["serverInfo"]["name"] == "Arya Native Language Server"
            assert initialized["capabilities"]["positionEncoding"] == "utf-16"
            send("initialized")
            send("textDocument/didOpen", {"textDocument": {"uri": uri, "languageId": "arya", "version": 1, "text": source}})
            definition = request("textDocument/definition", params("total(2)"))
            assert definition["uri"] == library.as_uri(), definition
            references = request("textDocument/references", {**params("total(2)"), "context": {"includeDeclaration": True}})
            assert len(references) == 2, references
            hover = request("textDocument/hover", params("total(2)"))
            assert "number" in hover["contents"]["value"], hover
            completion = request("textDocument/completion", params("total(2)", 2))
            assert any(item["label"] == "total" for item in completion), completion
            signature = request("textDocument/signatureHelp", params("total(2)", len("total(")))
            assert "number" in signature["signatures"][0]["label"], signature
            renamed = request("textDocument/rename", {**params("total(2)"), "newName": "sum"})
            assert len(renamed["documentChanges"]) == 2, renamed
            assert all(edit["newText"] == "sum" for change in renamed["documentChanges"] for edit in change["edits"])
            rejected = request("textDocument/rename", {**params("local(n"), "newName": "value"}, allow_error=True)
            assert rejected["error"]["code"] == -32803, rejected
            symbols = request("textDocument/documentSymbol", {"textDocument": {"uri": uri}})
            assert {item["name"] for item in symbols} >= {"lib", "local", "value"}, symbols
            semantic = request("textDocument/semanticTokens/full", {"textDocument": {"uri": uri}})
            assert len(semantic["data"]) >= 25 and len(semantic["data"]) % 5 == 0, semantic
            edits = request("textDocument/formatting", {"textDocument": {"uri": uri}, "options": {"tabSize": 2, "insertSpaces": True}})
            assert edits[0]["newText"] == source, edits
            published = [message["params"] for message in notifications if message["method"] == "textDocument/publishDiagnostics"]
            assert published and any(item["code"] == "ARYA_UNUSED" for item in published[-1]["diagnostics"]), published
            assert not any(item["severity"] == 1 for item in published[-1]["diagnostics"]), published
            quickfixes = request("textDocument/codeAction", {"textDocument": {"uri": uri}, "range": {"start": point(source, "unused"), "end": point(source, "unused", 6)}, "context": {"diagnostics": published[-1]["diagnostics"]}})
            assert quickfixes and quickfixes[0]["kind"] == "quickfix", quickfixes
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 2}, "contentChanges": [{"text": source + "missing()\n"}]})
            request("textDocument/documentSymbol", {"textDocument": {"uri": uri}})
            published = [message["params"] for message in notifications if message["method"] == "textDocument/publishDiagnostics"]
            assert any(item["code"] == "ARYA_NAME" for item in published[-1]["diagnostics"]), published[-1]
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 3}, "contentChanges": [{"text": source}]})
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 2}, "contentChanges": [{"text": "bad()"}]})
            assert request("textDocument/definition", params("total(2)"))["uri"] == library.as_uri()
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 4}, "contentChanges": [{"text": "fn broken() {\nconst x = )\n}\nconst y = )\n"}]})
            request("textDocument/documentSymbol", {"textDocument": {"uri": uri}})
            published = [message["params"] for message in notifications if message["method"] == "textDocument/publishDiagnostics"]
            assert sum(item["code"] == "ARYA_SYNTAX" for item in published[-1]["diagnostics"]) == 2, published[-1]
            # Unsaved documents retain their public URI for navigation and edits.
            untitled = "untitled:Native-Scratch"
            scratch = "const amount: number = 4\nprint(amount)\n"
            send("textDocument/didOpen", {"textDocument": {"uri": untitled, "languageId": "arya", "version": 1, "text": scratch}})
            scratch_params = {"textDocument": {"uri": untitled}, "position": point(scratch, "amount)", 2)}
            assert request("textDocument/definition", scratch_params)["uri"] == untitled
            changes = request("textDocument/rename", {**scratch_params, "newName": "total"})["documentChanges"]
            assert changes[0]["textDocument"] == {"uri": untitled, "version": 1}, changes
            send("textDocument/didClose", {"textDocument": {"uri": untitled}})
            # Completion must use the lexical binding and follow record chains,
            # including the common incomplete trailing-dot editing state.
            chain = "const model = {account: {balance: 1, currency: \"AFN\"}}\nmodel.account.\n"
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 5}, "contentChanges": [{"text": chain}]})
            completed = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": 1, "character": len("model.account.")}})
            assert {"balance", "currency"} <= {item["label"] for item in completed}, completed
            nested = "fn combine(a, b) => a\ncombine([1, 2], {nested: [3, 4]})\n"
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 6}, "contentChanges": [{"text": nested}]})
            signature = request("textDocument/signatureHelp", {"textDocument": {"uri": uri}, "position": point(nested, "{nested")})
            assert signature["activeParameter"] == 1, signature
            # Shorthand refers to a binding while its record key remains stable
            # when that binding is renamed. Computed keys are ordinary reads.
            composition = 'const name = "Arya"\nconst field = "tag"\nconst source = {name, ["tag"]: 1}\nconst dynamic = {[field]: 2}\nconst copied = {...source, active: true}\nprint(JSON.stringify(copied))\n'
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 7}, "contentChanges": [{"text": composition}]})
            shorthand_params = {"textDocument": {"uri": uri}, "position": point(composition, "{name", 1)}
            definition = request("textDocument/definition", shorthand_params)
            assert definition["range"]["start"] == point(composition, "name ="), definition
            renamed = request("textDocument/rename", {**shorthand_params, "newName": "title"})
            edits = renamed["documentChanges"][0]["edits"]
            assert {edit["newText"] for edit in edits} == {"title", "name: title"}, renamed
            assert len(edits) == 2, renamed
            computed_params = {"textDocument": {"uri": uri}, "position": point(composition, "[field]", 1)}
            renamed = request("textDocument/rename", {**computed_params, "newName": "key"})
            edits = renamed["documentChanges"][0]["edits"]
            assert len(edits) == 2 and all(edit["newText"] == "key" for edit in edits), renamed
            composition += "copied.\n"
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 8}, "contentChanges": [{"text": composition}]})
            completed = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": point(composition, "copied.\n", len("copied."))})
            assert {"name", "tag", "active"} <= {item["label"] for item in completed}, completed
            # New standard auth contracts must reach member completion through
            # both the module and its opaque native session-store result.
            auth_source = 'use std "auth" as auth\nconst store = auth.sessions()\nauth.\nstore.\n'
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 9}, "contentChanges": [{"text": auth_source}]})
            completed = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": 2, "character": len("auth.")}})
            assert {"sessions", "verifyTotp", "authenticate", "vault", "pkce"} <= {item["label"] for item in completed}, completed
            completed = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": 3, "character": len("store.")}})
            assert {"issue", "verify", "rotate", "consume", "revoke", "close"} <= {item["label"] for item in completed}, completed
            vault_source = 'use std "auth" as auth\nconst vault = auth.vault({service: "org.arya.types"})\nvault.\n'
            send("textDocument/didChange", {"textDocument": {"uri": uri, "version": 10}, "contentChanges": [{"text": vault_source}]})
            completed = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": 2, "character": len("vault.")}})
            assert {"store", "read", "replace", "remove"} <= {item["label"] for item in completed}, completed
            send("textDocument/didClose", {"textDocument": {"uri": uri}})
            first, second = root / "first", root / "second"
            first.mkdir(); second.mkdir()
            (root / "outside.arya").write_text("export const secret = 1\n")
            boundary = first / "main.arya"
            boundary_source = 'use arya "../outside.arya" as outside\nprint(outside.secret)\n'
            boundary.write_text(boundary_source)
            send("workspace/didChangeWorkspaceFolders", {"event": {"removed": [{"uri": root.as_uri()}],
                "added": [{"uri": first.as_uri()}, {"uri": second.as_uri()}]}})
            send("textDocument/didOpen", {"textDocument": {"uri": boundary.as_uri(), "languageId": "arya", "version": 1, "text": boundary_source}})
            request("textDocument/documentSymbol", {"textDocument": {"uri": boundary.as_uri()}})
            published = [message["params"] for message in notifications if message["method"] == "textDocument/publishDiagnostics"
                         and message["params"]["uri"] == boundary.as_uri()]
            assert published and any("project" in item["message"].lower() and item["severity"] == 1
                                     for item in published[-1]["diagnostics"]), published
            assert request("shutdown") is None
            send("exit")
            server.stdin.close()
            assert server.wait(timeout=10) == 0, error_file.read_text()
            assert not error_file.read_text(), error_file.read_text()
            print("native LSP: transport, diagnostics, navigation, safe/shorthand rename, record spread completion, nested signatures, incomplete member chains, unsaved URIs, workspace boundaries, format, tokens and fixes passed")
        finally:
            if server.poll() is None:
                server.kill()
                server.wait()
