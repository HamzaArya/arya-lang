/* Bounded native JSON codec. Strings retain UTF-16 semantics and exact money stays text. */
#include "json-scan.h"
/* Parser-local, bounded key reuse. The cache is rooted only for this parse;
 * returned records own their keys. Scratch storage never aliases a value. */
typedef struct {const uint16_t *text;size_t length,at,nodes;int depth;uint16_t *scratch;size_t scratch_cap;unsigned value_probes,value_hits,value_bypass;AV strings[512];} AJParser;
typedef struct {AH *key;size_t length;char text[66];} AJQuotedKey;
typedef struct {char *data;size_t length,cap;AH *active[128];int depth,plain;AV replacer,keys;char gap[41];size_t gap_length;AJQuotedKey quoted[64];} AJWriter;
static void ajerror(const char *message){afail("SyntaxError",message);}
static void ajspace(AJParser *p){while(p->at<p->length&&(p->text[p->at]==' '||p->text[p->at]=='\n'||p->text[p->at]=='\r'||p->text[p->at]=='\t'))p->at++;}
static int ajhex(uint16_t c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;}
static AV ajread(AJParser *p);
static void ajvalue_sample(AJParser *p,int hit) {
  p->value_hits+=(unsigned)hit;
  /* Stop hashing high-entropy values after a small low-hit window. Recheck
   * each window so a repetitive prefix does not penalize a unique tail. */
  if(++p->value_probes==128){if(p->value_hits<16)p->value_bypass=1;p->value_probes=p->value_hits=0;}
}
static AV ajstring_value(AJParser *p,const uint16_t *units,size_t n,int key) {
  /* Repeated short data values (types, currency, amounts) are immutable too.
   * Keep separate bounded caches so values cannot evict property names. */
  if(!key&&(n>128||p->value_bypass))return as16(units,n);
  uint32_t hash=2166136261u;for(size_t i=0;i<n;i++)hash=(hash^units[i])*16777619u;
  AV *slot=&p->strings[(key?0:256)+(hash&255)];
  if(slot->t==ASTR&&(size_t)slot->p->scope==n&&!memcmp(slot->p->chars,units,n*sizeof(uint16_t))){if(key)ACOUNT(json_key_hits);else ajvalue_sample(p,1);return *slot;}
  if(!key)ajvalue_sample(p,0);*slot=as16(units,n);return *slot;
}
static AV ajstring(AJParser *p,int key) {
  if(p->at>=p->length||p->text[p->at++]!='"'){ajerror("Expected JSON string.");return av(AUNDEF);}
  size_t begin=p->at;
  /* Most data strings need no decoding or temporary buffer. */
  p->at=ajscan_string(p->text,p->at,p->length);
  if(p->at==p->length){ajerror("Unclosed JSON string.");return av(AUNDEF);}
  if(p->text[p->at]=='"'){size_t n=p->at++-begin;return ajstring_value(p,p->text+begin,n,key);}
  size_t n=p->at-begin;int closed=0;
  if(p->scratch_cap<n+1){size_t cap=n+64;free(p->scratch);p->scratch=(uint16_t*)amemory(cap*sizeof(uint16_t));p->scratch_cap=cap;}
  if(n)memcpy(p->scratch,p->text+begin,n*sizeof(uint16_t));
  while(p->at<p->length){uint16_t c=p->text[p->at++];if(c=='"'){closed=1;break;}if(c<32){ajerror("Control character in JSON string.");break;}
    if(c=='\\'){if(p->at==p->length){ajerror("Incomplete JSON escape.");break;}c=p->text[p->at++];
      if(c=='n')c='\n';else if(c=='r')c='\r';else if(c=='t')c='\t';else if(c=='b')c='\b';else if(c=='f')c='\f';
      else if(c=='u'){unsigned code=0;for(int i=0;i<4;i++){if(p->at==p->length||ajhex(p->text[p->at])<0){ajerror("Invalid JSON Unicode escape.");break;}code=code*16+(unsigned)ajhex(p->text[p->at++]);}c=(uint16_t)code;}
      else if(c!='"'&&c!='\\'&&c!='/'){ajerror("Invalid JSON escape.");break;}
    }if(afailed)break;
    if(n==p->scratch_cap){size_t cap=p->scratch_cap*2;uint16_t *next=(uint16_t*)realloc(p->scratch,cap*sizeof(uint16_t));if(!next){ajerror("Cannot allocate JSON string.");break;}p->scratch=next;p->scratch_cap=cap;}
    p->scratch[n++]=c;
  }
  if(!closed&&!afailed)ajerror("Unclosed JSON string.");return afailed?av(AUNDEF):ajstring_value(p,p->scratch,n,key);
}
static AV ajread(AJParser *p) {
  if(++p->nodes>100000||++p->depth>128){ajerror("JSON structure limit exceeded.");p->depth--;return av(AUNDEF);}ajspace(p);
  AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  if(p->at==p->length){ajerror("Incomplete JSON value.");goto done;}
  uint16_t c=p->text[p->at];
  if(c=='"'){r[0]=ajstring(p,0);goto done;}
  if(c=='{'||c=='['){p->at++;int record=c=='{';r[0]=record?arecord():alist(0,NULL);ajspace(p);
    if(p->at<p->length&&p->text[p->at]==(record?'}':']')){p->at++;goto done;}
    for(;;){ajspace(p);if(record){r[1]=ajstring(p,1);if(afailed)break;ajspace(p);if(p->at==p->length||p->text[p->at++]!=':'){ajerror("Expected JSON colon.");break;}}
      r[2]=ajread(p);if(afailed)break;if(record)aset(r[0],r[1],r[2]);else{aresize(r[0].p,r[0].p->len+1);r[0].p->data[r[0].p->len++]=r[2];}
      ajspace(p);if(p->at==p->length){ajerror("Unclosed JSON collection.");break;}c=p->text[p->at++];if(c==(record?'}':']'))break;if(c!=','){ajerror("Expected JSON comma.");break;}
    }goto done;
  }
  const char *words[]={"true","false","null"};
  for(int i=0;i<3;i++){size_t n=strlen(words[i]);if(p->length-p->at>=n){size_t j=0;while(j<n&&p->text[p->at+j]==(unsigned char)words[i][j])j++;if(j==n){p->at+=n;r[0]=i==2?av(ANULL):ab(i==0);goto done;}}}
  {size_t begin=p->at;if(c=='-')p->at++;size_t digits=p->at;
    if(p->at<p->length&&p->text[p->at]=='0')p->at++;else while(p->at<p->length&&p->text[p->at]>='0'&&p->text[p->at]<='9')p->at++;
    if(p->at==digits){ajerror("Invalid JSON value.");goto done;}
    if(p->at<p->length&&p->text[p->at]=='.'){p->at++;digits=p->at;while(p->at<p->length&&p->text[p->at]>='0'&&p->text[p->at]<='9')p->at++;if(p->at==digits){ajerror("Invalid JSON fraction.");goto done;}}
    if(p->at<p->length&&(p->text[p->at]=='e'||p->text[p->at]=='E')){p->at++;if(p->at<p->length&&(p->text[p->at]=='+'||p->text[p->at]=='-'))p->at++;digits=p->at;while(p->at<p->length&&p->text[p->at]>='0'&&p->text[p->at]<='9')p->at++;if(p->at==digits){ajerror("Invalid JSON exponent.");goto done;}}
    size_t length=p->at-begin,first=begin+(c=='-');
    /* Accumulation through 2^53 is exact in binary64. Other integer, fraction
     * and exponent forms retain strtod's correctly rounded conversion. */
    uint64_t integer=0;size_t i=first;
    for(;i<p->at;i++){unsigned digit=p->text[i]-'0';if(digit>9||integer>(9007199254740992ULL-digit)/10)break;integer=integer*10+digit;}
    if(i==p->at)r[0]=an(c=='-'?-(double)integer:(double)integer);
    else {char local[128],*number=length<sizeof(local)?local:(char*)amemory(length+1);for(size_t j=0;j<length;j++)number[j]=(char)p->text[begin+j];number[length]=0;r[0]=an(strtod(number,NULL));if(number!=local)free(number);}
  }
done:;AV result=r[0];aunroot(&root);p->depth--;return result;
}
static int ajappend(AJWriter *w,const char *text,size_t n){if(n>16*1024*1024-w->length){afail("RangeError","JSON output exceeds 16 MiB.");return 0;}if(w->length+n+1>w->cap){size_t need=w->length+n+1,cap=w->cap?w->cap:256;while(cap<need){cap*=2;if(cap>16*1024*1024+1){cap=16*1024*1024+1;break;}}char *next=(char*)realloc(w->data,cap);if(!next){afail("Error","Cannot allocate JSON output.");return 0;}w->data=next;w->cap=cap;}memcpy(w->data+w->length,text,n);w->length+=n;w->data[w->length]=0;return 1;}
static void ajquoted(AJWriter *w,AV value){ajappend(w,"\"",1);for(int i=0;i<value.p->scope&&!afailed;i++){uint16_t c=value.p->chars[i];char text[16];
  if(c>=32&&c<128&&c!='"'&&c!='\\'){char ascii[256];size_t n=0;do{ascii[n++]=(char)c;i++;if(i==value.p->scope||n==sizeof(ascii))break;c=value.p->chars[i];}while(c>=32&&c<128&&c!='"'&&c!='\\');i--;ajappend(w,ascii,n);continue;}
  if(c=='"'||c=='\\'){text[0]='\\';text[1]=(char)c;ajappend(w,text,2);}else if(c=='\b'||c=='\t'||c=='\n'||c=='\f'||c=='\r'){text[0]='\\';text[1]=c=='\b'?'b':c=='\t'?'t':c=='\n'?'n':c=='\f'?'f':'r';ajappend(w,text,2);}else if(c<32||(c>=0xd800&&c<=0xdfff&&!(c<=0xdbff&&i+1<value.p->scope&&value.p->chars[i+1]>=0xdc00&&value.p->chars[i+1]<=0xdfff))){snprintf(text,sizeof(text),"\\u%04x",c);ajappend(w,text,6);}
  else {unsigned cp=c;if(c>=0xd800&&c<=0xdbff)cp=0x10000+((c-0xd800)<<10)+(value.p->chars[++i]-0xdc00);int n=0;if(cp<128)text[n++]=(char)cp;else if(cp<2048){text[n++]=(char)(0xc0|(cp>>6));text[n++]=(char)(0x80|(cp&63));}else if(cp<65536){text[n++]=(char)(0xe0|(cp>>12));text[n++]=(char)(0x80|((cp>>6)&63));text[n++]=(char)(0x80|(cp&63));}else{text[n++]=(char)(0xf0|(cp>>18));text[n++]=(char)(0x80|((cp>>12)&63));text[n++]=(char)(0x80|((cp>>6)&63));text[n++]=(char)(0x80|(cp&63));}ajappend(w,text,(size_t)n);}}
 ajappend(w,"\"",1);}
