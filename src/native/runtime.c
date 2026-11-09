/* Arya native runtime. Copyright 2026 Hamza Arya. Apache-2.0. */
#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700
#define _DARWIN_C_SOURCE 1
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <errno.h>
#include <limits.h>
#include <time.h>
#include <ctype.h>
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif
_Static_assert(sizeof(double) == 8 && DBL_MANT_DIG == 53, "Arya requires binary64 double");
typedef struct AV AV;
typedef struct AH AH;
typedef struct ARoot ARoot;
typedef struct AFrame AFrame;
typedef AV (*ACode)(AV, int, AV *);
enum { AUINIT, AUNDEF, ANULL, ABOOL, ANUM, ASTR, ALIST, ARECORD, AFUNC, AENV, AREF };
struct AV { int t; double n; AH *p; };
struct AH { AH *next; unsigned mark; int t, scope; size_t len, cap; AV *data; uint16_t *chars; ACode code; AV parent; const char *name; };
struct ARoot { ARoot *prev; AV *values; size_t count; };
struct AFrame { AFrame *prev; const char *file, *name; int line, column; ARoot roots; };
static AH *aheap;
static ARoot *aroots;
static AFrame *aframes;
static size_t aallocated, athreshold = 1024 * 1024, acollections, apeakh;
static int afailed, adepth;
static AV aerror;
static char atrace[16384];
static AV av(int t) { AV v = {t,0,NULL}; return v; }
static AV an(double n) { AV v = {ANUM,n,NULL}; return v; }
static AV ab(int b) { AV v = {ABOOL,b != 0,NULL}; return v; }
static int anumtruth(double n) { return n!=0&&!isnan(n); }
static AV ap(AH *p) { AV v = {p->t,0,p}; return v; }
static void aroot(ARoot *r, AV *values, size_t count) { r->prev=aroots; r->values=values; r->count=count; aroots=r; }
static void aunroot(ARoot *r) { aroots=r->prev; }
static void amark(AV v) {
  /* Iterative marking avoids overflowing the C stack on deeply linked graphs. */
  AH **work=NULL; size_t count=0, cap=0;
  if(v.p && v.t>=ASTR && !v.p->mark) { cap=64; work=(AH**)malloc(cap*sizeof(AH*)); if(!work) { fputs("Arya: out of memory\n",stderr); exit(70); } work[count++]=v.p; v.p->mark=1; }
  while(count) { AH *h=work[--count]; size_t total=h->len+(h->parent.p?1:0);
    for(size_t i=0;i<total;i++) { AV child=i<h->len ? h->data[i] : h->parent; if(!child.p || child.t<ASTR || child.p->mark) continue;
      child.p->mark=1; if(count==cap) { cap*=2; AH **next=(AH**)realloc(work,cap*sizeof(AH*)); if(!next) { free(work); fputs("Arya: out of memory\n",stderr); exit(70); } work=next; } work[count++]=child.p;
    }
  }
  free(work);
}
static void agc(void) {
  for(ARoot *r=aroots;r;r=r->prev) for(size_t i=0;i<r->count;i++) amark(r->values[i]);
  if(afailed) amark(aerror);
  AH **link=&aheap;
  while(*link) { AH *h=*link; if(h->mark) { h->mark=0; link=&h->next; } else { *link=h->next; aallocated-=sizeof(AH)+h->cap*sizeof(AV)+(h->t==ASTR ? (size_t)h->scope*sizeof(uint16_t):0); free(h->data); free(h->chars); free(h); } }
  athreshold=aallocated*2+1024*1024; acollections++;
}
static void *amemory(size_t n) { void *p=calloc(n?n:1,1); if(!p) { fputs("Arya: out of memory\n",stderr); exit(70); } return p; }
static AH *aalloc(int t, size_t len) {
  if(aallocated>athreshold || getenv("ARYA_GC_STRESS")) agc();
  AH *h=(AH*)amemory(sizeof(AH)); h->t=t; h->len=h->cap=len; h->parent=av(AUNDEF); if(len) h->data=(AV*)amemory(len*sizeof(AV));
  h->next=aheap; aheap=h; aallocated+=sizeof(AH)+len*sizeof(AV); if(aallocated>apeakh) apeakh=aallocated; return h;
}
static AV as16(const uint16_t *s, size_t n) { AH *h=aalloc(ASTR,0); h->scope=(int)n; h->chars=(uint16_t*)amemory((n+1)*sizeof(uint16_t)); if(n) memcpy(h->chars,s,n*sizeof(uint16_t)); aallocated+=n*sizeof(uint16_t); return ap(h); }
static AV astrn(const char *s,size_t n) {
  size_t used=0; uint16_t *u=(uint16_t*)amemory((n+1)*sizeof(uint16_t));
  for(size_t i=0;i<n;) { unsigned c=(unsigned char)s[i++], cp=c; int extra=0;
    if(c>=0xc2 && c<=0xdf) { cp=c&31; extra=1; } else if(c>=0xe0 && c<=0xef) { cp=c&15; extra=2; } else if(c>=0xf0 && c<=0xf4) { cp=c&7; extra=3; } else if(c>=128) cp=0xfffd;
    size_t begin=i; int valid=1;
    for(int j=0;j<extra;j++) { if(i>=n || ((unsigned char)s[i]&0xc0)!=0x80) { valid=0; break; } cp=(cp<<6)|((unsigned char)s[i++]&63); }
    if(!valid || (extra==1 && cp<128) || (extra==2 && cp<2048) || (extra==3 && cp<65536) || cp>0x10ffff || (cp>=0xd800 && cp<=0xdfff)) { cp=0xfffd; i=begin; }
    if(cp>65535) { cp-=65536; u[used++]=(uint16_t)(0xd800+(cp>>10)); u[used++]=(uint16_t)(0xdc00+(cp&1023)); } else u[used++]=(uint16_t)cp;
  }
  AV result=as16(u,used); free(u); return result;
}
static AV astr(const char *s) { return astrn(s,strlen(s)); }
static char *autf8bytes(AV s,size_t *written) {
  size_t n=(size_t)s.p->scope, at=0; char *out=(char*)amemory(n*3+1);
  for(size_t i=0;i<n;i++) { unsigned c=s.p->chars[i]; if(c>=0xd800 && c<=0xdbff && i+1<n && s.p->chars[i+1]>=0xdc00 && s.p->chars[i+1]<=0xdfff) c=0x10000+((c-0xd800)<<10)+(s.p->chars[++i]-0xdc00); else if(c>=0xd800 && c<=0xdfff) c=0xfffd;
    if(c<128) out[at++]=(char)c; else if(c<2048) { out[at++]=(char)(0xc0|(c>>6)); out[at++]=(char)(0x80|(c&63)); } else if(c<65536) { out[at++]=(char)(0xe0|(c>>12)); out[at++]=(char)(0x80|((c>>6)&63)); out[at++]=(char)(0x80|(c&63)); } else { out[at++]=(char)(0xf0|(c>>18)); out[at++]=(char)(0x80|((c>>12)&63)); out[at++]=(char)(0x80|((c>>6)&63)); out[at++]=(char)(0x80|(c&63)); }
  }
  out[at]=0; if(written)*written=at; return out;
}
static char *autf8(AV s) { return autf8bytes(s,NULL); }
static int aseq(AV x, AV y) { return x.t==ASTR && y.t==ASTR && x.p->scope==y.p->scope && !memcmp(x.p->chars,y.p->chars,(size_t)x.p->scope*sizeof(uint16_t)); }
static int aeq(AV x, AV y) { if(x.t!=y.t) return 0; if(x.t==ANUM || x.t==ABOOL) return x.n==y.n; if(x.t==ASTR) return aseq(x,y); if(x.t>=ALIST) return x.p==y.p; return 1; }
static AV afail(const char *name, const char *message);
static AV aread(AV v) { if(v.t==AUINIT) return afail("ReferenceError","Cannot access binding before initialization."); if(v.t==AREF) return aread(v.p->parent.p->data[(size_t)v.n]); return v; }
static int atruth(AV v) { return !(v.t==AUNDEF || v.t==ANULL || (v.t==ABOOL && !v.n) || (v.t==ANUM && (!v.n || isnan(v.n))) || (v.t==ASTR && !v.p->scope)); }
static void aresize(AH *h, size_t size) { if(size<=h->cap) return; size_t cap=h->cap ? h->cap*2:8; if(cap<size) cap=size; if(cap>SIZE_MAX/sizeof(AV)) { fputs("Arya: allocation too large\n",stderr); exit(70); } AV *p=(AV*)realloc(h->data,cap*sizeof(AV)); if(!p) { fputs("Arya: out of memory\n",stderr); exit(70); } memset(p+h->cap,0,(cap-h->cap)*sizeof(AV)); aallocated+=(cap-h->cap)*sizeof(AV); h->cap=cap; h->data=p; }
static AV aenv(AV parent, int scope, size_t count) { AH *h=aalloc(AENV,count); h->parent=parent; h->scope=scope; return ap(h); }
static AH *afind(AV env,int scope) { AH *h=env.p; while(h && h->scope!=scope) h=h->parent.p; if(!h) { fputs("Arya: invalid lexical environment\n",stderr); exit(70); } return h; }
static AV agetvar(AV env,int scope,size_t slot) { return aread(afind(env,scope)->data[slot]); }
static AV asetvar(AV env,int scope,size_t slot,AV value,int initialize) { AH *h=afind(env,scope); if(!initialize && h->data[slot].t==AUINIT) return afail("ReferenceError","Cannot access binding before initialization."); h->data[slot]=value; return value; }
static AV afunction(ACode code,AV env,const char *name) { AH *h=aalloc(AFUNC,0); h->parent=env; h->code=code; h->name=name; return ap(h); }
static AV alist(int n,AV *items) { AH *h=aalloc(ALIST,(size_t)n); if(n) memcpy(h->data,items,(size_t)n*sizeof(AV)); return ap(h); }
static AV arecord(void) { return ap(aalloc(ARECORD,0)); }
static AV aset(AV object,AV key,AV value);
static AV aget(AV object,AV key);
static AV atostring(AV v);
static double atonumber(AV v);
static void asnapshot(void) {
  atrace[0]=0; size_t used=0;
  for(AFrame *f=aframes;f && used<sizeof(atrace)-256;f=f->prev) { int n=snprintf(atrace+used,sizeof(atrace)-used,"\n  at %s (%s:%d:%d)",f->name,f->file,f->line,f->column); if(n>0) used+=(size_t)n; }
}
static AV afail(const char *name,const char *message) {
  if(afailed) return av(AUNDEF);
  /* Root the partially constructed record across all allocations. */
  AV roots[5]={av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,5);
  roots[0]=arecord(); roots[1]=astr("name"); roots[2]=astr(name); aset(roots[0],roots[1],roots[2]); roots[3]=astr("message"); roots[4]=astr(message); aset(roots[0],roots[3],roots[4]);
  aerror=roots[0]; afailed=1; asnapshot(); aunroot(&r); return av(AUNDEF);
}
static AV athrow(AV v) { aerror=v; afailed=1; asnapshot(); return av(AUNDEF); }
static AV acall(AV fn,int argc,AV *argv) { if(fn.t!=AFUNC) return afail("TypeError","Value is not callable."); if(adepth>=512) return afail("RangeError","Native call depth exceeds 512."); adepth++; AV result=fn.p->code(fn.p->parent,argc,argv); adepth--; return result; }
static AV atostring(AV v) {
  char buf[128];
  switch(v.t) {
    case ASTR:return v; case AUNDEF:return astr("undefined"); case ANULL:return astr("null"); case ABOOL:return astr(v.n?"true":"false");
    case ANUM:
      if(isnan(v.n)) return astr("NaN"); if(isinf(v.n)) return astr(v.n<0?"-Infinity":"Infinity"); if(v.n==0) return astr("0");
      /* Find the shortest significant-digit form that roundtrips to binary64. */
      for(int precision=1;precision<=17;precision++) { snprintf(buf,sizeof(buf),"%.*g",precision,v.n); if(strtod(buf,NULL)==v.n) break; }
      { char *e=strchr(buf,'e'); if(e) { int exponent=atoi(e+1); char mantissa[128]; size_t k=(size_t)(e-buf); memcpy(mantissa,buf,k); mantissa[k]=0;
          if(exponent>=-6 && exponent<21) { char digits[128]; int count=0,point=0,negative=mantissa[0]=='-'; for(int j=negative;mantissa[j];j++) { if(mantissa[j]=='.') { point=count; continue; } digits[count++]=mantissa[j]; } if(!point) point=count; point+=exponent; int at=0; if(negative) buf[at++]='-'; if(point<=0) { buf[at++]='0'; buf[at++]='.'; for(int j=0;j< -point;j++) buf[at++]='0'; for(int j=0;j<count;j++) buf[at++]=digits[j]; } else { for(int j=0;j<point || j<count;j++) { if(j==point) buf[at++]='.'; buf[at++]=j<count?digits[j]:'0'; } } buf[at]=0;
          } else snprintf(buf,sizeof(buf),"%se%s%d",mantissa,exponent>=0?"+":"",exponent);
        }
      }
      return astr(buf);
    case ARECORD:return astr("[object Object]"); case AFUNC:return astr("[function]");
    case ALIST: { /* Preserve primitive list-to-string conversion, detect cycles. */
      static AH *active[128]; static int depth; if(depth>=128) return astr(""); for(int j=0;j<depth;j++) if(active[j]==v.p) return astr(""); active[depth++]=v.p;
      AV roots[2]={astr(""),av(AUNDEF)}; ARoot r; aroot(&r,roots,2);
      for(size_t i=0;i<v.p->len;i++) { roots[1]=(v.p->data[i].t==ANULL || v.p->data[i].t==AUNDEF)?astr(""):atostring(v.p->data[i]); size_t a=(size_t)roots[0].p->scope,b=(size_t)roots[1].p->scope; uint16_t *u=(uint16_t*)amemory((a+b+2)*sizeof(uint16_t)); memcpy(u,roots[0].p->chars,a*sizeof(uint16_t)); if(i) u[a++]=','; memcpy(u+a,roots[1].p->chars,b*sizeof(uint16_t)); roots[0]=as16(u,a+b); free(u); }
      AV result=roots[0]; aunroot(&r); depth--; return result;
    }
    default:return astr("undefined");
  }
}
static int aspace(uint16_t c) { return (c>=9&&c<=13)||c==32||c==160||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff; }
static double atonumber(AV v) {
  if(v.t==ANUM || v.t==ABOOL) return v.n; if(v.t==ANULL) return 0; if(v.t==AUNDEF) return NAN;
  if(v.t!=ASTR) { AV root=atostring(v); ARoot r; aroot(&r,&root,1); double result=atonumber(root); aunroot(&r); return result; }
  size_t start=0,end=(size_t)v.p->scope;while(start<end&&aspace(v.p->chars[start]))start++;while(end>start&&aspace(v.p->chars[end-1]))end--;
  if(start==end)return 0;
  size_t len=end-start;char *text=(char*)amemory(len+1);
  for(size_t i=0;i<len;i++){uint16_t c=v.p->chars[start+i];if(!c||c>=128){free(text);return NAN;}text[i]=(char)c;}text[len]=0;
  if(!strcmp(text,"Infinity")||!strcmp(text,"+Infinity")){free(text);return INFINITY;}if(!strcmp(text,"-Infinity")){free(text);return -INFINITY;}
  if(len>=2&&text[0]=='0'&&(text[1]=='x'||text[1]=='X'||text[1]=='o'||text[1]=='O'||text[1]=='b'||text[1]=='B')){
    int base=text[1]=='x'||text[1]=='X'?16:text[1]=='o'||text[1]=='O'?8:2;double result=0;if(len==2){free(text);return NAN;}
    for(size_t i=2;i<len;i++){int c=text[i],digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:99;if(digit>=base){free(text);return NAN;}result=result*base+digit;}free(text);return result;
  }
  size_t i=0,digits=0;if(text[i]=='+'||text[i]=='-')i++;while(i<len&&text[i]>='0'&&text[i]<='9'){i++;digits++;}
  if(i<len&&text[i]=='.'){i++;while(i<len&&text[i]>='0'&&text[i]<='9'){i++;digits++;}}if(!digits){free(text);return NAN;}
  if(i<len&&(text[i]=='e'||text[i]=='E')){i++;if(i<len&&(text[i]=='+'||text[i]=='-'))i++;size_t begin=i;while(i<len&&text[i]>='0'&&text[i]<='9')i++;if(i==begin){free(text);return NAN;}}
  if(i!=len){free(text);return NAN;}double result=strtod(text,NULL);free(text);return result;
}
static AV aconcat(AV x,AV y) {
  AV roots[2]={av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,2); roots[0]=atostring(x); roots[1]=atostring(y);
  size_t a=(size_t)roots[0].p->scope,b=(size_t)roots[1].p->scope; uint16_t *u=(uint16_t*)amemory((a+b+1)*sizeof(uint16_t)); memcpy(u,roots[0].p->chars,a*sizeof(uint16_t)); memcpy(u+a,roots[1].p->chars,b*sizeof(uint16_t)); AV result=as16(u,a+b); free(u); aunroot(&r); return result;
}
static int aorder(AV x,AV y) { size_t a=(size_t)x.p->scope,b=(size_t)y.p->scope,n=a<b?a:b; for(size_t i=0;i<n;i++) if(x.p->chars[i]!=y.p->chars[i]) return x.p->chars[i]<y.p->chars[i]?-1:1; return a==b?0:(a<b?-1:1); }
static double apower(double x,double y) { if(isinf(y) && fabs(x)==1) return NAN; return pow(x,y); }
static AV abin(const char *op,AV x,AV y) {
  if(!strcmp(op,"==")) return ab(aeq(x,y)); if(!strcmp(op,"!=")) return ab(!aeq(x,y));
  if(!strcmp(op,"+") && (x.t==ASTR || y.t==ASTR || x.t==ALIST || y.t==ALIST || x.t==ARECORD || y.t==ARECORD)) return aconcat(x,y);
  int cmp=x.t==ASTR && y.t==ASTR; double a=cmp?aorder(x,y):atonumber(x),b=cmp?0:atonumber(y);
  if(!strcmp(op,"+")) return an(a+b); if(!strcmp(op,"-")) return an(a-b); if(!strcmp(op,"*")) return an(a*b); if(!strcmp(op,"/")) return an(a/b); if(!strcmp(op,"%")) return an(fmod(a,b)); if(!strcmp(op,"**")) return an(apower(a,b));
  if(!strcmp(op,"<")) return ab(a<b); if(!strcmp(op,"<=")) return ab(a<=b); if(!strcmp(op,">")) return ab(a>b); if(!strcmp(op,">=")) return ab(a>=b); return afail("TypeError","Unsupported operator.");
}
static AV aunary(const char *op,AV x) { if(!strcmp(op,"not") || !strcmp(op,"!")) return ab(!atruth(x)); double n=atonumber(x); return an(!strcmp(op,"-")?-n:n); }
static int aindex(AV key,size_t *index) { double n=key.t==ANUM?key.n:atonumber(key); if(!isfinite(n) || n<0 || n>=4294967295.0 || floor(n)!=n) return 0; if(key.t==ASTR) { AV str=atostring(an(n)); int same=aseq(key,str); if(!same) return 0; } *index=(size_t)n; return 1; }
static int akey(AV key,const char *name) { if(key.t!=ASTR) return 0; size_t n=strlen(name); if((size_t)key.p->scope!=n) return 0; for(size_t i=0;i<n;i++) if(key.p->chars[i]!=(unsigned char)name[i]) return 0; return 1; }
static AV abound(AV env,int argc,AV *argv);
static AV aget(AV object,AV key) {
  if(object.t==ANULL || object.t==AUNDEF) return afail("TypeError","Cannot read property of null or undefined.");
  if(object.t==ARECORD) { if(key.t!=ASTR) return afail("TypeError","Record keys must be strings."); for(size_t i=0;i<object.p->len;i+=2) if(aseq(key,object.p->data[i])) return aread(object.p->data[i+1]); return av(AUNDEF); }
  if(object.t==ALIST || object.t==ASTR) {
    if(akey(key,"length")) return an(object.t==ALIST?(double)object.p->len:object.p->scope);
    size_t index; if(aindex(key,&index)) { if(object.t==ALIST) return index<object.p->len?object.p->data[index]:av(AUNDEF); return index<(size_t)object.p->scope?as16(object.p->chars+index,1):av(AUNDEF); }
    if(akey(key,"push") || akey(key,"pop") || akey(key,"join") || akey(key,"slice") || akey(key,"includes") || akey(key,"indexOf") || akey(key,"toUpperCase") || akey(key,"toLowerCase") || akey(key,"trim") || akey(key,"split")) {
      AV roots[2]={object,key}; ARoot r; aroot(&r,roots,2); AV env=alist(2,roots); roots[0]=env; AV result=afunction(abound,env,"method"); aunroot(&r); return result;
    }
    return av(AUNDEF);
  }
  return av(AUNDEF);
}
static AV aset(AV object,AV key,AV value) {
  if(object.t==ARECORD) {
    if(object.p->scope==-1) return afail("TypeError","Cannot assign a module namespace.");
    if(key.t!=ASTR) return afail("TypeError","Record keys must be strings.");
    for(size_t i=0;i<object.p->len;i+=2) if(aseq(key,object.p->data[i])) { if(object.p->data[i+1].t==AREF) return afail("TypeError","Cannot assign a module export."); object.p->data[i+1]=value; return value; }
    aresize(object.p,object.p->len+2); object.p->data[object.p->len++]=key; object.p->data[object.p->len++]=value; return value;
  }
  if(object.t==ALIST) { size_t index; if(akey(key,"length")) { double n=atonumber(value); if(!isfinite(n)||n<0||floor(n)!=n||n>10000000) return afail("RangeError","Invalid native list length."); aresize(object.p,(size_t)n); for(size_t i=object.p->len;i<(size_t)n;i++) object.p->data[i]=av(AUNDEF); object.p->len=(size_t)n; return value; }
    if(!aindex(key,&index) || index>10000000) return afail("RangeError","Native list index must be between 0 and 10000000."); aresize(object.p,index+1); while(object.p->len<=index) object.p->data[object.p->len++]=av(AUNDEF); object.p->data[index]=value; return value;
  }
  return afail("TypeError","Cannot assign this property.");
}
static AV abound(AV env,int argc,AV *argv) {
  AV object=env.p->data[0], key=env.p->data[1], first=argc?argv[0]:av(AUNDEF); size_t n=object.t==ALIST?object.p->len:(size_t)object.p->scope;
  if(akey(key,"push") && object.t==ALIST) { aresize(object.p,n+(size_t)argc); for(int i=0;i<argc;i++) object.p->data[object.p->len++]=argv[i]; return an((double)object.p->len); }
  if(akey(key,"pop") && object.t==ALIST) return n?object.p->data[--object.p->len]:av(AUNDEF);
  if(akey(key,"includes") || akey(key,"indexOf")) { long found=-1; if(object.t==ALIST) { for(size_t i=0;i<n;i++) if(aeq(object.p->data[i],first) || (akey(key,"includes") && object.p->data[i].t==ANUM && first.t==ANUM && isnan(first.n) && isnan(object.p->data[i].n))) { found=(long)i; break; } } else { AV s=atostring(first); size_t len=(size_t)s.p->scope; for(size_t i=0;i+len<=n;i++) if(!memcmp(object.p->chars+i,s.p->chars,len*sizeof(uint16_t))) { found=(long)i; break; } } return akey(key,"includes")?ab(found>=0):an((double)found); }
  if(akey(key,"slice")) { double from=argc?atonumber(argv[0]):0,to=argc>1?atonumber(argv[1]):(double)n; if(isnan(from)) from=0; if(isnan(to)) to=0; if(from<0) from=fmax(0,(double)n+trunc(from)); if(to<0) to=fmax(0,(double)n+trunc(to)); from=fmin((double)n,fmax(0,trunc(from))); to=fmin((double)n,fmax(from,trunc(to))); return object.t==ALIST?alist((int)(to-from),object.p->data+(size_t)from):as16(object.p->chars+(size_t)from,(size_t)(to-from)); }
  if(akey(key,"join") && object.t==ALIST) { AV roots[4]={object,av(AUNDEF),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,4); roots[1]=argc?atostring(first):astr(","); roots[2]=astr(""); for(size_t i=0;i<n;i++) { if(i) roots[2]=aconcat(roots[2],roots[1]); AV value=object.p->data[i]; roots[3]=(value.t==ANULL||value.t==AUNDEF)?astr(""):atostring(value); roots[2]=aconcat(roots[2],roots[3]); } AV result=roots[2]; aunroot(&r); return result; }
  if(object.t==ASTR && (akey(key,"toUpperCase") || akey(key,"toLowerCase") || akey(key,"trim"))) { uint16_t *u=(uint16_t*)amemory((n+1)*sizeof(uint16_t)); memcpy(u,object.p->chars,n*sizeof(uint16_t)); size_t begin=0,end=n; if(akey(key,"trim")) { while(begin<end && u[begin]<128 && isspace(u[begin])) begin++; while(end>begin && u[end-1]<128 && isspace(u[end-1])) end--; } else for(size_t i=0;i<n;i++) if(u[i]<128) u[i]=(uint16_t)(akey(key,"toUpperCase")?toupper(u[i]):tolower(u[i])); AV result=as16(u+begin,end-begin); free(u); return result; }
  if(object.t==ASTR && akey(key,"split")) { AV roots[4]={object,av(AUNDEF),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,4); roots[1]=alist(0,NULL); if(!argc) { aresize(roots[1].p,1); roots[1].p->data[0]=object; roots[1].p->len=1; } else { roots[2]=atostring(first); size_t sep=(size_t)roots[2].p->scope,start=0; for(size_t i=0;i<=n;i++) { int hit=sep ? i+sep<=n && !memcmp(object.p->chars+i,roots[2].p->chars,sep*sizeof(uint16_t)) : i<n; if(hit || (sep && i==n)) { roots[3]=as16(object.p->chars+start,sep?i-start:1); AH *list=roots[1].p; aresize(list,list->len+1); list->data[list->len++]=roots[3]; if(sep && hit) { i+=sep-1; start=i+1; } else start=i+1; } } } AV result=roots[1]; aunroot(&r); return result; }
  return afail("TypeError","Unsupported native method.");
}
static AV abuiltin(AV env,int argc,AV *argv) {
  int id=(int)env.n; AV x=argc?argv[0]:av(AUNDEF);
  if(id==0) { for(int i=0;i<argc;i++) { AV s=atostring(argv[i]); size_t size; char *text=autf8bytes(s,&size); if(i) fputc(' ',stdout); fwrite(text,1,size,stdout); free(text); } fputc('\n',stdout); return av(AUNDEF); }
  if(id==1) { if(x.t!=ASTR && x.t!=ALIST) return afail("TypeError","len expects a string or list."); return an(x.t==ASTR?x.p->scope:(double)x.p->len); }
  if(id==2) return atostring(x);
  if(id==3) return an(atonumber(x));
  if(id==4) { double start=argc>1?atonumber(x):0,end=argc>1?atonumber(argv[1]):atonumber(x),step=argc>2 && argv[2].t!=AUNDEF?atonumber(argv[2]):1;
    if(argc>1 && argv[1].t==AUNDEF) { end=start; start=0; }
    if(!isfinite(start)||!isfinite(end)||!isfinite(step)||floor(start)!=start||floor(end)!=end||floor(step)!=step||fabs(start)>9007199254740991.0||fabs(end)>9007199254740991.0||fabs(step)>9007199254740991.0||step==0) return afail("TypeError","range expects safe integers and a nonzero step.");
    double count=fmax(0,ceil((end-start)/step)); if(count>100000) return afail("RangeError","range supports at most 100000 items."); AH *h=aalloc(ALIST,(size_t)count); for(size_t i=0;i<h->len;i++) h->data[i]=an(start+(double)i*step); return ap(h);
  }
  return afail("TypeError","Unknown builtin.");
}
static AV abuilt(int id) { AV env=an(id); return afunction(abuiltin,env,"builtin"); }
static AV aprocess(int id,int argc,AV *argv) {
  if(id==40) {
    if(!argc || argv[0].t!=ALIST || !argv[0].p->len) return afail("TypeError","process.run expects a nonempty argument list.");
    size_t n=argv[0].p->len; char **args=(char**)amemory((n+1)*sizeof(char*));
    for(size_t i=0;i<n;i++) { AV value=argv[0].p->data[i]; if(value.t!=ASTR) { for(size_t j=0;j<i;j++)free(args[j]);free(args);return afail("TypeError","Process arguments must be strings."); } for(int j=0;j<value.p->scope;j++) if(!value.p->chars[j]) {for(size_t k=0;k<i;k++)free(args[k]);free(args);return afail("TypeError","Process arguments cannot contain NUL.");} args[i]=autf8(value); }
    fflush(NULL); pid_t pid=fork(); if(pid==0) {execvp(args[0],args);fprintf(stderr,"Cannot start %s: %s\n",args[0],strerror(errno));_exit(127);} for(size_t i=0;i<n;i++)free(args[i]);free(args);
    if(pid<0)return afail("IOError",strerror(errno));int status=0;while(waitpid(pid,&status,0)<0){if(errno!=EINTR)return afail("IOError",strerror(errno));}return an(WIFEXITED(status)?WEXITSTATUS(status):128+WTERMSIG(status));
  }
  if(id==41) { double n=argc?atonumber(argv[0]):0; exit(isfinite(n)?(int)fmod(trunc(n),256):1); }
  if(id==42) {if(!argc||argv[0].t!=ASTR)return afail("TypeError","env expects a name.");char *name=autf8(argv[0]);const char *value=getenv(name);free(name);return value?astr(value):av(ANULL);}
  if(id==43) {char *cwd=getcwd(NULL,0);if(!cwd)return afail("IOError",strerror(errno));AV result=astr(cwd);free(cwd);return result;}
  if(id==44) {
    char buffer[PATH_MAX+1];
#ifdef __APPLE__
    uint32_t size=sizeof(buffer);if(_NSGetExecutablePath(buffer,&size))return afail("IOError","Executable path exceeds platform limit.");
#else
    ssize_t size=readlink("/proc/self/exe",buffer,PATH_MAX);if(size<0)return afail("IOError",strerror(errno));buffer[size]=0;
#endif
    return astr(buffer);
  }
  if(id>=50&&id<=54) {
    if(!argc||argv[0].t!=ASTR)return afail("TypeError","Path expects a string.");
    if(id==54) {char *path=autf8(argv[0]);char *canonical=realpath(path,NULL);free(path);if(!canonical)return afail("IOError",strerror(errno));AV result=astr(canonical);free(canonical);return result;}
    AV roots[2]={argv[0],av(AUNDEF)}; ARoot r;aroot(&r,roots,2);
    if(id==50||id==53) {for(int i=1;i<argc;i++){roots[1]=astr("/");roots[0]=aconcat(roots[0],roots[1]);roots[0]=aconcat(roots[0],argv[i]);}}
    char *text=autf8(roots[0]);
    if(id==51||id==52){char *slash=strrchr(text,'/');if(id==51){if(slash){if(slash==text)slash[1]=0;else *slash=0;}else {free(text);text=strdup(".");}}else if(slash)memmove(text,slash+1,strlen(slash+1)+1);}
    if(id==53 && text[0]!='/') {char *cwd=getcwd(NULL,0);if(!cwd){free(text);aunroot(&r);return afail("IOError",strerror(errno));}size_t n=strlen(cwd)+strlen(text)+2;char *next=(char*)amemory(n);snprintf(next,n,"%s/%s",cwd,text);free(cwd);free(text);text=next;}
    if(id==50||id==53){size_t length=strlen(text);char **parts=(char**)amemory((length+1)*sizeof(char*));size_t count=0;int absolute=text[0]=='/';char *save=NULL;for(char *part=strtok_r(text,"/",&save);part;part=strtok_r(NULL,"/",&save)){if(!strcmp(part,"."))continue;if(!strcmp(part,"..")&&count&&strcmp(parts[count-1],"..")){count--;continue;}if(!strcmp(part,"..")&&absolute&&!count)continue;parts[count++]=part;}char *normalized=(char*)amemory(length+2);size_t at=0;if(absolute)normalized[at++]='/';for(size_t i=0;i<count;i++){if(i)normalized[at++]='/';size_t n=strlen(parts[i]);memcpy(normalized+at,parts[i],n);at+=n;}if(!at)normalized[at++]='.';normalized[at]=0;free(parts);free(text);text=normalized;}
    AV result=astr(text);free(text);aunroot(&r);return result;
  }
  if(id==63) {if(!argc||argv[0].t!=ASTR)return afail("TypeError","tempDirectory expects a template ending in XXXXXX.");char *pattern=autf8(argv[0]);if(!mkdtemp(pattern)){free(pattern);return afail("IOError",strerror(errno));}AV result=astr(pattern);free(pattern);return result;}
  if(id>=60&&id<=64) {
    if(!argc||argv[0].t!=ASTR)return afail("TypeError","File operation expects a path.");char *text=autf8(argv[0]);int status=0;
    if(id==60){for(char *p=text+1;*p;p++)if(*p=='/'){*p=0;if(mkdir(text,0777)&&errno!=EEXIST){status=-1;*p='/';break;}*p='/';}if(!status&&mkdir(text,0777)&&errno!=EEXIST)status=-1;}
    else if(id==61){if(argc<2||argv[1].t!=ASTR){free(text);return afail("TypeError","rename expects two paths.");}char *to=autf8(argv[1]);status=rename(text,to);free(to);}
    else if(id==64)status=rmdir(text);else status=unlink(text);
    free(text);return status?afail("IOError",strerror(errno)):av(AUNDEF);
  }
  return afail("TypeError","Unknown process/path operation.");
}
static AV astdcall(AV env,int argc,AV *argv) {
  int id=(int)env.n; if(id>=40)return aprocess(id,argc,argv); AV x=argc?argv[0]:av(AUNDEF); double n=argc && id>=20 && id<30?atonumber(x):NAN;
  if(id==0) return abuiltin(an(0),argc,argv);
  if(id==1) { size_t count=0,cap=128; char *line=(char*)amemory(cap); int c; while((c=fgetc(stdin))!=EOF && c!='\n') { if(count+1>=cap) { cap*=2; char *p=(char*)realloc(line,cap); if(!p) { free(line); return afail("Error","Input is too large."); } line=p; } line[count++]=(char)c; } if(!count && c==EOF) { free(line); return av(ANULL); } if(count && line[count-1]=='\r') count--; line[count]=0; AV result=astr(line); free(line); return result; }
  if(id==2) { AV text=atostring(x); size_t size; char *bytes=autf8bytes(text,&size); fwrite(bytes,1,size,stdout); fflush(stdout); free(bytes); return av(AUNDEF); }
  if(id>=10 && id<=13) {
    if(x.t!=ASTR) return afail("TypeError","File path must be a string."); for(int i=0;i<x.p->scope;i++) if(!x.p->chars[i]) return afail("TypeError","File path contains NUL."); char *path=autf8(x);
    if(id==13) { FILE *f=fopen(path,"rb"); free(path); if(f) fclose(f); return ab(f!=NULL); }
    FILE *f=fopen(path,id==10?"rb":(id==11?"wb":"ab")); free(path); if(!f) return afail("IOError",strerror(errno));
    if(id==10) { size_t cap=4096,used=0; char *buf=(char*)amemory(cap+1); size_t got; while((got=fread(buf+used,1,cap-used,f))>0) { used+=got; if(used==cap) { if(cap>=16*1024*1024) { fclose(f); free(buf); return afail("RangeError","Text file exceeds 16 MiB."); } cap*=2; char *next=(char*)realloc(buf,cap+1); if(!next) { fclose(f); free(buf); return afail("Error","Out of memory reading file."); } buf=next; } } int failed=ferror(f); fclose(f); if(failed) { free(buf); return afail("IOError","Cannot read file."); } buf[used]=0; AV result=astrn(buf,used); free(buf); return result; }
    AV text=atostring(argc>1?argv[1]:av(AUNDEF)); size_t size; char *bytes=autf8bytes(text,&size); int failed=fwrite(bytes,1,size,f)!=size; free(bytes); if(fclose(f)) failed=1; return failed?afail("IOError","Cannot write file."):av(AUNDEF);
  }
  if(id==20) return an(sqrt(n)); if(id==21) return an(fabs(n)); if(id==22) return an(floor(n)); if(id==23) return an(ceil(n)); if(id==24) return an(n>=-0.5&&n<=0?-0.0:floor(n+0.5)); if(id==25) return an(apower(n,argc>1?atonumber(argv[1]):NAN)); if(id==26) return an(sin(n)); if(id==27) return an(cos(n));
  if(id==28 || id==29) { double result=id==28?INFINITY:-INFINITY; for(int i=0;i<argc;i++) { double v=atonumber(argv[i]); if(isnan(v)) return an(NAN); result=id==28?fmin(result,v):fmax(result,v); } return an(result); }
  if(id==30) return an((double)clock()/CLOCKS_PER_SEC);
  if(id==31) { agc(); return an((double)aallocated); }
  if(id==32) {if(x.t!=ASTR)return afail("TypeError","codeUnit expects a string.");double index=argc>1?atonumber(argv[1]):0;return isfinite(index)&&index>=0&&index<x.p->scope?an(x.p->chars[(size_t)index]):an(NAN);}
  return afail("TypeError","Unknown standard-library function.");
}
static void astdfield(AV obj,const char *key,int id) { AV roots[3]={obj,av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3); roots[1]=astr(key); roots[2]=afunction(astdcall,an(id),key); aset(obj,roots[1],roots[2]); aunroot(&r); }
static AV astd(const char *name) {
  AV roots[3]={arecord(),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3);
  if(!strcmp(name,"io")) { astdfield(roots[0],"print",0); astdfield(roots[0],"readLine",1); astdfield(roots[0],"write",2); }
  else if(!strcmp(name,"fs")) { astdfield(roots[0],"readText",10); astdfield(roots[0],"writeText",11); astdfield(roots[0],"appendText",12); astdfield(roots[0],"exists",13); astdfield(roots[0],"makeDirectory",60); astdfield(roots[0],"rename",61); astdfield(roots[0],"remove",62); astdfield(roots[0],"tempDirectory",63); astdfield(roots[0],"removeDirectory",64); }
  else if(!strcmp(name,"math")) { const char *names[]={"sqrt","abs","floor","ceil","round","pow","sin","cos","min","max"}; for(int i=0;i<10;i++) astdfield(roots[0],names[i],20+i); roots[1]=astr("PI"); aset(roots[0],roots[1],an(3.14159265358979323846)); roots[1]=astr("E"); aset(roots[0],roots[1],an(2.71828182845904523536)); }
  else if(!strcmp(name,"runtime")) { astdfield(roots[0],"clock",30); astdfield(roots[0],"collect",31); astdfield(roots[0],"codeUnit",32); }
  else if(!strcmp(name,"process")) { astdfield(roots[0],"run",40); astdfield(roots[0],"exit",41); astdfield(roots[0],"env",42); astdfield(roots[0],"cwd",43); astdfield(roots[0],"executable",44); }
  else if(!strcmp(name,"path")) {astdfield(roots[0],"join",50);astdfield(roots[0],"dirname",51);astdfield(roots[0],"basename",52);astdfield(roots[0],"resolve",53);astdfield(roots[0],"realPath",54);}
  else afail("ImportError","Unknown native standard library.");
  AV result=roots[0]; aunroot(&r); return result;
}
static AV aexport(AV env,int scope,size_t slot) { AH *h=aalloc(AREF,0); h->parent=ap(afind(env,scope)); AV result=ap(h); result.n=(double)slot; return result; }
static int areport(void) { if(!afailed) return 0; AV root=aerror; ARoot r; aroot(&r,&root,1); if(root.t==ARECORD) { AV keys[2]={astr("name"),av(AUNDEF)}; ARoot k; aroot(&k,keys,2); keys[1]=aget(root,keys[0]); AV msg=atostring(keys[1]); char *s=autf8(msg); fputs(s,stderr); free(s); keys[0]=astr("message"); keys[1]=aget(root,keys[0]); msg=atostring(keys[1]); s=autf8(msg); fprintf(stderr,": %s",s); free(s); aunroot(&k); } else { AV msg=atostring(root); char *s=autf8(msg); fprintf(stderr,"Uncaught: %s",s); free(s); } fprintf(stderr,"%s\n",atrace); aunroot(&r); return 1; }
static AV aiternext(AV iterable, AV *position) {
  size_t i=(size_t)position->n;
  if(iterable.t==ALIST) { if(i>=iterable.p->len) return av(AUINIT); position->n++; return iterable.p->data[i]; }
  if(iterable.t==ASTR) { if(i>=(size_t)iterable.p->scope) return av(AUINIT); size_t count=1; unsigned c=iterable.p->chars[i]; if(c>=0xd800 && c<=0xdbff && i+1<(size_t)iterable.p->scope && iterable.p->chars[i+1]>=0xdc00 && iterable.p->chars[i+1]<=0xdfff) count=2; position->n+=(double)count; return as16(iterable.p->chars+i,count); }
  return afail("TypeError","Value is not iterable.");
}
static void aaddexport(AV ns,const char *name,AV env,int scope,size_t slot) { AV roots[3]={ns,av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3); roots[1]=astr(name); roots[2]=aexport(env,scope,slot); aset(ns,roots[1],roots[2]); aunroot(&r); }
