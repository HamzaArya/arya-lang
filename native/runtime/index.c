/* Ordered values keep their public storage; hash tables contain offsets only.
 * Empty buckets are 0, deleted buckets SIZE_MAX. AUINIT is never a user key. */
struct AKeyIndex { size_t *slots, capacity, count, occupied, extent; unsigned iterating; };
static uint64_t ahash(AV value) {
  uint64_t hash=(uint64_t)value.t*0x9e3779b97f4a7c15ULL;
  if(value.t==ASTR) {
    if(!value.p->serial) { uint64_t h=1469598103934665603ULL; for(int i=0;i<value.p->scope;i++)h=(h^value.p->chars[i])*1099511628211ULL; value.p->serial=h?h:1; }
    hash=value.p->serial;
  } else if(value.t==ANUM) { double n=value.n==0?0:value.n; uint64_t bits; memcpy(&bits,&n,sizeof(bits)); hash^=isnan(n)?0x7ff8000000000000ULL:bits; }
  else if(value.t==ABOOL)hash^=(uint64_t)value.n;
  else if(value.t>=ALIST)hash^=(uint64_t)(uintptr_t)value.p;
  hash^=hash>>30;hash*=0xbf58476d1ce4e5b9ULL;hash^=hash>>27;hash*=0x94d049bb133111ebULL;return hash^(hash>>31);
}
static int akey_equal(AV a,AV b) { return aeq(a,b)||(a.t==ANUM&&b.t==ANUM&&isnan(a.n)&&isnan(b.n)); }
static void akey_bucket(AH *h,size_t slot) {
  AKeyIndex *index=h->keys; size_t at=(size_t)ahash(h->data[slot])&(index->capacity-1),deleted=SIZE_MAX;
  while(index->slots[at]) { if(index->slots[at]==SIZE_MAX&&deleted==SIZE_MAX)deleted=at; at=(at+1)&(index->capacity-1); }
  if(deleted!=SIZE_MAX)at=deleted;else index->occupied++;
  index->slots[at]=slot+1;index->count++;
}
static void akey_rebuild(AH *h,size_t step) {
  if(!h->keys) { h->keys=amemory(sizeof(AKeyIndex));aallocated+=sizeof(AKeyIndex); }
  AKeyIndex *index=h->keys; size_t count=0,capacity=64;
  for(size_t i=0;i<h->len;i+=step)if(h->data[i].t!=AUINIT)count++;
  while(capacity<(count+1)*2)capacity*=2;
  if(capacity!=index->capacity) { free(index->slots);aallocated-=index->capacity*sizeof(size_t);index->slots=amemory(capacity*sizeof(size_t));aallocated+=capacity*sizeof(size_t);index->capacity=capacity; }
  else memset(index->slots,0,capacity*sizeof(size_t));
  index->count=index->occupied=0;index->extent=h->len;
  for(size_t i=0;i<h->len;i+=step)if(h->data[i].t!=AUINIT)akey_bucket(h,i);
  if(aallocated>apeakh)apeakh=aallocated;
}
static size_t akey_find(AH *h,AV key,size_t step) {
  if(!h->keys&&h->len/step<32) { for(size_t i=0;i<h->len;i+=step)if(h->data[i].t!=AUINIT&&akey_equal(h->data[i],key))return i;return SIZE_MAX; }
  if(!h->keys||h->keys->extent!=h->len)akey_rebuild(h,step);
  AKeyIndex *index=h->keys;size_t at=(size_t)ahash(key)&(index->capacity-1);
  while(index->slots[at]) { size_t entry=index->slots[at];if(entry!=SIZE_MAX&&akey_equal(h->data[entry-1],key))return entry-1;at=(at+1)&(index->capacity-1); }
  return SIZE_MAX;
}
static void akey_added(AH *h,size_t slot,size_t step) {
  if(!h->keys)return;
  if(h->keys->extent!=slot||h->keys->occupied+1>=h->keys->capacity/2)akey_rebuild(h,step);
  else { akey_bucket(h,slot);h->keys->extent=h->len; }
}
static void akey_deleted(AH *h,size_t slot) {
  AKeyIndex *index=h->keys;if(!index)return;
  size_t at=(size_t)ahash(h->data[slot])&(index->capacity-1);
  while(index->slots[at]) { if(index->slots[at]==slot+1) { index->slots[at]=SIZE_MAX;index->count--;return; }at=(at+1)&(index->capacity-1); }
}
static void akey_release(AH *h) {
  if(h->keys) { aallocated-=sizeof(AKeyIndex)+h->keys->capacity*sizeof(size_t);free(h->keys->slots);free(h->keys);h->keys=NULL; }
}
