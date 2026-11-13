"""Optional HTTP integration controller using only Python's standard library.

The server is the real native auth example and runs with no interpreter on PATH.
Fixed credentials are public test material. No biometric prompt or vault write.
"""
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import tempfile
import time


def main():
    root = Path(__file__).resolve().parents[2]
    compiler = Path(os.environ.get("ARYA_NATIVE_BIN", str(root / ".build/independent/arya")))
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    legacy_hash = "arya$scrypt$v1$16384$8$1$AAECAwQFBgcICQoLDA0ODw$-UcR7RnegX8rtewN6TGWEZa867uDMOMk_cEDdQ5p72w"
    with tempfile.TemporaryDirectory(prefix="auth-http-", dir=root / ".build") as directory:
        binary = Path(directory) / "server"
        built = subprocess.run([str(compiler), "build", str(root / "native/examples/auth-service.arya"), "-o", str(binary), "--release"], text=True, capture_output=True)
        if built.returncode:
            raise RuntimeError(built.stdout + built.stderr)
        server = subprocess.Popen([str(binary)], env={"PATH": "/nonexistent", "PORT": "0", "AUTH_ACCOUNT": "admin", "AUTH_PASSWORD_HASH": legacy_hash, "AUTH_TOTP_SECRET": secret}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            assert select.select([server.stdout], [], [], 10)[0], "Server did not report its port"
            line = server.stdout.readline()
            assert line.startswith("Native auth API: "), line
            port = int(line.rsplit(" ", 1)[1])

            def request(method, path, body=None, token=None):
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                headers = {}
                if body is not None:
                    headers["Content-Type"] = "application/json"
                    body = json.dumps(body)
                if token is not None:
                    headers["Authorization"] = "Bearer " + token
                try:
                    connection.request(method, path, body, headers)
                    response = connection.getresponse()
                    return response.status, dict(response.getheaders()), json.loads(response.read())
                finally:
                    connection.close()

            assert request("GET", "/me")[0] == 401
            payload = {"account": "admin", "password": "wrong", "code": "000000"}
            assert request("POST", "/login", payload)[0] == 401
            counter = int(time.time()) // 30
            digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
            offset = digest[-1] & 15
            code = str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6)
            payload.update(password="migration example", code=code)
            status, headers, issued = request("POST", "/login", payload)
            assert status == 200 and headers["cache-control"] == "no-store", (status, issued)
            assert issued["session"]["methods"] == ["password", "totp"]
            assert request("POST", "/login", payload)[0] == 401, "TOTP replay succeeded"
            token = issued["token"]
            status, _, session = request("GET", "/me", token=token)
            assert status == 200 and session["subject"] == "admin", (status, session)
            status, _, rotated = request("POST", "/rotate", token=token)
            assert status == 200 and rotated["token"] != token
            assert rotated["session"]["expiresAt"] == issued["session"]["expiresAt"]
            assert request("GET", "/me", token=token)[0] == 401
            replacement = rotated["token"]
            assert request("GET", "/me", token=replacement)[0] == 200
            assert request("POST", "/logout", token=replacement)[0] == 200
            assert request("GET", "/me", token=replacement)[0] == 401
            for _ in range(2):
                assert request("POST", "/login", payload)[0] == 401
            assert request("POST", "/login", payload)[0] == 429
            print("auth HTTP: password + TOTP, replay denial, bearer verification, rotation, logout and throttling passed")
        finally:
            server.terminate()
            try:
                _, error = server.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                _, error = server.communicate()
            if error:
                raise RuntimeError(error)


if __name__ == "__main__":
    main()
