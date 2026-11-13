/* Independent scan predicate plus protected-page tails; no Arya/JS runtime. */
#define _GNU_SOURCE 1
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <unistd.h>
#include "../runtime/json-scan.h"
#ifndef MAP_ANONYMOUS
#define MAP_ANONYMOUS MAP_ANON
#endif
static size_t checks;
static uint32_t state=0x41525941u;
static uint32_t next(void){state^=state<<13;state^=state>>17;state^=state<<5;return state;}
static void check(const uint16_t *text,size_t start,size_t length){
  size_t expected=start;
  while(expected<length&&text[expected]>=32&&text[expected]!=34&&text[expected]!=92)expected++;
  size_t actual=ajscan_string(text,start,length);
  if(actual!=expected){fprintf(stderr,"scan mismatch: start=%zu length=%zu expected=%zu actual=%zu\n",start,length,expected,actual);exit(1);}
  checks++;
}
int main(void){
  long page=sysconf(_SC_PAGESIZE);if(page<4096)return 1;
  unsigned char *memory=mmap(NULL,(size_t)page*3,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  if(memory==MAP_FAILED||mprotect(memory+page,(size_t)page,PROT_READ|PROT_WRITE))return 1;
  uint16_t *end=(uint16_t*)(memory+page*2);
  /* Every length lands exactly before the inaccessible page. The final valid
   * vector may be unaligned; a partial vector must use scalar loads. */
  for(size_t length=0;length<=1024;length++){
    uint16_t *text=end-length;
    for(size_t i=0;i<length;i++)text[i]=(uint16_t)(0x100+next()%0xff00);
    check(text,0,length);
    for(size_t start=length>24?length-24:0;start<=length;start++)check(text,start,length);
    if(length){
      size_t first=length>24?length-24:0;
      for(size_t position=first;position<length;position++){
        uint16_t saved=text[position];
        for(unsigned c=0;c<34;c++){
          text[position]=(uint16_t)(c<32?c:c==32?'"':'\\');check(text,first,length);
        }
        text[position]=saved;
      }
    }
  }
  /* Full UTF-16 domain in each lane of two vector-width blocks. */
  uint16_t *text=end-32;for(size_t i=0;i<32;i++)text[i]='a';
  for(size_t position=8;position<24;position++){
    for(unsigned c=0;c<=65535;c++){text[position]=(uint16_t)c;check(text,0,32);}
    text[position]='a';
  }
  for(size_t trial=0;trial<10000;trial++){
    size_t length=next()%512;uint16_t *input=end-length;
    for(size_t i=0;i<length;i++)input[i]=(uint16_t)next();
    size_t start=next()%(length+1);check(input,start,length);
  }
  /* No read before the beginning of the readable page either. */
  text=(uint16_t*)(memory+page);for(size_t i=0;i<64;i++)text[i]='a';
  for(size_t length=0;length<=64;length++)check(text,0,length);
  if(munmap(memory,(size_t)page*3))return 1;
  printf("JSON scan: %zu exact offset and protected-page checks passed (%s).\n",checks,
#ifdef ARYA_JSON_NEON
    "NEON"
#else
    "scalar"
#endif
  );
  return 0;
}
