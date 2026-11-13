/* Input-first collection helpers, implemented by the native value runtime. */
static AV alist_noop(AV env,int argc,AV *argv){(void)env;(void)argc;(void)argv;return av(AUNDEF);}
static AV alist_sync(AV value){
  if(value.t==APROMISE){value.p->name="observed";return acoded_error("ARYA_LIST_ASYNC","This operation requires a synchronous callback; use list.map and Promise.all for async work.");}
  if(value.t==ARECORD||value.t==AFUNC){AV r[3]={value,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=aprop(value,"then");if(r[1].t==AFUNC){r[2]=afunction(alist_noop,av(AUNDEF),"observe thenable");AV args[2]={r[2],r[2]};acall(r[1],2,args);afailed=0;aunroot(&root);return acoded_error("ARYA_LIST_ASYNC","This operation requires a synchronous callback.");}aunroot(&root);}return value;
}
static AV alist_select(AV selector,AV value,size_t index) {
  if(selector.t==AFUNC){AV args[2]={value,an((double)index)};return acall(selector,2,args);}
  if(selector.t==ASTR&&selector.p->scope){if(value.t==ANULL||value.t==AUNDEF)return av(AUNDEF);return aget(value,selector);}
  return acoded_error("ARYA_LIST_CALLBACK","Use a function or nonempty field name as selector.");
}
static int alist_key_equal(AV a,AV b){return aeq(a,b)||(a.t==ANUM&&b.t==ANUM&&isnan(a.n)&&isnan(b.n));}
typedef struct {AV value,key;size_t index;int reverse;} ALRow;
static int alist_row_compare(const void *left,const void *right){const ALRow *a=left,*b=right;int order=a->key.t==ASTR?aorder(a->key,b->key):a->key.n<b->key.n?-1:a->key.n>b->key.n?1:0;if(order)return a->reverse?-order:order;return a->index<b->index?-1:a->index>b->index;}
static AV alist_standard(int id,int argc,AV *argv) {
  if(!argc||argv[0].t!=ALIST)return acoded_error("ARYA_LIST_INPUT","List helpers require a list.");
  if(id==310){if(argv[0].p->scope<0)return acoded_error("ARYA_LIST_INPUT","Cannot reserve a readonly list.");if(argc<2||!ais_safe_integer(argv[1])||argv[1].n<0||argv[1].n>1000000)return acoded_error("ARYA_LIST_COUNT","List capacity must be from 0 to 1000000.");aresize(argv[0].p,(size_t)argv[1].n);if(aallocated>apeakh)apeakh=aallocated;return argv[0];}
  AV r[7]={argv[0],argc>1?argv[1]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};
  ARoot root;aroot(&root,r,7);size_t n=r[0].p->len;
  int identity=(id==306||id==308||id==309)&&r[1].t==AUNDEF;
  if(id==307){double count=argc>1?atonumber(argv[1]):1;if((argc>1&&argv[1].t!=ANUM)||!isfinite(count)||count<0||floor(count)!=count||count>9007199254740991.0){acoded_error("ARYA_LIST_COUNT","list.take requires a nonnegative safe integer.");goto done;}r[2]=alist((int)fmin((double)n,count),r[0].p->data);goto done;}
  if(id==304){if(argc<3||r[1].t!=AFUNC){acoded_error("ARYA_LIST_CALLBACK","list.reduce requires a function and explicit initial value.");goto done;}r[2]=argv[2];}
  else if(!identity&&r[1].t!=AFUNC&&!(r[1].t==ASTR&&r[1].p->scope)){acoded_error("ARYA_LIST_CALLBACK","Use a function or nonempty field name as selector.");goto done;}
  if(id==305)r[2]=arecord();else if(id==303)r[2]=av(ANULL);else if(id==309)r[2]=an(0);else if(id!=304)r[2]=alist(id==300?(int)n:0,NULL);
  ALRow *rows=NULL;
  if(id==306){if(argc>2&&!akey(argv[2],"asc")&&!akey(argv[2],"desc")){acoded_error("ARYA_LIST_ORDER","Use asc or desc.");goto done;}rows=(ALRow*)amemory((n?n:1)*sizeof(ALRow));r[5]=alist((int)n,NULL);r[6]=alist((int)n,NULL);}
  size_t sorted=0;
  for(size_t i=0;i<((id==303||id==305||id==309)?r[0].p->len:n)&&!afailed;i++){
    if(i>=1000000){acoded_error("ARYA_LIST_INPUT","List iteration limit exceeded.");break;}
    int hole=i>=r[0].p->len||r[0].p->data[i].t==AUINIT;
    if(hole&&(id==300||id==301||id==302||id==304||id==306||id==308))continue;
    r[3]=!hole?r[0].p->data[i]:av(AUNDEF);
    if(id==304){AV args[3]={r[2],r[3],an((double)i)};r[4]=acall(r[1],3,args);r[2]=alist_sync(r[4]);continue;}
    r[4]=identity?r[3]:alist_select(r[1],r[3],i);if(afailed)break;if(id!=300)r[4]=alist_sync(r[4]);if(afailed)break;
    if(id==300)r[2].p->data[i]=r[4];
    else if(id==301){if(r[4].t!=ALIST){acoded_error("ARYA_LIST_CALLBACK","flatMap callbacks must return a list.");break;}for(size_t j=0;j<r[4].p->len&&!afailed;j++)if(r[4].p->data[j].t!=AUINIT)aappend_value(r[2],r[4].p->data[j]);}
    else if(id==302){if(atruth(r[4]))aappend_value(r[2],r[3]);}
    else if(id==303){if(atruth(r[4])){r[2]=r[3];break;}}
    else if(id==305){if(r[4].t!=ASTR){acoded_error("ARYA_LIST_KEY","groupBy keys must be strings.");break;}r[5]=aget(r[2],r[4]);if(r[5].t==AUNDEF){r[5]=alist(0,NULL);aset(r[2],r[4],r[5]);}aappend_value(r[5],r[3]);}
    else if(id==306){if((r[4].t!=ASTR&&(r[4].t!=ANUM||!isfinite(r[4].n)))||(sorted&&r[4].t!=rows[0].key.t)){acoded_error("ARYA_LIST_KEY","sortBy keys must all be strings or finite numbers.");break;}r[5].p->data[i]=r[4];r[6].p->data[i]=r[3];rows[sorted++]=(ALRow){r[3],r[4],i,argc>2&&akey(argv[2],"desc")};}
    else if(id==308){if(akey_find(r[2].p,r[4],1)==SIZE_MAX){size_t slot=r[2].p->len;aappend_value(r[2],r[4]);akey_added(r[2].p,slot,1);if(r[5].t==AUNDEF)r[5]=alist(0,NULL);aappend_value(r[5],r[3]);}}
    else if(id==309){if(r[4].t!=ANUM||!isfinite(r[4].n)||!isfinite(r[2].n+r[4].n)){acoded_error("ARYA_LIST_NUMBER","sum requires finite numbers and finite total.");break;}r[2].n+=r[4].n;}
  }
  if(id==306&&!afailed){qsort(rows,sorted,sizeof(ALRow),alist_row_compare);for(size_t i=0;i<sorted;i++)aappend_value(r[2],rows[i].value);while(r[2].p->len<n)aappend_value(r[2],av(AUINIT));}
  if(id==308&&!afailed){if(r[5].t==AUNDEF)r[5]=alist(0,NULL);r[2]=r[5];}
  free(rows);
done:;AV result=r[2];aunroot(&root);return afailed?av(AUNDEF):result;
}
