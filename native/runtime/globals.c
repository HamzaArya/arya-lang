/* Native value helpers. These operate on Arya values, without a JavaScript VM. */
static int aown(AV object,AV key){if(object.t==ARECORD||object.t==AFUNC){return key.t==ASTR&&akey_find(object.p,key,2)!=SIZE_MAX;}else if(object.t==ALIST){size_t i;if(akey(key,"length"))return 1;return aindex(key,&i)&&i<object.p->len&&object.p->data[i].t!=AUINIT;}return 0;}
static AV aobject_keys(AV object){if(object.t==ANULL||object.t==AUNDEF)return afail("TypeError","Cannot enumerate null or undefined.");if(object.t==ARECORD||object.t==AFUNC)return ajkeys(object);AV r[2]={object,alist(0,NULL)};ARoot root;aroot(&root,r,2);size_t n=object.t==ALIST?object.p->len:object.t==ASTR?(size_t)object.p->scope:object.t==ABYTES?(size_t)object.p->scope:0;for(size_t i=0;i<n&&!afailed;i++)if(object.t!=ALIST||object.p->data[i].t!=AUINIT){AV key=atostring(an((double)i));aappend_value(r[1],key);}AV out=r[1];aunroot(&root);return out;}
/* Record literal spread is shallow and copies current own field values. Key
 * enumeration is snapshotted before getters run; newly added fields are not
 * visited. All values survive getter allocation, collection and suspension.
 * Arya records have no prototype chain or hidden property attributes. */
