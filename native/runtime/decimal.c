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
  char digits[32],text[64];int count=snprintf(digits,sizeof(digits),"%llu",(unsigned long long)magnitude);size_t at=0;
  if(negative)text[at++]='-';
  if(count<=scale){text[at++]='0';if(scale)text[at++]='.';for(int i=count;i<scale;i++)text[at++]='0';memcpy(text+at,digits,(size_t)count);at+=(size_t)count;}
  else {int whole=count-scale;memcpy(text+at,digits,(size_t)whole);at+=(size_t)whole;if(scale){text[at++]='.';memcpy(text+at,digits+whole,(size_t)scale);at+=(size_t)scale;}}
  return astrn(text,at);
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
    }else if(scale>=a.scale){if(__builtin_mul_overflow(left,adpowers[scale-a.scale],&result))return 0;}
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
    if(argc<=mode_at||argv[place_at].t!=ANUM||argv[place_at].n<0||argv[place_at].n>100||floor(argv[place_at].n)!=argv[place_at].n){output=acoded_error("ARYA_DECIMAL_PLACES","Decimal places must be an integer from 0 to 100.");goto done;}
    int negative=mpd_isnegative(a)^(id==105?mpd_isnegative(b):0),round=adround(argv[mode_at],negative);
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
    if(argc<=mode||argv[place].t!=ANUM||!isfinite(argv[place].n)||argv[place].n<0||argv[place].n>100||floor(argv[place].n)!=argv[place].n){mpd_del(result);return acoded_error("ARYA_DECIMAL_PLACES","Decimal places must be an integer from 0 to 100.");}
    int negative=mpd_isnegative(a)^(id==116?mpd_isnegative(b):0),round=adround(argv[mode],negative);
    if(round<0){mpd_del(result);return av(AUNDEF);}
    if(id==116){if(mpd_iszero(b)){mpd_del(result);return acoded_error("ARYA_DECIMAL_ZERO","Decimal division by zero.");}mpd_qdiv(result,a,b,&ctx,&status);}
    else {mpd_qcopy(result,a,&status);fixed=1;negative_zero=mpd_isnegative(a)&&!mpd_iszero(a);}
    ctx.round=round;mpd_qrescale(result,result,-(mpd_ssize_t)argv[place].n,&ctx,&status);
  }else {mpd_del(result);return acoded_error("ARYA_DECIMAL_INPUT","Unknown parsed decimal operation.");}
  if(status&MPD_Errors){mpd_del(result);return acoded_error("ARYA_DECIMAL_RANGE","Decimal arithmetic failed.");}
  return advalue_wrap(result,fixed,negative_zero);
}
static AV anumber_method(AV env,int argc,AV *argv) {
  double value=env.p->data[0].n;AV key=env.p->data[1];
  if(akey(key,"toString")){double base=argc&&argv[0].t!=AUNDEF?ainteger(argv[0]):10;if(!isfinite(base)||base<2||base>36)return afail("RangeError","Numeric radix must be from 2 to 36.");if(base==10||!isfinite(value)||value==0)return atostring(an(value));if(trunc(value)!=value||fabs(value)>9007199254740991.0)return afail("RangeError","Nondecimal radix formatting requires a safe integer in the native profile.");uint64_t number=(uint64_t)fabs(value);char buffer[66];size_t at=sizeof(buffer);buffer[--at]=0;do{buffer[--at]="0123456789abcdefghijklmnopqrstuvwxyz"[number%(uint64_t)base];number/=(uint64_t)base;}while(number);if(value<0)buffer[--at]='-';return astr(buffer+at);}
  double places=argc?atonumber(argv[0]):0;if(isnan(places))places=0;places=trunc(places);
  if(!isfinite(places)||places<0||places>100)return afail("RangeError","toFixed places must be from 0 to 100.");
  if(!isfinite(value)||fabs(value)>=1e21)return atostring(an(value));
  char exact[1600];snprintf(exact,sizeof(exact),"%.1074f",value);
  mpd_context_t ctx;adcontext(&ctx);uint32_t status=0;mpd_t *number=mpd_qnew();if(!number)return afail("Error","Cannot allocate decimal formatting context.");
  mpd_qset_string(number,exact,&ctx,&status);mpd_qrescale(number,number,-(mpd_ssize_t)places,&ctx,&status);
  AV result=status&MPD_Errors?afail("RangeError","Cannot format number."):adtext(number,&ctx,1,value<0);mpd_del(number);return result;
}
