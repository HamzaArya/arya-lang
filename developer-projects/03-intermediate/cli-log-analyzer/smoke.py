#!/usr/bin/env python3
import json, pathlib, subprocess, sys, tempfile
exe=str(pathlib.Path(sys.argv[1]).resolve())
def run(*args,code=0):
 result=subprocess.run([exe,*map(str,args)],capture_output=True,text=True,timeout=10)
 assert result.returncode==code,(result.returncode,result.stdout,result.stderr)
 return result

with tempfile.TemporaryDirectory() as root:
 path=pathlib.Path(root)/"access.jsonl"
 rows=[{"level":"info","service":"api","message":"ok","durationMs":10},{"level":"error","service":"api","message":"failure","durationMs":30},{"level":"warn","service":"worker","message":"slow","durationMs":100}]
 path.write_text("\n".join(map(json.dumps,rows))+"\nnot-json\n"+json.dumps({"level":"wrong"})+"\n")
 value=json.loads(run(path).stdout);assert value["matched"]==3 and value["invalidLines"]==[4,5]
 assert value["latency"]["p95Ms"]==100 and value["levels"]["error"]==1
 value=json.loads(run(path,"api").stdout);assert value["matched"]==2 and value["latency"]["averageMs"]==20
 path.write_text("");assert json.loads(run(path).stdout)["latency"]["p95Ms"] is None
 run(pathlib.Path(root)/"missing",code=1);run(path,"api","extra",code=1);assert "Signal Log" in run("--help").stdout
print("PASS: real JSONL aggregation, malformed lines, service filter, nearest-rank p95, empty input, missing file, usage")
