/* POSIX signal delivery. The OS handler only sets flags and wakes the poll loop;
 * Arya callbacks run on the normal runtime thread with rooted values. */
#include <signal.h>
static volatile sig_atomic_t asignal_pending[3],asignal_write_fd=-1;
static int asignal_numbers[3]={SIGINT,SIGTERM,SIGHUP},asignal_installed[3];
static const char *asignal_names[3]={"SIGINT","SIGTERM","SIGHUP"};
static struct sigaction asignal_previous[3];
static int asignal_read_fd=-1;
static void (*asignal_prior_cleanup)(void);
static void asignal_handler(int number){int saved=errno;for(int i=0;i<3;i++)if(number==asignal_numbers[i])asignal_pending[i]=1;int fd=asignal_write_fd;if(fd>=0){unsigned char byte=1;ssize_t ignored=write(fd,&byte,1);(void)ignored;}errno=saved;}
static void asignal_restore(int index){if(!asignal_installed[index])return;AV listeners=aextra_roots[3];if(listeners.t==ALIST)for(size_t i=0;i<listeners.p->len;i++)if((int)listeners.p->data[i].p->data[0].n==index)return;sigaction(asignal_numbers[index],&asignal_previous[index],NULL);asignal_installed[index]=0;}
static void asignal_remove(AV entry){AV listeners=aextra_roots[3];if(listeners.t!=ALIST)return;for(size_t i=0;i<listeners.p->len;i++)if(aeq(listeners.p->data[i],entry)){memmove(listeners.p->data+i,listeners.p->data+i+1,(listeners.p->len-i-1)*sizeof(AV));listeners.p->len--;break;}asignal_restore((int)entry.p->data[0].n);}
static AV asignal_dispose(AV env,int argc,AV *argv){(void)argc;(void)argv;asignal_remove(env);return av(AUNDEF);}
static int asignal_dispatch(void){
  unsigned char bytes[128];while(read(asignal_read_fd,bytes,sizeof(bytes))>0){}
  int handled=0;AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  for(int index=0;index<3&&!afailed;index++)if(asignal_pending[index]){
    asignal_pending[index]=0;handled=1;AV listeners=aextra_roots[3];r[0]=alist((int)listeners.p->len,listeners.p->data);r[1]=astr(asignal_names[index]);
    for(size_t i=0;i<r[0].p->len&&!afailed;i++){r[2]=r[0].p->data[i];if((int)r[2].p->data[0].n!=index)continue;if(r[2].p->data[2].n)asignal_remove(r[2]);acall(r[2].p->data[1],1,r+1);}
  }
  aunroot(&root);return handled;
}
static void asignal_cleanup(void){
  for(int i=0;i<3;i++){if(asignal_installed[i])sigaction(asignal_numbers[i],&asignal_previous[i],NULL);asignal_installed[i]=0;asignal_pending[i]=0;}
  int output=asignal_write_fd;asignal_write_fd=-1;if(output>=0)close(output);if(asignal_read_fd>=0)close(asignal_read_fd);asignal_read_fd=-1;asignal_event_fd=-1;asignal_event_hook=NULL;
  if(asignal_prior_cleanup)asignal_prior_cleanup();asignal_prior_cleanup=NULL;
}
static AV asignal_register(int argc,AV *argv){
  if(argc<2||argv[0].t!=ASTR||argv[1].t!=AFUNC)return afail("TypeError","process.onSignal requires a signal name and callback.");
  int index=-1;for(int i=0;i<3;i++)if(akey(argv[0],asignal_names[i]))index=i;if(index<0)return afail("TypeError","Native signal names are SIGINT, SIGTERM and SIGHUP.");
  AV r[4]={argv[0],argv[1],argc>2?argv[2]:av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);int once=0;
  if(r[2].t!=AUNDEF){const char *allowed[]={"once"};if(!aplain_options(r[2],allowed,1))goto done;AV value=aprop(r[2],"once");if(value.t!=AUNDEF&&value.t!=ABOOL){afail("TypeError","Signal once must be boolean.");goto done;}once=value.t==ABOOL&&value.n;}
  if(aextra_roots[3].t!=ALIST)aextra_roots[3]=alist(0,NULL);if(aextra_roots[3].p->len>=64){afail("RangeError","At most 64 native signal handlers may be registered.");goto done;}
  if(asignal_read_fd<0){int descriptors[2];if(pipe(descriptors)){aio_error(errno,"pipe",argv[0]);goto done;}int valid=1;for(int i=0;i<2;i++){int flags=fcntl(descriptors[i],F_GETFL,0);if(flags<0||fcntl(descriptors[i],F_SETFL,flags|O_NONBLOCK)<0||fcntl(descriptors[i],F_SETFD,FD_CLOEXEC)<0)valid=0;}if(!valid){int saved=errno;close(descriptors[0]);close(descriptors[1]);aio_error(saved,"fcntl",argv[0]);goto done;}asignal_read_fd=descriptors[0];asignal_write_fd=descriptors[1];asignal_event_fd=descriptors[0];asignal_event_hook=asignal_dispatch;asignal_prior_cleanup=aasync_cleanup_hook;aasync_cleanup_hook=asignal_cleanup;}
  if(!asignal_installed[index]){struct sigaction action={0};action.sa_handler=asignal_handler;sigemptyset(&action.sa_mask);if(sigaction(asignal_numbers[index],&action,&asignal_previous[index])){aio_error(errno,"sigaction",argv[0]);goto done;}asignal_installed[index]=1;}
  r[2]=alist(3,NULL);r[2].p->data[0]=an(index);r[2].p->data[1]=r[1];r[2].p->data[2]=ab(once);aappend_value(aextra_roots[3],r[2]);r[3]=afunction(asignal_dispose,r[2],"remove signal handler");
done:;AV result=r[3];aunroot(&root);return afailed?av(AUNDEF):result;
}
