/* Gregorian date/instant arithmetic and explicit system-IANA zone projections.
 * Zone lookup never changes the caller's persistent TZ environment. There are no
 * scheduling points while libc's timezone state is temporarily selected.
 */
static int adigits(const char *s,int n){int v=0;for(int i=0;i<n;i++){if(s[i]<'0'||s[i]>'9')return -1;v=v*10+s[i]-'0';}return v;}
static int aleap(int year){return year%4==0&&(year%100!=0||year%400==0);}
static int amonthdays(int year,int month){const int days[]={31,28,31,30,31,30,31,31,30,31,30,31};return month>=1&&month<=12?days[month-1]+(month==2&&aleap(year)):0;}
static int adate_parts(const char *s,int *year,int *month,int *day){*year=adigits(s,4);*month=adigits(s+5,2);*day=adigits(s+8,2);return s[4]=='-'&&s[7]=='-'&&*year>=1&&*year<=9999&&*day>=1&&*day<=amonthdays(*year,*month);}
static long long adays(int year,int month,int day){long long y=year-1,total=y*365+y/4-y/100+y/400;for(int m=1;m<month;m++)total+=amonthdays(year,m);return total+day-1-719162;}
static char *adate_text(AV value){if(value.t!=ASTR)return NULL;for(int i=0;i<value.p->scope;i++)if(!value.p->chars[i]||value.p->chars[i]>=128)return NULL;return autf8(value);}
static int ainstant_ms(AV value,long long *out) {
  char *s=adate_text(value);if(!s)return 0;size_t n=strlen(s);int year,month,day,ok=0;
  if(n<20||!adate_parts(s,&year,&month,&day)||s[10]!='T'||s[13]!=':'||s[16]!=':')goto done;
  int hour=adigits(s+11,2),minute=adigits(s+14,2),second=adigits(s+17,2);if(hour<0||hour>23||minute<0||minute>59||second<0||second>59)goto done;
  size_t at=19;int millis=0;if(at<n&&s[at]=='.'){at++;int count=0;while(at<n&&s[at]>='0'&&s[at]<='9'){if(++count>3)goto done;millis=millis*10+s[at++]-'0';}if(!count)goto done;while(count++<3)millis*=10;}
  int offset=0;if(at<n&&s[at]=='Z'){at++;}else if(at+6==n&&(s[at]=='+'||s[at]=='-')&&s[at+3]==':'){int hours=adigits(s+at+1,2),minutes=adigits(s+at+4,2);if(hours<0||hours>23||minutes<0||minutes>59)goto done;offset=(hours*60+minutes)*(s[at]=='+'?1:-1);at+=6;}else goto done;
  if(at!=n)goto done;*out=((adays(year,month,day)*24+hour)*60+minute-offset)*60000+second*1000+millis;
  if(*out<adays(1,1,1)*86400000LL||*out>=adays(10000,1,1)*86400000LL)goto done;ok=1;
done:free(s);return ok;
}
static AV aiso_ms(long long ms){long long seconds=ms/1000;int fraction=(int)(ms%1000);if(fraction<0){fraction+=1000;seconds--;}time_t stamp=(time_t)seconds;struct tm parts;if(!gmtime_r(&stamp,&parts)||parts.tm_year+1900<1||parts.tm_year+1900>9999)return acoded_error("ARYA_DATETIME","Instant is outside years 0001 through 9999.");char out[32];snprintf(out,sizeof(out),"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",parts.tm_year+1900,parts.tm_mon+1,parts.tm_mday,parts.tm_hour,parts.tm_min,parts.tm_sec,fraction);return astr(out);}
static AV anow_iso(void){struct timespec now;clock_gettime(CLOCK_REALTIME,&now);return aiso_ms((long long)now.tv_sec*1000+now.tv_nsec/1000000);}
static int azone_valid(const char *zone) {
  size_t n=strlen(zone);if(!n||n>255||zone[0]=='/'||zone[n-1]=='/'||strstr(zone,".."))return 0;
  for(const unsigned char *p=(const unsigned char*)zone;*p;p++)if(!isalnum(*p)&&*p!='/'&&*p!='_'&&*p!='-'&&*p!='+')return 0;
  if(!strcmp(zone,"UTC")||!strcmp(zone,"GMT"))return 1;
  const char *roots[]={"/usr/share/zoneinfo/","/var/db/timezone/zoneinfo/"};char path[PATH_MAX];struct stat info;
  for(size_t i=0;i<2;i++){snprintf(path,sizeof(path),"%s%s",roots[i],zone);if(stat(path,&info)==0&&S_ISREG(info.st_mode)){FILE *f=fopen(path,"rb");char magic[4];int valid=f&&fread(magic,1,4,f)==4&&!memcmp(magic,"TZif",4);if(f)fclose(f);if(valid)return 1;}}return 0;
}
static AV adateline(int id,int argc,AV *argv) {
  AV x=argc?argv[0]:av(AUNDEF);long long ms;
  if(id==510){char *s=adate_text(x);int y,m,d,valid=s&&strlen(s)==10&&adate_parts(s,&y,&m,&d);free(s);return valid?x:acoded_error("ARYA_DATETIME","Use a valid YYYY-MM-DD date in years 0001 through 9999.");}
  if(id==513){if(x.t!=ADATE||!isfinite(x.p->data[0].n))return acoded_error("ARYA_DATETIME","Expected a valid native Date.");return aiso_ms((long long)x.p->data[0].n);}
  if(id==516){if(argc<3||argv[0].t!=ASTR||argv[1].t!=ASTR||argv[2].t!=ASTR)return acoded_error("ARYA_DATETIME","atOffset requires date, time and offset text.");AV r[3]={x,argv[1],argv[2]};ARoot root;aroot(&root,r,3);r[0]=adateline(510,1,r);if(!afailed){r[0]=aconcat(r[0],astr("T"));r[0]=aconcat(r[0],r[1]);r[0]=aconcat(r[0],r[2]);if(!ainstant_ms(r[0],&ms))acoded_error("ARYA_DATETIME","Invalid instant time or offset.");}AV result=afailed?av(AUNDEF):aiso_ms(ms);aunroot(&root);return result;}
  if(!ainstant_ms(x,&ms))return acoded_error("ARYA_DATETIME","Use an ISO instant with seconds, an explicit offset, and at most millisecond precision.");
  if(id==511)return aiso_ms(ms);
  if(id==514){AV date=ap(aalloc(ADATE,1));date.n=(double)ms;date.p->data[0]=an(date.n);return date;}
  if(argc<2||argv[1].t!=ASTR)return acoded_error("ARYA_DATETIME","An explicit IANA time zone is required.");
  char *zone=adate_text(argv[1]);if(!zone||!azone_valid(zone)){free(zone);return acoded_error("ARYA_DATETIME","Unknown IANA time zone.");}
  const char *old=getenv("TZ");char *saved=old?strdup(old):NULL;setenv("TZ",zone,1);tzset();time_t stamp=(time_t)(ms/1000-(ms<0&&ms%1000!=0));struct tm local;int valid=localtime_r(&stamp,&local)!=NULL;
  if(saved){setenv("TZ",saved,1);free(saved);}else unsetenv("TZ");tzset();free(zone);
  if(!valid||local.tm_year+1900<1||local.tm_year+1900>9999)return acoded_error("ARYA_DATETIME","Zoned date is outside years 0001 through 9999.");
  char date[16],time[16];snprintf(date,sizeof(date),"%04d-%02d-%02d",local.tm_year+1900,local.tm_mon+1,local.tm_mday);snprintf(time,sizeof(time),"%02d:%02d:%02d",local.tm_hour,local.tm_min,local.tm_sec);
  if(id==515)return astr(date);AV r=arecord();ARoot root;aroot(&root,&r,1);aput(r,"date",astr(date));aput(r,"time",astr(time));aput(r,"timeZone",argv[1]);aunroot(&root);return r;
}
static AV adate_method(AV env,int argc,AV *argv) {
  AV date=env.p->data[0],key=env.p->data[1];double ms=date.p->data[0].n;
  if(akey(key,"getTime")||akey(key,"valueOf"))return an(ms);
  if(akey(key,"setTime")){double value=argc?atonumber(argv[0]):NAN;date.p->data[0]=an(isfinite(value)&&fabs(value)<=8640000000000000.0?trunc(value):NAN);return date.p->data[0];}
  if(!isfinite(ms)){if(akey(key,"toJSON"))return av(ANULL);if(akey(key,"toString"))return astr("Invalid Date");return afail("RangeError","Invalid date value.");}
  if(akey(key,"toISOString")||akey(key,"toJSON")||akey(key,"toString"))return aiso_ms((long long)ms);
  time_t stamp=(time_t)floor(ms/1000);struct tm parts;if(!gmtime_r(&stamp,&parts))return an(NAN);
  if(akey(key,"getUTCFullYear"))return an(parts.tm_year+1900);if(akey(key,"getUTCMonth"))return an(parts.tm_mon);if(akey(key,"getUTCDate"))return an(parts.tm_mday);if(akey(key,"getUTCDay"))return an(parts.tm_wday);if(akey(key,"getUTCHours"))return an(parts.tm_hour);if(akey(key,"getUTCMinutes"))return an(parts.tm_min);if(akey(key,"getUTCSeconds"))return an(parts.tm_sec);if(akey(key,"getUTCMilliseconds"))return an(ms-floor(ms/1000)*1000);
  return av(AUNDEF);
}
static AV adate_get(AV object,AV key) {
  const char *methods[]={"getTime","valueOf","setTime","toISOString","toJSON","toString","getUTCFullYear","getUTCMonth","getUTCDate","getUTCDay","getUTCHours","getUTCMinutes","getUTCSeconds","getUTCMilliseconds"};int known=0;for(size_t i=0;i<sizeof(methods)/sizeof(*methods);i++)if(akey(key,methods[i]))known=1;if(!known)return av(AUNDEF);
  AV r[3]={object,key,av(AUNDEF)};ARoot root;aroot(&root,r,3);r[2]=alist(2,r);AV result=afunction(adate_method,r[2],"Date method");aunroot(&root);return result;
}
static AV adate_construct(AV env,int argc,AV *argv) {
  if(env.n==1){struct timespec now;clock_gettime(CLOCK_REALTIME,&now);return an((double)now.tv_sec*1000+now.tv_nsec/1000000);}
  double ms=NAN;if(!argc){struct timespec now;clock_gettime(CLOCK_REALTIME,&now);ms=(double)now.tv_sec*1000+now.tv_nsec/1000000;}
  else if(argc==1){if(argv[0].t==ADATE)ms=argv[0].p->data[0].n;else if(argv[0].t==ASTR){long long parsed;if(ainstant_ms(argv[0],&parsed))ms=(double)parsed;else{char *s=adate_text(argv[0]);int y,m,d;if(s&&strlen(s)==10&&adate_parts(s,&y,&m,&d))ms=(double)adays(y,m,d)*86400000;free(s);}}else ms=atonumber(argv[0]);}
  else{double numbers[7]={0,0,1,0,0,0,0};int valid=1;for(int i=0;i<argc&&i<7;i++){numbers[i]=atonumber(argv[i]);if(!isfinite(numbers[i])||fabs(numbers[i])>10000000)valid=0;}if(valid){int year=(int)numbers[0],month=(int)numbers[1];if(year>=0&&year<=99)year+=1900;year+=month/12;month%=12;if(month<0){month+=12;year--;}if(year>=1&&year<=9999)ms=(double)adays(year,month+1,1)*86400000+(trunc(numbers[2])-1)*86400000+trunc(numbers[3])*3600000+trunc(numbers[4])*60000+trunc(numbers[5])*1000+trunc(numbers[6]);}}
  if(env.n==2)return an(ms);AV date=ap(aalloc(ADATE,1));date.p->data[0]=an(isfinite(ms)&&fabs(ms)<=8640000000000000.0?trunc(ms):NAN);return date;
}
static AV adate_global(void){AV r=afunction(adate_construct,an(0),"Date");ARoot root;aroot(&root,&r,1);aput(r,"now",afunction(adate_construct,an(1),"Date.now"));aput(r,"parse",afunction(adate_construct,an(2),"Date.parse"));aunroot(&root);return r;}
