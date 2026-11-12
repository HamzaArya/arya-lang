#!/usr/bin/env python3
"""Optional live C-client qualification against a new, private socket-only DB."""
import os
import pathlib
import subprocess
import sys
import tempfile
import time

binary = pathlib.Path(sys.argv[1]).resolve()
prefix = pathlib.Path(os.environ.get("ARYA_MYSQL_PREFIX", "/usr/local/mysql"))
mysqld = prefix / "bin/mysqld"
if not mysqld.is_file():
    raise SystemExit("Set ARYA_MYSQL_PREFIX to a MySQL installation to run this optional integration gate.")
with tempfile.TemporaryDirectory(prefix="arya-native-mysql-") as temporary:
    root = pathlib.Path(temporary)
    data = root / "data"
    socket = root / "mysql.sock"
    output_path = pathlib.Path(str(binary) + ".database.log")
    with output_path.open("w") as log:
        subprocess.run([str(mysqld), "--no-defaults", "--initialize-insecure", "--basedir=" + str(prefix),
            "--datadir=" + str(data)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, check=True, timeout=60)
        server = subprocess.Popen([str(mysqld), "--no-defaults", "--basedir=" + str(prefix), "--datadir=" + str(data),
            "--skip-networking", "--mysqlx=OFF", "--skip-log-bin", "--socket=" + str(socket),
            "--pid-file=" + str(root / "server.pid"), "--secure-file-priv=" + str(root)],
            stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 30
            while not socket.exists():
                if server.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("private database did not start; see " + str(output_path))
                time.sleep(0.05)
            subprocess.run([str(binary), str(socket)], check=True, timeout=40,
                env={"PATH": "/nonexistent", "ASAN_OPTIONS": "detect_leaks=0", "UBSAN_OPTIONS": "halt_on_error=1", "ARYA_GC_STRESS": "1"})
        finally:
            if server.poll() is None:
                server.terminate()
                try: server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
