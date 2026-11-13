/* Include emitted C to exercise the actual runtime, without program globals. */
#define main arya_string_storage_fixture_main
#include ARYA_STRING_STORAGE_SOURCE
#undef main
#include <assert.h>
#ifndef EXPECT_STRING_ALLOCATIONS
#define EXPECT_STRING_ALLOCATIONS 2
#endif

static void check_accounting(void) {
  size_t bytes=0;
  for(AH *h=aheap;h;h=h->next) {
    assert(h->t==ASTR && !h->cap);
    bytes+=sizeof(*h);
    AStringBuffer *buffer=h->external;
    int first=1;
    for(AH *other=aheap;other;other=other->next) {
      if(other==h)break;
      if(other->external==buffer)first=0;
    }
    if(first) {
      size_t references=0;
      for(AH *other=aheap;other;other=other->next)
        if(other->external==buffer)references++;
      assert(buffer->references==references);
      bytes+=sizeof(*buffer)+(buffer->capacity+1)*sizeof(uint16_t);
    }
    assert(h->chars==buffer->chars && (size_t)h->scope<=buffer->used);
    assert(buffer->used<=buffer->capacity && buffer->chars[buffer->used]==0);
  }
  assert(aallocated==bytes);
}

int main(void) {
  AV values[6]={0};ARoot root;aroot(&root,values,6);
  size_t calls=acounters.calloc_calls;
  values[0]=as16(NULL,0);
  assert(acounters.calloc_calls-calls==EXPECT_STRING_ALLOCATIONS);
  assert(aallocated==sizeof(AH)+sizeof(AStringBuffer)+sizeof(uint16_t));
  const uint16_t units[]={0,0x633,0xd83d,0xde00,0xd800,0xdc00};
  calls=acounters.calloc_calls;
  values[1]=as16(units,sizeof(units)/sizeof(*units));
  assert(acounters.calloc_calls-calls==EXPECT_STRING_ALLOCATIONS);
  assert(!memcmp(values[1].p->chars,units,sizeof(units)));
  values[2]=as16((uint16_t[]){'x'},1);
  values[3]=aconcat(values[1],values[2]);
  AStringBuffer *shared=values[3].p->external;
  calls=acounters.calloc_calls;
  values[4]=aconcat(values[3],values[2]);
  assert(acounters.calloc_calls-calls==1);
  assert(values[4].p->external==shared && shared->references==2);
  values[5]=aconcat(values[3],values[2]);
  assert(values[5].p->external!=shared);
  assert(values[3].p->scope==7 && values[4].p->scope==8);
  check_accounting();
  values[4]=av(AUNDEF);agc();
  assert(shared->references==1);check_accounting();
  values[4]=values[3];
  for(size_t i=0;i<512;i++) {
    values[4]=aconcat(values[4],values[2]);
    agc();check_accounting();
    assert(values[3].p->scope==7 && !memcmp(values[3].p->chars,units,sizeof(units)));
  }
  values[4]=av(AUNDEF);agc();check_accounting();
  assert(values[3].p->external==shared && shared->references==1);
  for(size_t i=0;i<6;i++)values[i]=av(AUNDEF);
  agc();assert(aallocated==0 && !aheap);
  aunroot(&root);
  puts("string storage: exact allocation, reference counts and full reclamation passed");
  return 0;
}
