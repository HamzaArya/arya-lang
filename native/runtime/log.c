/* Native JSON logging with recursive, bounded redaction and snapshot bindings. */
static int alog_secret(AV key,AV extras){if(key.t!=ASTR)return 0;char *text=autf8(key);size_t n=0;for(char *p=text;*p;p++)if(*p!='-'&&*p!='_')text[n++]=(char)tolower((unsigned char)*p);text[n]=0;
  const char *secrets[]={"password","passwd","pwd","secret","token","authorization","cookie","setcookie","apikey","accesstoken","refreshtoken"};int secret=0;for(size_t i=0;i<sizeof(secrets)/sizeof(*secrets);i++)if(!strcmp(text,secrets[i]))secret=1;
  if(extras.t==ALIST)for(size_t i=0;i<extras.p->len;i++){char *s=autf8(extras.p->data[i]);size_t at=0;for(char *p=s;*p;p++)if(*p!='-'&&*p!='_')s[at++]=(char)tolower((unsigned char)*p);s[at]=0;if(!strcmp(text,s))secret=1;free(s);}free(text);return secret;
}
typedef struct {AH *seen[1000];size_t count,nodes;AV redact;} ALogClean;
static AV alog_clean(ALogClean *state,AV value,int depth) {
  if(value.t==AGETTER)return astr("[Accessor]");
  if(++state->nodes>1000||depth>8)return astr("[Truncated]");
  if(value.t==ANULL||value.t==ABOOL||value.t==ANUM)return value;if(value.t==ASTR){if(value.p->scope<=8192)return value;AV r=as16(value.p->chars,8192);ARoot root;aroot(&root,&r,1);r=aconcat(r,astr("[Truncated]"));aunroot(&root);return r;}
  if(value.t!=ARECORD&&value.t!=ALIST)return astr(value.t==AUNDEF?"[undefined]":value.t==AFUNC?"[function]":"[object]");
  for(size_t i=0;i<state->count;i++)if(state->seen[i]==value.p)return astr("[Circular]");if(state->count==1000)return astr("[Truncated]");state->seen[state->count++]=value.p;
  AV r[4]={value,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);int list=value.t==ALIST;r[1]=list?alist(0,NULL):arecord();size_t n=list?value.p->len:value.p->len/2;if(n>100)n=100;
  int error=value.p->name&&!strcmp(value.p->name,"arya.error");
  for(size_t i=0;i<n&&!afailed;i++){r[2]=list?an((double)i):value.p->data[i*2];if(error&&!akey(r[2],"name")&&!akey(r[2],"message")&&!akey(r[2],"code")&&!akey(r[2],"driverCode")&&!akey(r[2],"sqlState"))continue;
    AV item=list?value.p->data[i]:value.p->data[i*2+1];if(item.t!=AGETTER&&item.t!=AUINIT)item=aread(item);if(item.t==AUINIT)item=av(AUNDEF);if(!list&&alog_secret(r[2],state->redact))r[3]=astr("[Redacted]");else r[3]=alog_clean(state,item,depth+1);
    if(list)aappend_value(r[1],r[3]);else aset(r[1],r[2],r[3]);}
  if(error&&aprop(r[1],"name").t==AUNDEF)aput(r[1],"name",astr("Error"));AV result=r[1];aunroot(&root);return result;
}
static AV alog_fields(AV value,AV redact){if(value.t!=ARECORD)return acoded_error("ARYA_LOG_CONFIG","Log fields must be a record.");ALogClean state={0};state.redact=redact;return alog_clean(&state,value,0);}
static void alog_merge(AV to,AV from){for(size_t i=0;i<from.p->len&&!afailed;i+=2)aset(to,from.p->data[i],from.p->data[i+1]);}
static AV alog_make(AV settings,AV bindings);
static AV alog_method(AV env,int argc,AV *argv) {
  AV settings=env.p->data[0],bindings=env.p->data[1];int method=(int)env.p->data[2].n;
  if(method!=6&&method<(int)settings.p->data[1].n)return av(AUNDEF);
  AV r[6]={env,av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);
  r[1]=argc>1?argv[1]:av(AUNDEF);if(method==6)r[1]=argc?argv[0]:av(AUNDEF);if(r[1].t==AUNDEF)r[1]=arecord();r[2]=alog_fields(r[1],settings.p->data[3]);if(afailed)goto done;
  if(method==6){r[3]=avcopy(bindings);alog_merge(r[3],r[2]);r[5]=alog_make(settings,r[3]);goto done;}
  if(!argc||argv[0].t!=ASTR){acoded_error("ARYA_LOG_CONFIG","Log messages must be text; put data in the fields argument.");goto done;}
  r[3]=avcopy(bindings);alog_merge(r[3],r[2]);const char *levels[]={"trace","debug","info","warn","error","fatal"};aput(r[3],"timestamp",anow_iso());aput(r[3],"level",astr(levels[method]));aput(r[3],"name",settings.p->data[0]);r[4]=argv[0].p->scope>8192?as16(argv[0].p->chars,8192):argv[0];aput(r[3],"message",r[4]);r[4]=ajson(201,1,&r[3]);if(afailed)goto done;r[4]=aconcat(r[4],astr("\n"));
  if(settings.p->data[2].t==AFUNC)acall(settings.p->data[2],1,&r[4]);else{size_t n;char *text=autf8bytes(r[4],&n);fwrite(text,1,n,stdout);free(text);}r[5]=av(AUNDEF);
done:;AV result=r[5];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV alog_make(AV settings,AV bindings){AV r[4]={settings,bindings,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);r[2]=arecord();const char *names[]={"trace","debug","info","warn","error","fatal","child"};for(int i=0;i<7;i++){r[3]=alist(3,NULL);r[3].p->data[0]=settings;r[3].p->data[1]=bindings;r[3].p->data[2]=an(i);r[3]=afunction(alog_method,r[3],names[i]);aput(r[2],names[i],r[3]);}r[2].p->scope=-2;AV result=r[2];aunroot(&root);return result;}
static AV alog_create(int argc,AV *argv){AV r[6]={argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);if(r[0].t==AUNDEF)r[0]=arecord();const char *names[]={"name","level","sink","redact"};if(!aplain_options(r[0],names,4)){afailed=0;acoded_error("ARYA_LOG_CONFIG","Unknown or invalid logger options.");goto done;}
  r[1]=aprop(r[0],"name");if(r[1].t==AUNDEF)r[1]=astr("arya");int empty=r[1].t!=ASTR;if(!empty){empty=1;for(int i=0;i<r[1].p->scope;i++)if(!aspace(r[1].p->chars[i]))empty=0;}if(empty){acoded_error("ARYA_LOG_CONFIG","Logger name must be nonempty text.");goto done;}
  r[2]=aprop(r[0],"level");if(r[2].t==AUNDEF)r[2]=astr("info");const char *levels[]={"trace","debug","info","warn","error","fatal","silent"};int level=-1;for(int i=0;i<7;i++)if(akey(r[2],levels[i]))level=i;if(level<0){acoded_error("ARYA_LOG_CONFIG","Unknown logger level.");goto done;}
  r[3]=aprop(r[0],"sink");if(r[3].t!=AUNDEF&&r[3].t!=AFUNC){acoded_error("ARYA_LOG_CONFIG","Logger sink must be a function.");goto done;}r[4]=aprop(r[0],"redact");if(r[4].t==AUNDEF)r[4]=alist(0,NULL);if(r[4].t!=ALIST){acoded_error("ARYA_LOG_CONFIG","Logger redact must be a list of field names.");goto done;}for(size_t i=0;i<r[4].p->len;i++)if(r[4].p->data[i].t!=ASTR||!r[4].p->data[i].p->scope){acoded_error("ARYA_LOG_CONFIG","Logger redact fields must be nonempty text.");goto done;}
  r[4]=alist((int)r[4].p->len,r[4].p->data);r[5]=alist(4,NULL);r[5].p->data[0]=r[1];r[5].p->data[1]=an(level);r[5].p->data[2]=r[3];r[5].p->data[3]=r[4];r[0]=arecord();r[5]=alog_make(r[5],r[0]);
done:;AV result=r[5];aunroot(&root);return afailed?av(AUNDEF):result;
}
