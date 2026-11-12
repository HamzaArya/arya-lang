#!/usr/bin/env python3
"""Socket acceptance oracle only; Python is not used by the compiler or server."""
import http.client
import json
import os
import pathlib
import selectors
import socket
import subprocess
import sys

binary = pathlib.Path(sys.argv[1]).resolve()
log = open(str(binary) + ".acceptance.log", "w+")
server = subprocess.Popen([str(binary)], stdout=subprocess.PIPE, stderr=log, text=True,
    env={"PATH": "/nonexistent", "ARYA_GC_STRESS": "1", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1"})
selector = selectors.DefaultSelector()
selector.register(server.stdout, selectors.EVENT_READ)
try:
    assert selector.select(10), "server did not start"
    port = int(server.stdout.readline())
    def request(method, target, body=None, headers=None):
        client = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        client.request(method, target, body, headers or {})
        response = client.getresponse()
        value = response.read()
        result = response.status, {key.lower(): value for key, value in response.getheaders()}, value
        client.close()
        return result
    status, headers, body = request("GET", "/health")
    assert status == 200 and json.loads(body) == {"status": "ready", "checks": {"database": "ok"}}
    assert headers["x-content-type-options"] == "nosniff" and len(headers["x-request-id"]) == 36
    status, _, body = request("POST", "/invoice/Inv%20One?x=first&x=last", '{"total":"123.45"}',
        {"Content-Type": "application/json", "X-Request-ID": "acceptance-1"})
    assert status == 200 and json.loads(body) == {"id": "Inv One", "total": "123.45", "query": {"x": "last"}, "requestId": "acceptance-1"}
    status, _, body = request("POST", "/invoice/1", '{"total":123.45}', {"Content-Type": "application/json"})
    assert status == 400 and json.loads(body)["code"] == "ARYA_VALIDATION"
    assert json.loads(body)["issues"][0]["path"] == ["body", "total"]
    assert request("POST", "/invoice/1", "{", {"Content-Type": "application/json"})[0] == 400
    assert request("POST", "/invoice/1", "x" * 1025)[0] == 413
    assert request("POST", "/invoice/a%2fb", "{}")[0] == 400
    assert request("GET", "/missing")[0] == 404
    assert request("GET", "/failure")[2] == b'{"error":"Internal server error"}'
    assert json.loads(request("GET", "/shutdown-context")[2])["code"] == "ARYA_SHUTDOWN_CONTEXT"
    status, _, body = request("GET", "/slow")
    assert status == 504 and json.loads(body)["code"] == "ARYA_HTTP_TIMEOUT"
    status, headers, body = request("HEAD", "/hello")
    assert status == 200 and body == b"" and int(headers["content-length"]) == len("Hello native HTTP")
    # Strict framing prevents duplicate length and TE/CL request smuggling.
    def raw(payload):
        with socket.create_connection(("127.0.0.1", port), timeout=5) as client:
            client.sendall(payload)
            return client.recv(65536)
    for payload in [
        b"POST /invoice/1 HTTP/1.1\r\nHost: local\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{}x",
        b"POST /invoice/1 HTTP/1.1\r\nHost: local\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
        b"GET /hello HTTP/1.1\r\nHost: one\r\nHost: two\r\n\r\n",
    ]:
        assert raw(payload).startswith(b"HTTP/1.1 400"), payload
    assert raw(b"GET /hello HTTP/1.1\r\nHost: local\r\nX-Long: " + b"a" * 32768 + b"\r\n\r\n").startswith(b"HTTP/1.1 431")
    # Both requests arrive in one TCP read; leftovers must not be lost.
    with socket.create_connection(("127.0.0.1", port), timeout=5) as client:
        client.sendall(b"GET /hello HTTP/1.1\r\nHost: local\r\n\r\nGET /hello HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n")
        chunks = []
        while True:
            chunk = client.recv(65536)
            if not chunk: break
            chunks.append(chunk)
        assert b"".join(chunks).count(b"HTTP/1.1 200 OK") == 2
    client = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    client.request("POST", "/invoice/chunked", iter([b'{"total":', b'"9.00"}']), {"Content-Type": "application/json"}, encode_chunked=True)
    response = client.getresponse()
    assert response.status == 200 and json.loads(response.read())["total"] == "9.00"
    client.close()
    assert request("POST", "/stop")[0] == 200
    assert server.wait(timeout=10) == 0
    assert "cleaned" in server.stdout.read()
    log.seek(0)
    diagnostic = log.read()
    assert "ERROR: AddressSanitizer" not in diagnostic and "runtime error:" not in diagnostic, diagnostic
    print("native HTTP: routing, validation, health, deadlines, strict framing, chunked bodies, pipelining and graceful shutdown passed")
finally:
    selector.close()
    if server.poll() is None:
        server.terminate()
        try: server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
    log.close()
