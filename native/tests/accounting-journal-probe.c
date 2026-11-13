/* Include emitted C to check native snapshot ownership and global boundaries
 * without constructing 100000 source-level records or invoking program main. */
#define main arya_accounting_journal_fixture_main
#include ARYA_ACCOUNTING_JOURNAL_SOURCE
#undef main
#include <assert.h>

static AV prepared(size_t accounts,const char *prefix) {
  AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  r[0]=arecord();aput(r[0],"currency",astr("AFN"));aput(r[0],"scale",an(2));aput(r[0],"length",an((double)accounts));
  r[1]=alist(0,NULL);aput(r[0],"names",r[1]);
  for(size_t i=0;i<accounts;i++){
    char text[64];snprintf(text,sizeof(text),"%s:%zu",prefix,i);r[2]=astr(text);aappend_value(r[1],r[2]);
  }
  r[0].p->scope=r[1].p->scope=-2;r[2]=aac_new(2,accounts*sizeof(AACLedger),r[0]);
  AACBatch *batch=(AACBatch*)r[2].p->external;batch->count=batch->accounts=accounts;batch->scale=batch->price_scale=2;
  for(size_t i=0;i<accounts;i++){AACLedger *row=(AACLedger*)batch->storage+i;row->account=(uint32_t)i;row->debit=1;}
  AV result=r[2];aunroot(&root);return result;
}
static void rejected(const char *code,size_t row) {
  assert(afailed&&akey(aac_field(aerror,"code"),code));
  AV actual=aac_field(aerror,"row");
  assert(row==SIZE_MAX?actual.t==AUNDEF:actual.t==ANUM&&actual.n==(double)row);
  afailed=0;aerror=av(AUNDEF);
}
int main(void) {
  AV r[6];for(size_t i=0;i<6;i++)r[i]=av(AUNDEF);ARoot root;aroot(&root,r,6);
  r[0]=prepared(2,"account");r[1]=alist(1,r);r[2]=prepared(0,"empty");
  r[3]=aac_combine_ledger(r[1],r[2]);assert(!afailed);
  AACBatch *source=(AACBatch*)r[0].p->external,*copy=(AACBatch*)r[3].p->external;
  assert(copy->storage!=source->storage&&copy->count==2&&copy->accounts==2);
  ((AACLedger*)source->storage)[0].debit=99;
  r[0]=r[1]=av(AUNDEF);agc();
  r[4]=aac_begin(r[3]);aac_step(r[4],an(1000000));r[5]=aac_finish(r[4]);
  assert(!afailed&&akey(aac_field(r[5],"debit"),"0.02"));
  assert(akey(aac_field(aac_field(r[5],"accounts").p->data[0],"account"),"account:0"));
  r[0]=r[1]=r[3]=r[4]=r[5]=av(AUNDEF);agc();

  /* Exactly 100000 accounts succeeds. A new account in a later component
   * fails at its global posting offset; no partial batch is returned. */
  r[0]=prepared(100000,"unique");r[1]=alist(1,r);
  r[3]=aac_combine_ledger(r[1],r[2]);assert(!afailed&&((AACBatch*)r[3].p->external)->accounts==100000);
  r[4]=prepared(1,"extra");aappend_value(r[1],r[4]);
  r[5]=aac_combine_ledger(r[1],r[2]);assert(r[5].t==AUNDEF);rejected("ARYA_ACCOUNTING_LIMIT",100000);
  /* Count checks must precede storage reads, even for internal handle users. */
  source=(AACBatch*)r[0].p->external;size_t saved=source->count;source->count=1000000;
  r[5]=aac_combine_ledger(r[1],r[2]);assert(r[5].t==AUNDEF);rejected("ARYA_ACCOUNTING_LIMIT",SIZE_MAX);source->count=saved;
  ((AACBatch*)r[4].p->external)->scale=3;
  r[5]=aac_combine_ledger(r[1],r[2]);assert(r[5].t==AUNDEF);rejected("ARYA_ACCOUNTING_INPUT",SIZE_MAX);
  r[5]=aac_posting_summary(r[2]);assert(!afailed&&akey(aac_field(r[5],"debit"),"0.00"));
  r[5]=aac_combine_ledger(av(AUNDEF),r[2]);assert(r[5].t==AUNDEF);rejected("ARYA_ACCOUNTING_LIMIT",SIZE_MAX);
  r[5]=aac_posting_summary(an(1));assert(r[5].t==AUNDEF);rejected("ARYA_ACCOUNTING_INPUT",SIZE_MAX);
  for(size_t i=0;i<6;i++)r[i]=av(AUNDEF);
  agc();assert(aallocated==0&&!aheap);aunroot(&root);
  puts("journal snapshots: independent storage, retained names, global account/row limits and full reclamation passed");
  return 0;
}
