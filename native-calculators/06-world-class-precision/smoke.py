import decimal, fractions, hashlib, json, os, pathlib, random, resource, signal, subprocess, sys, tempfile
from fractions import Fraction as F
from decimal import Decimal as D
EXE=str(pathlib.Path(sys.argv[1]).resolve())
PRECISE=True
ROUND={'half-even':decimal.ROUND_HALF_EVEN,'half-up':decimal.ROUND_HALF_UP,'down':decimal.ROUND_DOWN,'floor':decimal.ROUND_FLOOR,'ceil':decimal.ROUND_CEILING}
def display(value,places=2,rounding='half-even'):
    with decimal.localcontext() as c:
        c.prec=1000
        out=(D(value.numerator)/D(value.denominator)).quantize(D(1).scaleb(-places),rounding=ROUND[rounding])
        if not out:out=abs(out)
        return format(out,'f')
def exact(value):return str(value.numerator) if value.denominator==1 else f'({value.numerator}/{value.denominator})'
def block_regular_file_writes():
    signal.signal(signal.SIGXFSZ,signal.SIG_IGN)
    resource.setrlimit(resource.RLIMIT_FSIZE,(0,0))
class Worker:
    def __init__(self,folder):self.folder=pathlib.Path(folder);self.file=self.folder/'data.json';self.calls=0;self.block_writes=False
    def call(self,command,body=None,ok=True):
        self.calls+=1;body={'view':'history','precision':'20' if PRECISE else '2','rounding':'half-even',**(body or {})}
        p=subprocess.run([EXE,command,json.dumps(body)],cwd=self.folder,env={**os.environ,'DATA_FILE':str(self.file)},capture_output=True,text=True,timeout=30,preexec_fn=block_regular_file_writes if self.block_writes else None)
        assert p.returncode==0,(command,p.returncode,p.stderr,p.stdout)
        value=json.loads(p.stdout);assert value['ok'] is ok,(command,body,value)
        assert isinstance(value.get('message'),str)
        if ok:assert isinstance(value['rows'],list) and isinstance(value['result'],str) and isinstance(value['memory'],str)
        return value
    def check(self,expression,value,places=2,rounding='half-even'):
        result=self.call('calculate',{'expression':expression,'precision':str(places),'rounding':rounding})
        expected=exact(value) if PRECISE else display(value,places,rounding)
        assert result['result']==expected,(expression,expected,result)
        assert display(value,places,rounding) in result['rows'][0]['details']
        return result
    def unchanged(self,command,body):
        before=self.file.read_bytes();self.call(command,body,False);assert self.file.read_bytes()==before
