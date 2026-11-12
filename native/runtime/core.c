/* Arya native runtime. Copyright 2026 Hamza Arya. Apache-2.0. */
#define _POSIX_C_SOURCE 200809L
#define _GNU_SOURCE 1
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
#include <fcntl.h>
#include <time.h>
#include <ctype.h>
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#ifdef __linux__
#include <sys/syscall.h>
#endif
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif
_Static_assert(sizeof(double) == 8 && DBL_MANT_DIG == 53, "Arya requires binary64 double");
typedef struct AV AV;
typedef struct AH AH;
typedef struct ARoot ARoot;
typedef struct AFrame AFrame;
typedef AV (*ACode)(AV, int, AV *);
enum { AUINIT, AUNDEF, ANULL, ABOOL, ANUM, ASTR, ALIST, ARECORD, AFUNC, AENV, AREF, APROMISE, ADATE, AAITER, AGETTER, ABYTES, AHANDLE };
struct AV { int t; double n; AH *p; };
struct AH { AH *next; unsigned mark,flags; uint64_t serial; int t, scope; size_t len, cap; AV *data; uint16_t *chars; ACode code; AV parent,tag; const char *name; void *external; void (*finalize)(AH *); };
struct ARoot { ARoot *prev; AV *values; size_t count; };
struct AFrame { AFrame *prev; const char *file, *name; int line, column; ARoot roots; };
static AH *aheap;
static ARoot *aroots;
static AFrame *aframes;
static size_t aallocated, athreshold = 1024 * 1024, acollections, apeakh;
static int afailed, adepth;
static AV aerror;
static AV aextra_roots[16];
static char atrace[16384];
static AV afail(const char *name,const char *message);
#ifdef ARYA_RUNTIME_COUNTERS
static struct {
  size_t calloc_calls, heap_objects, environments, functions;
  size_t generic_calls, direct_calls, numeric_calls, heap_temporaries;
  size_t scalar_calls, rooted_calls, root_pushes, environment_lookups;
  size_t requested_bytes, strings, string_units, json_key_hits, field_cache_hits, decimal_fast_paths;
  double gc_cpu_ms;
} acounters;
#define ACOUNT(field) (++acounters.field)
static void acounters_report(void) {
  fprintf(stderr,"ARYA_RUNTIME_COUNTERS {\"callocCalls\":%zu,\"heapObjects\":%zu,\"environments\":%zu,\"functions\":%zu,\"genericCalls\":%zu,\"directCalls\":%zu,\"numericCalls\":%zu,\"heapTemporaries\":%zu,\"gcCollections\":%zu,\"peakManagedBytes\":%zu,\"scalarCalls\":%zu,\"rootedCalls\":%zu,\"rootPushes\":%zu,\"environmentLookups\":%zu}\n",
    acounters.calloc_calls,acounters.heap_objects,acounters.environments,acounters.functions,acounters.generic_calls,acounters.direct_calls,acounters.numeric_calls,acounters.heap_temporaries,acollections,apeakh,acounters.scalar_calls,acounters.rooted_calls,acounters.root_pushes,acounters.environment_lookups);
  fprintf(stderr,"ARYA_ALLOCATION_DETAIL {\"requestedBytes\":%zu,\"strings\":%zu,\"stringUnits\":%zu,\"jsonKeyHits\":%zu,\"fieldCacheHits\":%zu,\"decimalFastPaths\":%zu,\"gcCpuMs\":%.6f}\n",acounters.requested_bytes,acounters.strings,acounters.string_units,acounters.json_key_hits,acounters.field_cache_hits,acounters.decimal_fast_paths,acounters.gc_cpu_ms);
}
#define AADD(field,n) (acounters.field+=(n))
#else
#define ACOUNT(field) ((void)0)
#define AADD(field,n) ((void)0)
static void acounters_report(void) {}
#endif
static AV av(int t) { AV v = {t,0,NULL}; return v; }
static AV an(double n) { AV v = {ANUM,n,NULL}; return v; }
static AV ab(int b) { AV v = {ABOOL,b != 0,NULL}; return v; }
static int anumtruth(double n) { return n!=0&&!isnan(n); }
static AV ap(AH *p) { AV v = {p->t,0,p}; return v; }
static void aroot(ARoot *r, AV *values, size_t count) { ACOUNT(root_pushes); r->prev=aroots; r->values=values; r->count=count; aroots=r; }
static void aunroot(ARoot *r) { aroots=r->prev; }
static void amark(AV v) {
  /* Iterative marking avoids overflowing the C stack on deeply linked graphs. */
  AH **work=NULL; size_t count=0, cap=0;
  if(v.p && v.t>=ASTR && !v.p->mark) { cap=64; work=(AH**)malloc(cap*sizeof(AH*)); if(!work) { fputs("Arya: out of memory\n",stderr); exit(70); } work[count++]=v.p; v.p->mark=1; }
  while(count) { AH *h=work[--count]; size_t total=h->len+2;
    for(size_t i=0;i<total;i++) { AV child=i<h->len ? h->data[i] : i==h->len?h->parent:h->tag; if(!child.p || child.t<ASTR || child.p->mark) continue;
      child.p->mark=1; if(count==cap) { cap*=2; AH **next=(AH**)realloc(work,cap*sizeof(AH*)); if(!next) { free(work); fputs("Arya: out of memory\n",stderr); exit(70); } work=next; } work[count++]=child.p;
    }
  }
  free(work);
}
static void aasync_mark(void);
static void agc(void) {
#ifdef ARYA_RUNTIME_COUNTERS
  clock_t started=clock();
#endif
  for(size_t i=0;i<16;i++)amark(aextra_roots[i]);
  aasync_mark();
  for(ARoot *r=aroots;r;r=r->prev) for(size_t i=0;i<r->count;i++) amark(r->values[i]);
  if(afailed) amark(aerror);
  AH **link=&aheap;
  while(*link) { AH *h=*link; if(h->mark) { h->mark=0; link=&h->next; } else { *link=h->next; aallocated-=sizeof(AH)+h->cap*sizeof(AV)+(h->t==ASTR ? (size_t)h->scope*sizeof(uint16_t):h->t==ABYTES&&!(h->flags&4)?(size_t)h->scope:0);if(h->finalize)h->finalize(h);free(h->data);if(!(h->t==ABYTES&&(h->flags&4)))free(h->chars);free(h); } }
  athreshold=aallocated*2+1024*1024; acollections++;
#ifdef ARYA_RUNTIME_COUNTERS
  acounters.gc_cpu_ms+=(double)(clock()-started)*1000/CLOCKS_PER_SEC;
#endif
}
static void *amemory(size_t n) { ACOUNT(calloc_calls); AADD(requested_bytes,n?n:1); void *p=calloc(n?n:1,1); if(!p) { fputs("Arya: out of memory\n",stderr); exit(70); } return p; }
static AH *aalloc(int t, size_t len) {
  if(aallocated>athreshold || getenv("ARYA_GC_STRESS")) agc();
  ACOUNT(heap_objects);
  AH *h=(AH*)amemory(sizeof(AH)); h->t=t; h->len=h->cap=len; h->parent=av(AUNDEF); if(len) h->data=(AV*)amemory(len*sizeof(AV));
  h->next=aheap; aheap=h; aallocated+=sizeof(AH)+len*sizeof(AV); if(aallocated>apeakh) apeakh=aallocated; return h;
}
static AV as16(const uint16_t *s, size_t n) { if(n>16777216)return afail("RangeError","Strings exceed the 16 Mi UTF-16 unit limit.");ACOUNT(strings);AADD(string_units,n);AH *h=aalloc(ASTR,0); h->scope=(int)n; h->chars=(uint16_t*)amemory((n+1)*sizeof(uint16_t)); if(n) memcpy(h->chars,s,n*sizeof(uint16_t)); aallocated+=n*sizeof(uint16_t);if(aallocated>apeakh)apeakh=aallocated;return ap(h); }
static AV astrn(const char *s,size_t n) {
  if(n>67108864)return afail("RangeError","UTF-8 input exceeds 64 MiB.");
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
static AV acall(AV fn,int argc,AV *argv);
static AV aread(AV v) { if(v.t==AUINIT) return afail("ReferenceError","Cannot access binding before initialization."); if(v.t==AREF) return aread(v.p->parent.p->data[(size_t)v.n]);if(v.t==AGETTER)return acall(v.p->parent,0,NULL); return v; }
static int atruth(AV v) { return !(v.t==AUNDEF || v.t==ANULL || (v.t==ABOOL && !v.n) || (v.t==ANUM && (!v.n || isnan(v.n))) || (v.t==ASTR && !v.p->scope)); }
static void aresize(AH *h, size_t size) { if(size<=h->cap) return; size_t cap=h->cap ? h->cap*2:8; if(cap<size) cap=size; if(cap>SIZE_MAX/sizeof(AV)) { fputs("Arya: allocation too large\n",stderr); exit(70); } AV *p=(AV*)realloc(h->data,cap*sizeof(AV)); if(!p) { fputs("Arya: out of memory\n",stderr); exit(70); } memset(p+h->cap,0,(cap-h->cap)*sizeof(AV)); aallocated+=(cap-h->cap)*sizeof(AV); h->cap=cap; h->data=p; }
static AV aenv(AV parent, int scope, size_t count) { ACOUNT(environments); AH *h=aalloc(AENV,count); h->parent=parent; h->scope=scope; return ap(h); }
static AH *afind(AV env,int scope) { ACOUNT(environment_lookups); AH *h=env.p; while(h && h->scope!=scope) h=h->parent.p; if(!h) { fputs("Arya: invalid lexical environment\n",stderr); exit(70); } return h; }
static AV agetvar(AV env,int scope,size_t slot) { return aread(afind(env,scope)->data[slot]); }
static AV asetvar(AV env,int scope,size_t slot,AV value,int initialize) { AH *h=afind(env,scope); if(!initialize && h->data[slot].t==AUINIT) return afail("ReferenceError","Cannot access binding before initialization."); h->data[slot]=value; return value; }
static AV asetlocal(AV *slot,AV value,int initialize) { if(!initialize && slot->t==AUINIT) return afail("ReferenceError","Cannot access binding before initialization."); *slot=value; return value; }
static AV afunction(ACode code,AV env,const char *name) { ACOUNT(functions); AH *h=aalloc(AFUNC,0); h->parent=env; h->code=code; h->name=name; return ap(h); }
static AV alist(int n,AV *items) { AH *h=aalloc(ALIST,(size_t)n); if(n && items) memcpy(h->data,items,(size_t)n*sizeof(AV)); return ap(h); }
static AV arecord(void) { return ap(aalloc(ARECORD,0)); }
static AV aset(AV object,AV key,AV value);
static AV aget(AV object,AV key);
static AV atostring(AV v);
#ifdef ARYA_URL
static int aurl_is(AV value,int kind);
static AV aurl_string(AV value);
static AV aurl_get(AV object,AV key);
static AV aurl_set(AV object,AV key,AV value);
#endif
static AV abytes_to_text(AV value);
static double atonumber(AV v);
static void asnapshot(void) {
  atrace[0]=0; size_t used=0;
  for(AFrame *f=aframes;f && used<sizeof(atrace)-256;f=f->prev) { int n=snprintf(atrace+used,sizeof(atrace)-used,"\n  at %s (%s:%d:%d)",f->name,f->file,f->line,f->column); if(n>0) used+=(size_t)n; }
}
static AV afail(const char *name,const char *message) {
  if(afailed) return av(AUNDEF);
  /* Root the partially constructed record across all allocations. */
  AV roots[5]={av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,5);
  roots[0]=arecord(); roots[0].p->name="arya.error"; roots[1]=astr("name"); roots[2]=astr(name); aset(roots[0],roots[1],roots[2]); roots[3]=astr("message"); roots[4]=astr(message); aset(roots[0],roots[3],roots[4]);
  aerror=roots[0]; afailed=1; asnapshot(); aunroot(&r); return av(AUNDEF);
}
static AV athrow(AV v) { aerror=v; afailed=1; asnapshot(); return av(AUNDEF); }
static AV aasync_start(AV fn,int argc,AV *argv);
static int acall_enter(void) {
  if(adepth>=512) { afail("RangeError","Native call depth exceeds 512."); return 0; }
  adepth++; return 1;
}
static AV acall(AV fn,int argc,AV *argv) {
  ACOUNT(generic_calls);
  if(fn.t!=AFUNC) return afail("TypeError","Value is not callable.");
  if(!acall_enter()) return av(AUNDEF);
  ARoot f,a;aroot(&f,&fn,1);aroot(&a,argv,(size_t)argc);
  AV result=(fn.p->flags&1)?aasync_start(fn,argc,argv):fn.p->code(fn.p->parent,argc,argv);
  adepth--;aunroot(&a);aunroot(&f);return result;
}
/* Generated callers already root the evaluated callee and every argument.
 * Runtime callbacks keep using acall(), which establishes its own roots. */
static AV acall_rooted(AV fn,int argc,AV *argv) {
  ACOUNT(generic_calls);ACOUNT(rooted_calls);
  if(fn.t!=AFUNC) return afail("TypeError","Value is not callable.");
  if(!acall_enter()) return av(AUNDEF);
  AV result=(fn.p->flags&1)?aasync_start(fn,argc,argv):fn.p->code(fn.p->parent,argc,argv);
  adepth--;return result;
}
static AV aasyncfunction(ACode code,AV env,const char *name) { AV fn=afunction(code,env,name);fn.p->flags|=1;return fn; }

#include "number.c"
static AV atostring(AV v) {
  char buf[128];
#ifdef ARYA_URL
  if(aurl_is(v,0)||aurl_is(v,1))return aurl_string(v);
#endif
  if(v.t==ABYTES)return abytes_to_text(v);
  switch(v.t) {
    case ASTR:return v; case AUNDEF:return astr("undefined"); case ANULL:return astr("null"); case ABOOL:return astr(v.n?"true":"false");
    case ANUM:
      if(isnan(v.n)) return astr("NaN"); if(isinf(v.n)) return astr(v.n<0?"-Infinity":"Infinity"); if(v.n==0) return astr("0");
      aformat_number(v.n,buf);
      return astr(buf);
    case ARECORD:return astr("[object Object]"); case AFUNC:return astr("[function]");
    case ALIST: { /* Preserve primitive list-to-string conversion, detect cycles. */
      static AH *active[128]; static int depth; if(depth>=128) return astr(""); for(int j=0;j<depth;j++) if(active[j]==v.p) return astr(""); active[depth++]=v.p;
      AV roots[2]={astr(""),av(AUNDEF)}; ARoot r; aroot(&r,roots,2);
      for(size_t i=0;i<v.p->len;i++) { roots[1]=(v.p->data[i].t==ANULL || v.p->data[i].t==AUNDEF || v.p->data[i].t==AUINIT)?astr(""):atostring(v.p->data[i]); if(afailed){aunroot(&r);return av(AUNDEF);}size_t a=(size_t)roots[0].p->scope,b=(size_t)roots[1].p->scope;if(a>16777216-b){aunroot(&r);return afail("RangeError","Concatenation exceeds the string limit.");}uint16_t *u=(uint16_t*)amemory((a+b+2)*sizeof(uint16_t)); memcpy(u,roots[0].p->chars,a*sizeof(uint16_t)); if(i) u[a++]=','; memcpy(u+a,roots[1].p->chars,b*sizeof(uint16_t)); roots[0]=as16(u,a+b); free(u); }
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
  if(afailed){aunroot(&r);return av(AUNDEF);}size_t a=(size_t)roots[0].p->scope,b=(size_t)roots[1].p->scope;if(a>16777216-b){aunroot(&r);return afail("RangeError","Concatenation exceeds the string limit.");}uint16_t *u=(uint16_t*)amemory((a+b+1)*sizeof(uint16_t)); memcpy(u,roots[0].p->chars,a*sizeof(uint16_t)); memcpy(u+a,roots[1].p->chars,b*sizeof(uint16_t)); AV result=as16(u,a+b); free(u); aunroot(&r); return result;
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
static AV atext_method(AV object,AV key,int argc,AV *argv);
static AV aarray_method(AV object,AV key,int argc,AV *argv);
#ifdef ARYA_REGEX
static int aregex_is(AV value);
static AV aregex_get(AV object,AV key);
static AV aregex_text(AV input,AV key,int argc,AV *argv);
#endif
static AV apromise_get(AV object,AV key);
static AV adate_get(AV object,AV key);
static AV abytes_get(AV object,AV key);
static AV acollection_get(AV object,AV key);
static AV acollection_invoke(AV object,AV key,int argc,AV *argv);
#ifdef ARYA_PYTHON
static int apython_reference(AV value);
static int apython_bound(AV value);
static AV apython_get(AV value,AV key);
#endif
static AV aiter_get(AV object,AV key);
static AV anumber_method(AV env,int argc,AV *argv);
static AV advalue_property(AV value,AV key);
static AV acsv_property(AV value,AV key);
static AV aget(AV object,AV key) {
  if(object.t==ANULL || object.t==AUNDEF) return afail("TypeError","Cannot read property of null or undefined.");
#ifdef ARYA_REGEX
  if(aregex_is(object))return aregex_get(object,key);
#endif
  if(object.t==APROMISE)return apromise_get(object,key);
  if(object.t==ADATE)return adate_get(object,key);
  if(object.t==ABYTES)return abytes_get(object,key);
  if(object.t==AAITER)return aiter_get(object,key);
#ifdef ARYA_PYTHON
  if(apython_reference(object)||apython_bound(object))return apython_get(object,key);
#endif
  if(object.t==AHANDLE&&object.p->name&&(!strcmp(object.p->name,"arya.map")||!strcmp(object.p->name,"arya.set")))return acollection_get(object,key);
  if(object.t==AHANDLE&&object.p->name&&!strcmp(object.p->name,"arya.decimal"))return advalue_property(object,key);
  if(object.t==AHANDLE&&object.p->name&&!strcmp(object.p->name,"arya.csv"))return acsv_property(object,key);
#ifdef ARYA_URL
  if(aurl_is(object,0)||aurl_is(object,1))return aurl_get(object,key);
#endif
  if(object.t==ANUM&&(akey(key,"toFixed")||akey(key,"toString"))){AV roots[2]={object,key};ARoot r;aroot(&r,roots,2);AV env=alist(2,roots);roots[0]=env;AV result=afunction(anumber_method,env,"number method");aunroot(&r);return result;}
  if(object.t==ARECORD||object.t==AFUNC) { if(key.t!=ASTR) return afail("TypeError","Record keys must be strings."); for(size_t i=0;i<object.p->len;i+=2) if(aseq(key,object.p->data[i])) return aread(object.p->data[i+1]); return av(AUNDEF); }
  if(object.t==ALIST || object.t==ASTR) {
    if(akey(key,"length")) return an(object.t==ALIST?(double)object.p->len:object.p->scope);
    size_t index; if(aindex(key,&index)) { if(object.t==ALIST) return index<object.p->len&&object.p->data[index].t!=AUINIT?object.p->data[index]:av(AUNDEF); return index<(size_t)object.p->scope?as16(object.p->chars+index,1):av(AUNDEF); }
    if(object.t==ALIST&&object.p->tag.t==ARECORD){for(size_t i=0;i<object.p->tag.p->len;i+=2)if(aseq(key,object.p->tag.p->data[i]))return object.p->tag.p->data[i+1];}
    const char *methods[]={"push","pop","join","slice","includes","indexOf","toUpperCase","toLowerCase","trim","trimStart","trimEnd","split","charAt","charCodeAt","codePointAt","at","substring","substr","startsWith","endsWith","lastIndexOf","repeat","padStart","padEnd","concat","replace","replaceAll","isWellFormed","toWellFormed","map","filter","flatMap","find","findIndex","findLast","findLastIndex","some","every","forEach","reduce","reduceRight","sort","toSorted","reverse","toReversed","splice","toSpliced","shift","unshift","fill","copyWithin","flat","with","keys","values","entries","toString","match","matchAll","search"};int method=0;for(size_t i=0;i<sizeof(methods)/sizeof(*methods);i++)if(akey(key,methods[i]))method=1;
    if(method) {
      AV roots[2]={object,key}; ARoot r; aroot(&r,roots,2); AV env=alist(2,roots); roots[0]=env; AV result=afunction(abound,env,"method"); aunroot(&r); return result;
    }
    return av(AUNDEF);
  }
  return av(AUNDEF);
}
/* A cache contains an offset, never a heap pointer or a private layout exposed
 * to bindings. Validate the actual key on every use, including after deletion,
 * reshaping or a different record. Accessors and live references still read. */
typedef struct {size_t slot;} AFieldCache;
static AV aget_cached(AV object,AV key,AFieldCache *cache) {
  if((object.t!=ARECORD&&object.t!=AFUNC)||key.t!=ASTR)return aget(object,key);
  size_t slot=cache->slot;
  if(slot<object.p->len&&aseq(key,object.p->data[slot])){ACOUNT(field_cache_hits);return aread(object.p->data[slot+1]);}
  for(size_t i=0;i<object.p->len;i+=2)if(aseq(key,object.p->data[i])){cache->slot=i;return aread(object.p->data[i+1]);}
  return av(AUNDEF);
}
/* Resolve before evaluating arguments, as a normal property call does. The
 * receiver stays in a caller root; detached methods retain the generic path. */
static AV aimmediate_get(AV object,AV key,int *direct) {
  *direct=0;
  if(object.t==ALIST||object.t==ASTR){
    if(object.t==ALIST&&object.p->tag.t==ARECORD)for(size_t i=0;i<object.p->tag.p->len;i+=2)if(aseq(key,object.p->tag.p->data[i]))return aget(object,key);
    const char *names[]={"push","pop","includes","indexOf","slice","join","map","filter","flatMap","forEach","reduce","sort","toSorted","reverse","concat","toLowerCase","toUpperCase","trim","startsWith","endsWith","split","replace","replaceAll"};
    for(size_t i=0;i<sizeof(names)/sizeof(*names);i++)if(akey(key,names[i])){*direct=1;return av(AUNDEF);}
  }
  if(object.t==AHANDLE&&object.p->name&&(!strcmp(object.p->name,"arya.map")||!strcmp(object.p->name,"arya.set"))){
    int set=!strcmp(object.p->name,"arya.set");const char *names[]={"has","get","set","add","clear","delete","keys","values","entries","forEach"};
    for(int i=0;i<10;i++)if(akey(key,names[i])&&!(set&&(i==1||i==2))&&!(!set&&i==3)){*direct=1;return av(AUNDEF);}
  }
  return aget(object,key);
}
static AV aimmediate_call(AV callee,AV object,AV key,int direct,int argc,AV *argv) {
  if(!direct)return acall_rooted(callee,argc,argv);
  ACOUNT(direct_calls);if(!acall_enter())return av(AUNDEF);
  AV result=object.t==ALIST?aarray_method(object,key,argc,argv):object.t==ASTR?atext_method(object,key,argc,argv):acollection_invoke(object,key,argc,argv);
  adepth--;return result;
}
static AV aset(AV object,AV key,AV value) {
#ifdef ARYA_REGEX
  if(aregex_is(object)){if(!akey(key,"lastIndex"))return afail("TypeError","Cannot assign a readonly regular-expression property.");object.p->data[2]=value;return value;}
#endif
#ifdef ARYA_URL
  if(aurl_is(object,0)||aurl_is(object,1))return aurl_set(object,key,value);
#endif
  if(object.t==ABYTES){size_t index;if(!aindex(key,&index)||index>=(size_t)object.p->scope)return value;double n=atonumber(value);((unsigned char*)object.p->chars)[index]=!isfinite(n)?0:(unsigned char)(int64_t)fmod(trunc(n),256);return value;}
  if(object.t==ARECORD||object.t==AFUNC) {
    if(object.p->scope<0) return afail("TypeError","Cannot assign a module or standard-library namespace.");
    if(key.t!=ASTR) return afail("TypeError","Record keys must be strings.");
    for(size_t i=0;i<object.p->len;i+=2) if(aseq(key,object.p->data[i])) { if(object.p->data[i+1].t==AREF||object.p->data[i+1].t==AGETTER) return afail("TypeError","Cannot assign a readonly property."); object.p->data[i+1]=value; return value; }
    aresize(object.p,object.p->len+2); object.p->data[object.p->len++]=key; object.p->data[object.p->len++]=value; return value;
  }
  if(object.t==ALIST) { if(object.p->scope<0)return afail("TypeError","Cannot assign a readonly list."); size_t index; if(akey(key,"length")) { double n=atonumber(value); if(!isfinite(n)||n<0||floor(n)!=n||n>10000000) return afail("RangeError","Invalid native list length."); aresize(object.p,(size_t)n); for(size_t i=object.p->len;i<(size_t)n;i++) object.p->data[i]=av(AUINIT); object.p->len=(size_t)n; return value; }
    if(!aindex(key,&index) || index>10000000) return afail("RangeError","Native list index must be between 0 and 10000000."); aresize(object.p,index+1); while(object.p->len<=index) object.p->data[object.p->len++]=av(AUINIT); object.p->data[index]=value; return value;
  }
  return afail("TypeError","Cannot assign this property.");
}
static AV abound(AV env,int argc,AV *argv) {
  AV object=env.p->data[0], key=env.p->data[1], first=argc?argv[0]:av(AUNDEF); size_t n=object.t==ALIST?object.p->len:(size_t)object.p->scope;
  if(object.t==ASTR)return atext_method(object,key,argc,argv);
  if(object.t==ALIST)return aarray_method(object,key,argc,argv);
  if(object.t==ALIST&&object.p->scope<0&&(akey(key,"push")||akey(key,"pop")))return afail("TypeError","Cannot mutate a readonly list.");
  if(akey(key,"push") && object.t==ALIST) { aresize(object.p,n+(size_t)argc); for(int i=0;i<argc;i++) object.p->data[object.p->len++]=argv[i]; return an((double)object.p->len); }
  if(akey(key,"pop") && object.t==ALIST) return n?object.p->data[--object.p->len]:av(AUNDEF);
  if(akey(key,"includes") || akey(key,"indexOf")) { long found=-1; if(object.t==ALIST) { for(size_t i=0;i<n;i++) if(aeq(object.p->data[i],first) || (akey(key,"includes") && object.p->data[i].t==ANUM && first.t==ANUM && isnan(first.n) && isnan(object.p->data[i].n))) { found=(long)i; break; } } else { AV s=atostring(first); size_t len=(size_t)s.p->scope; for(size_t i=0;i+len<=n;i++) if(!memcmp(object.p->chars+i,s.p->chars,len*sizeof(uint16_t))) { found=(long)i; break; } } return akey(key,"includes")?ab(found>=0):an((double)found); }
  if(akey(key,"slice")) { double from=argc?atonumber(argv[0]):0,to=argc>1?atonumber(argv[1]):(double)n; if(isnan(from)) from=0; if(isnan(to)) to=0; if(from<0) from=fmax(0,(double)n+trunc(from)); if(to<0) to=fmax(0,(double)n+trunc(to)); from=fmin((double)n,fmax(0,trunc(from))); to=fmin((double)n,fmax(from,trunc(to))); return object.t==ALIST?alist((int)(to-from),object.p->data+(size_t)from):as16(object.p->chars+(size_t)from,(size_t)(to-from)); }
  if(akey(key,"join") && object.t==ALIST) {
    AV roots[4]={object,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot r;aroot(&r,roots,4);
    roots[1]=argc&&first.t!=AUNDEF?atostring(first):astr(",");roots[2]=alist((int)n,NULL);
    size_t length=n?(n-1)*(size_t)roots[1].p->scope:0;
    for(size_t i=0;i<n;i++){AV value=object.p->data[i];roots[3]=(value.t==ANULL||value.t==AUNDEF||value.t==AUINIT)?astr(""):atostring(value);roots[2].p->data[i]=roots[3];length+=(size_t)roots[3].p->scope;if(length>16*1024*1024){aunroot(&r);return afail("RangeError","Joined text exceeds 16 MiB.");}}
    uint16_t *text=(uint16_t*)amemory((length+1)*sizeof(uint16_t));size_t at=0;
    for(size_t i=0;i<n;i++){if(i){size_t size=(size_t)roots[1].p->scope;memcpy(text+at,roots[1].p->chars,size*sizeof(uint16_t));at+=size;}AV item=roots[2].p->data[i];size_t size=(size_t)item.p->scope;memcpy(text+at,item.p->chars,size*sizeof(uint16_t));at+=size;}
    AV result=as16(text,length);free(text);aunroot(&r);return result;
  }
  if(object.t==ASTR && (akey(key,"toUpperCase") || akey(key,"toLowerCase") || akey(key,"trim"))) { uint16_t *u=(uint16_t*)amemory((n+1)*sizeof(uint16_t)); memcpy(u,object.p->chars,n*sizeof(uint16_t)); size_t begin=0,end=n; if(akey(key,"trim")) { while(begin<end && u[begin]<128 && isspace(u[begin])) begin++; while(end>begin && u[end-1]<128 && isspace(u[end-1])) end--; } else for(size_t i=0;i<n;i++) if(u[i]<128) u[i]=(uint16_t)(akey(key,"toUpperCase")?toupper(u[i]):tolower(u[i])); AV result=as16(u+begin,end-begin); free(u); return result; }
  if(object.t==ASTR && akey(key,"split")) { AV roots[4]={object,av(AUNDEF),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,4); roots[1]=alist(0,NULL); if(!argc) { aresize(roots[1].p,1); roots[1].p->data[0]=object; roots[1].p->len=1; } else { roots[2]=atostring(first); size_t sep=(size_t)roots[2].p->scope,start=0; for(size_t i=0;i<=n;i++) { int hit=sep ? i+sep<=n && !memcmp(object.p->chars+i,roots[2].p->chars,sep*sizeof(uint16_t)) : i<n; if(hit || (sep && i==n)) { roots[3]=as16(object.p->chars+start,sep?i-start:1); AH *list=roots[1].p; aresize(list,list->len+1); list->data[list->len++]=roots[3]; if(sep && hit) { i+=sep-1; start=i+1; } else start=i+1; } } } AV result=roots[1]; aunroot(&r); return result; }
  return afail("TypeError","Unsupported native method.");
}
static AV abuiltin(AV env,int argc,AV *argv) {
  int id=(int)env.n; AV x=argc?argv[0]:av(AUNDEF);
  if(id==0) { for(int i=0;i<argc;i++) { if(argv[i].t==ANUM&&argv[i].n==0&&signbit(argv[i].n)){if(i)fputc(' ',stdout);fputs("-0",stdout);continue;} AV s=atostring(argv[i]); size_t size; char *text=autf8bytes(s,&size); if(i) fputc(' ',stdout); fwrite(text,1,size,stdout); free(text); } fputc('\n',stdout); fflush(stdout); return av(AUNDEF); }
  if(id==1) { if(x.t!=ASTR && x.t!=ALIST) return afail("TypeError","len expects a string or list."); return an(x.t==ASTR?x.p->scope:(double)x.p->len); }
  if(id==2) return atostring(x);
  if(id==3) return an(atonumber(x));
  if(id==5) return ab(atruth(x));
  if(id==4) { double start=argc>1?atonumber(x):0,end=argc>1?atonumber(argv[1]):atonumber(x),step=argc>2 && argv[2].t!=AUNDEF?atonumber(argv[2]):1;
    if(argc>1 && argv[1].t==AUNDEF) { end=start; start=0; }
    if(!isfinite(start)||!isfinite(end)||!isfinite(step)||floor(start)!=start||floor(end)!=end||floor(step)!=step||fabs(start)>9007199254740991.0||fabs(end)>9007199254740991.0||fabs(step)>9007199254740991.0||step==0) return afail("TypeError","range expects safe integers and a nonzero step.");
    double count=fmax(0,ceil((end-start)/step)); if(count>100000) return afail("RangeError","range supports at most 100000 items."); AH *h=aalloc(ALIST,(size_t)count); for(size_t i=0;i<h->len;i++) h->data[i]=an(start+(double)i*step); return ap(h);
  }
  return afail("TypeError","Unknown builtin.");
}
static AV abuilt(int id) { AV env=an(id); return afunction(abuiltin,env,"builtin"); }
#include "helpers.c"
static AV aappend_value(AV list,AV value);
static AV aiternext(AV iterable,AV *position);
#include "text.c"
#include "array.c"
#ifdef ARYA_REGEX
#include "regex.c"
#endif
#include "async.c"
#include "signals.c"
static AV aprocess(int id,int argc,AV *argv) {
  if(id==46)return asignal_register(argc,argv);
  if(id==40) {
    if(!argc || argv[0].t!=ALIST || !argv[0].p->len) return afail("TypeError","process.run expects a nonempty argument list.");
    size_t n=argv[0].p->len; char **args=(char**)amemory((n+1)*sizeof(char*));
    for(size_t i=0;i<n;i++) { AV value=argv[0].p->data[i]; if(value.t!=ASTR) { for(size_t j=0;j<i;j++)free(args[j]);free(args);return afail("TypeError","Process arguments must be strings."); } for(int j=0;j<value.p->scope;j++) if(!value.p->chars[j]) {for(size_t k=0;k<i;k++)free(args[k]);free(args);return afail("TypeError","Process arguments cannot contain NUL.");} args[i]=autf8(value); }
    fflush(NULL); pid_t pid=fork(); if(pid==0) {execvp(args[0],args);fprintf(stderr,"Cannot start %s: %s\n",args[0],strerror(errno));_exit(127);} for(size_t i=0;i<n;i++)free(args[i]);free(args);
    if(pid<0)return afail("IOError",strerror(errno));int status=0;while(waitpid(pid,&status,0)<0){if(errno!=EINTR)return afail("IOError",strerror(errno));}return an(WIFEXITED(status)?WEXITSTATUS(status):128+WTERMSIG(status));
  }
  if(id==45) {AV text=atostring(argc?argv[0]:av(AUNDEF));size_t size;char *bytes=autf8bytes(text,&size);fwrite(bytes,1,size,stderr);fputc('\n',stderr);free(bytes);return av(AUNDEF);}
  if(id==41) { double n=argc?atonumber(argv[0]):0; exit(isfinite(n)?(int)fmod(trunc(n),256):1); }
  if(id==42) {if(!argc||!apath_argument(argv[0]))return av(AUNDEF);char *name=autf8(argv[0]);const char *value=getenv(name);free(name);return value?astr(value):av(ANULL);}
  if(id==43) {char *cwd=getcwd(NULL,0);if(!cwd)return afail("IOError",strerror(errno));AV result=astr(cwd);free(cwd);return result;}
  if(id==44) {
    char buffer[PATH_MAX+1];
#ifdef __APPLE__
    uint32_t size=sizeof(buffer);if(_NSGetExecutablePath(buffer,&size))return afail("IOError","Executable path exceeds platform limit.");
#else
    ssize_t size=readlink("/proc/self/exe",buffer,PATH_MAX);if(size<0)return afail("IOError",strerror(errno));buffer[size]=0;
#endif
    char *canonical=realpath(buffer,NULL);if(!canonical)return aio_error(errno,"realpath",av(AUNDEF));AV executable=astr(canonical);free(canonical);return executable;
  }
  if(id>=50&&id<=54) {
    if(!argc||!apath_argument(argv[0]))return av(AUNDEF);for(int i=1;i<argc;i++)if(!apath_argument(argv[i]))return av(AUNDEF);
    if(id==54) {char *path=autf8(argv[0]);char *canonical=realpath(path,NULL);free(path);if(!canonical)return aio_error(errno,"realpath",argv[0]);AV result=astr(canonical);free(canonical);return result;}
    AV roots[2]={argv[0],av(AUNDEF)}; ARoot r;aroot(&r,roots,2);
    if(id==50||id==53) {for(int i=1;i<argc;i++){roots[1]=astr("/");roots[0]=aconcat(roots[0],roots[1]);roots[0]=aconcat(roots[0],argv[i]);}}
    char *text=autf8(roots[0]);
    if(id==51||id==52){char *slash=strrchr(text,'/');if(id==51){if(slash){if(slash==text)slash[1]=0;else *slash=0;}else {free(text);text=strdup(".");}}else if(slash)memmove(text,slash+1,strlen(slash+1)+1);}
    if(id==53 && text[0]!='/') {char *cwd=getcwd(NULL,0);if(!cwd){free(text);aunroot(&r);return afail("IOError",strerror(errno));}size_t n=strlen(cwd)+strlen(text)+2;char *next=(char*)amemory(n);snprintf(next,n,"%s/%s",cwd,text);free(cwd);free(text);text=next;}
    if(id==50||id==53){size_t length=strlen(text);char **parts=(char**)amemory((length+1)*sizeof(char*));size_t count=0;int absolute=text[0]=='/';char *save=NULL;for(char *part=strtok_r(text,"/",&save);part;part=strtok_r(NULL,"/",&save)){if(!strcmp(part,"."))continue;if(!strcmp(part,"..")&&count&&strcmp(parts[count-1],"..")){count--;continue;}if(!strcmp(part,"..")&&absolute&&!count)continue;parts[count++]=part;}char *normalized=(char*)amemory(length+2);size_t at=0;if(absolute)normalized[at++]='/';for(size_t i=0;i<count;i++){if(i)normalized[at++]='/';size_t n=strlen(parts[i]);memcpy(normalized+at,parts[i],n);at+=n;}if(!at)normalized[at++]='.';normalized[at]=0;free(parts);free(text);text=normalized;}
    AV result=astr(text);free(text);aunroot(&r);return result;
  }
  if(id==68){
    if(argc<2||!apath_argument(argv[0])||!apath_argument(argv[1]))return av(AUNDEF);
    char *from=autf8(argv[0]),*to=autf8(argv[1]);int status;
#ifdef __APPLE__
    status=renameatx_np(AT_FDCWD,from,AT_FDCWD,to,RENAME_EXCL);
#elif defined(__linux__) && defined(SYS_renameat2)
    status=(int)syscall(SYS_renameat2,AT_FDCWD,from,AT_FDCWD,to,1);
#else
    errno=ENOSYS;status=-1;
#endif
    int saved=errno;free(from);free(to);return status?aio_error(saved,"rename-exclusive",argv[1]):av(AUNDEF);
  }
  if(id==67){if(!argc||!apath_argument(argv[0]))return av(AUNDEF);char *path=autf8(argv[0]);struct stat info;int status=lstat(path,&info),saved=errno;free(path);if(status){if(saved==ENOENT||saved==ENOTDIR)return av(ANULL);return aio_error(saved,"lstat",argv[0]);}AV result=arecord();ARoot root;aroot(&root,&result,1);aput(result,"type",astr(S_ISREG(info.st_mode)?"file":S_ISDIR(info.st_mode)?"directory":S_ISLNK(info.st_mode)?"symlink":"other"));aput(result,"size",an((double)info.st_size));aput(result,"device",an((double)info.st_dev));aput(result,"inode",an((double)info.st_ino));aput(result,"modified",an((double)info.st_mtime));aput(result,"changed",an((double)info.st_ctime));aput(result,"mode",an((double)info.st_mode));
#ifdef __APPLE__
    aput(result,"modifiedNanoseconds",an(info.st_mtimespec.tv_nsec));aput(result,"changedNanoseconds",an(info.st_ctimespec.tv_nsec));
#else
    aput(result,"modifiedNanoseconds",an(info.st_mtim.tv_nsec));aput(result,"changedNanoseconds",an(info.st_ctim.tv_nsec));
#endif
aunroot(&root);return result;}
  if(id==66){if(!argc||!apath_argument(argv[0]))return av(AUNDEF);char *path=autf8(argv[0]);struct stat info;int status=stat(path,&info),saved=errno;free(path);if(status&&saved!=ENOENT&&saved!=ENOTDIR)return aio_error(saved,"stat",argv[0]);return ab(!status&&S_ISREG(info.st_mode));}
  if(id==65) {
    if(argc<2||!apath_argument(argv[0])||!apath_argument(argv[1]))return av(AUNDEF);
    char *from=autf8(argv[0]),*to=autf8(argv[1]);int status=link(from,to),saved=errno;free(from);free(to);return status?aio_error(saved,"link",argv[0]):av(AUNDEF);
  }
  if(id==63) {if(!argc||!apath_argument(argv[0]))return av(AUNDEF);char *pattern=autf8(argv[0]);if(!mkdtemp(pattern)){int saved=errno;free(pattern);return aio_error(saved,"mkdtemp",argv[0]);}AV result=astr(pattern);free(pattern);return result;}
  if(id>=60&&id<=64) {
    if(!argc||!apath_argument(argv[0]))return av(AUNDEF);if(id==61&&(argc<2||!apath_argument(argv[1])))return av(AUNDEF);char *text=autf8(argv[0]);int status=0;
    if(id==60&&!*text){free(text);return aio_error(ENOENT,"mkdir",argv[0]);}
    if(id==60){for(char *p=text+1;*p;p++)if(*p=='/'){*p=0;if(amkdir_checked(text)){status=-1;*p='/';break;}*p='/';}if(!status&&amkdir_checked(text))status=-1;}
    else if(id==61){if(argc<2||argv[1].t!=ASTR){free(text);return afail("TypeError","rename expects two paths.");}char *to=autf8(argv[1]);status=rename(text,to);free(to);}
    else if(id==64)status=rmdir(text);else status=unlink(text);
    int saved=errno;free(text);return status?aio_error(saved,id==60?"mkdir":id==61?"rename":id==64?"rmdir":"unlink",argv[0]):av(AUNDEF);
  }
  return afail("TypeError","Unknown process/path operation.");
}

#include "decimal.c"
static AV aappend_value(AV list,AV value);
#include "json.c"
#include "list.c"
#include "async-stream.c"
#include "env.c"
#include "datetime.c"
#include "validate.c"
#include "debug.c"
#include "log.c"
#include "math.c"
#include "bytes.c"
#include "uri.c"
#ifdef ARYA_URL
#include "url.c"
#endif
#include "objects.c"
#include "csv.c"
#include "globals.c"
#ifdef ARYA_ACCOUNTING
#include "accounting.c"
#endif
#ifdef ARYA_DESKTOP
#include "desktop.c"
#endif
#ifdef ARYA_PYTHON
#include "python.c"
#endif
#include "html.c"
#ifdef ARYA_HTTP
#include "http.c"
#endif
#if defined(ARYA_CRYPTO) || defined(ARYA_MYSQL)
#include "jobs.c"
#endif
#ifdef ARYA_CRYPTO
#include "security.c"
#endif
#ifdef ARYA_MYSQL
#include "mysql.c"
#endif
#include <dirent.h>
static AV astdcall(AV env,int argc,AV *argv);
static AV astd_async(AV env,int argc,AV *argv){acurrent_task->state=0;atask_yield();return astdcall(env,argc,argv);}
static AV astdcall(AV env,int argc,AV *argv) {
  if(env.n==1900)return acsv_decoder(argc,argv);
#ifdef ARYA_ACCOUNTING
  if(env.n>=1800&&env.n<=1805)return aaccounting_operation((int)env.n,argc,argv);
#endif
#ifdef ARYA_DESKTOP
  if(env.n==1700)return adesktop_operation(argc,argv);
#endif
#ifdef ARYA_PYTHON
  if(env.n>=1600&&env.n<=1603)return apython_operation((int)env.n,argc,argv);
#endif
#ifdef ARYA_MYSQL
  if(env.n>=1500&&env.n<=1506)return amysql_operation((int)env.n,argc,argv);
#endif
#ifdef ARYA_HTTP
  if(env.n>=1400&&env.n<=1407)return ahttp_operation((int)env.n,argc,argv);
#endif
  if(env.n>=1300&&env.n<=1322)return aruntime_objects((int)env.n,argc,argv);
#ifdef ARYA_CRYPTO
  if(env.n>=1200&&env.n<=1213)return asecurity((int)env.n,argc,argv);
#endif
  if(env.n>=1000&&env.n<=1025)return amath((int)env.n,argc,argv);
  if(env.n>=400&&env.n<=402)return aasync_library((int)env.n,argc,argv);
  if(env.n==202||env.n==203){AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);if(env.n==202){r[0]=astdcall(an(10),argc,argv);if(!afailed)r[1]=ajson(200,1,r);}else{r[0]=argc>1?argv[1]:av(AUNDEF);AV args[3]={r[0],av(ANULL),an(2)};r[1]=ajson(201,3,args);if(!afailed){r[1]=aconcat(r[1],astr("\n"));AV write[2]={argc?argv[0]:av(AUNDEF),r[1]};r[1]=astdcall(an(11),2,write);}}AV result=r[1];aunroot(&root);return result;}
  if(env.n==14){if(!argc||!apath_argument(argv[0]))return av(AUNDEF);char *path=autf8(argv[0]);DIR *directory=opendir(path);int openedError=errno;free(path);if(!directory)return aio_error(openedError,"scandir",argv[0]);AV r[2]={alist(0,NULL),av(AUNDEF)};ARoot root;aroot(&root,r,2);struct dirent *item;errno=0;while((item=readdir(directory))){if(!strcmp(item->d_name,".")||!strcmp(item->d_name,".."))continue;r[1]=astr(item->d_name);aappend_value(r[0],r[1]);if(afailed)break;}int saved=errno;closedir(directory);if(saved&&!afailed)aio_error(saved,"scandir",argv[0]);AV result=r[0];aunroot(&root);return afailed?av(AUNDEF):result;}
  if(env.n>=800&&env.n<=802)return adebug((int)env.n,argc,argv);
  if(env.n==810)return alog_create(argc,argv);
  if(env.n>=700&&env.n<=710)return avalidation((int)env.n,argc,argv);
  if(env.n>=510&&env.n<=516)return adateline((int)env.n,argc,argv);
  if(env.n>=500&&env.n<=503)return aenvironment((int)env.n,argc,argv);
  int id=(int)env.n; if(id>=300&&id<=310)return alist_standard(id,argc,argv); if(id>=200&&id<=201)return ajson(id,argc,argv); if(id>=110&&id<=118)return adecimal_values(id,argc,argv); if(id>=100&&id<=107)return adecimal(id,argc,argv); if(id>=40)return aprocess(id,argc,argv); AV x=argc?argv[0]:av(AUNDEF); double n=argc && id>=20 && id<30?atonumber(x):NAN;
  if(id==0) return abuiltin(an(0),argc,argv);
  if(id==3)return aread_chunk(argc,argv);
  if(id==1){if(ainput_mode==2)return afail("TypeError","Do not mix readLine and readChunk on stdin.");ainput_mode=1;}
  if(id==1) {
    size_t count=0,cap=128;char *line=(char*)amemory(cap);int c;
    /* Arya stdin operations run on the main cooperative thread. Hold the
     * stdio lock once, retaining byte/NUL semantics and the pre-allocation
     * frame bound, instead of locking on every fgetc. */
    flockfile(stdin);
    while((c=getc_unlocked(stdin))!=EOF&&c!='\n'){
      if(count>=1024*1024){funlockfile(stdin);free(line);return afail("RangeError","Native input frame exceeds 1 MiB.");}
      if(count+1>=cap){cap*=2;char *p=(char*)realloc(line,cap);if(!p){funlockfile(stdin);free(line);return afail("Error","Input is too large.");}line=p;}
      line[count++]=(char)c;
    }
    funlockfile(stdin);
    if(!count&&c==EOF){free(line);return av(ANULL);}if(count&&line[count-1]=='\r')count--;line[count]=0;
    AV result=astrn(line,count);free(line);return result;
  }
  if(id==2) { AV text=atostring(x); size_t size; char *bytes=autf8bytes(text,&size); fwrite(bytes,1,size,stdout); fflush(stdout); free(bytes); return av(AUNDEF); }
  if(id>=10 && id<=13) {
    if(x.t!=ASTR) return afail("TypeError","File path must be a string."); for(int i=0;i<x.p->scope;i++) if(!x.p->chars[i]) return afail("TypeError","File path contains NUL."); char *path=autf8(x);
    if(id==13) {int status=access(path,F_OK),saved=errno;free(path);if(status&&saved!=ENOENT)return aio_error(saved,"access",x);return ab(status==0);}
    FILE *f=fopen(path,id==10?"rb":(id==11?"wb":"ab"));int openError=errno;free(path);if(!f)return aio_error(openError,"open",x);
    if(id==10) { size_t cap=4096,used=0; char *buf=(char*)amemory(cap+1); size_t got; while((got=fread(buf+used,1,cap-used,f))>0) { used+=got; if(used==cap) { if(cap>=16*1024*1024) { fclose(f); free(buf); return afail("RangeError","Text file exceeds 16 MiB."); } cap*=2; char *next=(char*)realloc(buf,cap+1); if(!next) { fclose(f); free(buf); return afail("Error","Out of memory reading file."); } buf=next; } } int failed=ferror(f),saved=errno;fclose(f);if(failed){free(buf);return aio_error(saved?saved:EIO,"read",x);} buf[used]=0; AV result=astrn(buf,used); free(buf); return result; }
    AV text=atostring(argc>1?argv[1]:av(AUNDEF)); size_t size; char *bytes=autf8bytes(text,&size); int failed=fwrite(bytes,1,size,f)!=size,saved=errno;free(bytes);if(fclose(f)){failed=1;saved=errno;}return failed?aio_error(saved?saved:EIO,"write",x):av(AUNDEF);
  }
  if(id==20) return an(sqrt(n)); if(id==21) return an(fabs(n)); if(id==22) return an(floor(n)); if(id==23) return an(ceil(n)); if(id==24) {if(n==0||!isfinite(n)||fabs(n)>=4503599627370496.0)return an(n);double low=floor(n),rounded=n-low<0.5?low:low+1;return an(rounded==0&&n<0?-0.0:rounded);} if(id==25) return an(apower(n,argc>1?atonumber(argv[1]):NAN)); if(id==26) return an(sin(n)); if(id==27) return an(cos(n));
  if(id==28 || id==29) { double result=id==28?INFINITY:-INFINITY; for(int i=0;i<argc;i++) { double v=atonumber(argv[i]); if(isnan(v)) return an(NAN); if(v==0&&result==0)result=id==28?(signbit(v)||signbit(result)?-0.0:0.0):(!signbit(v)||!signbit(result)?0.0:-0.0);else result=id==28?fmin(result,v):fmax(result,v); } return an(result); }
  if(id==30) return an((double)clock()/CLOCKS_PER_SEC);
  if(id==31) { agc(); return an((double)aallocated); }
  if(id==32) {if(x.t!=ASTR)return afail("TypeError","codeUnit expects a string.");double index=argc>1?atonumber(argv[1]):0;return isfinite(index)&&index>=0&&index<x.p->scope?an(x.p->chars[(size_t)index]):an(NAN);}
  if(id==34){if(x.t!=ARECORD&&x.t!=AFUNC)return afail("TypeError","keys expects a record.");return ajkeys(x);}
  if(id==35){
#ifdef __APPLE__
    return astr("darwin");
#elif defined(_WIN32)
    return astr("win32");
#else
    return astr("linux");
#endif
  }
  return afail("TypeError","Unknown standard-library function.");
}
static void astdfield(AV obj,const char *key,int id) { AV roots[3]={obj,av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3); roots[1]=astr(key); roots[2]=afunction(astdcall,an(id),key); aset(obj,roots[1],roots[2]); aunroot(&r); }
static void astdasyncfield(AV obj,const char *key,int id){AV r[3]={obj,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=astr(key);r[2]=aasyncfunction(astd_async,an(id),key);aset(obj,r[1],r[2]);aunroot(&root);}
static AV astd(const char *name) {
  AV roots[3]={arecord(),av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3);
  if(!strcmp(name,"list")) {const char *names[]={"map","flatMap","filter","find","reduce","groupBy","sortBy","take","unique","sum","reserve"};for(int i=0;i<11;i++)astdfield(roots[0],names[i],300+i);}
#ifdef ARYA_ACCOUNTING
  else if(!strcmp(name,"_accounting")){const char *names[]={"prepareInvoices","prepareLedger","metadata","begin","step","finish"};for(int i=0;i<6;i++)astdfield(roots[0],names[i],1800+i);}
#endif
#ifdef ARYA_DESKTOP
  else if(!strcmp(name,"desktop")){astdfield(roots[0],"open",1700);}
#endif
#ifdef ARYA_PYTHON
  else if(!strcmp(name,"_python")){astdasyncfield(roots[0],"run",1600);astdfield(roots[0],"runSync",1601);astdfield(roots[0],"metadata",1602);astdfield(roots[0],"bind",1603);}
#endif
#ifdef ARYA_MYSQL
  else if(!strcmp(name,"_mysql")){const char *names[]={"open","execute","ping","begin","commit","rollback","close"};for(int i=0;i<7;i++)astdasyncfield(roots[0],names[i],1500+i);}
#endif
#ifdef ARYA_HTTP
  else if(!strcmp(name,"_http")){const char *names[]={"listen","accept","close","address","send","read","file","requestId"};for(int i=0;i<8;i++){if(i==1||i==4||i==5)astdasyncfield(roots[0],names[i],1400+i);else astdfield(roots[0],names[i],1400+i);}}
#endif
  else if(!strcmp(name,"async")){astdfield(roots[0],"map",400);astdfield(roots[0],"each",401);astdfield(roots[0],"sleep",402);}
#ifdef ARYA_CRYPTO
  else if(!strcmp(name,"security")){const char *names[]={"randomToken","uuid","generateKey","hash","hmac","verifyHmac","timingSafeEqual","hashPassword","verifyPassword","passwordNeedsUpgrade","verifyPasswordAndUpgrade","keyring","encrypt","decrypt"};for(int i=0;i<14;i++){if(i==7||i==8||i==10)astdasyncfield(roots[0],names[i],1200+i);else astdfield(roots[0],names[i],1200+i);}}
#endif
  else if(!strcmp(name,"env")){const char *names[]={"get","require","int","bool"};for(int i=0;i<4;i++)astdfield(roots[0],names[i],500+i);}
  else if(!strcmp(name,"datetime")){const char *names[]={"date","instant","zoned","fromDate","toDate","dateAt","atOffset"};for(int i=0;i<7;i++)astdfield(roots[0],names[i],510+i);}
  else if(!strcmp(name,"validate")){const char *names[]={"string","number","integer","boolean","enum","optional","nullable","array","object","check","parse"};for(int i=0;i<11;i++)astdfield(roots[0],names[i],700+i);}
  else if(!strcmp(name,"debug")){const char *names[]={"assert","inspect","trace"};for(int i=0;i<3;i++)astdfield(roots[0],names[i],800+i);}
  else if(!strcmp(name,"log")){astdfield(roots[0],"create",810);}
  else if(!strcmp(name,"json")) {astdfield(roots[0],"parse",200);astdfield(roots[0],"stringify",201);astdasyncfield(roots[0],"read",202);astdasyncfield(roots[0],"write",203);}
  else if(!strcmp(name,"decimal")) {const char *names[]={"from","add","subtract","multiply","compare","divide","quantize","toNumber"};for(int i=0;i<8;i++)astdfield(roots[0],names[i],100+i);const char *modes[]={"up","down","ceil","floor","half-up","half-down","half-even","half-ceil","half-floor"};roots[2]=alist(9,NULL);for(int i=0;i<9;i++)roots[2].p->data[i]=astr(modes[i]);roots[2].p->scope=-2;roots[1]=astr("roundingModes");aset(roots[0],roots[1],roots[2]);roots[2]=arecord();const char *values[]={"parse","format","add","subtract","multiply","compare","divide","quantize","toNumber"};for(int i=0;i<9;i++)astdfield(roots[2],values[i],110+i);roots[2].p->scope=-2;roots[1]=astr("values");aset(roots[0],roots[1],roots[2]);}
  else if(!strcmp(name,"io")) { astdfield(roots[0],"print",0); astdfield(roots[0],"readLine",1); astdfield(roots[0],"write",2);astdfield(roots[0],"readChunk",3); }
  else if(!strcmp(name,"_csv")){astdfield(roots[0],"decoder",1900);}
  else if(!strcmp(name,"fs")) { astdasyncfield(roots[0],"readText",10);astdfield(roots[0],"readTextSync",10);astdasyncfield(roots[0],"writeText",11);astdfield(roots[0],"writeTextSync",11);astdasyncfield(roots[0],"list",14);astdfield(roots[0],"listSync",14);astdfield(roots[0],"appendText",12);astdasyncfield(roots[0],"exists",13);astdfield(roots[0],"existsSync",13); astdfield(roots[0],"makeDirectory",60); astdfield(roots[0],"rename",61); astdfield(roots[0],"remove",62); astdfield(roots[0],"tempDirectory",63); astdfield(roots[0],"removeDirectory",64); astdfield(roots[0],"publish",65); astdfield(roots[0],"isFile",66);astdfield(roots[0],"infoSync",67);astdfield(roots[0],"publishDirectory",68); }
  else if(!strcmp(name,"math")) { const char *names[]={"sqrt","abs","floor","ceil","round","pow","sin","cos","min","max"}; for(int i=0;i<10;i++) astdfield(roots[0],names[i],20+i);const char *extra[]={"acos","acosh","asin","asinh","atan","atanh","atan2","cbrt","clz32","cosh","exp","expm1","fround","f16round","hypot","imul","log","log10","log1p","log2","random","sign","sinh","tan","tanh","trunc"};for(int i=0;i<26;i++)astdfield(roots[0],extra[i],1000+i);const char *constants[]={"PI","E","LN2","LN10","LOG2E","LOG10E","SQRT1_2","SQRT2"};double values[]={3.14159265358979323846,2.71828182845904523536,0.69314718055994530942,2.30258509299404568402,1.44269504088896340736,0.43429448190325182765,0.70710678118654752440,1.41421356237309504880};for(int i=0;i<8;i++)aput(roots[0],constants[i],an(values[i])); }
  else if(!strcmp(name,"runtime")) { astdfield(roots[0],"clock",30); astdfield(roots[0],"collect",31); astdfield(roots[0],"codeUnit",32);astdfield(roots[0],"keys",34);astdfield(roots[0],"platform",35);const char *names[]={"kind","sameValue","deepEqual","freeze","context","exitCode","defer","onFinish","elapsed","fieldGetter","error","readFrame","writeFrame","tag","hasAccessor","errorMatches","stringFromCodes","randomUUID","isRecord","jsonParse","jsonStringify","uriEncode","uriDecode"};for(int i=0;i<23;i++)astdfield(roots[0],names[i],1300+i); }
  else if(!strcmp(name,"process")) { astdfield(roots[0],"run",40); astdfield(roots[0],"exit",41); astdfield(roots[0],"env",42); astdfield(roots[0],"cwd",43); astdfield(roots[0],"executable",44); astdfield(roots[0],"error",45);astdfield(roots[0],"onSignal",46); }
  else if((!strcmp(name,"path")||!strcmp(name,"_path"))) {astdfield(roots[0],"join",50);astdfield(roots[0],"dirname",51);astdfield(roots[0],"basename",52);astdfield(roots[0],"resolve",53);astdfield(roots[0],"realPath",54);}
  else afail("ImportError","Unknown native standard library.");
  roots[0].p->scope=-2;
  AV result=roots[0]; aunroot(&r); return result;
}
static AV aexport(AV env,int scope,size_t slot) { AH *h=aalloc(AREF,0); h->parent=ap(afind(env,scope)); AV result=ap(h); result.n=(double)slot; return result; }
static int areport(void) { if(!afailed) return 0; AV root=aerror; ARoot r; aroot(&r,&root,1); if(root.t==ARECORD) { AV keys[2]={astr("name"),av(AUNDEF)}; ARoot k; aroot(&k,keys,2); keys[1]=aget(root,keys[0]); AV msg=atostring(keys[1]); char *s=autf8(msg); fputs(s,stderr); free(s); keys[0]=astr("message"); keys[1]=aget(root,keys[0]); msg=atostring(keys[1]); s=autf8(msg); fprintf(stderr,": %s",s); free(s); aunroot(&k); } else { AV msg=atostring(root); char *s=autf8(msg); fprintf(stderr,"Uncaught: %s",s); free(s); } fprintf(stderr,"%s\n",atrace); aunroot(&r); return 1; }
static AV aiternext(AV iterable, AV *position) {
  if(iterable.t==AAITER){AV r[3]={iterable,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=aprop(iterable,"next");r[2]=acall(r[1],0,NULL);if(!afailed)r[2]=aawait(r[2]);AV result=av(AUNDEF);if(!afailed){r[1]=aprop(r[2],"done");result=atruth(r[1])?av(AUINIT):aprop(r[2],"value");}aunroot(&root);return result;}
  size_t i=(size_t)position->n;
  if(iterable.t==AHANDLE&&iterable.p->name&&(!strcmp(iterable.p->name,"arya.map")||!strcmp(iterable.p->name,"arya.set"))){int set=!strcmp(iterable.p->name,"arya.set");size_t step=set?1:2;if(i>=iterable.p->len/step)return av(AUINIT);position->n++;if(set)return iterable.p->data[i];AV r[2]={iterable,av(AUNDEF)};ARoot root;aroot(&root,r,2);r[1]=alist(2,iterable.p->data+2*i);AV result=r[1];aunroot(&root);return result;}
  if(iterable.t==ALIST) { if(i>=iterable.p->len) return av(AUINIT); position->n++; return iterable.p->data[i].t==AUINIT?av(AUNDEF):iterable.p->data[i]; }
  if(iterable.t==ASTR) { if(i>=(size_t)iterable.p->scope) return av(AUINIT); size_t count=1; unsigned c=iterable.p->chars[i]; if(c>=0xd800 && c<=0xdbff && i+1<(size_t)iterable.p->scope && iterable.p->chars[i+1]>=0xdc00 && iterable.p->chars[i+1]<=0xdfff) count=2; position->n+=(double)count; return as16(iterable.p->chars+i,count); }
  return afail("TypeError","Value is not iterable.");
}
static AV aiterclose(AV iterable) {
  if(iterable.t!=AAITER)return av(AUNDEF);
  AV r[2]={iterable,av(AUNDEF)};ARoot root;aroot(&root,r,2);r[1]=aprop(iterable,"return");
  if(!afailed&&r[1].t!=AUNDEF){r[1]=acall(r[1],0,NULL);if(!afailed)r[1]=aawait(r[1]);}
  aunroot(&root);return av(AUNDEF);
}
static void aaddexport(AV ns,const char *name,AV env,int scope,size_t slot) { AV roots[3]={ns,av(AUNDEF),av(AUNDEF)}; ARoot r; aroot(&r,roots,3); roots[1]=astr(name); roots[2]=aexport(env,scope,slot); aset(ns,roots[1],roots[2]); aunroot(&r); }

static AV aappend_value(AV list,AV value) {
  if(list.t!=ALIST)return afail("TypeError","Expected list accumulator.");
  if(list.p->len>=1000000)return afail("RangeError","Native list limit exceeded.");
  aresize(list.p,list.p->len+1);list.p->data[list.p->len++]=value;return list;
}
static AV aspread_into(AV list,AV iterable) {
  AV values[3]={list,iterable,av(AUNDEF)};ARoot r;aroot(&r,values,3);AV position=an(0);
  while(!afailed){values[2]=aiternext(iterable,&position);if(values[2].t==AUINIT)break;aappend_value(list,values[2]);}
  aunroot(&r);return list;
}
