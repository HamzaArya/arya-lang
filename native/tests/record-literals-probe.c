/* Exercise suspension inside a native getter, beyond source-level getters
 * whose async functions return Promises without implicitly awaiting them. */
#define main arya_record_literals_fixture_main
#include ARYA_RECORD_LITERALS_SOURCE
#undef main
#include <assert.h>

static int getter_reads;
static AV suspended_getter(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;
  AV value=env;ARoot root;aroot(&root,&value,1);
  getter_reads++;
  aawait(an(0)); /* A resolved value still yields the active native fiber. */
  agc();
  aunroot(&root);return value;
}
static AV suspended_copy(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;
  AV r[2]={env,av(AUNDEF)};ARoot root;aroot(&root,r,2);
  r[1]=arecord();r[1]=arecord_spread(r[1],r[0]);
  AV result=r[1];aunroot(&root);return result;
}
int main(void) {
  AV r[6];for(size_t i=0;i<6;i++)r[i]=av(AUNDEF);
  ARoot root;aroot(&root,r,6);
  r[0]=arecord();r[1]=arecord();r[2]=astr("payload");r[3]=astr("survived");
  aset(r[1],r[2],r[3]);
  r[4]=afunction(suspended_getter,r[1],"suspending record getter");
  r[5]=ap(aalloc(AGETTER,0));r[5].p->parent=r[4];
  r[2]=astr("first");aset(r[0],r[2],r[5]);
  r[2]=astr("last");r[3]=astr("also survived");aset(r[0],r[2],r[3]);
  r[1]=aasyncfunction(suspended_copy,r[0],"record copy task");
  r[2]=acall(r[1],0,NULL);
  assert(!afailed&&getter_reads==1&&r[2].t==APROMISE&&!apromise_state(r[2]));
  r[0]=r[1]=r[3]=r[4]=r[5]=av(AUNDEF);
  agc(); /* Only the suspended task can retain source, target and key snapshot. */
  r[0]=aawait(r[2]);assert(!afailed&&r[0].t==ARECORD&&getter_reads==1);
  agc();
  r[1]=astr("first");r[3]=aget(r[0],r[1]);
  r[1]=astr("payload");r[4]=aget(r[3],r[1]);assert(akey(r[4],"survived"));
  r[1]=astr("last");r[4]=aget(r[0],r[1]);assert(akey(r[4],"also survived"));
  r[5]=ajkeys(r[0]);assert(r[5].p->len==2&&!afailed);
  aasync_shutdown();aunroot(&root);agc();
  puts("record spread: suspended native getter roots survived collection");
  return 0;
}
