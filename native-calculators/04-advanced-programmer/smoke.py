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

MASK=(1<<32)-1
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory);store=root/"data.json"
 assert call(store)["result"]=="0" and not store.exists()
 cases=[("0xFF AND 0b10101010",170),("NOT 0",MASK),("NOT 0xFFFFFFFF",0),("1 << 31",1<<31),("0xFFFFFFFF >> 31",1),("1 << 2 + 1",8),("1 OR 2 AND 4",1),("1 XOR 3 AND 2",3),("7/2",3),("7%2",1),("-1",MASK),("0xffffffff+1",0),("0xffffffff*0xffffffff",1),("0x80000000 << 1",0),("NOT NOT 17",17),("0XfF + 0B1",256),("(1 OR 2) << 8",768),("(0-1)+2",1)]
 for expression,expected in cases:
  response=call(store,"calculate",{"expression":expression,"overflow":"wrap"});assert int(response["result"])==expected,(expression,response)
  assert f"0x{expected:08X}" in response["rows"][0]["details"] and f"{expected:032b}" in response["rows"][0]["details"]
 rng=random.Random(3224)
 for _ in range(35):
  a=rng.randrange(1<<32);b=rng.randrange(1<<32)
  for operator,expected in [("+",(a+b)&MASK),("-",(a-b)&MASK),("*",(a*b)&MASK),("AND",a&b),("OR",a|b),("XOR",a^b)]:
   expression=f"{a} {operator} {b}";actual=int(call(store,"calculate",{"expression":expression})["result"]);assert actual==expected,(expression,actual,expected)
  n=rng.randrange(32)
  for operator,expected in [("<<",(a<<n)&MASK),(">>",a>>n)]:assert int(call(store,"calculate",{"expression":f"{a} {operator} {n}"})["result"])==expected
 for expression in ["4294967296","0x100000000","0b102","0x","1.5","1e3","1/0","1%0","1<<32","1>>32","2^3","2&3","1AND2","unknown","1+","1 2","","("*34+"1"+")"*34,"1+"*130+"1","1"*513]:reject(store,expression)
 for expression in ["0xffffffff+1","0-1","-1","0x10000*0x10000","0x80000000<<1"]:reject(store,expression,overflow="checked")
 for expression,expected in [("65535*65535",65535*65535),("0xffffffff-1",MASK-1),("NOT 0",MASK),("0xffffffff>>1",MASK>>1)]:assert int(call(store,"calculate",{"expression":expression,"overflow":"checked"})["result"])==expected
 reject(store,"1",overflow="invalid")
 response=call(store);assert len(response["rows"])==100;last=response["result"]
 disk_cases(root,store,"1+1")
 cleared=call(store,"clear-history");assert cleared["rows"]==[] and cleared["result"]==last
 valid=store.read_text()
 for bad_result in ["NaN", "4294967296", "-1", "1.5", ""]:
  corrupt=json.loads(valid);corrupt["history"]=[{"id":"bad","expression":"1","result":bad_result,"kind":"UInt32 / wrap","time":"2026-11-13T00:00:00Z","details":"Corrupt result"}]
  store.write_text(json.dumps(corrupt));before=store.read_bytes();call(store,ok=False);assert store.read_bytes()==before
 store.write_text(valid)
 state=json.loads(store.read_text());state["lastResult"]="4294967296";store.write_text(json.dumps(state));call(store,ok=False)
print("PASS: UInt32 literals/precedence/bit operations, 280 Python integer references including large multiplication, checked errors, conversions, history, persistence, corruption and failed writes")
