/* Exact decimal standard library, backed by libmpdec. Apache-2.0 wrapper. */
#include <mpdecimal.h>
static AV acoded_error(const char *code,const char *message) {
  const char *name=(!strncmp(code,"ARYA_LIST_",10)||!strcmp(code,"ARYA_VALIDATION_SCHEMA")||!strcmp(code,"ARYA_LOG_CONFIG")||!strcmp(code,"ARYA_ASYNC_OPTIONS"))?"TypeError":(!strncmp(code,"ARYA_DECIMAL_",13)||!strcmp(code,"ARYA_DATETIME"))?"RangeError":"Error";
  afail(name,message);
  AV roots[2]={av(AUNDEF),av(AUNDEF)};ARoot r;aroot(&r,roots,2);
  roots[0]=astr("code");roots[1]=astr(code);aset(aerror,roots[0],roots[1]);aunroot(&r);return av(AUNDEF);
}
static void adcontext(mpd_context_t *ctx) {
  mpd_defaultcontext(ctx);ctx->prec=4096;ctx->emax=4096;ctx->emin=-4096;ctx->round=MPD_ROUND_HALF_UP;ctx->traps=0;
}
static mpd_t *adread(AV value,mpd_context_t *ctx) {
  if(value.t!=ASTR||value.p->scope<1||value.p->scope>1024){acoded_error("ARYA_DECIMAL_INPUT","Use a finite decimal string of at most 1024 characters.");return NULL;}
  char *s=autf8(value);size_t i=s[0]=='-'?1:0,begin=i;
  if(s[i]=='0')i++;else if(s[i]>='1'&&s[i]<='9'){while(s[i]>='0'&&s[i]<='9')i++;}
  if(i==begin){free(s);acoded_error("ARYA_DECIMAL_INPUT","Invalid decimal input.");return NULL;}
  if(s[i]=='.'){i++;begin=i;while(s[i]>='0'&&s[i]<='9')i++;if(i==begin){free(s);acoded_error("ARYA_DECIMAL_INPUT","Invalid decimal fraction.");return NULL;}}
  if(s[i]||i!=(size_t)value.p->scope){free(s);acoded_error("ARYA_DECIMAL_INPUT","Decimal grouping, exponents and nondecimal digits are not accepted.");return NULL;}
  mpd_t *d=mpd_qnew();uint32_t status=0;
  if(d)mpd_qset_string(d,s,ctx,&status);free(s);
  if(!d||status&(MPD_Errors)){if(d)mpd_del(d);acoded_error("ARYA_DECIMAL_RANGE","Cannot represent decimal.");return NULL;}return d;
}
static int adround(AV mode,int negative) {
  const char *names[]={"up","down","ceil","floor","half-up","half-down","half-even","half-ceil","half-floor"};
  int modes[]={MPD_ROUND_UP,MPD_ROUND_DOWN,MPD_ROUND_CEILING,MPD_ROUND_FLOOR,MPD_ROUND_HALF_UP,MPD_ROUND_HALF_DOWN,MPD_ROUND_HALF_EVEN,
    negative?MPD_ROUND_HALF_DOWN:MPD_ROUND_HALF_UP,negative?MPD_ROUND_HALF_UP:MPD_ROUND_HALF_DOWN};
  for(int i=0;i<9;i++)if(akey(mode,names[i]))return modes[i];
  acoded_error("ARYA_DECIMAL_ROUNDING","Choose an explicit supported rounding mode.");return -1;
}
static AV adtext(mpd_t *d,mpd_context_t *ctx,int fixed,int preserve_negative_zero) {
  if(!mpd_isfinite(d))return acoded_error("ARYA_DECIMAL_RANGE","Nonfinite decimal result.");
  uint32_t status=0;char *text=mpd_qformat(d,"f",ctx,&status);
  if(!text)return acoded_error("ARYA_DECIMAL_RANGE","Cannot serialize decimal.");
  if(!fixed){char *point=strchr(text,'.');if(point){char *end=text+strlen(text)-1;while(end>point&&*end=='0')*end--=0;if(end==point)*end=0;}}
  if(mpd_iszero(d)&&text[0]=='-'&&!preserve_negative_zero)memmove(text,text+1,strlen(text));
  AV result=strlen(text)>1024?acoded_error("ARYA_DECIMAL_RANGE","Decimal result exceeds 1024 characters."):astr(text);mpd_free(text);return result;
}
/* Checked fixed-scale integer path. A miss is silent and falls back to the
 * same libmpdec contract, including input validation and arbitrary precision. */
