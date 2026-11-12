/* Ordered async iteration with bounded read-ahead and cooperative cancellation. */
static int asignal_check(AV signal){if(signal.t==AUNDEF||signal.t==ANULL)return 1;AV fn=aprop(signal,"throwIfAborted");if(fn.t!=AFUNC){afail("TypeError","signal must provide throwIfAborted().");return 0;}acall(fn,0,NULL);return !afailed;}
static AV amap_apply(AV env,int argc,AV *argv){(void)argc;(void)argv;acurrent_task->state=0;atask_yield();if(!asignal_check(env.p->data[3]))return av(AUNDEF);AV args[3]={env.p->data[1],env.p->data[2],env.p->data[3]};return acall(env.p->data[0],3,args);}
static AV aiter_result(AV value,int done){AV r[2]={value,av(AUNDEF)};ARoot root;aroot(&root,r,2);r[1]=arecord();aput(r[1],"value",value);aput(r[1],"done",ab(done));AV result=r[1];aunroot(&root);return result;}
static void amap_fill(AV state){AV r[5]={state,av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);AV pending=state.p->data[4];
 while(!state.p->data[6].n&&pending.p->len<(size_t)state.p->data[7].n&&!afailed){if(!asignal_check(state.p->data[2]))break;r[1]=aiternext(state.p->data[0],state.p->data+3);if(afailed)break;if(r[1].t==AUINIT){state.p->data[6]=ab(1);break;}r[2]=alist(4,NULL);r[2].p->data[0]=state.p->data[1];r[2].p->data[1]=r[1];r[2].p->data[2]=state.p->data[5];r[2].p->data[3]=state.p->data[2];state.p->data[5].n++;r[3]=aasyncfunction(amap_apply,r[2],"async.map callback");r[4]=acall(r[3],0,NULL);if(!afailed){r[4].p->name="observed";aappend_value(pending,r[4]);}}
 aunroot(&root);
}
static void amap_close(AV state){AV pending=state.p->data[4];ARoot root;aroot(&root,&state,1);state.p->data[6]=ab(1);for(size_t i=0;i<pending.p->len;i++){aawait(pending.p->data[i]);afailed=0;}pending.p->len=0;
 if(state.p->data[0].t==AAITER){AV fn=aprop(state.p->data[0],"return");ARoot f;aroot(&f,&fn,1);AV p=acall(fn,0,NULL);if(!afailed)aawait(p);afailed=0;aunroot(&f);}aunroot(&root);
}
static AV amap_next_body(AV env,int argc,AV *argv){(void)argc;(void)argv;AV state=env.p->data[0];int close=env.p->data[2].n!=0;AV r[4]={env,state,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
 if(env.p->data[1].t==APROMISE){aawait(env.p->data[1]);afailed=0;}else{acurrent_task->state=0;atask_yield();}
 if(close){amap_close(state);r[3]=aiter_result(av(AUNDEF),1);goto done;}
 if(!asignal_check(state.p->data[2]))goto failure;amap_fill(state);if(afailed)goto failure;
 {AV pending=state.p->data[4];if(!pending.p->len){r[3]=aiter_result(av(AUNDEF),1);goto done;}r[2]=aawait(pending.p->data[0]);if(afailed)goto failure;if(!asignal_check(state.p->data[2]))goto failure;
  memmove(pending.p->data,pending.p->data+1,(pending.p->len-1)*sizeof(AV));pending.p->len--;r[3]=aiter_result(r[2],0);goto done;}
 failure:r[2]=aerror;afailed=0;amap_close(state);athrow(r[2]);
 done:;AV result=r[3];aunroot(&root);return result;
}
static AV aiter_method(AV env,int argc,AV *argv){(void)argc;(void)argv;AV iterator=env.p->data[0],state=iterator.p->parent;AV r[3]={env,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=alist(3,NULL);r[1].p->data[0]=state;r[1].p->data[1]=state.p->data[8];r[1].p->data[2]=env.p->data[1];r[2]=aasyncfunction(amap_next_body,r[1],"async iterator step");r[2]=acall(r[2],0,NULL);if(!afailed)state.p->data[8]=r[2];AV result=r[2];aunroot(&root);return result;}
static AV aiter_get(AV object,AV key){int close=akey(key,"return");if(!close&&!akey(key,"next"))return av(AUNDEF);AV r[3]={object,key,av(AUNDEF)};ARoot root;aroot(&root,r,3);r[2]=alist(2,NULL);r[2].p->data[0]=object;r[2].p->data[1]=ab(close);AV result=afunction(aiter_method,r[2],"async iterator method");aunroot(&root);return result;}
static AV amap_construct(int argc,AV *argv){if(argc<2||argv[1].t!=AFUNC)return acoded_error("ARYA_ASYNC_OPTIONS","async.map requires a callback and concurrency from 1 to 64.");
 AV r[5]={argv[0],argv[1],argc>2?argv[2]:av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);
 if(r[0].t!=ALIST&&r[0].t!=ASTR&&r[0].t!=AAITER){afail("TypeError","async.map requires an iterable.");goto done;}if(r[2].t==AUNDEF)r[2]=arecord();if(r[2].t!=ARECORD){acoded_error("ARYA_ASYNC_OPTIONS","async.map options must be a record.");goto done;}AV limit=aprop(r[2],"concurrency");if(limit.t==AUNDEF)limit=an(4);if(!ais_safe_integer(limit)||limit.n<1||limit.n>64){acoded_error("ARYA_ASYNC_OPTIONS","Concurrency must be an integer from 1 to 64.");goto done;}
 r[3]=alist(9,NULL);r[3].p->data[0]=r[0];r[3].p->data[1]=r[1];r[3].p->data[2]=aprop(r[2],"signal");r[3].p->data[3]=an(0);r[3].p->data[5]=an(0);r[3].p->data[6]=ab(0);r[3].p->data[7]=limit;r[4]=alist(0,NULL);r[3].p->data[4]=r[4];r[4]=ap(aalloc(AAITER,0));r[4].p->parent=r[3];
 done:;AV result=r[4];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aasync_each_body(AV env,int argc,AV *argv){(void)env;AV r[2]={amap_construct(argc,argv),av(AUNDEF)};ARoot root;aroot(&root,r,2);AV position=an(0);while(!afailed){r[1]=aiternext(r[0],&position);if(r[1].t==AUINIT)break;}aunroot(&root);return av(AUNDEF);}
static AV aasync_sleep_body(AV env,int argc,AV *argv){(void)env;double ms=argc?atonumber(argv[0]):0;if(!isfinite(ms)||ms<0||ms>2147483647)return afail("RangeError","Sleep requires 0 through 2147483647 milliseconds.");aasync_suspend(av(AUNDEF),amonotonic()+ms/1000);return av(AUNDEF);}
static AV aasync_library(int id,int argc,AV *argv){if(id==400)return amap_construct(argc,argv);AV fn=aasyncfunction(id==401?aasync_each_body:aasync_sleep_body,av(AUNDEF),id==401?"async.each":"async.sleep");return acall(fn,argc,argv);}
