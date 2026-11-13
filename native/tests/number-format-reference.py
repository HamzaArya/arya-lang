"""Independent seeded binary64 fixed-format oracle using Python integer ratios.
Python is optional test machinery; the generated application is native.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import struct
import subprocess
import tempfile


def expected(value, places):
    numerator, denominator = abs(value).as_integer_ratio()
    units, remainder = divmod(numerator * 10**places, denominator)
    if remainder * 2 >= denominator:
        units += 1
    text = str(units).zfill(places + 1)
    if places:
        text = text[:-places] + "." + text[-places:]
    return ("-" if value < 0 else "") + text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    compiler = Path(os.environ.get("ARYA_NATIVE_BIN", root / ".build/independent/arya")).resolve()
    rng = random.Random(0x41525941)
    values = [0., -0., 5e-324, -5e-324, 1.005, -1.005, 2.55, -2.55, 2.5, -2.5, 0.1, -0.1, 1e20, -1e20, math.nextafter(1e21, 0), 1000000000000000128., 2**-18, math.nextafter(0.5, 0), math.nextafter(0.5, 1)]
    cases = [(x, p) for x in values for p in [0, 1, 2, 6, 17, 18, 19, 50, 100]]
    for _ in range(2000):
        value = struct.unpack("d", struct.pack("Q", rng.getrandbits(64)))[0]
        if math.isfinite(value) and abs(value) < 1e21:
            cases.append((value, rng.choice([0, 1, 2, 6, 17, 18, 19, 50, 100])))
    # Uniform random bit patterns heavily favor values rounding to zero. Add
    # ordinary nonzero amounts and the widest accepted fixed coefficients.
    for _ in range(1000):
        value = rng.randrange(-(10**18), 10**18) / 10**rng.randrange(19)
        cases.append((value, rng.randrange(19)))
    for exponent in [-1074, -1022, -128, -127, -100, -64, -53, -1, 0, 52, 53, 63, 64, 69]:
        value = math.ldexp(1., exponent)
        for neighbor in [math.nextafter(value, 0), value, math.nextafter(value, math.inf)]:
            for places in [0, 2, 17, 18, 19, 100]:
                cases.append((neighbor, places))
                cases.append((-neighbor, places))
    # Every precision and both sides of binary rounding boundaries.
    for places in range(101):
        for value in [0.5, math.nextafter(0.5, 0), math.nextafter(0.5, 1)]:
            cases.append((value, places))
            cases.append((-value, places))
    with tempfile.TemporaryDirectory(prefix="number-format-reference-", dir=root / ".build") as directory:
        work = Path(directory)
        source = work / "main.arya"
        source.write_text('use std "io" as io\nwhile true {\n const line = io.readLine()\n if line == null { break }\n const row = JSON.parse(line)\n print(number(row[0]).toFixed(row[1]))\n}\n')
        binary = work / "program"
        flags = ["--debug", "--sanitize"] if args.sanitize else ["--release"]
        subprocess.run([str(compiler), "build", str(source), "-o", str(binary), *flags], check=True, capture_output=True, text=True)
        data = "".join(json.dumps([repr(x), places]) + "\n" for x, places in cases)
        env = dict(os.environ, ARYA_GC_STRESS="1", ASAN_OPTIONS="detect_leaks=0", UBSAN_OPTIONS="halt_on_error=1")
        output = subprocess.run([str(binary)], input=data, capture_output=True, text=True, env=env, check=True, timeout=120).stdout.splitlines()
        assert len(output) == len(cases), (len(output), len(cases))
        for (value, places), actual in zip(cases, output):
            assert actual == expected(value, places), (value, places, actual, expected(value, places))
        print(json.dumps({"cases": len(cases), "sanitized": args.sanitize, "seed": "0x41525941", "compilerSha256": hashlib.sha256(compiler.read_bytes()).hexdigest(), "inputSha256": hashlib.sha256(data.encode()).hexdigest(), "passed": True}))


if __name__ == "__main__":
    main()
