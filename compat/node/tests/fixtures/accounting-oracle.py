"""Independent high-precision Decimal model for the documented per-line policy."""
import json,sys
from decimal import Decimal,localcontext,ROUND_UP,ROUND_DOWN,ROUND_CEILING,ROUND_FLOOR,ROUND_HALF_UP,ROUND_HALF_DOWN,ROUND_HALF_EVEN
MODES={'up':ROUND_UP,'down':ROUND_DOWN,'ceil':ROUND_CEILING,'floor':ROUND_FLOOR,'half-up':ROUND_HALF_UP,'half-down':ROUND_HALF_DOWN,'half-even':ROUND_HALF_EVEN}
def invoice(case):
    scale=case['options']['scale'];mode=case['options']['rounding'];quantum=Decimal(1).scaleb(-scale)
    def rounded(value):
        rounding=MODES.get(mode)
        if mode=='half-ceil':rounding=ROUND_HALF_UP if value>=0 else ROUND_HALF_DOWN
        if mode=='half-floor':rounding=ROUND_HALF_DOWN if value>=0 else ROUND_HALF_UP
        return value.quantize(quantum,rounding=rounding)
    def text(value):return format(abs(value) if value==0 else value,f'.{scale}f')
    totals={key:Decimal(0) for key in ['gross','discount','net','tax','total']}
    for row in case['lines']:
        gross=rounded(Decimal(row['price'])*Decimal(row.get('quantity','1')))
        discount=rounded(gross*(Decimal(row['discountRate']) if 'discountRate' in row else Decimal(row.get('discountBps',0))/Decimal(10000)))
        net=gross-discount
        tax=rounded(net*(Decimal(row['taxRate']) if 'taxRate' in row else Decimal(row.get('taxBps',0))/Decimal(10000)))
        values={'gross':gross,'discount':discount,'net':net,'tax':tax,'total':net+tax}
        for key,value in values.items():totals[key]+=value
    return {key:text(value) for key,value in totals.items()}
with localcontext() as context:
    context.prec=100
    print(json.dumps([invoice(case) for case in json.load(sys.stdin)]))
