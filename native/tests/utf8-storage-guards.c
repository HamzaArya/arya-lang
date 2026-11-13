/* Probe actual emitted runtime conversions at inaccessible page boundaries. */
#define _GNU_SOURCE 1
#define main arya_utf8_fixture_main
#include ARYA_UTF8_SOURCE
#undef main
#include <assert.h>
#include <sys/mman.h>
#ifndef MAP_ANONYMOUS
#define MAP_ANONYMOUS MAP_ANON
#endif
#ifndef EXPECT_ASCII_ALLOCATIONS
#define EXPECT_ASCII_ALLOCATIONS 2
#endif
static size_t checks;
int main(void) {
  long page=sysconf(_SC_PAGESIZE);assert(page>=4096);
  unsigned char *memory=mmap(NULL,(size_t)page*3,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  assert(memory!=MAP_FAILED && !mprotect(memory+page,(size_t)page,PROT_READ|PROT_WRITE));
  unsigned char *end=memory+page*2;
  AV value=av(AUNDEF);ARoot root;aroot(&root,&value,1);
  /* astrn historically consumes its source before aalloc may collect. An
   * unrooted byte owner is therefore a supported internal calling pattern. */
  for(size_t n=0;n<=32;n++){
    unsigned char bytes[32];for(size_t i=0;i<n;i++)bytes[i]=(unsigned char)i;
    AV unrooted=abytes(bytes,n);
    value=astrn((const char*)unrooted.p->chars,n);
    assert(!afailed && value.p->scope==(int)n);
    for(size_t i=0;i<n;i++)assert(value.p->chars[i]==i);
    value=av(AUNDEF);agc();assert(!aheap && !aallocated);checks++;
  }
  for(size_t n=0;n<=1024;n++) {
    unsigned char *input=end-n;
    for(size_t i=0;i<n;i++)input[i]=(unsigned char)(i%128);
    size_t allocations=acounters.calloc_calls;
    value=astrn((const char*)input,n);
    assert(!afailed && value.t==ASTR && value.p->scope==(int)n);
    assert(acounters.calloc_calls-allocations==EXPECT_ASCII_ALLOCATIONS);
    assert(value.p->chars[n]==0);
    for(size_t i=0;i<n;i++)assert(value.p->chars[i]==input[i]);
    checks++;
    value=av(AUNDEF);agc();assert(!aheap && !aallocated);
  }
  /* A fake non-owning string exposes encoder reads directly at the guard page. */
  for(size_t n=0;n<=1024;n++) {
    uint16_t *units=(uint16_t*)end-n;
    for(size_t i=0;i<n;i++)units[i]=(uint16_t)(i%128);
    AH fake={0};fake.t=ASTR;fake.scope=(int)n;fake.chars=units;
    size_t length,bytes=acounters.requested_bytes;
    char *encoded=autf8bytes(ap(&fake),&length);
    assert(length==n && encoded[n]==0);
    assert(acounters.requested_bytes-bytes==n*(EXPECT_ASCII_ALLOCATIONS==2?1:3)+1);
    for(size_t i=0;i<n;i++)assert((unsigned char)encoded[i]==units[i]);
    free(encoded);checks++;
  }
#ifdef ARYA_UTF8_FAST
  /* Every byte value in every word lane; every UTF-16 value in every lane.
   * Independent scalar predicates establish the classifier truth tables. */
  unsigned char *bytes=end-16;memset(bytes,'a',16);
  for(size_t position=0;position<16;position++) {
    for(unsigned c=0;c<256;c++){bytes[position]=(unsigned char)c;assert(aascii_bytes((char*)bytes,16)==(c<128));checks++;}
    bytes[position]='a';
  }
  uint16_t *units=(uint16_t*)end-8;for(size_t i=0;i<8;i++)units[i]='a';
  for(size_t position=0;position<8;position++) {
    for(unsigned c=0;c<=65535;c++){units[position]=(uint16_t)c;assert(aascii_units(units,8)==(c<128));checks++;}
    units[position]='a';
  }
  for(size_t n=1;n<=65;n++){
    uint16_t *span=(uint16_t*)end-n;for(size_t i=0;i<n;i++)span[i]='a';
    size_t positions[]={0,n/2,n-1};
    for(size_t k=0;k<3;k++){span[positions[k]]=128;assert(!aascii_units(span,n));span[positions[k]]='a';checks++;}
    unsigned char *data=end-n;memset(data,'a',n);
    for(size_t k=0;k<3;k++){data[positions[k]]=128;assert(!aascii_bytes((char*)data,n));data[positions[k]]='a';checks++;}
  }
#endif
  const size_t maximum=16777216;
  char *large=malloc(maximum+1);assert(large);memset(large,'x',maximum+1);
  value=astrn(large,maximum);assert(!afailed && value.p->scope==(int)maximum && value.p->chars[maximum-1]=='x');
  value=av(AUNDEF);agc();assert(!aheap && !aallocated);checks++;
  value=astrn(large,maximum+1);assert(afailed && value.t==AUNDEF);
  afailed=0;aerror=av(AUNDEF);agc();assert(!aheap && !aallocated);checks++;
  value=astrn((const char*)end,67108865);assert(afailed && value.t==AUNDEF);
  afailed=0;aerror=av(AUNDEF);agc();assert(!aheap && !aallocated);checks++;
  free(large);aunroot(&root);assert(!munmap(memory,(size_t)page*3));
  printf("UTF8 storage: %zu guard, classifier, allocation, length-limit and reclamation checks passed.\n",checks);
  return 0;
}