typedef struct {int64_t units;int scale,negative;} ADSmall;
static const int64_t adpowers[]={1,10,100,1000,10000,100000,1000000,10000000,100000000,1000000000,10000000000LL,100000000000LL,1000000000000LL,10000000000000LL,100000000000000LL,1000000000000000LL,10000000000000000LL,100000000000000000LL,1000000000000000000LL};
static int adsmall(AV value,ADSmall *out) {
  if(value.t!=ASTR||value.p->scope<1||value.p->scope>1024)return 0;
  const uint16_t *s=value.p->chars;size_t n=(size_t)value.p->scope,i=0;int negative=s[0]=='-',scale=0,point=0;uint64_t magnitude=0;
  if(negative)i++;if(i==n||s[i]<'0'||s[i]>'9')return 0;
  if(s[i]=='0'&&i+1<n&&s[i+1]!='.')return 0;
  uint64_t limit=negative?((uint64_t)INT64_MAX+1):(uint64_t)INT64_MAX;
  for(;i<n;i++){unsigned c=s[i];if(c=='.'&&!point){point=1;if(i+1==n)return 0;continue;}if(c<'0'||c>'9')return 0;unsigned digit=c-'0';if(magnitude>(limit-digit)/10)return 0;magnitude=magnitude*10+digit;if(point&&++scale>18)return 0;}
  out->units=negative?(magnitude==(uint64_t)INT64_MAX+1?INT64_MIN:-(int64_t)magnitude):(int64_t)magnitude;out->scale=scale;out->negative=negative;return 1;
}
static uint64_t adunsigned(int64_t value){return value<0?(uint64_t)(-(value+1))+1:(uint64_t)value;}
static AV adsmall_text(int64_t units,int scale,int fixed,int negative_zero) {
  int negative=units<0||(units==0&&negative_zero);uint64_t magnitude=adunsigned(units);
  if(!fixed){while(scale&&magnitude%10==0){magnitude/=10;scale--;}if(!magnitude)negative=0;}
  /* Decimal coefficients contain ASCII only. Build UTF-16 directly rather
   * than formatting through stdio and decoding the result back from UTF-8. */
  uint16_t reverse[20],digits[20],text[64];int count=0;size_t at=0;
  do{reverse[count++]=(uint16_t)('0'+magnitude%10);magnitude/=10;}while(magnitude);
  for(int i=0;i<count;i++)digits[i]=reverse[count-i-1];
  if(negative)text[at++]='-';
  if(count<=scale){text[at++]='0';if(scale)text[at++]='.';for(int i=count;i<scale;i++)text[at++]='0';memcpy(text+at,digits,(size_t)count*sizeof(uint16_t));at+=(size_t)count;}
  else {int whole=count-scale;memcpy(text+at,digits,(size_t)whole*sizeof(uint16_t));at+=(size_t)whole;if(scale){text[at++]='.';memcpy(text+at,digits+whole,(size_t)scale*sizeof(uint16_t));at+=(size_t)scale;}}
  return as16(text,at);
}
static int adsmall_round(int64_t numerator,int64_t denominator,int rounding,int64_t *out) {
  if(!denominator||(numerator==INT64_MIN&&denominator==-1))return 0;
  int64_t quotient=numerator/denominator,remainder=numerator%denominator;int negative=(numerator<0)^(denominator<0),away=0;
  uint64_t rem=adunsigned(remainder),divisor=adunsigned(denominator);
  if(rem){
    if(rounding==MPD_ROUND_UP)away=1;
    else if(rounding==MPD_ROUND_CEILING)away=!negative;
    else if(rounding==MPD_ROUND_FLOOR)away=negative;
    /* Compare without doubling a potentially 2^63 denominator/remainder. */
    else if(rounding==MPD_ROUND_HALF_UP)away=rem>=divisor-rem;
    else if(rounding==MPD_ROUND_HALF_DOWN)away=rem>divisor-rem;
    else if(rounding==MPD_ROUND_HALF_EVEN)away=rem>divisor-rem||(rem==divisor-rem&&(quotient%2!=0));
  }
  if(away&&__builtin_add_overflow(quotient,negative?-1LL:1LL,&quotient))return 0;*out=quotient;return 1;
}
static int adsmall_decimal(int id,int argc,AV *argv,AV *out) {
  if(id==107)return 0;
  int binary=id>=101&&id<=105;ADSmall a,b={0};if(argc<(binary?2:1)||!adsmall(argv[0],&a)||(binary&&!adsmall(argv[1],&b)))return 0;
  int64_t left=a.units,right=b.units,result=0;int scale=a.scale;
  if(id==100){*out=adsmall_text(left,scale,0,0);return 1;}
  if(id==101||id==102||id==104){scale=a.scale>b.scale?a.scale:b.scale;
    if(__builtin_mul_overflow(left,adpowers[scale-a.scale],&left)||__builtin_mul_overflow(right,adpowers[scale-b.scale],&right))return 0;
    if(id==104){*out=an(left<right?-1:left>right?1:0);return 1;}
    if(id==101?__builtin_add_overflow(left,right,&result):__builtin_sub_overflow(left,right,&result))return 0;
  }else if(id==103){scale=a.scale+b.scale;if(scale>18||__builtin_mul_overflow(left,right,&result))return 0;
  }else if(id==105||id==106){int place=id==105?2:1,mode=place+1;
    if(argc<=mode||argv[place].t!=ANUM||!isfinite(argv[place].n)||argv[place].n<0||argv[place].n>100||floor(argv[place].n)!=argv[place].n)return 0;
    scale=(int)argv[place].n;if(scale>18)return 0;
    int rounding=adround(argv[mode],a.negative^(id==105?b.negative:0));if(rounding<0){*out=av(AUNDEF);return 1;}
    if(id==105){if(!right){*out=acoded_error("ARYA_DECIMAL_ZERO","Decimal division by zero.");return 1;}int power=scale+b.scale-a.scale;
      if(power>=0){if(power>18||__builtin_mul_overflow(left,adpowers[power],&left))return 0;}
      else if(-power>18||__builtin_mul_overflow(right,adpowers[-power],&right))return 0;
      if(!adsmall_round(left,right,rounding,&result))return 0;
    }else if(scale>=a.scale){
      /* A validated fixed-scale string is already the quantized output.
       * Negative zero still needs the established normalization below. */
      if(scale==a.scale&&!(a.negative&&!a.units)){*out=argv[0];return 1;}
      if(__builtin_mul_overflow(left,adpowers[scale-a.scale],&result))return 0;
    }
    else if(!adsmall_round(left,adpowers[a.scale-scale],rounding,&result))return 0;
    *out=adsmall_text(result,scale,id==106,id==106&&a.negative&&a.units!=0);return 1;
  }else return 0;
  *out=adsmall_text(result,scale,0,0);return 1;
}
static AV adecimal(int id,int argc,AV *argv) {
  AV fast;if(adsmall_decimal(id,argc,argv,&fast)){ACOUNT(decimal_fast_paths);return fast;}
  mpd_context_t ctx;adcontext(&ctx);uint32_t status=0;
  int binary=id==101||id==102||id==103||id==104||id==105;
  if(argc<(binary?2:1))return acoded_error("ARYA_DECIMAL_INPUT","Missing decimal argument.");
  mpd_t *a=adread(argv[0],&ctx),*b=NULL,*result=NULL;
  if(!a)return av(AUNDEF);
  if(binary){b=adread(argv[1],&ctx);if(!b){mpd_del(a);return av(AUNDEF);}}
  AV output=av(AUNDEF);
  if(id==104){int order=mpd_qcmp(a,b,&status);output=status&MPD_Errors?acoded_error("ARYA_DECIMAL_RANGE","Decimal comparison failed."):an(order);goto done;}
  result=mpd_qnew();
  if(!result){output=acoded_error("ARYA_DECIMAL_RANGE","Cannot allocate decimal result.");goto done;}
  if(id==100){mpd_qcopy(result,a,&status);}
  else if(id==101)mpd_qadd(result,a,b,&ctx,&status);
  else if(id==102)mpd_qsub(result,a,b,&ctx,&status);
  else if(id==103)mpd_qmul(result,a,b,&ctx,&status);
  else if(id==105||id==106){
    int place_at=id==105?2:1,mode_at=place_at+1;
    if(argc<=place_at||argv[place_at].t!=ANUM||argv[place_at].n<0||argv[place_at].n>100||floor(argv[place_at].n)!=argv[place_at].n){output=acoded_error("ARYA_DECIMAL_PLACES","Decimal places must be an integer from 0 to 100.");goto done;}
    int negative=mpd_isnegative(a)^(id==105?mpd_isnegative(b):0),round=adround(argc>mode_at?argv[mode_at]:av(AUNDEF),negative);
    if(round<0)goto done;
    if(id==105){if(mpd_iszero(b)){output=acoded_error("ARYA_DECIMAL_ZERO","Decimal division by zero.");goto done;}mpd_qdiv(result,a,b,&ctx,&status);}
    else mpd_qcopy(result,a,&status);
    ctx.round=round;mpd_qrescale(result,result,-(mpd_ssize_t)argv[place_at].n,&ctx,&status);
    if(status&MPD_Errors){output=acoded_error("ARYA_DECIMAL_RANGE","Decimal arithmetic failed.");goto done;}
    output=adtext(result,&ctx,id==106,id==106&&mpd_isnegative(a)&&!mpd_iszero(a));goto done;
  } else if(id==107){
    char *text=mpd_to_sci(a,0);if(!text){output=acoded_error("ARYA_DECIMAL_RANGE","Cannot convert decimal.");goto done;}
    double number=strtod(text,NULL);mpd_free(text);char encoded[128];aformat_number(number,encoded);
    mpd_qset_string(result,encoded,&ctx,&status);
    mpd_t *limit=mpd_qnew();if(!limit){output=acoded_error("ARYA_DECIMAL_RANGE","Cannot allocate decimal bound.");goto done;}
    mpd_qset_string(limit,mpd_isnegative(a)?"-9007199254740991":"9007199254740991",&ctx,&status);
    int bound=mpd_qcmp(a,limit,&status),same=mpd_qcmp(a,result,&status)==0;mpd_del(limit);
    if(!isfinite(number)||!same||(mpd_isnegative(a)?bound<0:bound>0))output=acoded_error("ARYA_DECIMAL_PRECISION","Decimal cannot round trip through number.");else output=an(number);goto done;
  }
  if(status&MPD_Errors)output=acoded_error("ARYA_DECIMAL_RANGE","Decimal arithmetic failed.");else output=adtext(result,&ctx,0,0);
done:
  if(result)mpd_del(result);if(b)mpd_del(b);mpd_del(a);return output;
}
/* Opaque immutable values own exactly one libmpdec allocation. No mpd_t or
 * runtime layout crosses a public binding. Only explicit format converts to
 * text; arithmetic and comparisons borrow rooted operands. */
