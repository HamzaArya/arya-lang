"""Bounded line-reader regression, including NUL/UTF-8 and the exact byte cap."""
import json,os,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
compiler=Path(os.environ.get('ARYA_NATIVE_BIN',root/'.build/independent/arya')).resolve()
with tempfile.TemporaryDirectory(prefix='io-reference-',dir=root/'.build') as temporary:
    directory=Path(temporary);entry=directory/'main.arya';binary=directory/'reader'
    entry.write_text('''use std "io" as io
use std "json" as json
while true {
  try { const text = io.readLine(); if text == null { break }; print(json.stringify({line: text})) }
  catch error { print(json.stringify({error: error.name, message: error.message})); break }
}
''')
    result=subprocess.run([str(compiler),'build',str(entry),'-o',str(binary),'--debug','--sanitize'],text=True,capture_output=True,timeout=120)
    assert result.returncode==0,result.stderr or result.stdout
    limit=1024*1024
    cases=[(b'',[]),(b'\n',[{'line':''}]),(b'\r\n\r\n',[{'line':''},{'line':''}]),
           (b'a\0b\nlast\r',[{'line':'a\0b'},{'line':'last'}]),
           ('فارسی 😀\r\nlast'.encode(),[{'line':'فارسی 😀'},{'line':'last'}]),
           (b'\xff\0a\n',[{'line':'\ufffd\0a'}]),(b'\xf0\x9f\n',[{'line':'\ufffd\ufffd'}]),
           (b'x'*limit+b'\n',[{'line':'x'*limit}]),
           (('😀'*(limit//4)).encode()+b'\n',[{'line':'😀'*(limit//4)}]),
           (b'x'*(limit+1)+b'\n',[{'error':'RangeError','message':'Native input frame exceeds 1 MiB.'}])]
    for data,expected in cases:
        result=subprocess.run([str(binary)],input=data,capture_output=True,timeout=30,env={'PATH':'/nonexistent','ARYA_GC_STRESS':'1','ASAN_OPTIONS':'detect_leaks=0','UBSAN_OPTIONS':'halt_on_error=1'})
        assert result.returncode==0,result.stderr.decode()
        actual=[json.loads(line) for line in result.stdout.splitlines()]
        assert actual==expected,(len(data),[list(x) for x in actual])
    print(f'Line input: {len(cases)} EOF/NUL/Unicode/CRLF/byte-limit cases passed with ASan/UBSan and GC stress')
