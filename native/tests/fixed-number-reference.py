"""Independent seeded bitwise oracle for Number(binary64.toFixed(precision))."""
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


def rounded(value, places):
    if not math.isfinite(value) or abs(value) >= 1e21:
        return value
    numerator, denominator = abs(value).as_integer_ratio()
    coefficient, remainder = divmod(numerator * 10**places, denominator)
    if remainder * 2 >= denominator:
        coefficient += 1
    digits = str(coefficient).zfill(places + 1)
    text = digits[:-places] + "." + digits[-places:] if places else digits
    return float(("-" if value < 0 else "") + text)


def spelling(value):
    return "NaN" if math.isnan(value) else "Infinity" if value == math.inf else "-Infinity" if value == -math.inf else repr(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    compiler = Path(os.environ.get("ARYA_NATIVE_BIN", root / ".build/independent/arya")).resolve()
    rng = random.Random(0x4649584E)
    edge = [0., -0., 5e-324, -5e-324, 1.005, -1.005, 2.675, -2.675, 0.125, -0.004, 1e20, math.nextafter(1e21, 0), 1e21, -1e21, math.inf, -math.inf, math.nan]
    cases = [(value, places) for value in edge for places in range(101)]
    for places in range(19):
        # Exact-to-double coefficient guard and uint64 boundaries, plus both
        # neighbors of binary half ties. Expected values use integer ratios.
        for center in [0.5, 2**53 / 10**places, 2**64 / 10**places]:
            for value in [math.nextafter(center, 0), center, math.nextafter(center, math.inf)]:
                cases.extend([(value, places), (-value, places)])
    for _ in range(4000):
        value = struct.unpack("d", struct.pack("Q", rng.getrandbits(64)))[0]
        cases.append((value, rng.randrange(101)))
    for _ in range(2000):
        value = rng.randrange(-(10**18), 10**18) / 10**rng.randrange(19)
        cases.append((value, rng.randrange(19)))
    data = "".join(json.dumps([spelling(x), p, spelling(rounded(x, p))]) + "\n" for x, p in cases)
    with tempfile.TemporaryDirectory(prefix="fixed-number-reference-", dir=root / ".build") as directory:
        work = Path(directory)
        source = work / "main.arya"
        source.write_text('use std "io" as io\nlet checks = 0\nwhile true {\n const line = io.readLine()\n if line == null { break }\n const row = JSON.parse(line)\n const value = number(row[0])\n const expected = number(row[2])\n const actual = Number(value.toFixed(row[1]))\n if not Object.is(actual, expected) { print(row, actual, expected); throw new Error("Independent fixed-number oracle mismatch") }\n checks += 1\n}\nprint(checks)\n')
        binaries = {}
        for variant in ["optimized", "reference"]:
            binary = work / variant
            flags = ["--debug", "--sanitize"] if args.sanitize else ["--release"]
            if variant == "reference":
                flags.append("--no-data-opt")
            result = subprocess.run([str(compiler), "build", str(source), "-o", str(binary), *flags], capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stdout + result.stderr)
            env = dict(os.environ, PATH="/nonexistent", ARYA_GC_STRESS="1", ASAN_OPTIONS="detect_leaks=0", UBSAN_OPTIONS="halt_on_error=1")
            result = subprocess.run([str(binary)], input=data, capture_output=True, text=True, env=env, timeout=120)
            assert result.returncode == 0, (variant, result.stdout, result.stderr)
            assert result.stdout.strip() == str(len(cases)), (variant, result.stdout)
            binaries[variant] = hashlib.sha256(binary.read_bytes()).hexdigest()
        print(json.dumps({"cases": len(cases), "variants": binaries, "sanitized": args.sanitize, "seed": "0x4649584E", "compilerSha256": hashlib.sha256(compiler.read_bytes()).hexdigest(), "inputSha256": hashlib.sha256(data.encode()).hexdigest(), "passed": True}))


if __name__ == "__main__":
    main()