static void advalue_finalize(AH *h){mpd_del((mpd_t*)h->external);}
static mpd_t *advalue_get(AV value){
  if(value.t==AHANDLE&&value.p->name&&!strcmp(value.p->name,"arya.decimal"))return (mpd_t*)value.p->external;
  acoded_error("ARYA_DECIMAL_INPUT","Expected a parsed decimal value.");return NULL;
}
static int advalue_fits(const mpd_t *d,int fixed,int negative_zero) {
  if(!mpd_isfinite(d))return 0;
  mpd_ssize_t digits=d->digits,exponent=d->exp;
  if(!fixed){if(mpd_iszero(d))return 1;mpd_ssize_t zeros=mpd_trail_zeros(d);if(zeros>=digits)zeros=digits-1;digits-=zeros;exponent+=zeros;}
  mpd_ssize_t whole=digits+exponent;
  mpd_ssize_t length=exponent>=0?whole:whole>0?digits+1:2-exponent;
  if(mpd_isnegative(d)&&(!mpd_iszero(d)||negative_zero))length++;
  return length<=1024;
}
static AV advalue_wrap(mpd_t *owned,int fixed,int negative_zero) {
  if(!advalue_fits(owned,fixed,negative_zero)){mpd_del(owned);return acoded_error("ARYA_DECIMAL_RANGE","Decimal result exceeds 1024 characters.");}
  AH *h=aalloc(AHANDLE,0);h->name="arya.decimal";h->external=owned;h->finalize=advalue_finalize;h->flags=(fixed?8:0)|(negative_zero?16:0);return ap(h);
}
static AV advalue_json(AV value,int argc,AV *argv){(void)argc;(void)argv;mpd_context_t ctx;adcontext(&ctx);return adtext((mpd_t*)value.p->external,&ctx,!!(value.p->flags&8),!!(value.p->flags&16));}
static AV advalue_property(AV value,AV key){return akey(key,"toJSON")?afunction(advalue_json,value,"decimal.toJSON"):av(AUNDEF);}
static AV adecimal_values(int id,int argc,AV *argv) {
  mpd_context_t ctx;adcontext(&ctx);uint32_t status=0;
  if(!argc)return acoded_error("ARYA_DECIMAL_INPUT","Missing decimal argument.");
  if(id==110){mpd_t *parsed=adread(argv[0],&ctx);return parsed?advalue_wrap(parsed,0,0):av(AUNDEF);}
  mpd_t *a=advalue_get(argv[0]);if(!a)return av(AUNDEF);
  if(id==111)return advalue_json(argv[0],0,NULL);
  if(id==118){AV text=advalue_json(argv[0],0,NULL);ARoot root;aroot(&root,&text,1);AV result=afailed?av(AUNDEF):adecimal(107,1,&text);aunroot(&root);return result;}
  int binary=id>=112&&id<=116;mpd_t *b=NULL;
  if(binary){if(argc<2)return acoded_error("ARYA_DECIMAL_INPUT","Missing decimal argument.");b=advalue_get(argv[1]);if(!b)return av(AUNDEF);}
  if(id==115){int order=mpd_qcmp(a,b,&status);return status&MPD_Errors?acoded_error("ARYA_DECIMAL_RANGE","Decimal comparison failed."):an(order);}
  int fixed=0,negative_zero=0;mpd_t *result=mpd_qnew();if(!result)return acoded_error("ARYA_DECIMAL_RANGE","Cannot allocate decimal result.");
  if(id==112)mpd_qadd(result,a,b,&ctx,&status);
  else if(id==113)mpd_qsub(result,a,b,&ctx,&status);
  else if(id==114)mpd_qmul(result,a,b,&ctx,&status);
  else if(id==116||id==117){int place=id==116?2:1,mode=place+1;
    if(argc<=place||argv[place].t!=ANUM||!isfinite(argv[place].n)||argv[place].n<0||argv[place].n>100||floor(argv[place].n)!=argv[place].n){mpd_del(result);return acoded_error("ARYA_DECIMAL_PLACES","Decimal places must be an integer from 0 to 100.");}
    int negative=mpd_isnegative(a)^(id==116?mpd_isnegative(b):0),round=adround(argc>mode?argv[mode]:av(AUNDEF),negative);
    if(round<0){mpd_del(result);return av(AUNDEF);}
    if(id==116){if(mpd_iszero(b)){mpd_del(result);return acoded_error("ARYA_DECIMAL_ZERO","Decimal division by zero.");}mpd_qdiv(result,a,b,&ctx,&status);}
    else {mpd_qcopy(result,a,&status);fixed=1;negative_zero=mpd_isnegative(a)&&!mpd_iszero(a);}
    ctx.round=round;mpd_qrescale(result,result,-(mpd_ssize_t)argv[place].n,&ctx,&status);
  }else {mpd_del(result);return acoded_error("ARYA_DECIMAL_INPUT","Unknown parsed decimal operation.");}
  if(status&MPD_Errors){mpd_del(result);return acoded_error("ARYA_DECIMAL_RANGE","Decimal arithmetic failed.");}
  return advalue_wrap(result,fixed,negative_zero);
}
/* Exact binary64 rounding for common fixed formats. Multiplying the binary
 * significand by 5^places, then shifting by exponent+places, computes the
 * rational value*10^places without a floating-point rounding step. Remainders
 * at or above one half round away from zero, as the existing libmpdec path.
 * Unsupported widths/scales fall back without changing the public contract. */
