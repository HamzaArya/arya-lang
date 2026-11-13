"""Optional independent oracle: Python's pure-Python decimal implementation.
Builds and executes one native Arya test program; Python is not used by Arya.
"""
import _pydecimal as d
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
compiler = Path(os.environ.get('ARYA_NATIVE_BIN', root / '.build/independent/arya')).resolve()
rng = random.Random(0x41525941)
modes = {'up': d.ROUND_UP, 'down': d.ROUND_DOWN, 'ceil': d.ROUND_CEILING,
         'floor': d.ROUND_FLOOR, 'half-up': d.ROUND_HALF_UP,
         'half-down': d.ROUND_HALF_DOWN, 'half-even': d.ROUND_HALF_EVEN}
source = ['use std "decimal" as decimal']
expected = []
def decimal():
    sign = '-' if rng.randrange(3) == 0 else ''
    return sign + str(rng.randrange(10**24)) + '.' + str(rng.randrange(10**12)).zfill(12)
def canonical(value):
    text = format(value, 'f')
    if '.' in text: text = text.rstrip('0').rstrip('.')
    return '0' if value == 0 else text
with d.localcontext() as context:
    context.prec = 4096
    context.Emax = 4096
    context.Emin = -4096
    context.rounding = d.ROUND_HALF_UP
    for _ in range(60):
        a, b = decimal(), decimal()
        left, right = d.Decimal(a), d.Decimal(b)
        for operation, value in [('add', left+right), ('subtract', left-right), ('multiply', left*right)]:
            source.append(f'print(decimal.{operation}({json.dumps(a)}, {json.dumps(b)}))')
            expected.append(canonical(value))
        source.append(f'print(decimal.compare({json.dumps(a)}, {json.dumps(b)}))')
        expected.append(str(-1 if left < right else 1 if left > right else 0))
    for mode in list(modes)+['half-ceil','half-floor']:
        for _ in range(20):
            a, b = decimal(), decimal()
            places = rng.randrange(9)
            for operation in ['quantize','divide']:
                value = d.Decimal(a)
                if operation == 'divide': value /= d.Decimal(b)
                rounding = modes.get(mode)
                if mode == 'half-ceil': rounding = d.ROUND_HALF_DOWN if value < 0 else d.ROUND_HALF_UP
                if mode == 'half-floor': rounding = d.ROUND_HALF_UP if value < 0 else d.ROUND_HALF_DOWN
                quantized = value.quantize(d.Decimal(1).scaleb(-places),rounding=rounding)
                output = format(quantized, f'.{places}f') if operation == 'quantize' else canonical(quantized)
                arguments = [a] + ([b] if operation == 'divide' else []) + [places,mode]
                source.append('print(decimal.'+operation+'('+', '.join(json.dumps(arg) for arg in arguments)+'))')
                expected.append(output)
    # Exercise both the checked integer path and its arbitrary-precision
    # fallback at alignment/product boundaries, all rounding ties and -0.
    pairs = [('9223372036854775807', '1'), ('-9223372036854775808', '-1'),
             ('92233720368547758.07', '0.01'), ('0.000000000000000001', '9'),
             ('-0', '2'), ('-0.004', '1'), ('0.025', '1'), ('-0.025', '1')]
    for _ in range(100):
        def small():
            units = rng.randrange(-(10**18), 10**18)
            scale = rng.randrange(19)
            digits = str(abs(units)).zfill(scale+1)
            return ('-' if units < 0 else '') + (digits[:-scale]+'.'+digits[-scale:] if scale else digits)
        pairs.append((small(), small()))
    def add_case(operation, arguments, output):
        source.append('print(decimal.'+operation+'('+', '.join(json.dumps(arg) for arg in arguments)+'))')
        expected.append(output)
        count = 2 if operation in ['add','subtract','multiply','compare','divide'] else 1
        args = ['decimal.values.parse('+json.dumps(arg)+')' if i < count else json.dumps(arg) for i,arg in enumerate(arguments)]
        expression = 'decimal.values.'+operation+'('+', '.join(args)+')'
        if operation != 'compare': expression = 'decimal.values.format('+expression+')'
        source.append('print('+expression+')'); expected.append(output)
    for a,b in pairs:
        left,right=d.Decimal(a),d.Decimal(b)
        for operation,result in [('add',left+right),('subtract',left-right),('multiply',left*right)]:
            add_case(operation,[a,b],canonical(result))
        add_case('compare',[a,b],str(-1 if left<right else 1 if left>right else 0))
        for mode in list(modes)+['half-ceil','half-floor']:
            places=rng.randrange(19)
            for operation in ['quantize','divide']:
                if operation=='divide' and right==0: continue
                value=left if operation=='quantize' else left/right
                rounding=modes.get(mode)
                negative=value.is_signed()
                if mode=='half-ceil':rounding=d.ROUND_HALF_DOWN if negative else d.ROUND_HALF_UP
                if mode=='half-floor':rounding=d.ROUND_HALF_UP if negative else d.ROUND_HALF_DOWN
                quantized=value.quantize(d.Decimal(1).scaleb(-places),rounding=rounding)
                output=format(quantized,f'.{places}f') if operation=='quantize' else canonical(quantized)
                if operation=='quantize' and left==0 and output.startswith('-'):output=output[1:]
                add_case(operation,[a]+([b] if operation=='divide' else [])+[places,mode],output)
    # Already-quantized text may be reused by the native small-coefficient
    # path, but input negative zero must still normalize for every mode.
    for mode in list(modes)+['half-ceil','half-floor']:
        for text in ['0','-0','0.00','-0.00','1.00','-1.00',
                     '0.000000000000000001','-0.000000000000000001',
                     '9223372036854775807','-9223372036854775808']:
            places=len(text.split('.')[1]) if '.' in text else 0
            output=text[1:] if text.startswith('-') and d.Decimal(text)==0 else text
            add_case('quantize',[text,places,mode],output)
