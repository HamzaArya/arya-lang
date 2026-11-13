/* Native binary64 Math operations; exact accounting remains in decimal.c. */
static uint32_t auint32(double n){return !isfinite(n)||!n?0:(uint32_t)(int64_t)fmod(trunc(n),4294967296.0);}
static double ahalf(double n){double a=fabs(n);if(!isfinite(a)||a==0)return n;if(a>=65520)return copysign(INFINITY,n);if(a<0x1p-14)return copysign(nearbyint(a*0x1p24)*0x1p-24,n);int e;frexp(a,&e);return copysign(ldexp(nearbyint(ldexp(a,11-e)),e-11),n);}
/* Refill in bounded batches, retaining OS entropy without a per-number FILE
 * allocation or buffered read that discards almost all of its entropy. */
static int arandom_number(uint64_t *value) {
  static uint64_t pool[512];static size_t available;static pid_t owner;
  if(owner!=getpid()){available=0;owner=getpid();}
  if(!available) {
    int fd=open("/dev/urandom",O_RDONLY|O_CLOEXEC);if(fd<0){afail("IOError","Cannot obtain native randomness.");return 0;}
    size_t used=0;while(used<sizeof(pool)){ssize_t n=read(fd,(char*)pool+used,sizeof(pool)-used);if(n>0)used+=(size_t)n;else if(n<0&&errno==EINTR)continue;else{close(fd);memset(pool,0,sizeof(pool));afail("IOError","Cannot read native randomness.");return 0;}}
    close(fd);available=512;
  }
  *value=pool[--available];pool[available]=0;return 1;
}
/* Strict unsigned operations avoid floating-point emulation in programmer
 * software. Validate before integer conversion; every result is exact in
 * binary64 and no C shift ever receives a negative or width-sized count. */
static AV abit32(int id,int argc,AV *argv) {
  int unary=id==1029;
  if(argc!=(unary?1:2))return afail("TypeError","UInt32 operation received the wrong number of arguments.");
  for(int i=0;i<argc;i++) {
    if(argv[i].t!=ANUM)return afail("TypeError","UInt32 operands must be numbers.");
    double maximum=(id>=1030&&i==1)?31.0:4294967295.0;
    if(!isfinite(argv[i].n)||argv[i].n<0||argv[i].n>maximum||trunc(argv[i].n)!=argv[i].n)
      return afail("RangeError",id>=1030&&i==1?"Shift count must be an integer from 0 to 31.":"UInt32 operand must be an integer from 0 to 4294967295.");
  }
  uint32_t left=(uint32_t)argv[0].n,right=unary?0:(uint32_t)argv[1].n,result;
  switch(id) {
    case 1026:result=left&right;break;
    case 1027:result=left|right;break;
    case 1028:result=left^right;break;
    case 1029:result=~left;break;
    case 1030:result=left<<right;break;
    case 1031:result=left>>right;break;
    default:return afail("TypeError","Unknown UInt32 operation.");
  }
  return an((double)result);
}
static AV amath(int id,int argc,AV *argv){if(id>=1026)return abit32(id,argc,argv);double n=argc?atonumber(argv[0]):NAN,y=argc>1?atonumber(argv[1]):NAN;id-=1000;
 switch(id){case 0:return an(acos(n));case 1:return an(acosh(n));case 2:return an(asin(n));case 3:return an(asinh(n));case 4:return an(atan(n));case 5:return an(atanh(n));case 6:return an(atan2(n,y));case 7:return an(cbrt(n));
 case 8:{uint32_t value=auint32(n);int count=0;for(uint32_t mask=0x80000000;mask&&!(value&mask);mask>>=1)count++;return an(count);}
 case 9:return an(cosh(n));case 10:return an(exp(n));case 11:return an(expm1(n));case 12:return an((double)(float)n);case 13:return an(ahalf(n));
 case 14:{double largest=0;int nan=0;for(int i=0;i<argc;i++){double v=fabs(atonumber(argv[i]));if(isinf(v))return an(INFINITY);if(isnan(v))nan=1;else if(v>largest)largest=v;}if(nan)return an(NAN);if(!largest)return an(0);double sum=0,correction=0;for(int i=0;i<argc;i++){double v=atonumber(argv[i])/largest;double square=v*v-correction,next=sum+square;correction=(next-sum)-square;sum=next;}return an(sqrt(sum)*largest);}
 case 15:{uint32_t product=(uint32_t)((uint64_t)auint32(n)*auint32(y));int32_t signed_product;memcpy(&signed_product,&product,sizeof(product));return an(signed_product);}
 case 16:return an(log(n));case 17:return an(log10(n));case 18:return an(log1p(n));case 19:return an(log2(n));
 case 20:{uint64_t bytes;return arandom_number(&bytes)?an((double)(bytes>>11)*0x1p-53):av(AUNDEF); }
 case 21:return an(isnan(n)||n==0?n:n>0?1:-1);case 22:return an(sinh(n));case 23:return an(tan(n));case 24:return an(tanh(n));case 25:return an(trunc(n));
 }return afail("TypeError","Unknown native Math function.");}