static int anumber_fixed_small(double value,int places,AV *out) {
#if defined(__SIZEOF_INT128__)
  if(places>18)return 0;
  uint64_t bits;memcpy(&bits,&value,sizeof(bits));
  unsigned encoded=(unsigned)((bits>>52)&2047);
  uint64_t significand=bits&UINT64_C(0xfffffffffffff);
  int exponent=-1074;
  if(encoded){significand|=UINT64_C(0x10000000000000);exponent=(int)encoded-1023-52;}
  __uint128_t scaled=significand;
  for(int i=0;i<places;i++)scaled*=5;
  int shift=exponent+places;
  if(shift>=0){
    if(shift>=128||scaled>((~(__uint128_t)0)>>shift))return 0;
    scaled<<=shift;
  }else {
    unsigned discarded=(unsigned)-shift;
    /* At most 95 numerator bits: shifts beyond 128 cannot reach half. */
    if(discarded>128)scaled=0;
    else {
      int round=(scaled&((__uint128_t)1<<(discarded-1)))!=0;
      scaled=discarded==128?0:scaled>>discarded;
      if(round)scaled++;
    }
  }
  uint16_t reverse[40],digits[40],text[64];int count=0;size_t at=0;
  do{reverse[count++]=(uint16_t)('0'+scaled%10);scaled/=10;}while(scaled);
  for(int i=0;i<count;i++)digits[i]=reverse[count-i-1];
  /* Negative zero formats as zero; a negative nonzero value rounded to zero
   * retains its minus sign. This deliberately tests value<0, not signbit. */
  if(value<0)text[at++]='-';
  if(count<=places){text[at++]='0';if(places)text[at++]='.';for(int i=count;i<places;i++)text[at++]='0';memcpy(text+at,digits,(size_t)count*sizeof(uint16_t));at+=(size_t)count;}
  else {int whole=count-places;memcpy(text+at,digits,(size_t)whole*sizeof(uint16_t));at+=(size_t)whole;if(places){text[at++]='.';memcpy(text+at,digits+whole,(size_t)places*sizeof(uint16_t));at+=(size_t)places;}}
  *out=as16(text,at);return 1;
#else
  (void)value;(void)places;(void)out;return 0;
#endif
}
/* Round the exact binary64 value times 10^places, never a rounded floating
 * multiplication. toFixed chooses the larger magnitude on an exact half tie.
 * A uint64 path covers common scales; a bounded stack integer handles all
 * remaining finite values below 1e21 and places 0..100 (at most 403 bits).
 * Neither path depends on libc's rounding mode, locale, or decimal precision. */
