"""Optional independent Python CSV and native whole-file decoding references."""
import csv, io, json, os, random, subprocess, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
compiler=Path(os.environ.get('ARYA_NATIVE_BIN',root/'.build/independent/arya')).resolve()
env={'PATH':'/nonexistent','ASAN_OPTIONS':'detect_leaks=0','UBSAN_OPTIONS':'halt_on_error=1','ARYA_GC_STRESS':'1'}
def build(directory,name,source):
    path=directory/(name+'.arya');path.write_text(source)
    result=subprocess.run([str(compiler),'build',str(path),'-o',str(directory/name),'--debug','--sanitize'],text=True,capture_output=True,timeout=120)
    assert result.returncode==0,result.stderr or result.stdout
    return directory/name
with tempfile.TemporaryDirectory(prefix='csv-reference-',dir=root/'.build') as temporary:
    directory=Path(temporary)
    binary=build(directory,'csv','''use std "csv" as csv
use std "json" as json
use std "io" as io
while true { let line = io.readLine(); if line == null { break }; let input: any = json.parse(line)
  let decoder = csv.decoder(); let rows: any = []
  for chunk in input.chunks { rows = rows.concat(decoder.push(chunk)) }
  rows = rows.concat(decoder.finish()); print(json.stringify(rows))
}
''')
    rng=random.Random(0x435356);requests=[];expected=[]
    fields=['','plain','a,b','a"b','a\r\nb','\0','فارسی','😀','=print(99)','__proto__']
    for _ in range(140):
        rows=[[rng.choice(fields) for _ in range(rng.randrange(1,6))] for _ in range(rng.randrange(1,7))]
        output=io.StringIO(newline='');csv.writer(output,lineterminator='\r\n').writerows(rows);text=output.getvalue()
        chunks=[];at=0
        while at<len(text):
            size=rng.randrange(1,9);chunks.append(text[at:at+size]);at+=size
        requests.append({'chunks':chunks});expected.append(list(csv.reader(io.StringIO(text,newline=''),strict=True)))
    result=subprocess.run([str(binary)],input=''.join(json.dumps(x,ensure_ascii=True)+'\n' for x in requests),env=env,text=True,capture_output=True,timeout=120)
    assert result.returncode==0,result.stderr
    assert [json.loads(x) for x in result.stdout.splitlines()]==expected
    chunk=build(directory,'chunks','''use std "io" as io
use std "fs" as fs
use std "json" as json
use std "debug" as debug
let text = ""
while true { let chunk = io.readChunk(Number(args[0])); if chunk == null { break }; text += chunk }
debug.assert(text == fs.readTextSync(args[1]), "Chunk decoding differs from whole input")
let caught = false
try { io.readLine() } catch error { debug.assert(error.name == "TypeError"); caught = true }
debug.assert(caught)
print("chunks passed")
''')
    payloads=['فارسی 😀\0a\r\nb'.encode(),b'\xf0\x9f',b'a\xc2b\xffz',b'\xf0\x80\x80\x80',b'']
    for data in payloads:
        file=directory/'input.bin';file.write_bytes(data)
        for size in [1,2,3,4,5,7,65532]:
            result=subprocess.run([str(chunk),str(size),str(file)],input=data,env=env,capture_output=True,timeout=30)
            assert result.returncode==0,(data,size,result.stderr.decode())
    print(f'CSV: {len(requests)} Python reference cases; {len(payloads)*7} UTF-8 chunk/whole-file equivalence cases passed with ASan/UBSan and GC stress')
