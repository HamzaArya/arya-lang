/* Include a generated native fixture to test defensive guards not exposed by
 * source-level immutable builtin bindings. This is test-only C machinery. */
#define main arya_fixture_main
#include ARYA_FIXED_NUMBER_SOURCE
#undef main
#include <assert.h>
#include <fenv.h>
#include <locale.h>

static uint64_t bits(double value){uint64_t result;memcpy(&result,&value,8);return result;}
static int custom_number_calls,custom_method_calls;
static AV custom_number(AV env,int argc,AV *argv){(void)env;assert(argc==1&&argv[0].t==ASTR);custom_number_calls++;return an(99);}
static AV custom_method(AV env,int argc,AV *argv){(void)env;(void)argc;(void)argv;custom_method_calls++;return astr("7.25");}

static void same_pair(AV *r,double value,int places){
  int folded=0;
  r[2]=an(value);r[3]=an(places);
  r[4]=afixed_number_prepare(r[0],av(AUNDEF),r[2],r[1],1,1,r+3,&folded);
  assert(!afailed);
  r[4]=afixed_number_finish(r[0],r[4],folded);
  assert(!afailed);
  r[5]=aimmediate_call(av(AUNDEF),r[2],r[1],1,1,r+3);
  assert(!afailed);
  r[5]=acall_rooted(r[0],1,r+5);
  assert(!afailed&&r[4].t==ANUM&&r[5].t==ANUM);
  if(!(isnan(r[4].n)&&isnan(r[5].n))&&bits(r[4].n)!=bits(r[5].n)){
    fprintf(stderr,"fixed-number fenv mismatch value=%a places=%d rounding=%d actual=%a expected=%a\n",value,places,fegetround(),r[4].n,r[5].n);abort();
  }
  assert(adepth==0);
}

int main(void){
  AV r[10];for(size_t i=0;i<10;i++)r[i]=av(AUNDEF);
  ARoot root;aroot(&root,r,10);
  r[0]=aglobal("Number");r[1]=astr("toFixed");
  const int modes[]={FE_TONEAREST,FE_DOWNWARD,FE_UPWARD,FE_TOWARDZERO};
  const double edge[]={0.,-0.,0x1p-1074,-0x1p-1074,1.005,-1.005,2.675,-0.004,0.125,1.25,9007199254740991.,9007199254740992.,9007199254740994.,1e20,1e21,INFINITY,-INFINITY,NAN};
  size_t cases=0;
  for(size_t mode=0;mode<sizeof(modes)/sizeof(*modes);mode++){
    assert(fesetround(modes[mode])==0);
    for(size_t i=0;i<sizeof(edge)/sizeof(*edge);i++)for(int p=0;p<=100;p++){same_pair(r,edge[i],p);cases++;}
    uint64_t state=UINT64_C(0x415259414649584E);
    for(int i=0;i<3000;i++){
      state^=state<<13;state^=state>>7;state^=state<<17;double value;memcpy(&value,&state,8);
      same_pair(r,value,i%101);cases++;
    }
    /* Near the exactly representable coefficient threshold. Compute fixture
     * centers in nearest mode so all four passes use the same binary64 inputs. */
    for(int p=0;p<=18;p++){
      assert(fesetround(FE_TONEAREST)==0);double center=9007199254740992./pow(10.,p);
      double neighbors[]={nextafter(center,0),center,nextafter(center,INFINITY)};
      assert(fesetround(modes[mode])==0);
      for(int i=0;i<3;i++){same_pair(r,neighbors[i],p);same_pair(r,-neighbors[i],p);cases+=2;}
    }
  }
  assert(fesetround(FE_TONEAREST)==0);
  const char *locales[]={"de_DE.UTF-8","fr_FR.UTF-8","de_DE.utf8","fr_FR.utf8"};
  int comma_locale=0;
  for(size_t i=0;i<sizeof(locales)/sizeof(*locales);i++)if(setlocale(LC_NUMERIC,locales[i])){
    if(strcmp(localeconv()->decimal_point,".")){same_pair(r,1.25,2);same_pair(r,-0.004,2);comma_locale=1;break;}
  }
  assert(setlocale(LC_NUMERIC,"C"));
  int folded;
  r[2]=an(1.25);r[3]=an(2);
  r[6]=afunction(custom_number,an(0),"replacement Number");
  r[4]=afixed_number_prepare(r[6],av(AUNDEF),r[2],r[1],1,1,r+3,&folded);
  assert(!folded&&r[4].t==ASTR);r[4]=afixed_number_finish(r[6],r[4],folded);
  assert(!afailed&&r[4].n==99&&custom_number_calls==1);
  r[6]=afunction(anumber_global_call,an(1),"wrong Number discriminator");
  r[4]=afixed_number_prepare(r[6],av(AUNDEF),r[2],r[1],1,1,r+3,&folded);
  assert(!folded&&r[4].t==ASTR);r[4]=afixed_number_finish(r[6],r[4],folded);
  assert(!afailed&&r[4].t==ABOOL&&!r[4].n);
  r[6]=afunction(custom_method,av(AUNDEF),"replacement toFixed");
  r[4]=afixed_number_prepare(r[0],r[6],r[2],r[1],0,1,r+3,&folded);
  assert(!folded&&custom_method_calls==1);r[4]=afixed_number_finish(r[0],r[4],folded);
  assert(!afailed&&r[4].n==7.25);
  r[7]=astr("toString");r[2]=an(2);
  r[4]=afixed_number_prepare(r[0],av(AUNDEF),r[2],r[7],1,1,r+3,&folded);
  assert(!folded);r[4]=afixed_number_finish(r[0],r[4],folded);
  assert(!afailed&&r[4].n==10&&adepth==0);
  printf("fixed number C guards: %zu bitwise cases, 4 rounding modes, comma locale %s, replacement callees passed\n",cases,comma_locale?"passed":"unavailable");
  aunroot(&root);afailed=0;agc();return 0;
}