static AV afixed_text(const uint16_t *reverse,size_t count,int places,int negative) {
  uint16_t text[124];size_t at=0;
  if(negative)text[at++]='-';
  if(count<=(size_t)places){text[at++]='0';if(places)text[at++]='.';for(size_t i=count;i<(size_t)places;i++)text[at++]='0';}
  for(size_t i=count;i;i--){text[at++]=reverse[i-1];if(i==(size_t)places+1&&places)text[at++]='.';}
  return as16(text,at);
}
/* Exact common coefficient shared by ordinary formatting and the guarded
 * Number(toFixed(...)) lowering. Failure retains the existing wide path. */
static int afixed_coefficient64(double value,int places,uint64_t *rounded) {
  if(places<0||places>18)return 0;
  uint64_t bits;memcpy(&bits,&value,sizeof(bits));
  unsigned exponent=(unsigned)((bits>>52)&2047);
  uint64_t significand=bits&0xfffffffffffffULL;
  int shift=(exponent?(int)exponent-1075:-1074)+places;
  if(exponent)significand|=1ULL<<52;
  static const uint64_t five[]={1,5,25,125,625,3125,15625,78125,390625,1953125,9765625,48828125,244140625,1220703125,6103515625ULL,30517578125ULL,152587890625ULL,762939453125ULL,3814697265625ULL};
  if(significand>UINT64_MAX/five[places])return 0;
  uint64_t scaled=significand*five[places];
  if(shift>=0){if(shift>=64||scaled>(UINT64_MAX>>shift))return 0;*rounded=scaled<<shift;}
  else {unsigned right=(unsigned)-shift;*rounded=right<64?scaled>>right:0;if(right<=64)*rounded+=(scaled>>(right-1))&1;}
  return 1;
}
static AV anumber_fixed(double value,int places) {
  uint16_t reverse[122];size_t count=0;uint64_t rounded;
  if(afixed_coefficient64(value,places,&rounded)){
    do{reverse[count++]=(uint16_t)('0'+rounded%10);rounded/=10;}while(rounded);
    ACOUNT(tofixed_fast_paths);return afixed_text(reverse,count,places,value<0);
  }
  AV small;if(anumber_fixed_small(value,places,&small)){ACOUNT(tofixed_fast_paths);return small;}
  uint64_t bits;memcpy(&bits,&value,sizeof(bits));
  unsigned exponent=(unsigned)((bits>>52)&2047);
  uint64_t significand=bits&0xfffffffffffffULL;
  int shift=(exponent?(int)exponent-1075:-1074)+places;
  if(exponent)significand|=1ULL<<52;
  /* 16 limbs leave room above the maximum 403-bit rounded coefficient.
   * Subnormals can require a right shift of 1074: bits beyond the coefficient
   * are zero, so they round to zero without shifting by an invalid C width. */
  uint32_t limbs[16]={0};size_t used=significand>>32?2:1;
  limbs[0]=(uint32_t)significand;limbs[1]=(uint32_t)(significand>>32);
  for(int i=0;i<places;i++){uint64_t carry=0;for(size_t j=0;j<used;j++){uint64_t product=(uint64_t)limbs[j]*5+carry;limbs[j]=(uint32_t)product;carry=product>>32;}if(carry)limbs[used++]=(uint32_t)carry;}
  if(shift>=0){
    unsigned words=(unsigned)shift/32,part=(unsigned)shift%32;
    if(words){for(size_t i=used;i;i--)limbs[i-1+words]=limbs[i-1];memset(limbs,0,words*sizeof(uint32_t));used+=words;}
    if(part){uint32_t carry=0;for(size_t i=0;i<used;i++){uint64_t next=((uint64_t)limbs[i]<<part)|carry;limbs[i]=(uint32_t)next;carry=(uint32_t)(next>>32);}if(carry)limbs[used++]=carry;}
  }else{
    unsigned right=(unsigned)-shift,words=right/32,part=right%32,half=(right-1)/32;
    int up=half<used&&((limbs[half]>>((right-1)%32))&1);
    size_t remaining=words<used?used-words:0;
    for(size_t i=0;i<remaining;i++){uint32_t next=limbs[i+words]>>part;if(part&&i+words+1<used)next|=limbs[i+words+1]<<(32-part);limbs[i]=next;}
    used=remaining;if(!used){used=1;limbs[0]=0;}
    if(up){size_t i=0;while(i<used&&++limbs[i]==0)i++;if(i==used)limbs[used++]=1;}
  }
  while(used>1&&!limbs[used-1])used--;
  /* Divide by 1e9, emitting each remainder backwards with zero padding. */
  do{uint64_t remainder=0;for(size_t i=used;i;i--){uint64_t next=(remainder<<32)|limbs[i-1];limbs[i-1]=(uint32_t)(next/1000000000);remainder=next%1000000000;}
    while(used>1&&!limbs[used-1])used--;
    int more=used>1||limbs[0]!=0;
    for(int i=0;i<9;i++){reverse[count++]=(uint16_t)('0'+remainder%10);remainder/=10;if(!more&&!remainder)break;}
  }while(used>1||limbs[0]);
  ACOUNT(tofixed_fallbacks);return afixed_text(reverse,count,places,value<0);
}
/* Immediate calls keep receiver/key/arguments in the generated caller's roots.
 * Detached methods retain their bound environment and share this implementation. */
