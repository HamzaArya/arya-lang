/* Demand-zero pages preserve contiguous native reads without allocating or
 * tracing the holes in a high-index list. Only indexed writes commit pages.
 * Bulk mutators materialize ordinary dense storage before writing directly. */
static void asparse_note(ASparse *s,size_t page) {
  if(s->bitmap[page/8]&(1u<<(page%8)))return;
  if(s->count==s->capacity) {
    size_t capacity=s->capacity?s->capacity*2:8;
    size_t *pages=realloc(s->pages,capacity*sizeof(size_t));if(!pages){fputs("Arya: out of memory\n",stderr);exit(70);}
    aallocated+=(capacity-s->capacity)*sizeof(size_t);s->pages=pages;s->capacity=capacity;
  }
  s->bitmap[page/8]|=(unsigned char)(1u<<(page%8));s->pages[s->count++]=page;aallocated+=s->page_size;
}
static ASparse *asparse_mapping(size_t size) {
  ASparse *s=amemory(sizeof(*s));long page=sysconf(_SC_PAGESIZE);s->page_size=page>0?(size_t)page:4096;
  size_t capacity=size<=5000000?size*2:10000001;if(capacity<8192)capacity=8192;
  s->bytes=((capacity*sizeof(AV)+s->page_size-1)/s->page_size)*s->page_size;
  s->bitmap_bytes=((s->bytes/s->page_size)+7)/8;s->bitmap=amemory(s->bitmap_bytes);
  s->data=mmap(NULL,s->bytes,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  if(s->data==MAP_FAILED){fputs("Arya: cannot reserve sparse list storage\n",stderr);exit(70);}
  aallocated+=sizeof(*s)+s->bitmap_bytes;return s;
}
static void asparse_release(AH *h) {
  ASparse *s=h->sparse;if(!s)return;
  aallocated-=sizeof(*s)+s->bitmap_bytes+s->capacity*sizeof(size_t)+s->count*s->page_size;
  munmap(s->data,s->bytes);free(s->bitmap);free(s->pages);free(s);h->sparse=NULL;
}
static void asparse_make(AH *h,size_t size) {
  ASparse *next=asparse_mapping(size);size_t bytes=h->len*sizeof(AV);
  if(h->sparse) {
    ASparse *old=h->sparse;
    for(size_t i=0;i<old->count;i++) {
      size_t at=old->pages[i]*old->page_size;if(at>=bytes)continue;size_t n=old->page_size;if(n>bytes-at)n=bytes-at;
      asparse_note(next,at/next->page_size);memcpy((char*)next->data+at,(char*)h->data+at,n);
    }
    asparse_release(h);
  } else {
    if(bytes){memcpy(next->data,h->data,bytes);for(size_t i=0;i<(bytes+next->page_size-1)/next->page_size;i++)asparse_note(next,i);}
    aallocated-=h->cap*sizeof(AV);free(h->data);
  }
  h->sparse=next;h->data=next->data;h->cap=next->bytes/sizeof(AV);if(aallocated>apeakh)apeakh=aallocated;
}
static void alist_dense(AH *h) {
  ASparse *s=h->sparse;if(!s)return;size_t bytes=h->len*sizeof(AV);AV *data=amemory(bytes);
  for(size_t i=0;i<s->count;i++) {
    size_t at=s->pages[i]*s->page_size;if(at>=bytes)continue;size_t n=s->page_size;if(n>bytes-at)n=bytes-at;
    memcpy((char*)data+at,(char*)h->data+at,n);
  }
  asparse_release(h);h->data=data;h->cap=h->len;aallocated+=bytes;if(aallocated>apeakh)apeakh=aallocated;
}
static void alist_length(AH *h,size_t size) {
  if(size<h->len) {
    if(h->sparse) {
      ASparse *s=h->sparse;
      for(size_t page=0;page<s->count;page++) {
        size_t start=s->pages[page]*s->page_size/sizeof(AV),end=((s->pages[page]+1)*s->page_size+sizeof(AV)-1)/sizeof(AV);
        if(start<size)start=size;if(end>h->len)end=h->len;
        for(size_t i=start;i<end;i++)if(h->data[i].t!=AUINIT)h->data[i]=av(AUINIT);
      }
    } else memset(h->data+size,0,(h->len-size)*sizeof(AV));
  } else if(size>h->cap) {
    if(h->sparse||(size>4096&&size>h->len*4+1024))asparse_make(h,size);else aresize(h,size);
  }
  /* Dense mutators can leave removed values beyond len. Growing creates holes,
   * even when spare capacity still contains those former elements. */
  if(size>h->len&&!h->sparse)memset(h->data+h->len,0,(size-h->len)*sizeof(AV));
  h->len=size;
}
static void alist_store(AH *h,size_t index,AV value) {
  if(index>=h->len)alist_length(h,index+1);
  if(h->sparse) {
    if(value.t==AUINIT&&h->data[index].t==AUINIT)return;
    ASparse *s=h->sparse;asparse_note(s,index*sizeof(AV)/s->page_size);asparse_note(s,((index+1)*sizeof(AV)-1)/s->page_size);
  }
  h->data[index]=value;
  if(h->sparse&&h->sparse->count*h->sparse->page_size>h->len*sizeof(AV)/2)alist_dense(h);
  if(aallocated>apeakh)apeakh=aallocated;
}
