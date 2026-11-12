/* Exact fixed-point accounting. No Node ABI or floating-point amount storage.
 * A line is checked in signed 64-bit minor units. Signed 128-bit intermediates
 * hold products and all aggregates of at most one million lines. */
#ifndef __SIZEOF_INT128__
#error "Native accounting requires a compiler with signed 128-bit integers."
#endif
typedef __int128 AACWide;
typedef unsigned __int128 AACUnsigned;
typedef struct {
  int kind, scale, price_scale, mode;
  size_t count, accounts, position, bytes;
  uint64_t divisor;
  void *storage;
  AACWide invoice[5];
} AACBatch;
typedef struct { int64_t price, quantity; uint32_t discount, tax; } AACInvoice;
typedef struct { int64_t debit, credit; uint32_t account; } AACLedger;
static const char *aac_modes[]={"up","down","ceil","floor","half-up","half-down","half-even","half-ceil","half-floor"};
static const char aac_name[]="arya.accounting.batch";

static AV aac_fail(const char *code,const char *message,size_t row) {
  afail("Error",message);
  AV error=aerror; ARoot root; aroot(&root,&error,1);afailed=0;
  aput(error,"code",astr(code));
  if(row!=SIZE_MAX)aput(error,"row",an((double)row));
  athrow(error);aunroot(&root); return av(AUNDEF);
}
static AV aac_field(AV object,const char *key) {
  if(object.t!=ARECORD)return av(AUNDEF);
  for(size_t i=0;i<object.p->len;i+=2)if(akey(object.p->data[i],key))return object.p->data[i+1];
  return av(AUNDEF);
}
static int aac_object(AV value,const char *const *keys,size_t count,const char *label,size_t row) {
  if(value.t!=ARECORD){aac_fail("ARYA_ACCOUNTING_INPUT",label,row);return 0;}
  for(size_t i=0;i<value.p->len;i+=2){
    int found=0;
    for(size_t k=0;k<count;k++)if(akey(value.p->data[i],keys[k])){found=1;break;}
    if(!found||value.p->data[i+1].t==AGETTER){aac_fail("ARYA_ACCOUNTING_INPUT","Unknown or accessor accounting field.",row);return 0;}
  }
  return 1;
}
static int aac_fits(AACWide value){return value>=INT64_MIN&&value<=INT64_MAX;}
static int aac_units(AV value,int scale,int positive,size_t row,int64_t *out) {
  if(value.t!=ASTR||!value.p->scope||value.p->scope>64)goto invalid;
  const uint16_t *s=value.p->chars;size_t n=(size_t)value.p->scope,i=0;
  int negative=s[0]=='-';if(negative)i++;
  if(i==n||(positive&&negative)||s[i]<'0'||s[i]>'9')goto invalid;
  if(s[i]=='0'&&i+1<n&&s[i+1]!='.')goto invalid;
  uint64_t units=0,limit=(uint64_t)INT64_MAX+(negative?1:0);
  while(i<n&&s[i]>='0'&&s[i]<='9'){
    unsigned digit=s[i++]-'0';
    if(units>(limit-digit)/10)goto range;
    units=units*10+digit;
  }
  int fractional=0;
  if(i<n){
    if(s[i++]!='.'||i==n)goto invalid;
    while(i<n){
      if(s[i]<'0'||s[i]>'9')goto invalid;
      unsigned digit=s[i++]-'0';
      if(fractional<scale){if(units>(limit-digit)/10)goto range;units=units*10+digit;}
      else if(digit){aac_fail("ARYA_ACCOUNTING_SCALE","Nonzero digits exceed the selected accounting scale.",row);return 0;}
      fractional++;
    }
  }
  while(fractional++<scale){if(units>limit/10)goto range;units*=10;}
  *out=negative?(units?(int64_t)(-(AACWide)units):0):(int64_t)units;return 1;
invalid:
  aac_fail("ARYA_ACCOUNTING_INPUT","Amounts must be exact decimal strings without grouping or exponent; quantities and ledger amounts must be nonnegative.",row);return 0;
range:
  aac_fail("ARYA_ACCOUNTING_RANGE","A line amount exceeds signed 64-bit minor units.",row);return 0;
}
static int aac_rate(AV row,const char *basis,const char *fraction,int discount,size_t index,uint32_t *out) {
  AV bps=aac_field(row,basis),text=aac_field(row,fraction);
  if(bps.t!=AUNDEF&&text.t!=AUNDEF)goto invalid;
  if(text.t!=AUNDEF){int64_t units;if(!aac_units(text,6,1,index,&units))return 0;if(units>(discount?1000000:100000000))goto invalid;*out=(uint32_t)units;return 1;}
  if(bps.t==AUNDEF){*out=0;return 1;}
  if(!ais_safe_integer(bps)||bps.n<0||bps.n>(discount?10000:1000000))goto invalid;
  *out=(uint32_t)bps.n*100;return 1;
invalid:
  aac_fail("ARYA_ACCOUNTING_RATE","Specify one exact fractional rate or integer basis points within the supported range.",index);return 0;
}
static AACWide aac_round(AACWide value,uint64_t denominator,int mode) {
  AACWide q=value/denominator,r=value%denominator;
  if(!r)return q;
  int negative=value<0,increment=0;AACWide twice=(r<0?-r:r)*2;
  switch(mode){
    case 0:increment=1;break;case 1:break;
    case 2:increment=!negative;break;case 3:increment=negative;break;
    case 4:increment=twice>=denominator;break;case 5:increment=twice>denominator;break;
    case 6:increment=twice>denominator||(twice==denominator&&q%2);break;
    case 7:increment=twice>denominator||(twice==denominator&&!negative);break;
    case 8:increment=twice>denominator||(twice==denominator&&negative);break;
  }
  return q+(increment?(negative?-1:1):0);
}
static AV aac_format(AACWide value,int scale) {
  char reversed[64],text[68];size_t n=0,used=0;
  AACUnsigned magnitude=value<0?(AACUnsigned)(-(value+1))+1:(AACUnsigned)value;
  do{reversed[n++]=(char)('0'+magnitude%10);magnitude/=10;}while(magnitude);
  while(n<=(size_t)scale)reversed[n++]='0';
  if(value<0)text[used++]='-';
  while(n){text[used++]=reversed[--n];if(scale&&n==(size_t)scale)text[used++]='.';}
  return astrn(text,used);
}
static void aac_finalize(AH *h){AACBatch *batch=(AACBatch*)h->external;if(batch){aallocated-=sizeof(*batch)+batch->bytes;free(batch->storage);free(batch);}}
static AV aac_new(int kind,size_t bytes,AV parent) {
  AH *h=aalloc(AHANDLE,0);h->name=aac_name;h->parent=parent;
  AACBatch *batch=(AACBatch*)amemory(sizeof(*batch));batch->kind=kind;batch->bytes=bytes;
  if(bytes)batch->storage=amemory(bytes);
  h->external=batch;h->finalize=aac_finalize;aallocated+=sizeof(*batch)+bytes;
  if(aallocated>apeakh)apeakh=aallocated;return ap(h);
}
static AACBatch *aac_batch(AV value,int state) {
  if(value.t!=AHANDLE||value.p->name!=aac_name||!value.p->external){aac_fail("ARYA_ACCOUNTING_INPUT","Invalid accounting batch handle.",SIZE_MAX);return NULL;}
  AACBatch *batch=(AACBatch*)value.p->external;
  if((batch->kind>=3)!=state){aac_fail("ARYA_ACCOUNTING_INPUT","Wrong accounting handle kind.",SIZE_MAX);return NULL;}
  return batch;
}
static uint64_t aac_hash(AV text){uint64_t h=1469598103934665603ULL;for(int i=0;i<text.p->scope;i++){h^=text.p->chars[i];h*=1099511628211ULL;}return h;}
static AV aac_prepare(AV rows,AV options,int invoice) {
  static const char *const invoice_keys[]={"currency","scale","rounding","priceScale"};
  static const char *const ledger_keys[]={"currency","scale"};
  static const char *const line_keys[]={"price","quantity","discountBps","taxBps","discountRate","taxRate"};
  static const char *const entry_keys[]={"account","debit","credit"};
  if(rows.t!=ALIST||rows.p->len>1000000)return aac_fail("ARYA_ACCOUNTING_LIMIT","Provide a list with at most one million accounting rows.",SIZE_MAX);
  if(!aac_object(options,invoice?invoice_keys:ledger_keys,invoice?4:2,"Accounting options must be a record.",SIZE_MAX))return av(AUNDEF);
  AV currency=aac_field(options,"currency"),scale=aac_field(options,"scale"),price_scale=aac_field(options,"priceScale"),rounding=aac_field(options,"rounding");
  if(currency.t!=ASTR||currency.p->scope!=3)return aac_fail("ARYA_ACCOUNTING_CURRENCY","Specify a three-letter uppercase currency tag.",SIZE_MAX);
  for(int i=0;i<3;i++)if(currency.p->chars[i]<'A'||currency.p->chars[i]>'Z')return aac_fail("ARYA_ACCOUNTING_CURRENCY","Specify a three-letter uppercase currency tag.",SIZE_MAX);
  if(!ais_safe_integer(scale)||scale.n<0||scale.n>6)return aac_fail("ARYA_ACCOUNTING_SCALE","Specify a scale from zero to six.",SIZE_MAX);
  int mode=0;
  if(invoice){for(mode=0;mode<9;mode++)if(akey(rounding,aac_modes[mode]))break;if(mode==9)return aac_fail("ARYA_ACCOUNTING_ROUNDING","Specify a supported rounding mode explicitly.",SIZE_MAX);}
  if(!invoice||price_scale.t==AUNDEF)price_scale=scale;
  if(!ais_safe_integer(price_scale)||price_scale.n<scale.n||price_scale.n>6)return aac_fail("ARYA_ACCOUNTING_SCALE","priceScale must be between the money scale and six.",SIZE_MAX);
  AV r[4]={av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
  r[0]=arecord();aput(r[0],"currency",currency);aput(r[0],"scale",scale);aput(r[0],"length",an((double)rows.p->len));
  r[1]=alist(0,NULL);aput(r[0],"names",r[1]);r[0].p->scope=-2;
  r[2]=aac_new(invoice?1:2,rows.p->len*(invoice?sizeof(AACInvoice):sizeof(AACLedger)),r[0]);
  AACBatch *batch=(AACBatch*)r[2].p->external;batch->count=rows.p->len;batch->scale=(int)scale.n;batch->price_scale=(int)price_scale.n;batch->mode=mode;
  batch->divisor=1;for(int i=0;i<6+batch->price_scale-batch->scale;i++)batch->divisor*=10;
  size_t capacity=8;while(capacity<(batch->count<100000?batch->count:100000)*2)capacity*=2;
  uint32_t *ids=invoice?NULL:(uint32_t*)amemory(capacity*sizeof(uint32_t));
  for(size_t i=0;i<batch->count&&!afailed;i++){
    AV row=rows.p->data[i];
    if(!aac_object(row,invoice?line_keys:entry_keys,invoice?6:3,"Accounting rows must be records.",i))break;
    if(invoice){
      AACInvoice *line=(AACInvoice*)batch->storage+i;AV quantity=aac_field(row,"quantity");
      if(!aac_units(aac_field(row,"price"),batch->price_scale,0,i,&line->price))break;
      if(quantity.t==AUNDEF)line->quantity=1000000;else if(!aac_units(quantity,6,1,i,&line->quantity))break;
      if(!aac_rate(row,"discountBps","discountRate",1,i,&line->discount)||!aac_rate(row,"taxBps","taxRate",0,i,&line->tax))break;
    }else{
      AACLedger *entry=(AACLedger*)batch->storage+i;AV account=aac_field(row,"account");
      if(account.t!=ASTR||!account.p->scope||account.p->scope>128){aac_fail("ARYA_ACCOUNTING_INPUT","Account tags must be nonempty text of at most 128 UTF-16 units.",i);break;}
      int nonspace=0;for(int j=0;j<account.p->scope;j++)if(!aspace(account.p->chars[j])){nonspace=1;break;}
      if(!nonspace){aac_fail("ARYA_ACCOUNTING_INPUT","Account tags cannot contain only whitespace.",i);break;}
      size_t slot=(size_t)aac_hash(account)&(capacity-1);
      while(ids[slot]){AV existing=r[1].p->data[ids[slot]-1];if(existing.p->scope==account.p->scope&&!memcmp(existing.p->chars,account.p->chars,(size_t)account.p->scope*sizeof(uint16_t)))break;slot=(slot+1)&(capacity-1);}
      if(!ids[slot]){if(batch->accounts>=100000){aac_fail("ARYA_ACCOUNTING_LIMIT","Too many account groups.",i);break;}ids[slot]=(uint32_t)++batch->accounts;aappend_value(r[1],account);}
      entry->account=ids[slot]-1;
      if(!aac_units(aac_field(row,"debit"),batch->scale,1,i,&entry->debit)||!aac_units(aac_field(row,"credit"),batch->scale,1,i,&entry->credit))break;
    }
  }
  free(ids);r[1].p->scope=-2;AV result=afailed?av(AUNDEF):r[2];aunroot(&root);return result;
}
static AV aac_begin(AV prepared) {
  AACBatch *source=aac_batch(prepared,0);if(!source)return av(AUNDEF);
  AV result=aac_new(source->kind+2,source->kind==2?source->accounts*2*sizeof(AACWide):0,prepared);
  AACBatch *state=(AACBatch*)result.p->external;state->count=source->count;state->accounts=source->accounts;return result;
}
static AV aac_step(AV value,AV limit) {
  AACBatch *state=aac_batch(value,1);if(!state)return av(AUNDEF);
  if(!ais_safe_integer(limit)||limit.n<1||limit.n>1000000)return aac_fail("ARYA_ACCOUNTING_INPUT","Accounting chunk size must be from one to one million.",SIZE_MAX);
  AACBatch *source=(AACBatch*)value.p->parent.p->external;size_t end=state->position+(size_t)limit.n;if(end>state->count)end=state->count;
  for(size_t i=state->position;i<end;i++){
    if(source->kind==1){
      AACInvoice *line=(AACInvoice*)source->storage+i;
      AACWide gross=aac_round((AACWide)line->price*line->quantity,source->divisor,source->mode);
      if(!aac_fits(gross))return aac_fail("ARYA_ACCOUNTING_RANGE","A gross line amount exceeds signed 64-bit minor units.",i);
      AACWide discount=aac_round(gross*line->discount,1000000,source->mode),net=gross-discount;
      AACWide tax=aac_round(net*line->tax,1000000,source->mode),total=net+tax;
      if(!aac_fits(discount)||!aac_fits(net)||!aac_fits(tax)||!aac_fits(total))return aac_fail("ARYA_ACCOUNTING_RANGE","A calculated line amount exceeds signed 64-bit minor units.",i);
      state->invoice[0]+=gross;state->invoice[1]+=discount;state->invoice[2]+=net;state->invoice[3]+=tax;state->invoice[4]+=total;
    }else{
      AACLedger *entry=(AACLedger*)source->storage+i;AACWide *totals=(AACWide*)state->storage;
      totals[entry->account]+=entry->debit;totals[source->accounts+entry->account]+=entry->credit;
    }
  }
  state->position=end;return ab(end==state->count);
}
static AV aac_finish(AV value) {
  AACBatch *state=aac_batch(value,1);if(!state)return av(AUNDEF);
  if(state->position!=state->count)return aac_fail("ARYA_ACCOUNTING_INPUT","Accounting calculation is incomplete.",SIZE_MAX);
  AV prepared=value.p->parent;AACBatch *source=(AACBatch*)prepared.p->external;
  AV r[4]={value,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
  r[1]=arecord();aput(r[1],"currency",aac_field(prepared.p->parent,"currency"));aput(r[1],"scale",an(source->scale));aput(r[1],"backend",astr("native"));
  if(source->kind==1){
    aput(r[1],"lineCount",an((double)source->count));aput(r[1],"rounding",astr(aac_modes[source->mode]));aput(r[1],"priceScale",an(source->price_scale));aput(r[1],"quantityScale",an(6));aput(r[1],"policy",astr("line-v1"));
    const char *keys[]={"gross","discount","net","tax","total"};for(int i=0;i<5;i++)aput(r[1],keys[i],aac_format(state->invoice[i],source->scale));
  }else{
    AACWide debit=0,credit=0,*totals=(AACWide*)state->storage;AV names=aac_field(prepared.p->parent,"names");
    r[2]=alist(0,NULL);
    for(size_t i=0;i<source->accounts;i++){
      AACWide d=totals[i],c=totals[source->accounts+i];debit+=d;credit+=c;
      r[3]=arecord();aput(r[3],"account",names.p->data[i]);aput(r[3],"debit",aac_format(d,source->scale));aput(r[3],"credit",aac_format(c,source->scale));aput(r[3],"balance",aac_format(d-c,source->scale));r[3].p->scope=-2;aappend_value(r[2],r[3]);
    }
    r[2].p->scope=-2;aput(r[1],"accounts",r[2]);aput(r[1],"entryCount",an((double)source->count));aput(r[1],"debit",aac_format(debit,source->scale));aput(r[1],"credit",aac_format(credit,source->scale));aput(r[1],"difference",aac_format(debit-credit,source->scale));aput(r[1],"balanced",ab(debit==credit));
  }
  r[1].p->scope=-2;AV result=r[1];aunroot(&root);return result;
}
static AV aaccounting_operation(int id,int argc,AV *argv) {
  AV first=argc?argv[0]:av(AUNDEF),second=argc>1?argv[1]:av(AUNDEF);
  if(id==1800||id==1801)return aac_prepare(first,second,id==1800);
  if(id==1802){if(!aac_batch(first,0))return av(AUNDEF);return first.p->parent;}
  if(id==1803)return aac_begin(first);
  if(id==1804)return aac_step(first,second);
  if(id==1805)return aac_finish(first);
  return aac_fail("ARYA_ACCOUNTING_INPUT","Unknown accounting operation.",SIZE_MAX);
}
