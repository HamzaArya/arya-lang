"""Opt-in measurements; optional Node comparison never participates in builds."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import statistics
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("--compiler", default=".build/independent/arya")
parser.add_argument("--node-baseline")
parser.add_argument("--samples", type=int, default=3)
parser.add_argument("--output", default=".build/native-accounting-benchmark.json")
options = parser.parse_args()
root = Path(__file__).resolve().parents[2]
compiler = Path(options.compiler).resolve()
assert 1 <= options.samples <= 20
with tempfile.TemporaryDirectory(prefix="native-finance-bench-", dir=root / ".build") as directory:
    work = Path(directory); binary = work / "accounting"; hello = work / "hello"
    (work / "hello.arya").write_text('print("ready")\n')
    for source, output in [(root / "native/examples/accounting-benchmark.arya", binary), (work / "hello.arya", hello)]:
        result = subprocess.run([str(compiler), "build", str(source), "-o", str(output), "--release"],
                                capture_output=True, text=True, timeout=300)
        assert result.returncode == 0, result.stderr
    commands = {"native": [str(binary), "100000", "5"]}
    node = None
    if options.node_baseline:
        node = shutil.which("node")
        assert node, "Explicit Node baseline needs an installed Node executable"
        baseline = Path(options.node_baseline).resolve()
        program = work / "reference.cjs"
        program.write_text("""const a=require(process.argv[2]);const backend=process.argv[3];
if(backend==='info'){console.log(JSON.stringify(a.backendInfo()));process.exit()}
const {performance}=require('node:perf_hooks');const count=100000,repetitions=5;
let lines=Array(count).fill({price:'19.95',quantity:'2',discountBps:1000,taxBps:750});
let start=performance.now();const batch=a.prepareInvoices(lines,{currency:'AFN',scale:2,rounding:'half-even'});
const prepareMs=performance.now()-start;lines=null;global.gc();start=performance.now();let total;
for(let i=0;i<repetitions;i++)total=batch.calculate({backend}).total;
console.log(JSON.stringify({rows:count,repetitions,prepareMs,calculateMs:performance.now()-start,total}));
""")
        info = json.loads(subprocess.check_output([node, str(program), str(baseline), "info"], text=True))
        commands["retained-node-bigint"] = [node, "--expose-gc", str(program), str(baseline), "js"]
        if info["nativeAvailable"]: commands["retained-node-native-addon"] = [node, "--expose-gc", str(program), str(baseline), "native"]
    records = {name: [] for name in commands}
    # Interleave whole processes; do not compare a warmed process with cold startup.
    for _ in range(options.samples):
        for name, command in commands.items():
            timed = ["/usr/bin/time", "-l", *command] if platform.system() == "Darwin" else ["/usr/bin/time", "-v", *command]
            start = time.perf_counter()
            result = subprocess.run(timed, capture_output=True, text=True, timeout=120,
                                    env=dict(os.environ, PATH="/nonexistent") if name == "native" else None)
            wall = (time.perf_counter() - start) * 1000
            assert result.returncode == 0, result.stderr
            record = json.loads(result.stdout)
            assert record["total"] == "3860000.00", record
            pattern = r"(\d+)\s+maximum resident set size" if platform.system() == "Darwin" else r"Maximum resident set size \(kbytes\):\s*(\d+)"
            match = re.search(pattern, result.stderr)
            record.update({"processWallMs": wall, "maxRssBytes": int(match[1]) * (1 if platform.system() == "Darwin" else 1024) if match else None})
            records[name].append(record)
    startup = {}
    for name, command in {"native": [str(hello)], **({"node": [node, "-e", 'console.log("ready")']} if node else {})}.items():
        values = []
        for _ in range(20):
            start = time.perf_counter(); result = subprocess.run(command, capture_output=True, text=True, timeout=10)
            assert result.returncode == 0 and result.stdout.strip() == "ready"
            values.append((time.perf_counter() - start) * 1000)
        startup[name] = {"samples": 20, "medianProcessMs": statistics.median(values)}
    summary = {name: {key: statistics.median(row[key] for row in rows) for key in ["prepareMs", "calculateMs", "processWallMs", "maxRssBytes"]} for name, rows in records.items()}
    report = {"platform": platform.platform(), "architecture": platform.machine(),
        "compilerSha256": hashlib.sha256(compiler.read_bytes()).hexdigest(),
        "workload": "100000 identical exact invoice rows, line-v1 half-even, 5 prepared calculations per process",
        "flags": "--release (-O2 -ffp-contract=off)", "samples": records, "medians": summary, "startup": startup,
        "executableBytes": {"hello": hello.stat().st_size, "accounting": binary.stat().st_size},
        "scope": "Single-host measurements under current machine load; no universal speed or application-size claim."}
    if node: report.update({"nodeVersion": subprocess.check_output([node, "--version"], text=True).strip(),
                           "baselineSha256": hashlib.sha256(baseline.read_bytes()).hexdigest()})
    output = Path(options.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(output), "medians": summary, "startup": startup, "executableBytes": report["executableBytes"]}))
