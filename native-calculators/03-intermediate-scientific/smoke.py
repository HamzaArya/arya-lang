#!/usr/bin/env python3
"""Actual native engines, with Python standard-library reference oracles."""
import json, math, os, pathlib, random, subprocess, sys, tempfile
exe=str(pathlib.Path(sys.argv[1]).resolve())
def call(store, command="list", body=None, ok=True):
 result=subprocess.run([exe,command,json.dumps({"view":"history",**(body or {})})],env={**os.environ,"DATA_FILE":str(store)},capture_output=True,text=True,timeout=10)
 assert result.returncode==0,(result.returncode,result.stdout,result.stderr)
 response=json.loads(result.stdout);assert response["ok"] is ok,(command,body,response)
 if ok:assert isinstance(response["rows"],list) and isinstance(response["result"],str)
 return response
def reject(store, expression, **options):
 before=store.read_bytes();call(store,"calculate",{"expression":expression,**options},ok=False);assert store.read_bytes()==before
def disk_cases(root, store, expression):
 before=store.read_bytes();root.chmod(0o500)
 try:call(store,"calculate",{"expression":expression},ok=False);assert store.read_bytes()==before
 finally:root.chmod(0o700)
 assert not list(root.glob("*.stage-*"))
 broken=root/"broken.json";broken.write_text("{broken");call(broken,ok=False);assert broken.read_text()=="{broken"
 malformed=root/"schema.json";malformed.write_text('{"format":1}');call(malformed,ok=False)
 before=store.read_bytes();call(store,"unknown",ok=False);assert store.read_bytes()==before

with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory);store=root/"data.json"
 initial=call(store);assert initial["result"]=="0" and initial["memory"]=="0" and not store.exists()
 cases=[("2+3*4",14),("(2+3)*4",20),("2^3^2",512),("-2^2",-4),("(-2)^2",4),("2^-2",.25),("-3!",-6),("3!!",720),("fact(5)+1",121),(".5+1e-3",.501),("sqrt(9)+abs(-4)",7),("ln(e)",1),("log(1000)",3),("sin(30)",.5),("cos(60)",.5),("tan(45)",1),("asin(0.5)",30),("acos(0.5)",60),("atan(1)",45),("exp(1)",math.e),("floor(-1.2)+ceil(1.2)",0),("5%2",1),("-5%2",-1),("0^0",1),("170!",float(math.factorial(170)))]
 for expression,expected in cases:
  actual=float(call(store,"calculate",{"expression":expression,"angle":"deg"})["result"])
  assert math.isclose(actual,expected,rel_tol=2e-13,abs_tol=2e-13),(expression,actual,expected)
 for expression,expected in [("sin(pi/2)",1),("cos(pi)",-1),("atan(1)",math.pi/4)]:
  assert math.isclose(float(call(store,"calculate",{"expression":expression,"angle":"rad"})["result"]),expected,rel_tol=2e-13,abs_tol=2e-13)
 rng=random.Random(197)
 for _ in range(80):
  a,b,c=[rng.randint(-100,100) for _ in range(3)];denominator=rng.randint(1,100);expression=f"({a}+{b}*{c})/{denominator}"
  assert math.isclose(float(call(store,"calculate",{"expression":expression})["result"]),(a+b*c)/denominator,rel_tol=2e-13,abs_tol=2e-13)
 for expression in ["", "2pi", "1e+", ".", "1..2", "sin()", "sqrt(-1)", "ln(0)", "log(-1)", "tan(90)", "tan(990)", "tan(-990)", "tan(270)", "tan(450)", "asin(2)", "171!", "2.5!", "(-1)!", "1/0", "1%0", "1e309", "exp(1000)", "(-2)^0.5", "2+", "2 3", "unknown(1)", "2**3", "[1]", "("*34+"1"+")"*34, "1+"*130+"1", "1"*513]:reject(store,expression)
 reject(store,"2",angle="invalid")
 call(store,"memory-store",{"value":"12.5"});call(store,"memory-add",{"value":"2.5"});call(store,"memory-subtract",{"value":"3"})
 recalled=call(store,"memory-recall");assert recalled["result"]=="12" and recalled["memory"]=="12"
 assert call(store)["result"]=="12" and len(call(store)["rows"])==100
 before=store.read_bytes();call(store,"memory-store",{"value":"not a number"},ok=False);assert store.read_bytes()==before
 call(store,"memory-store",{"value":"1e308"});before=store.read_bytes();call(store,"memory-add",{"value":"1e308"},ok=False);assert store.read_bytes()==before
 call(store,"memory-clear");assert call(store)["memory"]=="0"
 disk_cases(root,store,"1+1")
 cleared=call(store,"clear-history");assert cleared["rows"]==[] and cleared["result"]=="12"
 valid=store.read_text()
 for bad_result in ["NaN", "Infinity", "1e309", ""]:
  corrupt=json.loads(valid);corrupt["history"]=[{"id":"bad","expression":"1","result":bad_result,"kind":"Scientific","time":"2026-11-13T00:00:00Z","details":"Corrupt result"}]
  store.write_text(json.dumps(corrupt));before=store.read_bytes();call(store,ok=False);assert store.read_bytes()==before
 store.write_text(valid)
 state=json.loads(store.read_text());state["lastResult"]="NaN";store.write_text(json.dumps(state));call(store,ok=False)
print("PASS: precedence/powers/unary/factorial, functions/angles, 80 arithmetic references, errors/limits, memory, history, persistence, corrupt store and failed writes")