static AV anumber_invoke(double value,AV key,int argc,AV *argv) {
  if(akey(key,"toString")){double base=argc&&argv[0].t!=AUNDEF?ainteger(argv[0]):10;if(!isfinite(base)||base<2||base>36)return afail("RangeError","Numeric radix must be from 2 to 36.");if(base==10||!isfinite(value)||value==0)return atostring(an(value));if(trunc(value)!=value||fabs(value)>9007199254740991.0)return afail("RangeError","Nondecimal radix formatting requires a safe integer in the native profile.");uint64_t number=(uint64_t)fabs(value);char buffer[66];size_t at=sizeof(buffer);buffer[--at]=0;do{buffer[--at]="0123456789abcdefghijklmnopqrstuvwxyz"[number%(uint64_t)base];number/=(uint64_t)base;}while(number);if(value<0)buffer[--at]='-';return astr(buffer+at);}
  double places=argc?atonumber(argv[0]):0;if(isnan(places))places=0;places=trunc(places);
  if(!isfinite(places)||places<0||places>100)return afail("RangeError","toFixed places must be from 0 to 100.");
  if(!isfinite(value)||fabs(value)>=1e21)return atostring(an(value));
  return anumber_fixed(value,(int)places);
}
static AV anumber_method(AV env,int argc,AV *argv) {
  return anumber_invoke(env.p->data[0].n,env.p->data[1],argc,argv);
}
/* These two helpers preserve separate inner/outer source locations and depth
 * checks. All AV inputs are already rooted in the generated caller's slots.
 * Only a known builtin Number can consume the virtual string. The fallback
 * keeps the originally selected method and performs ordinary conversion. */