static AV arecord_spread(AV target,AV source) {
  if(source.t!=ARECORD)return afail("TypeError","Record spread requires a record.");
  AV r[5]={target,source,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);
  r[2]=ajkeys(r[1]);
  for(size_t i=0;!afailed&&i<r[2].p->len;i++) {
    r[3]=r[2].p->data[i];r[4]=aget(r[1],r[3]);
    if(!afailed)aset(r[0],r[3],r[4]);
  }
  AV result=r[0];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aobject_function(AV env,int argc,AV *argv){int id=(int)env.n;AV r[6]={argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);AV out=av(AUNDEF);
 if(id==0){out=r[0].t==ANULL||r[0].t==AUNDEF?arecord():r[0];goto done;}
 if(id==4){out=ab(asame_value(r[0],r[1]));goto done;}if(id==5){if(r[1].t!=ASTR)r[1]=atostring(r[1]);out=ab(aown(r[0],r[1]));goto done;}
 if(id==6){if(r[0].t==ARECORD||r[0].t==ALIST||r[0].t==AFUNC)r[0].p->scope=-2;out=r[0];goto done;}
 if(id==7){out=ab(r[0].t<ALIST||r[0].p->scope<0);goto done;}
 if(id==8){if(r[0].t!=ALIST){afail("TypeError","Object.fromEntries requires a list of pairs.");goto done;}r[2]=arecord();for(size_t i=0;i<r[0].p->len&&!afailed;i++){AV pair=r[0].p->data[i];if(pair.t!=ALIST||pair.p->len<2){afail("TypeError","Object.fromEntries entry must be a pair.");break;}r[3]=atostring(pair.p->data[0]);aset(r[2],r[3],pair.p->data[1]);}out=r[2];goto done;}
 if(id==9){if(r[0].t!=ARECORD&&r[0].t!=AFUNC){afail("TypeError","Object.assign target must be a record.");goto done;}for(int a=1;a<argc&&!afailed;a++){if(argv[a].t==ANULL||argv[a].t==AUNDEF)continue;r[2]=aobject_keys(argv[a]);for(size_t i=0;i<r[2].p->len&&!afailed;i++){r[3]=r[2].p->data[i];r[4]=aget(argv[a],r[3]);aset(r[0],r[3],r[4]);}}out=r[0];goto done;}
 if(id==10){if(r[0].t!=ANULL){afail("TypeError","Native Object.create accepts null; use records for native objects.");goto done;}out=arecord();goto done;}
 if(id==11){if(r[1].t!=ASTR)r[1]=atostring(r[1]);if(!aown(r[0],r[1]))goto done;r[2]=arecord();if(r[0].t==ARECORD||r[0].t==AFUNC){for(size_t i=0;i<r[0].p->len;i+=2)if(aseq(r[1],r[0].p->data[i]))r[3]=r[0].p->data[i+1];}else r[3]=aget(r[0],r[1]);if(r[3].t==AGETTER)aput(r[2],"get",r[3].p->parent);else{aput(r[2],"value",r[3]);aput(r[2],"writable",ab(r[0].p->scope>=0));}aput(r[2],"enumerable",ab(1));aput(r[2],"configurable",ab(r[0].p->scope>=0));out=r[2];goto done;}
 if(id==12){if(argc<3||argv[2].t!=ARECORD||r[1].t!=ASTR){afail("TypeError","Object.defineProperty requires a record, name and descriptor.");goto done;}r[3]=aprop(argv[2],"get");if(r[3].t==AFUNC){r[4]=ap(aalloc(AGETTER,0));r[4].p->parent=r[3];aset(r[0],r[1],r[4]);}else{r[4]=aprop(argv[2],"value");aset(r[0],r[1],r[4]);}out=r[0];goto done;}
 if(id>=1&&id<=3){r[2]=aobject_keys(r[0]);if(afailed)goto done;if(id==1){out=r[2];goto done;}r[3]=alist(0,NULL);for(size_t i=0;i<r[2].p->len&&!afailed;i++){r[4]=r[2].p->data[i];r[5]=aget(r[0],r[4]);if(id==3){AV pair[2]={r[4],r[5]};r[5]=alist(2,pair);}aappend_value(r[3],r[5]);}out=r[3];goto done;}
 afail("TypeError","Unknown native Object function.");
 done:aunroot(&root);return afailed?av(AUNDEF):out;
}
/* Lowered fresh data descriptors are unobservable to the builtin. Guard the
 * actual selected function, since aliases, getters and user replacements must
 * still receive a normal mutable descriptor in its original field order. */
static AV adefine_data_call(AV callee,AV object,AV key,AV value,unsigned order) {
  /* Reading a stored reference/getter is observable in the native value
   * model. Materialize that descriptor and use the ordinary reader below. */
  if(value.t!=AUINIT&&value.t!=AREF&&value.t!=AGETTER&&callee.t==AFUNC&&callee.p->code==aobject_function&&callee.p->parent.t==ANUM&&callee.p->parent.n==12){
    ACOUNT(direct_calls);ACOUNT(data_descriptor_calls);if(!acall_enter())return av(AUNDEF);
    (void)(key.t!=ASTR?afail("TypeError","Object.defineProperty requires a record, name and descriptor."):aset(object,key,value));
    adepth--;return afailed?av(AUNDEF):object;
  }
  AV r[5]={callee,object,key,value,av(AUNDEF)};ARoot root;aroot(&root,r,5);r[4]=arecord();
  const char *names[]={"value","enumerable","configurable","writable"};
  for(int i=0;i<4&&!afailed;i++,order>>=2)aput(r[4],names[order&3],(order&3)?ab(1):r[3]);
  AV result=av(AUNDEF);if(!afailed){AV args[3]={r[1],r[2],r[4]};result=acall_rooted(r[0],3,args);}
  aunroot(&root);return result;
}
static AV anumber_global_call(AV env,int argc,AV *argv){int id=(int)env.n;AV x=argc?argv[0]:av(AUNDEF);if(id==0)return an(argc?atonumber(x):0);if(id==1)return ab(x.t==ANUM&&isfinite(x.n));if(id==2)return ab(x.t==ANUM&&isnan(x.n));if(id==3)return ab(x.t==ANUM&&isfinite(x.n)&&trunc(x.n)==x.n);if(id==4)return ab(ais_safe_integer(x));if(id==7)return ab(isnan(atonumber(x)));if(id==8)return ab(isfinite(atonumber(x)));
 AV text=atostring(x);if(afailed)return av(AUNDEF);ARoot root;aroot(&root,&text,1);size_t start=0,n=(size_t)text.p->scope;while(start<n&&aspace(text.p->chars[start]))start++;char *bytes=(char*)amemory(n-start+1);size_t length=0;for(size_t i=start;i<n;i++)bytes[length++]=text.p->chars[i]<128?(char)text.p->chars[i]:'?';bytes[length]=0;double result=NAN;
 if(id==6){char *end;result=strtod(bytes,&end);if(end==bytes)result=NAN;/* C accepts hex and infinity spellings that parseFloat does not. */if(!strncmp(bytes,"Infinity",8)||!strncmp(bytes,"+Infinity",9))result=INFINITY;else if(!strncmp(bytes,"-Infinity",9))result=-INFINITY;else{size_t i=bytes[0]=='+'||bytes[0]=='-'?1:0;if(!strncmp(bytes+i,"0x",2)||!strncmp(bytes+i,"0X",2))result=bytes[0]=='-'?-0.0:0;if(!strncmp(bytes+i,"inf",3)||!strncmp(bytes+i,"Inf",3))result=NAN;}}
 else{size_t i=0;int sign=1;if(bytes[i]=='+'||bytes[i]=='-'){if(bytes[i]=='-')sign=-1;i++;}uint32_t radix=argc>1?auint32(atonumber(argv[1])):0;if(radix&& (radix<2||radix>36))goto parsed;if(!radix)radix=16;else if(radix!=16)goto digits;if(bytes[i]=='0'&&(bytes[i+1]=='x'||bytes[i+1]=='X')){i+=2;radix=16;}else if(argc<2||atonumber(argv[1])==0)radix=10;
 digits:;double total=0;size_t begin=i;for(;i<length;i++){unsigned c=(unsigned char)bytes[i];unsigned digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='z'?c-'a'+10:c>='A'&&c<='Z'?c-'A'+10:99;if(digit>=radix)break;total=total*radix+digit;}if(i>begin)result=sign<0?-total:total;}
 parsed:free(bytes);aunroot(&root);return an(result);
}
static AV aarray_global_call(AV env,int argc,AV *argv){int id=(int)env.n;if(id==1)return ab(argc&&argv[0].t==ALIST);if(id==2)return alist(argc,argv);if(id==0){if(argc==1&&argv[0].t==ANUM){if(!ais_safe_integer(argv[0])||argv[0].n<0||argv[0].n>1000000)return afail("RangeError","Invalid native array length.");AV array=alist(0,NULL);alist_length(array.p,(size_t)argv[0].n);return array;}return alist(argc,argv);}AV r[4]={argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);if(argc>1&&argv[1].t!=AUNDEF&&argv[1].t!=AFUNC){afail("TypeError","Array.from mapper must be a function.");goto done;}r[1]=alist(0,NULL);r[0]=aiteropen(r[0]);AV position=an(0);size_t size=0;int arraylike=r[0].t==ARECORD;if(arraylike){r[3]=aprop(r[0],"length");double n=atonumber(r[3]);if(n>1000000){afail("RangeError","Array.from exceeds one million items.");goto done;}size=isnan(n)||n<=0?0:(size_t)trunc(n);}for(size_t i=0;!afailed;i++){if(arraylike){if(i>=size)break;r[3]=atostring(an((double)i));r[2]=aget(r[0],r[3]);}else{r[2]=aiternext(r[0],&position);if(r[2].t==AUINIT)break;}if(argc>1&&argv[1].t!=AUNDEF){AV args[2]={r[2],an((double)i)};r[2]=acall(argv[1],2,args);}if(!afailed)aappend_value(r[1],r[2]);}done:;aiterrelease(r[0]);AV result=r[1];aunroot(&root);return afailed?av(AUNDEF):result;}

/* Stable ordered entries: deletion leaves a tombstone instead of moving every
 * following key. Reclaim tombstones on a later insertion, amortized over churn. */
static size_t acollection_count(AV object,size_t step) { return object.p->keys?object.p->keys->count:object.p->len/step; }
static void acollection_compact(AV object,size_t step) {
  AH *h=object.p;if(!h->keys||h->keys->iterating)return;
  size_t out=0;for(size_t i=0;i<h->len;i+=step)if(h->data[i].t!=AUINIT) { for(size_t j=0;j<step;j++)h->data[out+j]=h->data[i+j];out+=step; }
  h->len=out;akey_rebuild(h,step);
}
static AV acollection_invoke(AV object,AV key,int argc,AV *argv) {
  AV first=argc?argv[0]:av(AUNDEF);int set=!strcmp(object.p->name,"arya.set");size_t step=set?1:2,slot=SIZE_MAX;
  int lookup=akey(key,"has")||akey(key,"get")||akey(key,"delete")||akey(key,"set")||akey(key,"add");
  if(lookup)slot=akey_find(object.p,first,step);
  if(akey(key,"has"))return ab(slot!=SIZE_MAX);
  if(akey(key,"get"))return slot==SIZE_MAX?av(AUNDEF):object.p->data[slot+1];
  if(akey(key,"clear")) {
    if(!object.p->keys)akey_rebuild(object.p,step);
    if(object.p->keys->iterating){if(object.p->len)memset(object.p->data,0,object.p->len*sizeof(AV));}else object.p->len=0;
    AKeyIndex *index=object.p->keys;memset(index->slots,0,index->capacity*sizeof(size_t));index->count=index->occupied=0;index->extent=object.p->len;return av(AUNDEF);
  }
  if(akey(key,"delete")) {
    if(slot==SIZE_MAX)return ab(0);if(!object.p->keys)akey_rebuild(object.p,step);
    akey_deleted(object.p,slot);object.p->data[slot]=av(AUINIT);if(!set)object.p->data[slot+1]=av(AUNDEF);return ab(1);
  }
  if(akey(key,"set")||akey(key,"add")) {
    if(slot==SIZE_MAX) {
      size_t count=acollection_count(object,step);
      if(count>=1000000/step)return afail("RangeError","Collection exceeds its entry limit.");
      if(object.p->len>=64&&count*step*2<object.p->len)acollection_compact(object,step);
      slot=object.p->len;aresize(object.p,slot+step);object.p->len+=step;
      object.p->data[slot]=first.t==ANUM&&first.n==0?an(0):first;akey_added(object.p,slot,step);
    }
    if(!set)object.p->data[slot+1]=argc>1?argv[1]:av(AUNDEF);return object;
  }
  AV r[3]={object,alist(0,NULL),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  int each=akey(key,"forEach");if(each){if(!object.p->keys)akey_rebuild(object.p,step);object.p->keys->iterating++;}
  for(size_t i=0;i<object.p->len&&!afailed;i+=step) {
    if(object.p->data[i].t==AUINIT)continue;AV value=object.p->data[i+(set?0:1)];
    if(each){AV args[3]={value,object.p->data[i],object};acall(first,3,args);}
    else {r[2]=akey(key,"keys")?object.p->data[i]:value;if(akey(key,"entries")){AV pair[2]={object.p->data[i],value};r[2]=alist(2,pair);}aappend_value(r[1],r[2]);}
  }
  if(each)object.p->keys->iterating--;
  AV result=each?av(AUNDEF):r[1];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV acollection_method(AV env,int argc,AV *argv){return acollection_invoke(env.p->data[0],env.p->data[1],argc,argv);}
static AV acollection_get(AV object,AV key){int set=!strcmp(object.p->name,"arya.set");if(akey(key,"size"))return an((double)acollection_count(object,set?1:2));const char *names[]={"has","get","set","add","clear","delete","keys","values","entries","forEach"};for(int i=0;i<10;i++)if(akey(key,names[i])&&!(set&&(i==1||i==2))&&!(!set&&i==3)){AV r[3]={object,key,av(AUNDEF)};ARoot root;aroot(&root,r,3);r[2]=alist(2,r);AV fn=afunction(acollection_method,r[2],names[i]);aunroot(&root);return fn;}return av(AUNDEF);}
static AV acollection_global(AV env,int argc,AV *argv){int set=env.n!=0;AV r[4]={ap(aalloc(AHANDLE,0)),argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);r[0].p->name=set?"arya.set":"arya.map";if(r[1].t!=AUNDEF&&r[1].t!=ANULL){r[1]=aiteropen(r[1]);AV position=an(0);while(!afailed){r[2]=aiternext(r[1],&position);if(r[2].t==AUINIT)break;AV value=r[2];if(!set){if(value.t!=ALIST||value.p->len<2){afail("TypeError","Map input requires pairs.");break;}value=value.p->data[0];}r[3]=aprop(r[0],set?"add":"set");AV args[2]={value,set?av(AUNDEF):r[2].p->data[1]};acall(r[3],set?1:2,args);}}aiterrelease(r[1]);AV result=r[0];aunroot(&root);return afailed?av(AUNDEF):result;}

static AV aabort_method(AV env,int argc,AV *argv){AV state=env.p->data[0];int id=(int)env.p->data[1].n;AV r[4]={env,argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);AV result=av(AUNDEF);
 if(id==0){result=state.p->data[0];goto done;}if(id==1){result=state.p->data[1];goto done;}if(id==2){if(state.p->data[0].n)athrow(state.p->data[1]);goto done;}
 if(id==3){if(!akey(r[1],"abort")||argc<2||argv[1].t!=AFUNC)goto done;AV listeners=state.p->data[2];for(size_t i=0;i<listeners.p->len;i++)if(aeq(listeners.p->data[i],argv[1]))goto done;aappend_value(listeners,argv[1]);goto done;}
 if(id==4){if(!akey(r[1],"abort")||argc<2)goto done;AV listeners=state.p->data[2];for(size_t i=0;i<listeners.p->len;i++)if(aeq(listeners.p->data[i],argv[1])){memmove(listeners.p->data+i,listeners.p->data+i+1,(listeners.p->len-i-1)*sizeof(AV));listeners.p->len--;break;}goto done;}
 if(id==5){if(state.p->data[0].n)goto done;state.p->data[0]=ab(1);if(r[1].t==AUNDEF){r[2]=astr("AbortError");AV message=astr("This operation was aborted.");r[1]=anative_error(r[2],1,&message);}state.p->data[1]=r[1];r[2]=alist((int)state.p->data[2].p->len,state.p->data[2].p->data);r[3]=arecord();aput(r[3],"type",astr("abort"));aput(r[3],"target",state.p->data[3]);for(size_t i=0;i<r[2].p->len&&!afailed;i++)acall(r[2].p->data[i],1,&r[3]);goto done;}
 done:aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aabort_bound(AV state,int id){AV r[2]={state,av(AUNDEF)};ARoot root;aroot(&root,r,2);r[1]=alist(2,NULL);r[1].p->data[0]=state;r[1].p->data[1]=an(id);AV result=afunction(aabort_method,r[1],"AbortSignal method");aunroot(&root);return result;}
static AV aabort_global_call(AV env,int argc,AV *argv){AV r[5]={alist(4,NULL),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);r[0].p->data[0]=ab(0);r[0].p->data[1]=av(AUNDEF);r[1]=alist(0,NULL);r[0].p->data[2]=r[1];r[2]=arecord();r[0].p->data[3]=r[2];for(int i=0;i<2;i++){r[3]=aabort_bound(r[0],i);r[4]=ap(aalloc(AGETTER,0));r[4].p->parent=r[3];aput(r[2],i?"reason":"aborted",r[4]);}aput(r[2],"throwIfAborted",aabort_bound(r[0],2));aput(r[2],"addEventListener",aabort_bound(r[0],3));aput(r[2],"removeEventListener",aabort_bound(r[0],4));r[2].p->scope=-2;
 if(env.n==1){r[3]=alist(2,NULL);r[3].p->data[0]=r[0];r[3].p->data[1]=an(5);aabort_method(r[3],argc,argv);}else if(env.n==2)afail("TypeError","Use new AbortController() to create a signal.");else{r[1]=arecord();aput(r[1],"signal",r[2]);aput(r[1],"abort",aabort_bound(r[0],5));r[2]=r[1];}AV result=r[2];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aconsole_call(AV env,int argc,AV *argv){FILE *file=env.n?stderr:stdout;AV value=av(AUNDEF);ARoot root;aroot(&root,&value,1);for(int i=0;i<argc&&!afailed;i++){value=argv[i].t==ASTR?argv[i]:ainspect(argv[i],4,10000,0);if(afailed)break;size_t n;char *bytes=autf8bytes(value,&n);if(i)fputc(' ',file);fwrite(bytes,1,n,file);free(bytes);}fputc('\n',file);fflush(file);aunroot(&root);return av(AUNDEF);}
static AV aperformance_call(AV env,int argc,AV *argv){(void)env;(void)argc;(void)argv;return an(amonotonic()*1000);}
static void aglobal_field(AV object,const char *name,ACode fn,int id){AV value=afunction(fn,an(id),name);aput(object,name,value);}
static AV aglobal(const char *name){if(aextra_roots[2].t!=ARECORD)aextra_roots[2]=arecord();
 /* The private cache is rooted for the process lifetime. ASCII hits need no
  * temporary string, and the returned object retains its mutable identity. */
 AV cached=aprop(aextra_roots[2],name);if(cached.t!=AUNDEF){ACOUNT(global_cache_hits);return cached;}
 AV r[2]={astr(name),av(AUNDEF)};ARoot root;aroot(&root,r,2);
 if(!strcmp(name,"Object")){r[1]=afunction(aobject_function,an(0),name);const char *names[]={"keys","values","entries","is","hasOwn","freeze","isFrozen","fromEntries","assign","create","getOwnPropertyDescriptor","defineProperty"};for(int i=0;i<12;i++)aglobal_field(r[1],names[i],aobject_function,i+1);}
 else if(!strcmp(name,"Number")){r[1]=afunction(anumber_global_call,an(0),name);const char *names[]={"isFinite","isNaN","isInteger","isSafeInteger","parseInt","parseFloat"};for(int i=0;i<6;i++)aglobal_field(r[1],names[i],anumber_global_call,i+1);aput(r[1],"MAX_SAFE_INTEGER",an(9007199254740991.0));aput(r[1],"MIN_SAFE_INTEGER",an(-9007199254740991.0));aput(r[1],"MAX_VALUE",an(DBL_MAX));aput(r[1],"MIN_VALUE",an(0x1p-1074));aput(r[1],"EPSILON",an(DBL_EPSILON));aput(r[1],"NaN",an(NAN));aput(r[1],"POSITIVE_INFINITY",an(INFINITY));aput(r[1],"NEGATIVE_INFINITY",an(-INFINITY));}
 else if(!strcmp(name,"Array")){r[1]=afunction(aarray_global_call,an(0),name);aglobal_field(r[1],"isArray",aarray_global_call,1);aglobal_field(r[1],"of",aarray_global_call,2);aglobal_field(r[1],"from",aarray_global_call,3);}
 else if(!strcmp(name,"Map")||!strcmp(name,"Set"))r[1]=afunction(acollection_global,an(!strcmp(name,"Set")),name);
 else if(!strcmp(name,"parseInt")||!strcmp(name,"parseFloat")||!strcmp(name,"isNaN")||!strcmp(name,"isFinite"))r[1]=afunction(anumber_global_call,an(!strcmp(name,"parseInt")?5:!strcmp(name,"parseFloat")?6:!strcmp(name,"isNaN")?7:8),name);
 else if(!strcmp(name,"console")){r[1]=arecord();const char *names[]={"log","info","debug","warn","error"};for(int i=0;i<5;i++)aglobal_field(r[1],names[i],aconsole_call,i>=3);}
 else if(!strcmp(name,"performance")){r[1]=arecord();aglobal_field(r[1],"now",aperformance_call,0);}
 else if(!strcmp(name,"AbortController"))r[1]=afunction(aabort_global_call,an(0),name);
 else if(!strcmp(name,"AbortSignal")){r[1]=afunction(aabort_global_call,an(2),name);aglobal_field(r[1],"abort",aabort_global_call,1);}

 else if(!strcmp(name,"Math")||!strcmp(name,"JSON"))r[1]=astd(!strcmp(name,"Math")?"math":"json");
 else if(!strcmp(name,"Promise"))r[1]=apromise_global();
 else if(!strcmp(name,"Buffer"))r[1]=abuffer_global();
 else if(!strcmp(name,"Date"))r[1]=adate_global();
 else if(!strcmp(name,"String")||!strcmp(name,"Boolean"))r[1]=abuilt(!strcmp(name,"String")?2:5);
 else if(!strcmp(name,"Error")||!strcmp(name,"TypeError")||!strcmp(name,"RangeError")||!strcmp(name,"SyntaxError")||!strcmp(name,"ReferenceError")||!strcmp(name,"URIError")||!strcmp(name,"EvalError")||!strcmp(name,"AggregateError"))r[1]=aerror_global(name);
#ifdef ARYA_REGEX
 else if(!strcmp(name,"RegExp"))r[1]=aregex_global();
#endif
#ifdef ARYA_URL
 else if(!strcmp(name,"URL")||!strcmp(name,"URLSearchParams"))r[1]=aurl_global(!strcmp(name,"URLSearchParams"));
#endif
 else if(!strcmp(name,"encodeURIComponent")||!strcmp(name,"encodeURI")||!strcmp(name,"decodeURIComponent")||!strcmp(name,"decodeURI"))r[1]=afunction(auri_function,an(!strcmp(name,"encodeURIComponent")?0:!strcmp(name,"encodeURI")?1:!strcmp(name,"decodeURIComponent")?2:3),name);
 else if(!strcmp(name,"setTimeout")||!strcmp(name,"setInterval")||!strcmp(name,"clearTimeout")||!strcmp(name,"clearInterval")||!strcmp(name,"queueMicrotask"))r[1]=afunction(atimer_call,an(!strcmp(name,"setTimeout")?0:!strcmp(name,"setInterval")?2:!strcmp(name,"queueMicrotask")?3:1),name);
 else afail("ReferenceError","Unknown native global.");
 if(!afailed)aset(aextra_roots[2],r[0],r[1]);
 done:;AV result=r[1];aunroot(&root);return afailed?av(AUNDEF):result;}