typedef struct {size_t slot;uint32_t index;int numeric;} AJKey;
static int ajkeycompare(const void *left,const void *right){const AJKey *a=left,*b=right;if(a->numeric!=b->numeric)return b->numeric-a->numeric;if(a->numeric&&a->index!=b->index)return a->index<b->index?-1:1;return a->slot<b->slot?-1:a->slot>b->slot;}
static int ajindex(AV key,uint32_t *out){if(key.t!=ASTR||key.p->scope<1||key.p->scope>10||(key.p->scope>1&&key.p->chars[0]=='0'))return 0;uint64_t n=0;for(int i=0;i<key.p->scope;i++){unsigned c=key.p->chars[i];if(c<'0'||c>'9')return 0;n=n*10+c-'0';}if(n>=4294967295ULL)return 0;*out=(uint32_t)n;return 1;}

static AV ajprepare(AJWriter *w,AV value,AV key) {
  AV r[4]={value,key,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
  if(value.t==ARECORD||value.t==ALIST||value.t==AFUNC||value.t==ADATE||value.t==APROMISE||value.t==ABYTES||value.t==AHANDLE){r[2]=aprop(value,"toJSON");if(r[2].t==AFUNC)r[0]=acall(r[2],1,&key);}
  if(!afailed&&w->replacer.t==AFUNC){AV args[2]={key,r[0]};r[0]=acall(w->replacer,2,args);}
  AV result=r[0];aunroot(&root);return result;
}
static int ajomitted(AV value){return value.t==AUNDEF||value.t==AUINIT||value.t==AFUNC;}
static void ajindent(AJWriter *w,int depth){if(!w->gap_length)return;ajappend(w,"\n",1);for(int i=0;i<depth&&!afailed;i++)ajappend(w,w->gap,w->gap_length);}
static AV ajkeys(AV value){size_t count=value.p->len/2;AJKey *keys=(AJKey*)amemory((count?count:1)*sizeof(AJKey));for(size_t i=0;i<count;i++){keys[i].slot=i*2;keys[i].numeric=ajindex(value.p->data[i*2],&keys[i].index);}qsort(keys,count,sizeof(AJKey),ajkeycompare);AV list=alist((int)count,NULL);for(size_t i=0;i<count;i++)list.p->data[i]=value.p->data[keys[i].slot];free(keys);return list;}
/* Prove that serialization cannot run user code before using direct slots.
 * A getter, live reference, toJSON method, tagged array, cycle/deep tree or
 * foreign value keeps the snapshot-and-lookup path. No callback is invoked by
 * this bounded inspection. */
static int ajplain(AV value,int depth,size_t *nodes){
  if(++*nodes>100000||depth>128)return 0;
  if(value.t<ASTR)return value.t!=AREF;
  if(value.t==ASTR)return 1;
  if(value.t!=ARECORD&&value.t!=ALIST)return 0;
  if(depth==128)return 0;
  if(value.t==ALIST&&value.p->tag.t==ARECORD)return 0;
  size_t start=value.t==ARECORD?1:0,step=value.t==ARECORD?2:1;
  for(size_t i=start;i<value.p->len;i+=step)if(!ajplain(value.p->data[i],depth+1,nodes))return 0;
  return 1;
}
static void ajnumber(AJWriter *w,double value) {
  char number[128];size_t length;
  if(!isfinite(value)){ajappend(w,"null",4);return;}
  if(value>=-9007199254740992.0&&value<=9007199254740992.0&&trunc(value)==value){
    char *end=number+sizeof(number),*at=end;uint64_t integer=(uint64_t)(value<0?-value:value);
    do{*--at=(char)('0'+integer%10);integer/=10;}while(integer);
    if(value<0)*--at='-';ajappend(w,at,(size_t)(end-at));return;
  }
  aformat_number(value,number);length=strlen(number);ajappend(w,number,length);
}
static void ajplain_key(AJWriter *w,AV key) {
  /* The proven tree stays rooted and cannot execute user code while writing;
   * these pointers therefore remain valid until the writer is discarded. */
  AJQuotedKey *cached=&w->quoted[((uintptr_t)key.p>>4)&63];
  if(cached->key==key.p){ajappend(w,cached->text,cached->length);return;}
  size_t length=(size_t)key.p->scope;
  if(length<=63){
    size_t i=0;for(;i<length;i++){uint16_t c=key.p->chars[i];if(c<32||c>=128||c=='"'||c=='\\')break;}
    if(i==length){cached->key=key.p;cached->length=length+2;cached->text[0]='"';for(i=0;i<length;i++)cached->text[i+1]=(char)key.p->chars[i];cached->text[length+1]='"';ajappend(w,cached->text,cached->length);return;}
  }
  ajquoted(w,key);
}
/* Once ajplain has proved the entire tree, no getter, reference or toJSON can
 * mutate it. Keep one caller root instead of rebuilding roots/keys at every
 * node. The generic writer below retains all dynamic serialization behavior. */
static void ajwrite_plain(AJWriter *w,AV value) {
  if(afailed)return;
  if(value.t==ASTR){ajquoted(w,value);return;}
  if(value.t==ANUM){ajnumber(w,value.n);return;}
  if(value.t==ABOOL){ajappend(w,value.n?"true":"false",value.n?4:5);return;}
  if(value.t==ANULL||ajomitted(value)){ajappend(w,"null",4);return;}
  w->depth++;int first=1;
  if(value.t==ALIST){
    ajappend(w,"[",1);
    for(size_t i=0;i<value.p->len&&!afailed;i++){if(!first)ajappend(w,",",1);ajindent(w,w->depth);first=0;ajwrite_plain(w,value.p->data[i]);}
    if(!first)ajindent(w,w->depth-1);ajappend(w,"]",1);
  }else{
    size_t count=value.p->len/2;AJKey *keys=NULL;uint32_t index;
    for(size_t i=0;i<count;i++)if(ajindex(value.p->data[i*2],&index)){
      keys=amemory(count*sizeof(AJKey));for(size_t j=0;j<count;j++){keys[j].slot=j*2;keys[j].numeric=ajindex(value.p->data[j*2],&keys[j].index);}qsort(keys,count,sizeof(AJKey),ajkeycompare);break;
    }
    ajappend(w,"{",1);
    for(size_t i=0;i<count&&!afailed;i++){size_t slot=keys?keys[i].slot:i*2;AV item=value.p->data[slot+1];if(ajomitted(item))continue;if(!first)ajappend(w,",",1);ajindent(w,w->depth);first=0;ajplain_key(w,value.p->data[slot]);ajappend(w,w->gap_length?": ":":",w->gap_length?2:1);ajwrite_plain(w,item);}
    if(!first)ajindent(w,w->depth-1);ajappend(w,"}",1);free(keys);
  }
  w->depth--;
}
static AV ajresult(AJWriter *w) {
  size_t i=0;for(;i<w->length;i++)if((unsigned char)w->data[i]>=128)break;
  if(i!=w->length)return astrn(w->data,w->length);
  /* ASCII output needs no UTF-8 decoder or intermediate UTF-16 allocation. */
  ACOUNT(strings);AADD(string_units,w->length);AH *h=aalloc(ASTR,0);AStringBuffer *buffer=astring_buffer(w->length);
  buffer->used=w->length;h->scope=(int)w->length;h->external=buffer;h->chars=buffer->chars;
  for(i=0;i<w->length;i++)h->chars[i]=(unsigned char)w->data[i];return ap(h);
}
static void ajwrite(AJWriter *w,AV value) {
  if(afailed)return;value=aread(value);if(afailed)return;
  if(value.t==ASTR){ajquoted(w,value);return;}if(value.t==ANUM){ajnumber(w,value.n);return;}if(value.t==ABOOL){ajappend(w,value.n?"true":"false",value.n?4:5);return;}if(value.t==ANULL||ajomitted(value)){ajappend(w,"null",4);return;}
  if(value.t==APROMISE||value.t==AHANDLE){ajappend(w,"{}",2);return;}
  if(value.t!=ALIST&&value.t!=ARECORD){afail("TypeError","Unsupported JSON value.");return;}if(w->depth==128){afail("RangeError","JSON depth exceeds 128.");return;}for(int i=0;i<w->depth;i++)if(w->active[i]==value.p){afail("TypeError","Circular JSON value.");return;}w->active[w->depth++]=value.p;
  AV r[4]={value,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);int first=1;
  if(value.t==ALIST){size_t n=value.p->len;ajappend(w,"[",1);for(size_t i=0;i<n&&!afailed;i++){AV item=i<value.p->len?value.p->data[i]:av(AUNDEF);if(item.t==AUINIT)item=av(AUNDEF);if(w->plain)r[2]=item;else{r[1]=atostring(an((double)i));r[2]=ajprepare(w,item,r[1]);}if(afailed)break;if(!first)ajappend(w,",",1);ajindent(w,w->depth);first=0;if(ajomitted(r[2]))ajappend(w,"null",4);else ajwrite(w,r[2]);}if(!first)ajindent(w,w->depth-1);ajappend(w,"]",1);}
  else{int direct=w->plain;uint32_t index;for(size_t i=0;direct&&i<value.p->len;i+=2)if(ajindex(value.p->data[i],&index))direct=0;
    if(!direct)r[3]=w->keys.t==ALIST?w->keys:ajkeys(value);size_t count=direct?value.p->len/2:r[3].p->len;
    ajappend(w,"{",1);for(size_t i=0;i<count&&!afailed;i++){r[1]=direct?value.p->data[2*i]:r[3].p->data[i];r[2]=direct?value.p->data[2*i+1]:aget(value,r[1]);if(!w->plain)r[2]=ajprepare(w,r[2],r[1]);if(afailed)break;if(ajomitted(r[2]))continue;if(!first)ajappend(w,",",1);ajindent(w,w->depth);first=0;ajquoted(w,r[1]);ajappend(w,w->gap_length?": ":":",w->gap_length?2:1);ajwrite(w,r[2]);}if(!first)ajindent(w,w->depth-1);ajappend(w,"}",1);}
  aunroot(&root);w->depth--;
}
static void ajdelete(AV holder,AV key){if(holder.t==ALIST){size_t i;if(aindex(key,&i)&&i<holder.p->len)alist_store(holder.p,i,av(AUINIT));}else for(size_t i=0;i<holder.p->len;i+=2)if(aseq(key,holder.p->data[i])){memmove(holder.p->data+i,holder.p->data+i+2,(holder.p->len-i-2)*sizeof(AV));holder.p->len-=2;break;}}
static AV ajrevive(AV holder,AV key,AV callback,int depth,size_t *nodes) {
  if(depth>128||++*nodes>100000)return afail("RangeError","JSON reviver structure limit exceeded.");
  AV r[6]={holder,key,callback,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);r[3]=aget(holder,key);
  if(r[3].t==ALIST||r[3].t==ARECORD){if(r[3].t==ARECORD)r[4]=ajkeys(r[3]);else{r[4]=alist((int)r[3].p->len,NULL);for(size_t i=0;i<r[4].p->len;i++)r[4].p->data[i]=atostring(an((double)i));}
    for(size_t i=0;i<r[4].p->len&&!afailed;i++){r[5]=r[4].p->data[i];if(r[5].t!=ASTR)r[5]=atostring(r[5]);AV childkey=r[5];r[5]=ajrevive(r[3],childkey,callback,depth+1,nodes);if(r[5].t==AUNDEF)ajdelete(r[3],childkey);else aset(r[3],childkey,r[5]);}}
  if(!afailed){AV args[2]={key,r[3]};r[3]=acall(callback,2,args);}AV result=r[3];aunroot(&root);return result;
}
static AV ajson(int id,int argc,AV *argv) {
  AV r[6]={argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),argc>2?argv[2]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);
  if(id==200){r[0]=atostring(r[0]);if(r[0].p->scope>16*1024*1024){afail("RangeError","JSON input exceeds 16 MiB.");goto done;}AJParser p={0};p.text=r[0].p->chars;p.length=(size_t)r[0].p->scope;ARoot keys;aroot(&keys,p.strings,512);r[3]=ajread(&p);ajspace(&p);if(p.at!=p.length&&!afailed)ajerror("Unexpected trailing JSON content.");free(p.scratch);aunroot(&keys);
    if(!afailed&&r[1].t==AFUNC){r[4]=arecord();aput(r[4],"",r[3]);r[5]=astr("");size_t nodes=0;r[3]=ajrevive(r[4],r[5],r[1],0,&nodes);}goto done;}
  {AJWriter w={0};w.replacer=r[1];
    if(r[1].t==ALIST){r[4]=alist(0,NULL);for(size_t i=0;i<r[1].p->len&&!afailed;i++){AV key=r[1].p->data[i];if(key.t!=ASTR&&key.t!=ANUM)continue;r[5]=atostring(key);int exists=0;for(size_t j=0;j<r[4].p->len;j++)if(aseq(r[5],r[4].p->data[j]))exists=1;if(!exists)aappend_value(r[4],r[5]);}w.keys=r[4];}
    if(r[2].t==ANUM){double n=r[2].n;if(isnan(n)||n<0)n=0;if(n>10)n=10;w.gap_length=(size_t)trunc(n);memset(w.gap,' ',w.gap_length);}
    else if(r[2].t==ASTR){r[5]=as16(r[2].p->chars,r[2].p->scope>10?10:(size_t)r[2].p->scope);size_t n;char *gap=autf8bytes(r[5],&n);memcpy(w.gap,gap,n);w.gap_length=n;free(gap);}
    r[5]=astr("");r[0]=ajprepare(&w,r[0],r[5]);if(!afailed&&!ajomitted(r[0])){size_t nodes=0;w.plain=w.replacer.t!=AFUNC&&w.keys.t!=ALIST&&ajplain(r[0],0,&nodes);if(w.plain)ajwrite_plain(&w,r[0]);else ajwrite(&w,r[0]);if(!afailed)r[3]=ajresult(&w);}free(w.data);
  }
 done:;AV result=r[3];aunroot(&root);return afailed?av(AUNDEF):result;
}
