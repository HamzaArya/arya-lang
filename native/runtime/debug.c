/* Bounded native inspection. Native records have data fields only: inspection
 * never invokes application callbacks, getters, or custom inspectors. */
typedef struct {AJWriter writer;AH *seen[128];int count,depth,limit,colors;} AInspector;
static int aidentifier(AV text){if(text.t!=ASTR||!text.p->scope)return 0;for(int i=0;i<text.p->scope;i++){unsigned c=text.p->chars[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||c=='_'||c=='$'||(i&&c>='0'&&c<='9')))return 0;}return 1;}
static void aiwrite(AInspector *p,const char *text){ajappend(&p->writer,text,strlen(text));}
static void aicolor(AInspector *p,const char *color){if(p->colors)aiwrite(p,color);}
static void ainspect_value(AInspector *p,AV value,int depth) {
  if(afailed)return;
  if(value.t==AGETTER){aiwrite(p,"[Getter]");return;}
  if(value.t==ASTR){aicolor(p,"\033[32m");aiwrite(p,"'");size_t n=(size_t)value.p->scope;if(n>10000)n=10000;for(size_t i=0;i<n;i++){unsigned c=value.p->chars[i];char bytes[16];if(c=='\''||c=='\\'){bytes[0]='\\';bytes[1]=(char)c;ajappend(&p->writer,bytes,2);}else if(c=='\n')aiwrite(p,"\\n");else if(c=='\r')aiwrite(p,"\\r");else if(c=='\t')aiwrite(p,"\\t");else if(c<32){snprintf(bytes,sizeof(bytes),"\\x%02x",c);aiwrite(p,bytes);}else{if(c>=0xd800&&c<=0xdbff&&i+1<n&&value.p->chars[i+1]>=0xdc00&&value.p->chars[i+1]<=0xdfff)c=0x10000+((c-0xd800)<<10)+(value.p->chars[++i]-0xdc00);int at=0;if(c<128)bytes[at++]=(char)c;else if(c<2048){bytes[at++]=(char)(0xc0|(c>>6));bytes[at++]=(char)(0x80|(c&63));}else if(c<65536){bytes[at++]=(char)(0xe0|(c>>12));bytes[at++]=(char)(0x80|((c>>6)&63));bytes[at++]=(char)(0x80|(c&63));}else{bytes[at++]=(char)(0xf0|(c>>18));bytes[at++]=(char)(0x80|((c>>12)&63));bytes[at++]=(char)(0x80|((c>>6)&63));bytes[at++]=(char)(0x80|(c&63));}ajappend(&p->writer,bytes,(size_t)at);}}aiwrite(p,"'");if((size_t)value.p->scope>n)aiwrite(p,"... [Truncated]");aicolor(p,"\033[39m");return;}
  if(value.t==AFUNC){aicolor(p,"\033[36m");aiwrite(p,"[Function");if(value.p->name&&strcmp(value.p->name,"anonymous")){aiwrite(p,": ");aiwrite(p,value.p->name);}aiwrite(p,"]");aicolor(p,"\033[39m");return;}
  if(value.t==APROMISE){aiwrite(p,"Promise { ");int state=apromise_state(value);if(!state)aiwrite(p,"<pending>");else{if(state==2)aiwrite(p,"<rejected> ");ainspect_value(p,value.p->data[0],depth+1);}aiwrite(p," }");return;}
  if(value.t==ADATE){if(!isfinite(value.p->data[0].n)){aiwrite(p,"Invalid Date");return;}AV text=aiso_ms((long long)value.p->data[0].n);char *s=autf8(text);aiwrite(p,s);free(s);return;}
  if(value.t!=ALIST&&value.t!=ARECORD){AV text=atostring(value);char *s=autf8(text);aicolor(p,value.t==ANUM||value.t==ABOOL?"\033[33m":"\033[90m");if(value.t==ANUM&&value.n==0&&signbit(value.n))aiwrite(p,"-0");else aiwrite(p,s);aicolor(p,"\033[39m");free(s);return;}
  for(int i=0;i<p->count;i++)if(p->seen[i]==value.p){aiwrite(p,"[Circular]");return;}
  if(depth>p->depth){aiwrite(p,value.t==ALIST?"[Array]":"[Object]");return;}if(p->count==128){aiwrite(p,"[Truncated]");return;}p->seen[p->count++]=value.p;
  int list=value.t==ALIST;size_t n=list?value.p->len:value.p->len/2,shown=list&&n>(size_t)p->limit?(size_t)p->limit:n;
  aiwrite(p,list?"[":"{");if(shown)aiwrite(p," ");
  for(size_t i=0;i<shown&&!afailed;i++){if(i)aiwrite(p,", ");if(!list){AV key=value.p->data[i*2];if(aidentifier(key)){char *s=autf8(key);aiwrite(p,s);free(s);}else ainspect_value(p,key,depth+1);aiwrite(p,": ");}AV child=list?value.p->data[i]:value.p->data[i*2+1];ainspect_value(p,child.t==AGETTER?child:child.t==AUINIT?av(AUNDEF):aread(child),depth+1);}
  if(shown<n){char text[64];snprintf(text,sizeof(text),"%s... %zu more items",shown?", ":"",n-shown);aiwrite(p,text);}if(n)aiwrite(p," ");aiwrite(p,list?"]":"}");p->count--;
}
static AV ainspect(AV value,int depth,int limit,int colors){AV r=value;ARoot root;aroot(&root,&r,1);AInspector inspector={0};inspector.depth=depth;inspector.limit=limit;inspector.colors=colors;ainspect_value(&inspector,value,0);AV result=afailed?av(AUNDEF):astrn(inspector.writer.data?inspector.writer.data:"",inspector.writer.length);free(inspector.writer.data);aunroot(&root);return result;}
static AV adebug(int id,int argc,AV *argv) {
  AV x=argc?argv[0]:av(AUNDEF);
  if(id==800){if(atruth(x))return x;AV message=argc>1&&argv[1].t!=AUNDEF?argv[1]:astr("Assertion failed.");if(message.t!=ASTR)return afail("TypeError","debug.assert expects a text message.");char *text=autf8(message);afail("AryaAssertionError",text);free(text);AV error=aerror;ARoot root;aroot(&root,&error,1);afailed=0;aput(error,"code",astr("ARYA_ASSERTION"));athrow(error);aunroot(&root);return av(AUNDEF);}
  if(id==802){if(x.t!=ASTR||!x.p->scope)return afail("TypeError","debug.trace expects a nonempty label.");AV r[2]={x,argc>1?argv[1]:av(AUNDEF)};ARoot root;aroot(&root,r,2);AV formatted=ainspect(r[1],4,50,0);char *label=autf8(x),*text=autf8(formatted);fprintf(stderr,"%s = %s\n",label,text);if(aframes)fprintf(stderr,"  at %s (%s:%d:%d)\n",aframes->name,aframes->file,aframes->line,aframes->column);free(label);free(text);AV result=r[1];aunroot(&root);return result;}
  AV options=argc>1?argv[1]:av(AUNDEF);int depth=4,limit=50,colors=0;
  if(options.t!=AUNDEF){const char *names[]={"depth","maxArrayLength","colors"};if(!aplain_options(options,names,3))return av(AUNDEF);AV d=aprop(options,"depth"),l=aprop(options,"maxArrayLength"),c=aprop(options,"colors");if(d.t!=AUNDEF){if(!ais_safe_integer(d)||d.n<0||d.n>20)return afail("TypeError","Inspection depth must be an integer from 0 to 20.");depth=(int)d.n;}if(l.t!=AUNDEF){if(!ais_safe_integer(l)||l.n<0||l.n>1000)return afail("TypeError","Inspection list limit must be from 0 to 1000.");limit=(int)l.n;}if(c.t!=AUNDEF&&c.t!=ABOOL)return afail("TypeError","Inspection colors must be boolean.");colors=atruth(c);}
  return ainspect(x,depth,limit,colors);
}