with tempfile.TemporaryDirectory(prefix='arya-native-reference-',dir=root/'.build') as temp:
    directory=Path(temp)
    # Each source unit keeps the compiler's existing 50000-token bound.
    entry=directory/'main.arya'
    imports=[]; source_text=[]
    for start in range(1,len(source),240):
        name=f'part-{len(imports)}.arya'; text=source[0]+'\n'+'\n'.join(source[start:start+240])+'\n'
        (directory/name).write_text(text); source_text.append(text)
        imports.append(f'use arya "./{name}" as part{len(imports)}')
    entry.write_text('\n'.join(imports)+'\n')
    binary=directory/'program'
    # Keep the independent matrix unchanged, but bound the C optimizer's working
    # set. A single generated program can otherwise exceed small hosts' memory.
    batch_modules=int(os.environ.get('ARYA_DECIMAL_REFERENCE_BATCH_MODULES','4'))
    if batch_modules<1:raise ValueError('Batch module count must be positive')
    actual=[]; batches=[]
    for start in range(0,len(imports),batch_modules):
        batch=directory/f'batch-{start}.arya'
        batch.write_text('\n'.join(imports[start:start+batch_modules])+'\n')
        binary=directory/f'program-{start}'
        build=subprocess.run([str(compiler),'build',str(batch),'-o',str(binary),'--release'],capture_output=True,text=True,timeout=240)
        assert build.returncode==0, build.stderr or build.stdout
        output=subprocess.check_output([str(binary)],env={'PATH':'/nonexistent'},text=True,timeout=30)
        actual.extend(output.splitlines())
        batches.append({'firstModule':start,'modules':min(batch_modules,len(imports)-start),
                        'entrySha256':hashlib.sha256(batch.read_bytes()).hexdigest(),
                        'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest()})
    assert actual == expected, next(((i,a,b) for i,(a,b) in enumerate(zip(actual,expected)) if a!=b),('length',len(actual),len(expected)))
    record={'reference':'Python _pydecimal (independent pure-Python arithmetic)', 'cases':len(expected),
            'seed':'0x41525941', 'allMatched':True, 'batchModules':batch_modules, 'batches':batches,
            'sourceSha256':hashlib.sha256(('\n'.join(source_text)+entry.read_text()).encode()).hexdigest(),
            'outputSha256':hashlib.sha256(('\n'.join(actual)+'\n').encode()).hexdigest()}
    (root/'.build/native-decimal-reference.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record,indent=2))
