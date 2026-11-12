/* Optional native desktop feature; linked only when std desktop is imported. */
extern void *arya_desktop_open(const char *,const char *,int,int);
extern int arya_desktop_step(void *);
extern void arya_desktop_close(void *);
extern void arya_desktop_release(void *);
static void adesktop_finalize(AH *handle){if(handle->external){arya_desktop_release(handle->external);handle->external=NULL;}}
static AV adesktop_close(AV env,int argc,AV *argv){(void)argc;(void)argv;if(env.p->external)arya_desktop_close(env.p->external);return av(AUNDEF);}
static AV adesktop_wait(AV env,int argc,AV *argv){(void)argc;(void)argv;while(!arya_desktop_step(env.p->external))aasync_suspend(av(AUNDEF),amonotonic()+0.008);return av(AUNDEF);}
static AV adesktop_operation(int argc,AV *argv){
  if(!argc||!apath_argument(argv[0]))return av(AUNDEF);
  AV r[6]={argv[0],argc>1?argv[1]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);
  if(r[1].t==AUNDEF)r[1]=arecord();const char *allowed[]={"title","width","height"};if(!aplain_options(r[1],allowed,3))goto done;
  r[2]=aprop(r[1],"title");if(r[2].t==AUNDEF)r[2]=astr("Arya");if(!apath_argument(r[2]))goto done;if(r[2].p->scope>1024){afail("RangeError","Desktop title exceeds 1024 UTF-16 units.");goto done;}
  AV width=aprop(r[1],"width"),height=aprop(r[1],"height");if(width.t==AUNDEF)width=an(1120);if(height.t==AUNDEF)height=an(800);
  if(!ais_safe_integer(width)||!ais_safe_integer(height)||width.n<420||height.n<360||width.n>8192||height.n>8192){afail("RangeError","Desktop size must be integers: width 420..8192, height 360..8192.");goto done;}
  r[3]=ap(aalloc(AHANDLE,0));r[3].p->name="arya.desktop";r[3].p->finalize=adesktop_finalize;
  char *url=autf8(r[0]),*title=autf8(r[2]);r[3].p->external=arya_desktop_open(url,title,(int)width.n,(int)height.n);free(url);free(title);
  if(!r[3].p->external){afail("DesktopError","Cannot open native window: use a local HTTP URL on the main thread (at most 16 windows).");goto done;}
  r[4]=arecord();r[5]=afunction(adesktop_close,r[3],"desktop.close");aput(r[4],"close",r[5]);r[5]=aasyncfunction(adesktop_wait,r[3],"desktop event pump");r[5]=acall(r[5],0,NULL);if(!afailed)aput(r[4],"closed",r[5]);
done:;AV result=r[4];aunroot(&root);return afailed?av(AUNDEF):result;
}
