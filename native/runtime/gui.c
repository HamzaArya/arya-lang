/* Direct native widget bridge. Runtime validates the entire mutation before
   calling the platform; callbacks enqueue plain data and never enter the GC. */
#include "gui-platform.h"
static int agui_string(AV value,size_t limit){if(value.t!=ASTR){afail("TypeError","GUI text and ids must be strings.");return 0;}if(value.p->scope>limit){afail("RangeError","GUI string exceeds its documented bound.");return 0;}for(size_t i=0;i<value.p->scope;i++)if(!value.p->chars[i]){afail("TypeError","GUI strings cannot contain NUL.");return 0;}return 1;}
static int agui_id(AV value){if(!agui_string(value,64))return 0;if(!value.p->scope){afail("TypeError","GUI control id cannot be empty.");return 0;}for(size_t i=0;i<value.p->scope;i++){uint16_t c=value.p->chars[i];if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='-')){afail("TypeError","GUI control ids use ASCII letters, digits, underscore or hyphen.");return 0;}}return 1;}
static int agui_integer(AV value,int low,int high){if(!ais_safe_integer(value)||value.n<low||value.n>high){afail("RangeError","GUI integer is outside its documented range.");return 0;}return 1;}
static void agui_finalize(AH *handle){if(handle->external){arya_gui_release(handle->external);handle->external=NULL;}}
static void *agui_pointer(AV env){return aprop(env,"handle").p->external;}
static AV agui_failure(void){return afail("GuiError",arya_gui_error());}
static AV agui_state(AGuiState *state,const AGuiEvent *event){AV r[3]={av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);r[0]=arecord();r[1]=astr(state->text?state->text:"");aput(r[0],"text",r[1]);aput(r[0],"checked",ab(state->checked));aput(r[0],"index",an(state->index));aput(r[0],"value",an(state->value));aput(r[0],"width",an(state->width));aput(r[0],"height",an(state->height));if(event){r[1]=astr(event->type);aput(r[0],"type",r[1]);r[2]=astr(event->id);aput(r[0],"id",r[2]);}AV result=r[0];aunroot(&root);return result;}
static AV agui_close(AV env,int argc,AV *argv){(void)argc;(void)argv;arya_gui_close(agui_pointer(env));return av(AUNDEF);}
static AV agui_next(AV env,int argc,AV *argv){(void)argc;(void)argv;if(atruth(aprop(env,"waiting")))return afail("GuiError","Only one nextEvent call may wait on a window at a time.");aput(env,"waiting",ab(1));AGuiEvent event;memset(&event,0,sizeof event);int result;while((result=arya_gui_poll(agui_pointer(env),&event))==0)aasync_suspend(av(AUNDEF),amonotonic()+0.008);aput(env,"waiting",ab(0));if(result==-2)return agui_failure();if(result==-1)return av(ANULL);AV value=agui_state(&event.state,&event);arya_gui_dispose_state(&event.state);return value;}
static AV agui_get(AV env,int argc,AV *argv){if(!agui_id(argc?argv[0]:av(AUNDEF)))return av(AUNDEF);char *id=autf8(argv[0]);AGuiState state;memset(&state,0,sizeof state);int ok=arya_gui_get(agui_pointer(env),id,&state);free(id);if(!ok)return agui_failure();AV value=agui_state(&state,NULL);arya_gui_dispose_state(&state);return value;}
static void agui_free_spec(AGuiSpec *spec){free((void *)spec->text);free((void *)spec->id);if(spec->items){for(int i=0;i<spec->count;i++)free((void *)spec->items[i]);free(spec->items);}}
static AV agui_mutate(AV env,int argc,AV *argv,int create){
  AV r[6]={env,argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);AGuiSpec spec;memset(&spec,0,sizeof spec);spec.index=-1;spec.enabled=1;
  r[3]=create?r[1]:r[2];const char *allowed[]={"id","type","text","x","y","width","height","enabled","checked","index","items","value"};
  if(!aplain_options(r[3],create?allowed:allowed+2,create?12:10))goto done;
  r[4]=create?aprop(r[3],"id"):r[1];if(!agui_id(r[4]))goto done;
  r[5]=aget(aprop(env,"controls"),r[4]);if(afailed)goto done;
  if(create){if(r[5].t!=AUNDEF){afail("GuiError","Control id already exists.");goto done;}AV type=aprop(r[3],"type");const char *kinds[]={"label","button","input","textarea","checkbox","select","list","progress"};int kind=-1;for(int i=0;i<8;i++)if(akey(type,kinds[i]))kind=i;if(kind<0){afail("TypeError","Unknown GUI widget type.");goto done;}spec.kind=kind;}
  else{if(r[5].t!=ARECORD){afail("GuiError","Unknown control id.");goto done;}spec.kind=(int)aprop(r[5],"kind").n;}
  AV text=aprop(r[3],"text"),enabled=aprop(r[3],"enabled"),checked=aprop(r[3],"checked"),index=aprop(r[3],"index"),items=aprop(r[3],"items"),value=aprop(r[3],"value");
  if(text.t!=AUNDEF){if(spec.kind==AG_SELECT||spec.kind==AG_LIST||spec.kind==AG_PROGRESS){afail("TypeError","text is not a property of select, list or progress controls.");goto done;}if(!agui_string(text,16384))goto done;spec.mask|=AG_TEXT;spec.text=autf8(text);}
  if(enabled.t!=AUNDEF){if(enabled.t!=ABOOL){afail("TypeError","enabled must be boolean.");goto done;}spec.mask|=AG_ENABLED;spec.enabled=atruth(enabled);}else if(create)spec.mask|=AG_ENABLED;
  if(checked.t!=AUNDEF){if(spec.kind!=AG_CHECKBOX||checked.t!=ABOOL){afail("TypeError","checked requires a checkbox and boolean.");goto done;}spec.mask|=AG_CHECKED;spec.checked=atruth(checked);}
  if(value.t!=AUNDEF){if(spec.kind!=AG_PROGRESS||value.t!=ANUM||!isfinite(value.n)||value.n<0||value.n>1){afail("RangeError","value requires a progress control and number 0..1.");goto done;}spec.mask|=AG_VALUE;spec.value=value.n;}
  int count=create?0:(int)aprop(r[5],"count").n;
  if(items.t!=AUNDEF){if((spec.kind!=AG_SELECT&&spec.kind!=AG_LIST)||items.t!=ALIST){afail("TypeError","items requires a select/list control and array of strings.");goto done;}if(items.p->len>1000){afail("RangeError","GUI controls support at most 1000 items.");goto done;}for(size_t i=0;i<items.p->len;i++)if(!agui_string(items.p->data[i],1024))goto done;spec.mask|=AG_ITEMS;spec.count=(int)items.p->len;count=spec.count;spec.items=(const char **)calloc(count?count:1,sizeof(char *));if(!spec.items){afail("GuiError","Cannot allocate GUI items.");goto done;}for(int i=0;i<count;i++)spec.items[i]=autf8(items.p->data[i]);}
  if(index.t!=AUNDEF){if(spec.kind!=AG_SELECT&&spec.kind!=AG_LIST){afail("TypeError","index requires a select or list control.");goto done;}if(!agui_integer(index,-1,count-1))goto done;spec.mask|=AG_INDEX;spec.index=(int)index.n;}
  AV x=aprop(r[3],"x"),y=aprop(r[3],"y"),width=aprop(r[3],"width"),height=aprop(r[3],"height");
  if(create||x.t!=AUNDEF||y.t!=AUNDEF||width.t!=AUNDEF||height.t!=AUNDEF){if(!agui_integer(x,0,16384)||!agui_integer(y,0,16384)||!agui_integer(width,1,16384)||!agui_integer(height,1,16384))goto done;spec.mask|=AG_RECT;spec.x=(int)x.n;spec.y=(int)y.n;spec.width=(int)width.n;spec.height=(int)height.n;}
  spec.id=autf8(r[4]);if(!(create?arya_gui_add(agui_pointer(env),&spec):arya_gui_set(agui_pointer(env),spec.id,&spec))){agui_failure();goto done;}
  if(create){r[5]=arecord();aput(r[5],"kind",an(spec.kind));aput(r[5],"count",an(count));aset(aprop(env,"controls"),r[4],r[5]);}else if(spec.mask&AG_ITEMS)aput(r[5],"count",an(count));
done:agui_free_spec(&spec);aunroot(&root);return av(AUNDEF);
}
static AV agui_add(AV env,int argc,AV *argv){return agui_mutate(env,argc,argv,1);}
static AV agui_set(AV env,int argc,AV *argv){return agui_mutate(env,argc,argv,0);}
static AV agui_operation(int id,int argc,AV *argv){
  if(id==1711)return astr(arya_gui_platform());
  AV r[6]={argc?argv[0]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);
  if(r[0].t==AUNDEF)r[0]=arecord();const char *allowed[]={"title","width","height"};if(!aplain_options(r[0],allowed,3))goto done;
  r[1]=aprop(r[0],"title");if(r[1].t==AUNDEF)r[1]=astr("Arya");if(!agui_string(r[1],1024))goto done;AV width=aprop(r[0],"width"),height=aprop(r[0],"height");if(width.t==AUNDEF)width=an(800);if(height.t==AUNDEF)height=an(600);if(!agui_integer(width,240,8192)||!agui_integer(height,160,8192))goto done;
  r[2]=ap(aalloc(AHANDLE,0));r[2].p->name="arya.gui";r[2].p->finalize=agui_finalize;char *title=autf8(r[1]);r[2].p->external=arya_gui_window(title,(int)width.n,(int)height.n);free(title);if(!r[2].p->external){agui_failure();goto done;}
  r[3]=arecord();aput(r[3],"handle",r[2]);r[4]=arecord();aput(r[3],"controls",r[4]);aput(r[3],"waiting",ab(0));r[4]=arecord();
  const char *names[]={"add","set","get","close","nextEvent"};ACode methods[]={agui_add,agui_set,agui_get,agui_close,agui_next};for(int i=0;i<5;i++){r[5]=i==4?aasyncfunction(methods[i],r[3],names[i]):afunction(methods[i],r[3],names[i]);aput(r[4],names[i],r[5]);}
done:;AV result=r[4];aunroot(&root);return afailed?av(AUNDEF):result;
}
