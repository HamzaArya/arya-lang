/* Cooperative native promises. No JavaScript VM and no worker-thread value sharing.
 * Each suspended Arya call owns a bounded native stack and an explicit GC root chain.
 * Sanitizer switching follows LLVM's public sanitizer/common_interface_defs.h API.
 */
#include <ucontext.h>
#include <poll.h>
#if defined(__has_feature)
#if __has_feature(address_sanitizer)
#define ARYA_ASAN_FIBERS 1
#endif
#endif
#if defined(__SANITIZE_ADDRESS__)
#define ARYA_ASAN_FIBERS 1
#endif
#ifdef ARYA_ASAN_FIBERS
extern void __sanitizer_start_switch_fiber(void **,const void *,size_t);
extern void __sanitizer_finish_switch_fiber(void *,const void **,size_t *);
#endif
typedef struct ATask ATask;
/* Unoptimized and instrumented C frames are substantially larger. Preserve the
 * language call-depth limit on these builds rather than overflowing task stacks.
 * The small rooted value buffers emitted by the compiler stay on this stack
 * across suspension; escaping captures remain on the managed heap. */
#ifndef ARYA_TASK_STACK_BYTES
#if defined(ARYA_ASAN_FIBERS) || defined(ARYA_NATIVE_DEBUG)
#define ARYA_TASK_STACK_BYTES (8u*1024u*1024u)
#else
#define ARYA_TASK_STACK_BYTES (1024u*1024u)
#endif
#endif
struct ATask {
  ATask *next,*caller;ucontext_t context;void *stack,*fake_stack;const void *stack_bottom;size_t stack_size;
  ARoot *roots;AFrame *frames;int failed,depth,state,cancelled,timer,fd;short events;double deadline;uint64_t ready_serial,wait_serial;
  struct pollfd descriptors[4];int descriptor_count;
  AV values[5],local[4],error;char trace[16384];
};
typedef struct ARejection {struct ARejection *next;AV promise;} ARejection;
static ATask amain_task={.fd=-1},*acurrent_task=&amain_task,*atasks;
static ATask *alast_switcher;
static void (*aasync_cleanup_hook)(void);
static void (*aasync_finish_hook)(void);
static int (*asignal_event_hook)(void);
static int asignal_event_fd=-1;
static int aprogram_status;
static ARejection *arejections;
static size_t atask_count;
static uint64_t aschedule_serial;
static AV aawait(AV value);
static AV athenable_body(AV env,int argc,AV *argv);
/* Slot 1 retains an internal rejection trace across native task boundaries.
 * It is an ordinary managed value so collection/adoption need no external owner. */
static AV apromise_new(void) {AH *h=aalloc(APROMISE,2);h->data[0]=av(AUNDEF);h->data[1]=av(AUNDEF);return ap(h);}
static void apromise_restore_trace(AV promise) {
  if(promise.p->data[1].t==ASTR) {char *text=autf8(promise.p->data[1]);snprintf(atrace,sizeof(atrace),"%s",text);free(text);}
}
static double amonotonic(void) {struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (double)t.tv_sec+(double)t.tv_nsec/1e9;}
static void aasync_mark(void) {
  for(ATask *t=atasks;t;t=t->next){for(int i=0;i<5;i++)amark(t->values[i]);for(int i=0;i<4;i++)amark(t->local[i]);if(t->failed)amark(t->error);
    if(t!=acurrent_task)for(ARoot *r=t->roots;r;r=r->prev)for(size_t i=0;i<r->count;i++)amark(r->values[i]);}
  if(acurrent_task!=&amain_task)for(ARoot *r=amain_task.roots;r;r=r->prev)for(size_t i=0;i<r->count;i++)amark(r->values[i]);
  if(acurrent_task!=&amain_task&&amain_task.failed)amark(amain_task.error);
  for(int i=0;i<4;i++)amark(amain_task.local[i]);
  for(ARejection *r=arejections;r;r=r->next)amark(r->promise);
}
static void apromise_watch(AV promise) {
  if(promise.p->flags&1)return;promise.p->flags|=1;
  ARejection *r=(ARejection*)amemory(sizeof(*r));r->promise=promise;r->next=arejections;arejections=r;
}
static void apromise_reject(AV promise,AV error) {
  if(promise.p->scope!=0)return;promise.p->scope=2;promise.p->serial=++aschedule_serial;promise.p->data[0]=error;
  apromise_watch(promise);
}
static AV apromise_resolver(AV env,int argc,AV *argv);
/* Both callbacks own the same already-resolved cell. Adopting a pending value
 * must lock out a later reject even before that value has settled. */