with tempfile.TemporaryDirectory() as tmp:
    w=Worker(tmp);assert w.call('list')['result']=='0' and not w.file.exists()
    examples=[('0.1 + 0.2',F(3,10)),('9007199254740993 + 1',F(9007199254740994)),('2 + 3 * 4',F(14)),('(2 + 3) * 4',F(20)),('-2^2',F(-4)),('(-2)^2',F(4)),('2^-3',F(1,8)),('2^3^2',F(512)),('.5 + 1.',F(3,2)),('0001.20 + .30',F(3,2)),('abs(-1/7)',F(1,7)),('200 * 10%',F(20)),('200 + 10%',F(2001,10)),('1/3 + 1/6',F(1,2)),('(2/3)^2',F(4,9)),('8/4/2',F(1)),('1/3*3',F(1)),('(10^100-1)/(10^100-1)',F(1)),('10^100 + 1',F(10**100+1)),('0^5',F(0))]
    for expression,value in examples:w.check(expression,value)
    for mode in ROUND:
        for value in [F(-1,8),F(-3,8),F(1,8),F(1,200)]:w.check(str(value),value,2,mode)
    w.check('1/7',F(1,7),50);w.check('-1/3',F(-1,3),0,'floor')
    continued=w.check('2/3',F(2,3))['result'];base=F(continued[1:-1] if continued.startswith('(') else continued)
    w.check(continued+'^2',base**2)
    rng=random.Random(60113)
    for _ in range(35):
        a,b,c,d,e,f=[rng.randint(1,1000) for _ in range(6)]
        if rng.choice([False,True]):a=-a
        expression=f'({a}/{b} + {c}/{d}) * ({e}/{f})'
        w.check(expression,(F(a,b)+F(c,d))*F(e,f),rng.choice([0,2,8,30,50]),rng.choice(list(ROUND)))
    for expression in ['1/0','1/(2-2)','0^-1','0^0','2^101','2^(1/2)','(' * 35 + '1' + ')' * 35,'1+'*150+'1','9'*601,'10^100*10^100*10^100','1e3','NaN','Infinity','sin(0)','1;2','2(3)','1..2','abs 2','1+','']:
        w.unchanged('calculate',{'expression':expression})
    for option,value in [('precision','51'),('precision','-1'),('precision','2.5'),('rounding','banker-ish')]:w.unchanged('calculate',{'expression':'1/3',option:value})
    memory_value='1/3' if PRECISE else '0.10'
    expected_memory='(1/3)' if PRECISE else '0.10'
    assert w.call('memory-store',{'value':memory_value})['memory']==expected_memory
    assert w.call('memory-add',{'value':'1/6' if PRECISE else '0.20'})['memory']==('(1/2)' if PRECISE else '0.30')
    assert w.call('memory-subtract',{'value':'1/6' if PRECISE else '0.10'})['memory']==('(1/3)' if PRECISE else '0.20')
    recall=w.call('memory-recall');assert recall['result']==recall['memory']
    w.unchanged('memory-add',{'value':'1/0'})
    old=w.file.read_bytes();assert w.call('list')['result']==recall['result'] and w.file.read_bytes()==old
    w.block_writes=True
    try:
        w.unchanged('calculate',{'expression':'7+8'});w.unchanged('memory-add',{'value':'1'});w.unchanged('clear-history',{})
    finally:w.block_writes=False
    assert not list(w.folder.glob('data.json.stage-*')), 'Failed write left staging directories'
    # A predictable old temporary path must never be followed or published.
    legacy=w.folder/'data.json.tmp';legacy.symlink_to(w.file)
    w.call('calculate',{'expression':'2+2'});assert not w.file.is_symlink() and legacy.is_symlink();legacy.unlink()
    sentinel=w.folder/'sentinel.txt';sentinel.write_text('KEEP THIS SENTINEL');legacy.symlink_to(sentinel)
    w.call('calculate',{'expression':'3+3'});assert sentinel.read_text()=='KEEP THIS SENTINEL' and legacy.is_symlink();legacy.unlink()
    assert not list(w.folder.glob('data.json.stage-*'))
    # Both existing and dangling store symlinks must be rejected without replacement.
    real=w.folder/'real-data.json';w.file.rename(real);before=real.read_bytes();w.file.symlink_to(real)
    w.call('list',ok=False);w.call('calculate',{'expression':'8+9'},False)
    assert w.file.is_symlink() and real.read_bytes()==before;w.file.unlink();real.rename(w.file)
    w.file.rename(real);missing=w.folder/'missing-data.json';w.file.symlink_to(missing)
    w.call('list',ok=False);w.call('calculate',{'expression':'8+9'},False)
    assert w.file.is_symlink() and not missing.exists() and real.read_bytes()==before;w.file.unlink();real.rename(w.file)
    w.call('memory-clear');assert w.call('memory-recall')['result']=='0'
    if not PRECISE:
        cases=[('loan','100000','6',360,2),('loan','1200','0',12,2),('loan','999999999999999999999999999999','0.000000000001',600,50),('loan','250000','7.125',240,8),('compound','1000','6',120,2),('compound','12345.67','0',12,2),('compound','100','100',1200,20),('discount','19.95','15',None,2)]
        for command,principal,rate,months,places in cases:
            with decimal.localcontext() as c:
                c.prec=250;p=D(principal);r=D(rate)/D(1200)
                if command=='loan':value=p/D(months) if not r else p*r*(1+r)**months/((1+r)**months-1)
                elif command=='compound':value=p*(1+r)**months
                else:value=p*(1-D(rate)/100)
                expected=format(value.quantize(D(1).scaleb(-places),rounding=decimal.ROUND_HALF_EVEN),'f')
            body={'principal':principal,'rate':rate,'precision':str(places)}
            if months is not None:body['months']=str(months)
            out=w.call(command,body);assert out['result']==expected,(command,body,expected,out)
            known={('loan','100000','6'):'599.55',('loan','1200','0'):'100.00',('compound','1000','6'):'1819.40',('discount','19.95','15'):'16.96'}
            if (command,principal,rate) in known:assert out['result']==known[(command,principal,rate)]
        for command,body in [('loan',{'principal':'1000','rate':'101','months':'12'}),('loan',{'principal':'1000','rate':'5','months':'0'}),('loan',{'principal':'-1','rate':'5','months':'12'}),('compound',{'principal':'1','rate':'5','months':'1201'}),('discount',{'principal':'10','rate':'-1'})]:w.unchanged(command,body)
    # Latest 100 items are bounded, and a new process preserves settings-independent results.
    for n in range(105):w.call('calculate',{'expression':str(n)})
    view=w.call('list');assert len(view['rows'])==100 and view['rows'][0]['expression']=='104' and view['rows'][-1]['expression']=='5'
    last=view['result'];w.call('clear-history');after=w.call('list');assert after['rows']==[] and after['result']==last
    saved=json.loads(w.file.read_text())
    for bad in ['{broken',json.dumps({**saved,'memory':'not a value'}),json.dumps({**saved,'history':[{}]}),json.dumps({**saved,'nextId':0})]:
        w.file.write_text(bad);before=w.file.read_bytes();w.call('list',ok=False);assert w.file.read_bytes()==before
    print(f'PASS: {w.calls} real native worker calls; independent Fraction/Decimal oracles, precedence, ties, limits, memory, persistence, latest100 history, corrupt data, existing/dangling store symlinks, poisoned temporary symlinks and real write failure'+('' if PRECISE else '; finance worksheets checked at300-digit reference precision, maximum magnitude and exact rounding ties'))
