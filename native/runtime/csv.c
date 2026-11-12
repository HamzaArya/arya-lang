/* Bounded incremental CSV data decoder. Quoted line endings, NUL and UTF-16
 * units are data. No evaluation, file access or user callback occurs. */
typedef struct {uint16_t *field,delimiter;size_t length,capacity,record,max_field,max_record,max_columns;int quoted,after_quote,skip_lf,done,failed;} ACsv;
static AV acsv_error(ACsv *s,const char *code,const char *message){if(s)s->failed=1;return acoded_error(code,message);}
static void acsv_finalize(AH *h){ACsv *s=h->external;aallocated-=sizeof(*s)+s->capacity*sizeof(uint16_t);free(s->field);free(s);}
static int acsv_append(ACsv *s,uint16_t c){
  if(s->length==s->max_field){acsv_error(s,"ARYA_CSV_LIMIT","CSV field exceeds its unit limit.");return 0;}
  if(s->length==s->capacity){size_t cap=s->capacity?s->capacity*2:128;if(cap>s->max_field)cap=s->max_field;uint16_t *p=realloc(s->field,cap*sizeof(uint16_t));if(!p){acsv_error(s,"ARYA_CSV_LIMIT","Cannot allocate CSV field.");return 0;}aallocated+=(cap-s->capacity)*sizeof(uint16_t);s->capacity=cap;s->field=p;if(aallocated>apeakh)apeakh=aallocated;}
  s->field[s->length++]=c;return 1;
}
static int acsv_field(AV decoder,AV *temporary){ACsv *s=decoder.p->external;AV row=decoder.p->data[0];if(row.p->len>=s->max_columns){acsv_error(s,"ARYA_CSV_LIMIT","CSV row exceeds its column limit.");return 0;}*temporary=as16(s->field,s->length);if(afailed)return 0;aappend_value(row,*temporary);s->length=0;s->quoted=s->after_quote=0;return !afailed;}
static int acsv_row(AV decoder,AV output,AV *temporary){if(!acsv_field(decoder,temporary))return 0;aappend_value(output,decoder.p->data[0]);decoder.p->data[0]=alist(0,NULL);((ACsv*)decoder.p->external)->record=0;return !afailed;}
static AV acsv_method(AV decoder,int argc,AV *argv){
  ACsv *s=decoder.p->external;int finish=decoder.n!=0;
  if(s->done||s->failed)return acsv_error(s,"ARYA_CSV_STATE","CSV decoder is closed or failed.");
  AV r[3]={decoder,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=alist(0,NULL);
  if(finish){if(s->quoted){acsv_error(s,"ARYA_CSV_SYNTAX","Unclosed quoted CSV field.");goto done;}if(s->record||s->length||decoder.p->data[0].p->len||s->after_quote)acsv_row(decoder,r[1],&r[2]);s->done=1;goto done;}
  if(!argc||argv[0].t!=ASTR||argv[0].p->scope>65536){acsv_error(s,"ARYA_CSV_INPUT","CSV push expects a string of at most 65536 UTF-16 units.");goto done;}
  for(int i=0;i<argv[0].p->scope&&!afailed;i++){uint16_t c=argv[0].p->chars[i];
    if(s->skip_lf){s->skip_lf=0;if(c=='\n')continue;}
    if(!s->quoted&&(c=='\r'||c=='\n')){if(!acsv_row(decoder,r[1],&r[2]))break;s->skip_lf=c=='\r';continue;}
    if(++s->record>s->max_record){acsv_error(s,"ARYA_CSV_LIMIT","CSV row exceeds its unit limit.");break;}
    if(s->quoted){if(c=='"'){s->quoted=0;s->after_quote=1;}else acsv_append(s,c);continue;}
    if(s->after_quote){if(c=='"'){s->after_quote=0;s->quoted=1;acsv_append(s,c);}else if(c==s->delimiter)acsv_field(decoder,&r[2]);else acsv_error(s,"ARYA_CSV_SYNTAX","Unexpected text after a quoted CSV field.");continue;}
    if(c==s->delimiter){acsv_field(decoder,&r[2]);continue;}
    if(c=='"'){if(s->length)acsv_error(s,"ARYA_CSV_SYNTAX","Quote inside an unquoted CSV field.");else s->quoted=1;continue;}
    acsv_append(s,c);
  }
done:;AV result=r[1];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV acsv_property(AV value,AV key){if(!akey(key,"push")&&!akey(key,"finish"))return av(AUNDEF);value.n=akey(key,"finish");return afunction(acsv_method,value,"CSV decoder");}
static AV acsv_decoder(int argc,AV *argv){
  AV options=argc?argv[0]:av(AUNDEF);size_t limits[3]={65536,1048576,1024};uint16_t delimiter=',';
  if(options.t!=AUNDEF){const char *const names[]={"delimiter","maxFieldUnits","maxRecordUnits","maxColumns"};if(!aplain_options(options,names,4))return av(AUNDEF);AV selected=aprop(options,"delimiter");if(selected.t!=AUNDEF){if(selected.t!=ASTR||selected.p->scope!=1||selected.p->chars[0]=='"'||selected.p->chars[0]=='\r'||selected.p->chars[0]=='\n')return acsv_error(NULL,"ARYA_CSV_INPUT","CSV delimiter must be one non-quote, non-newline UTF-16 unit.");delimiter=selected.p->chars[0];}
    const char *keys[]={"maxFieldUnits","maxRecordUnits","maxColumns"};size_t maximum[]={1048576,1048576,1024};for(int i=0;i<3;i++){selected=aprop(options,keys[i]);if(selected.t==AUNDEF)continue;if(!ais_safe_integer(selected)||selected.n<1||selected.n>maximum[i])return acsv_error(NULL,"ARYA_CSV_LIMIT","Invalid CSV resource limit.");limits[i]=(size_t)selected.n;}}
  AV decoder=ap(aalloc(AHANDLE,1));ARoot root;aroot(&root,&decoder,1);ACsv *s=amemory(sizeof(*s));s->delimiter=delimiter;s->max_field=limits[0];s->max_record=limits[1];s->max_columns=limits[2];decoder.p->name="arya.csv";decoder.p->external=s;decoder.p->finalize=acsv_finalize;aallocated+=sizeof(*s);decoder.p->data[0]=alist(0,NULL);aunroot(&root);return decoder;
}
/* stdin chunks retain at most three pending UTF-8 bytes across calls. */
static unsigned char ainput_pending[4];static size_t ainput_pending_length;static int ainput_mode;
static AV aread_chunk(int argc,AV *argv){
  if(!argc||!ais_safe_integer(argv[0])||argv[0].n<1||argv[0].n>1048576)return afail("RangeError","readChunk size must be from 1 to 1048576 bytes.");
  if(ainput_mode==1)return afail("TypeError","Do not mix readLine and readChunk on stdin.");ainput_mode=2;
  size_t cap=(size_t)argv[0].n;unsigned char *bytes=amemory(cap+4);memcpy(bytes,ainput_pending,ainput_pending_length);size_t n=ainput_pending_length;ainput_pending_length=0;
  size_t got=fread(bytes+n,1,cap,stdin);n+=got;
  if(ferror(stdin)){int saved=errno;free(bytes);return afail("IOError",strerror(saved?saved:EIO));}
  if(!n){free(bytes);return av(ANULL);}
  if(!feof(stdin)){size_t begin=n-1;while(begin&&n-begin<4&&(bytes[begin]&0xc0)==0x80)begin--;unsigned c=bytes[begin];size_t required=c>=0xc2&&c<=0xdf?2:c>=0xe0&&c<=0xef?3:c>=0xf0&&c<=0xf4?4:1;if(n-begin<required){ainput_pending_length=n-begin;memcpy(ainput_pending,bytes+begin,ainput_pending_length);n=begin;}}
  AV text=astrn((const char*)bytes,n);free(bytes);return text;
}