static AV apromise_pair(AV promise) {
  AV r[4]={promise,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
  r[1]=alist(2,NULL);r[1].p->data[0]=promise;r[1].p->data[1]=ab(0);r[2]=alist(2,NULL);
  for(int i=0;i<2;i++){r[3]=alist(2,NULL);r[3].p->data[0]=r[1];r[3].p->data[1]=ab(i);r[2].p->data[i]=afunction(apromise_resolver,r[3],i?"reject":"resolve");}
  AV result=r[2];aunroot(&root);return result;
}
static void apromise_resolve(AV promise,AV value) {
  if(promise.p->scope!=0)return;
  if(value.t==APROMISE){if(value.p==promise.p){afail("TypeError","A promise cannot resolve to itself.");AV error=aerror;afailed=0;apromise_reject(promise,error);return;}
    promise.p->scope=3;promise.p->parent=value;
    value.p->name="observed";apromise_watch(promise);return;}
  if(value.t==ARECORD||value.t==AFUNC){AV r[5]={promise,value,av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);
    r[2]=aprop(value,"then");if(r[2].t==AFUNC&&!afailed){r[3]=alist(2,NULL);r[3].p->data[0]=promise;r[3].p->data[1]=r[2];r[4]=aasyncfunction(athenable_body,r[3],"thenable job");
      r[4]=acall(r[4],0,NULL);if(afailed){AV error=aerror;afailed=0;apromise_reject(promise,error);}else r[4].p->name="observed";aunroot(&root);return;}
    aunroot(&root);if(afailed){AV error=aerror;afailed=0;apromise_reject(promise,error);return;}}
  promise.p->scope=1;promise.p->serial=++aschedule_serial;promise.p->data[0]=value;
}
static int apromise_state(AV promise) {
  AH *h=promise.p;AH *seen[128];int count=0;
  while(h->scope==3){for(int i=0;i<count;i++)if(seen[i]==h){afail("TypeError","Cyclic promise resolution.");AV error=aerror;afailed=0;h->scope=0;apromise_reject(ap(h),error);return 2;}
    if(count==128){afail("RangeError","Promise adoption chain exceeds 128.");AV error=aerror;afailed=0;promise.p->scope=0;apromise_reject(promise,error);return 2;}seen[count++]=h;h=h->parent.p;}
  if(h->scope){for(int i=0;i<count;i++){seen[i]->scope=h->scope;seen[i]->serial=h->serial;seen[i]->data[0]=h->data[0];seen[i]->data[1]=h->data[1];seen[i]->parent=av(AUNDEF);} }
  return promise.p->scope==3?0:promise.p->scope;
}
/* Run only after the microtask queue is empty. Observed rejections are pruned
 * each turn so a persistent server does not retain every completed request. */
static void apromise_checkpoint(void) {
  ARejection **link=&arejections;
  while(*link){ARejection *r=*link;int state=apromise_state(r->promise);
    if(r->promise.p->name||state){int rejected=state==2&&!r->promise.p->name;AV promise=r->promise,error=promise.p->data[0];*link=r->next;promise.p->flags&=~1u;free(r);if(rejected){athrow(error);apromise_restore_trace(promise);return;}}
    else link=&r->next;
  }
}
static int atask_ready(ATask *t,double now) {
  if(t->state==2)return 0;if(t->state==0)return 1;
  if(t->deadline>=0&&now>=t->deadline)return 1;
  if(t->fd>=0){struct pollfd fd={t->fd,t->events,0};if(poll(&fd,1,0)>0&&fd.revents)return 1;}
  if(t->descriptor_count&&poll(t->descriptors,(nfds_t)t->descriptor_count,0)>0)return 1;
  AV wait=t->values[3];if(wait.t==APROMISE)return apromise_state(wait)!=0;
  if(wait.t==ALIST)for(size_t i=0;i<wait.p->len;i++)if(apromise_state(wait.p->data[i]))return 1;
  return 0;
}
static void atask_save(ATask *t){t->roots=aroots;t->frames=aframes;t->depth=adepth;t->failed=afailed;t->error=afailed?aerror:av(AUNDEF);if(afailed)memcpy(t->trace,atrace,sizeof(atrace));else t->trace[0]=0;}
static void atask_load(ATask *t){aroots=t->roots;aframes=t->frames;adepth=t->depth;afailed=t->failed;aerror=t->failed?t->error:av(AUNDEF);if(t->failed)memcpy(atrace,t->trace,sizeof(atrace));else atrace[0]=0;}
static void atask_switch(ATask *to) {
  ATask *from=acurrent_task;atask_save(from);alast_switcher=from;acurrent_task=to;atask_load(to);
#ifdef ARYA_ASAN_FIBERS
  __sanitizer_start_switch_fiber(from->state==2?NULL:&from->fake_stack,to->stack_bottom,to->stack_size);
#endif
  if(swapcontext(&from->context,&to->context)){fputs("Arya: native context switch failed\n",stderr);exit(70);}
#ifdef ARYA_ASAN_FIBERS
  const void *bottom;size_t size;__sanitizer_finish_switch_fiber(from->fake_stack,&bottom,&size);
  alast_switcher->stack_bottom=bottom;alast_switcher->stack_size=size;
#endif
}
static void atask_yield(void){ATask *t=acurrent_task;if(t->state==0)t->ready_serial=++aschedule_serial;ATask *caller=t->caller;t->caller=&amain_task;atask_switch(caller);}
static void atask_entry(void) {
  ATask *t=acurrent_task;
#ifdef ARYA_ASAN_FIBERS
  const void *bottom;size_t size;__sanitizer_finish_switch_fiber(NULL,&bottom,&size);alast_switcher->stack_bottom=bottom;alast_switcher->stack_size=size;
#endif
  AV fn=t->values[0],args=t->values[1];t->values[4]=fn.p->code(fn.p->parent,(int)args.p->len,args.p->data);
  if(!afailed&&t->values[4].t==APROMISE)t->values[4]=aawait(t->values[4]);
  if(afailed){AV error=aerror;t->values[2].p->data[1]=astr(atrace);afailed=0;apromise_reject(t->values[2],error);}else apromise_resolve(t->values[2],t->values[4]);
  t->state=2;atask_yield();abort();
}
static void atask_reap(void) {
  ATask **link=&atasks;while(*link){ATask *t=*link;if(t->state==2&&t!=acurrent_task){*link=t->next;free(t->stack);free(t);atask_count--;}else link=&t->next;}
}
static AV aasync_start(AV fn,int argc,AV *argv) {
  if(atask_count>=512)return afail("RangeError","At most 512 native async tasks may be active.");
  AV r[3]={fn,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=alist(argc,argv);r[2]=apromise_new();
  ATask *t=(ATask*)amemory(sizeof(*t));t->values[0]=fn;t->values[1]=r[1];t->values[2]=r[2];t->deadline=-1;t->fd=-1;t->caller=acurrent_task;
  memcpy(t->local,acurrent_task->local,sizeof(t->local));
  t->stack_size=(fn.p->flags&2)?8*1024*1024:ARYA_TASK_STACK_BYTES;t->stack=amemory(t->stack_size);t->stack_bottom=t->stack;
  if(getcontext(&t->context)){free(t->stack);free(t);aunroot(&root);return afail("Error","Cannot create native async task.");}
  t->context.uc_stack.ss_sp=t->stack;t->context.uc_stack.ss_size=t->stack_size;t->context.uc_link=NULL;makecontext(&t->context,atask_entry,0);
  /* FIFO insertion makes runnable task order independent of allocation addresses. */
  ATask **last=&atasks;while(*last)last=&(*last)->next;*last=t;atask_count++;atask_switch(t);
  AV result=r[2];atask_reap();aunroot(&root);return result;
}
static int aevent_step(int wait) {
  double now=amonotonic(),deadline=INFINITY;
  ATask *micro=NULL;uint64_t serial=UINT64_MAX,registered=UINT64_MAX;
  for(ATask *t=atasks;t;t=t->next){uint64_t ready=0;if(t->state==0)ready=t->ready_serial;else if(t->state==1){AV value=t->values[3];if(value.t==APROMISE&&apromise_state(value))ready=value.p->serial;else if(value.t==ALIST)for(size_t i=0;i<value.p->len;i++)if(apromise_state(value.p->data[i])&&(!ready||value.p->data[i].p->serial<ready))ready=value.p->data[i].p->serial;if(ready&&ready<t->wait_serial)ready=t->wait_serial;}
    if(ready&&(ready<serial||(ready==serial&&t->wait_serial<registered))){micro=t;serial=ready;registered=t->wait_serial;}}
  if(micro){micro->state=0;micro->deadline=-1;micro->caller=&amain_task;atask_switch(micro);atask_reap();return 1;}
  apromise_checkpoint();if(afailed)return 0;
  if(asignal_event_hook&&asignal_event_hook()){atask_reap();return !afailed;}
  for(ATask *t=atasks;t;t=t->next){if(atask_ready(t,now)){t->state=0;t->deadline=-1;t->caller=&amain_task;atask_switch(t);atask_reap();return 1;}if(t->state!=2&&t->deadline>=0&&t->deadline<deadline)deadline=t->deadline;}
  atask_reap();if(wait){struct pollfd descriptors[2560];nfds_t count=0;for(ATask *t=atasks;t&&count<2556;t=t->next)if(t->state==1){if(t->fd>=0)descriptors[count++]=(struct pollfd){t->fd,t->events,0};for(int i=0;i<t->descriptor_count;i++)descriptors[count++]=t->descriptors[i];}
    int timeout=isfinite(deadline)?(int)fmin(2147483647,ceil(fmax(0,deadline-amonotonic())*1000)):-1;
    if(count||timeout>=0){if(asignal_event_fd>=0&&count<2560)descriptors[count++]=(struct pollfd){asignal_event_fd,POLLIN,0};int status;do{status=poll(descriptors,count,timeout);}while(status<0&&errno==EINTR);if(status<0){afail("IOError","Native event polling failed.");return 0;}return 1;}}
  return 0;
}
static void aasync_suspend(AV wait,double deadline) {
  ATask *t=acurrent_task;t->values[3]=wait;t->wait_serial=++aschedule_serial;t->deadline=deadline;t->fd=-1;t->state=1;atask_yield();t->values[3]=av(AUNDEF);t->deadline=-1;
}
static int aasync_wait_fd(int fd,short events,double deadline){if(acurrent_task==&amain_task){struct pollfd item={fd,events,0};int timeout=deadline<0?-1:(int)fmax(0,ceil((deadline-amonotonic())*1000));int status;do{status=poll(&item,1,timeout);}while(status<0&&errno==EINTR);return status>0;}
  ATask *t=acurrent_task;t->values[3]=av(AUNDEF);t->fd=fd;t->events=events;t->deadline=deadline;t->state=1;atask_yield();t->fd=-1;t->deadline=-1;struct pollfd item={fd,events,0};return poll(&item,1,0)>0&&item.revents;
}
static int aasync_wait_fds(struct pollfd *descriptors,int count,double deadline,int cooperative){if(count<0||count>4)return 0;if(acurrent_task==&amain_task||!cooperative){int timeout=deadline<0?-1:(int)fmin(2147483647,fmax(0,ceil((deadline-amonotonic())*1000)));int status;do{status=poll(descriptors,(nfds_t)count,timeout);}while(status<0&&errno==EINTR);return status>=0;}
 ATask *t=acurrent_task;t->values[3]=av(AUNDEF);t->fd=-1;t->descriptor_count=count;for(int i=0;i<count;i++)t->descriptors[i]=descriptors[i];t->deadline=deadline;t->state=1;atask_yield();t->descriptor_count=0;t->deadline=-1;return poll(descriptors,(nfds_t)count,0)>=0;}
static AV aawait(AV value) {
  AV r=value;ARoot root;aroot(&root,&r,1);
  if(r.t!=APROMISE){r=apromise_new();apromise_resolve(r,value);}
  r.p->name="observed";
  if(acurrent_task!=&amain_task)aasync_suspend(r,-1);
  while(!apromise_state(r)&&!afailed)if(!aevent_step(1)){afail("AsyncError","Promise has no runnable task or event source.");break;}
  AV result=afailed?av(AUNDEF):r.p->data[0];if(!afailed&&r.p->scope==2){athrow(result);apromise_restore_trace(r);}
  aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV apromise_resolver(AV env,int argc,AV *argv) {
  AV cell=env.p->data[0];if(cell.p->data[1].n)return av(AUNDEF);cell.p->data[1]=ab(1);
  AV promise=cell.p->data[0],value=argc?argv[0]:av(AUNDEF);
  if(env.p->data[1].n)apromise_reject(promise,value);else apromise_resolve(promise,value);return av(AUNDEF);
}
static AV athenable_body(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;acurrent_task->state=0;atask_yield();
  AV r[3]={env,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[1]=apromise_pair(env.p->data[0]);
  acall(env.p->data[1],2,r[1].p->data);if(afailed){r[2]=aerror;afailed=0;acall(r[1].p->data[1],1,r+2);}
  aunroot(&root);return av(AUNDEF);
}
static AV apromise_then_body(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;AV r[3]={env,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  r[1]=aawait(env.p->data[0]);int rejected=afailed;if(rejected){r[1]=aerror;afailed=0;}
  int finalizer=env.p->data[3].n!=0;AV handler=env.p->data[rejected?2:1];
  if(finalizer)handler=env.p->data[1];
  if(handler.t==AFUNC){r[2]=acall(handler,finalizer?0:1,&r[1]);if(finalizer&&!afailed)r[2]=aawait(r[2]);if(!finalizer){r[1]=r[2];rejected=0;}}
  if(!afailed&&rejected)athrow(r[1]);AV result=r[1];aunroot(&root);return result;
}
static AV apromise_method(AV env,int argc,AV *argv) {
  AV r[3]={env,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);int mode=(int)env.p->data[1].n;
  r[1]=alist(4,NULL);r[1].p->data[0]=env.p->data[0];env.p->data[0].p->name="observed";
  r[1].p->data[1]=argc?argv[0]:av(AUNDEF);r[1].p->data[2]=argc>1?argv[1]:av(AUNDEF);r[1].p->data[3]=ab(mode==2);
  if(mode==1){r[1].p->data[2]=r[1].p->data[1];r[1].p->data[1]=av(AUNDEF);}
  r[2]=aasyncfunction(apromise_then_body,r[1],"promise continuation");AV result=acall(r[2],0,NULL);aunroot(&root);return result;
}
static AV apromise_get(AV object,AV key) {
  int mode=akey(key,"then")?0:akey(key,"catch")?1:akey(key,"finally")?2:-1;if(mode<0)return av(AUNDEF);
  AV r[3]={object,key,av(AUNDEF)};ARoot root;aroot(&root,r,3);r[2]=alist(2,NULL);r[2].p->data[0]=object;r[2].p->data[1]=an(mode);AV fn=afunction(apromise_method,r[2],"promise method");aunroot(&root);return fn;
}
static AV apromise_combine_body(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;int mode=(int)env.p->data[1].n;AV input=env.p->data[0];
  AV r[5]={env,av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);
  size_t n=input.p->len;r[1]=alist((int)n,NULL);r[2]=alist((int)n,NULL);r[3]=alist((int)n,NULL);
  for(size_t i=0;i<n;i++){AV value=input.p->data[i];if(value.t==APROMISE)r[1].p->data[i]=value;else{r[4]=apromise_new();apromise_resolve(r[4],value);r[1].p->data[i]=r[4];}r[1].p->data[i].p->name="observed";r[3].p->data[i]=an((double)++aschedule_serial);}
  if(acurrent_task!=&amain_task){acurrent_task->state=0;atask_yield();}
  size_t finished=0;
  while(finished<n&&!afailed){int progress=0;
    for(size_t step=0;step<n;step++){size_t i=n;uint64_t earliest=UINT64_MAX;
      for(size_t candidate=0;candidate<n;candidate++){if(r[3].p->data[candidate].t==ABOOL)continue;AV p=r[1].p->data[candidate];if(!apromise_state(p))continue;uint64_t ready=p.p->serial,registered=(uint64_t)r[3].p->data[candidate].n;if(ready<registered)ready=registered;if(ready<earliest){earliest=ready;i=candidate;}}
      if(i==n)break;AV p=r[1].p->data[i];int state=apromise_state(p);
      progress=1;r[3].p->data[i]=ab(1);finished++;r[4]=p.p->data[0];
      if(mode==4||(mode==3&&state==2)){if(state==2)athrow(r[4]);AV result=r[4];aunroot(&root);return result;}
      if(mode==6&&state==1){AV result=r[4];aunroot(&root);return result;}
      if(mode==5){AV value=r[4];r[4]=arecord();aput(r[4],"status",astr(state==1?"fulfilled":"rejected"));aput(r[4],state==1?"value":"reason",value);}
      r[2].p->data[i]=r[4];
    }
    if(!progress&&finished<n){r[4]=alist(0,NULL);for(size_t i=0;i<n;i++)if(r[3].p->data[i].t!=ABOOL){aresize(r[4].p,r[4].p->len+1);r[4].p->data[r[4].p->len++]=r[1].p->data[i];}aasync_suspend(r[4],-1);}
  }
  if(mode==6){afail("AggregateError","All promises were rejected.");AV error=aerror;afailed=0;r[4]=error;aput(error,"errors",r[2]);athrow(error);}
  if(mode==4&&n==0){r[4]=apromise_new();aawait(r[4]);}
  AV result=r[2];aunroot(&root);return result;
}
static AV apromise_static(AV env,int argc,AV *argv) {
  int id=(int)env.n;AV r[5]={argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);
  if(id==1&&r[0].t==APROMISE){aunroot(&root);return r[0];}
  r[1]=apromise_new();
  if(id==1)apromise_resolve(r[1],r[0]);
  else if(id==2)apromise_reject(r[1],r[0]);
  else if(id==0){if(r[0].t!=AFUNC){afail("TypeError","Promise executor must be a function.");goto done;}
    r[2]=apromise_pair(r[1]);acall(r[0],2,r[2].p->data);if(afailed){r[3]=aerror;afailed=0;acall(r[2].p->data[1],1,r+3);}}
  else{if(r[0].t!=ALIST){afail("TypeError","Promise combinators require a list.");goto done;}if(!r[0].p->len&&(id==3||id==5)){r[2]=alist(0,NULL);apromise_resolve(r[1],r[2]);goto done;}r[2]=alist(2,NULL);r[2].p->data[0]=r[0];r[2].p->data[1]=an(id);r[3]=aasyncfunction(apromise_combine_body,r[2],"promise combinator");r[1]=acall(r[3],0,NULL);}
done:;AV result=r[1];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV apromise_global(void) {
  AV r=arecord();ARoot root;aroot(&root,&r,1);const char *names[]={"new","resolve","reject","all","race","allSettled","any"};
  for(int i=0;i<7;i++){AV fn=afunction(apromise_static,an(i),names[i]);aput(r,names[i],fn);}r.p->scope=-2;aunroot(&root);return r;
}
static AV atimer_body(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;double delay=env.p->data[1].n/1000.0;int repeat=env.p->data[3].n!=0;
  do{aasync_suspend(av(AUNDEF),amonotonic()+delay);if(acurrent_task->cancelled)return av(AUNDEF);
    AV args=env.p->data[2];acall(env.p->data[0],(int)args.p->len,args.p->data);if(afailed)return av(AUNDEF);
  }while(repeat);return av(AUNDEF);
}
static AV amicrotask_body(AV env,int argc,AV *argv) {
  (void)argc;(void)argv;acurrent_task->state=0;atask_yield();return acall(env,0,NULL);
}
static AV atimer_call(AV env,int argc,AV *argv) {
  int mode=(int)env.n;if(mode==1){if(argc&&argv[0].t==APROMISE)for(ATask *t=atasks;t;t=t->next)if(t->timer&&t->values[2].p==argv[0].p){t->cancelled=1;t->state=0;}return av(AUNDEF);}
  if(!argc||argv[0].t!=AFUNC)return afail("TypeError","Timer callback must be a function.");
  if(mode==3){AV r=argv[0];ARoot root;aroot(&root,&r,1);r=aasyncfunction(amicrotask_body,r,"microtask");acall(r,0,NULL);aunroot(&root);return av(AUNDEF);}
  double delay=argc>1?atonumber(argv[1]):0;if(!isfinite(delay)||delay<0||delay>2147483647)delay=1;
  AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[0]=alist(4,NULL);r[0].p->data[0]=argv[0];r[0].p->data[1]=an(floor(delay));r[0].p->data[3]=ab(mode==2);r[1]=alist(argc>2?argc-2:0,argc>2?argv+2:NULL);r[0].p->data[2]=r[1];r[2]=aasyncfunction(atimer_body,r[0],"timer");AV result=acall(r[2],0,NULL);for(ATask *t=atasks;t;t=t->next)if(t->values[2].p==result.p)t->timer=1;aunroot(&root);return result;
}
static int aasync_drain(void) {
  if(aasync_finish_hook)aasync_finish_hook();
  if(afailed)return 0;while(aevent_step(1)&&!afailed){}
  if(!afailed)apromise_checkpoint();
  while(arejections){ARejection *r=arejections;arejections=r->next;free(r);}return !afailed;
}
static void aasync_shutdown(void) {
  if(aasync_cleanup_hook)aasync_cleanup_hook();
  while(atasks){ATask *t=atasks;atasks=t->next;free(t->stack);free(t);}atask_count=0;
  while(arejections){ARejection *r=arejections;arejections=r->next;free(r);}
  for(int i=0;i<4;i++)amain_task.local[i]=av(AUNDEF);
  for(int i=0;i<16;i++)aextra_roots[i]=av(AUNDEF);
  aasync_finish_hook=NULL;aasync_cleanup_hook=NULL;
}