static AV anumber_global_call(AV env,int argc,AV *argv);
#include <fenv.h>
#include <locale.h>
static AV afixed_number_prepare(AV number,AV method,AV object,AV key,int direct,int argc,AV *argv,int *folded) {
  *folded=0;
  if(number.t==AFUNC&&number.p->code==anumber_global_call&&number.p->parent.t==ANUM&&number.p->parent.n==0&&direct&&object.t==ANUM&&akey(key,"toFixed")&&isfinite(object.n)&&fabs(object.n)<1e21&&(!argc||argv[0].t==ANUM||argv[0].t==AUNDEF)){
    double places=argc&&argv[0].t==ANUM?argv[0].n:0;
    if(isnan(places))places=0;places=trunc(places);
    uint64_t coefficient;
    if(isfinite(places)&&places>=0&&places<=18&&afixed_coefficient64(object.n,(int)places,&coefficient)){
      ACOUNT(direct_calls);if(!acall_enter())return av(AUNDEF);
#if FLT_EVAL_METHOD == 0 && !defined(__FAST_MATH__)
      /* Every 10^p through p=18 is exactly representable in binary64. With
       * a coefficient <=2^53 both operands are exact, so one nearest-rounded
       * division has the same result as parsing the exact decimal rational.
       * Keep strtod for directed rounding, non-dot locales, and wide values.
       * Negate before division to preserve a rounded negative zero. */
      if(coefficient<=9007199254740992ULL&&fegetround()==FE_TONEAREST){
        const char *point=localeconv()->decimal_point;
        if(point[0]=='.'&&point[1]==0){
          static const double tens[]={1.,10.,100.,1000.,10000.,100000.,1000000.,10000000.,100000000.,1000000000.,10000000000.,100000000000.,1000000000000.,10000000000000.,100000000000000.,1000000000000000.,10000000000000000.,100000000000000000.,1000000000000000000.};
          double signed_coefficient=(double)coefficient;
          if(object.n<0)signed_coefficient=-signed_coefficient;
          AV result=an(signed_coefficient/tens[(int)places]);adepth--;*folded=1;return result;
        }
      }
#endif
      char reverse[24],text[64];size_t count=0,at=0;int scale=(int)places;
      do{reverse[count++]=(char)('0'+coefficient%10);coefficient/=10;}while(coefficient);
      if(object.n<0)text[at++]='-';
      if(count<=(size_t)scale){text[at++]='0';if(scale)text[at++]='.';for(size_t i=count;i<(size_t)scale;i++)text[at++]='0';}
      for(size_t i=count;i;i--){text[at++]=reverse[i-1];if(i==(size_t)scale+1&&scale)text[at++]='.';}
      text[at]=0;
      /* Parse the same exact ASCII decimal as Number would. A coefficient
       * outside the exact conversion guard must never be rounded to double. */
      AV result=an(strtod(text,NULL));adepth--;*folded=1;return result;
    }
  }
  return aimmediate_call(method,object,key,direct,argc,argv);
}
static AV afixed_number_finish(AV number,AV value,int folded) {
  if(!folded)return acall_rooted(number,1,&value);
  ACOUNT(direct_calls);if(!acall_enter())return av(AUNDEF);
  adepth--;return value;
}
