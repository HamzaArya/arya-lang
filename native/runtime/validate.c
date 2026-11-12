/* Composable native schemas. The tag is held in private runtime metadata. */
static AV avschema_read(AV schema,AV value,AV path,AV issues,int depth);
static int avschema(AV schema){return schema.t==ARECORD&&schema.p->name&&!strcmp(schema.p->name,"arya.validation.schema");}
static AV avschema_error(const char *message){return acoded_error("ARYA_VALIDATION_SCHEMA",message);}
static void avissue(AV issues,AV path,const char *code,const char *message) {
  if(issues.p->len>=32)return;AV r[3]={issues,path,av(AUNDEF)};ARoot root;aroot(&root,r,3);r[2]=arecord();aput(r[2],"path",path);aput(r[2],"code",astr(code));aput(r[2],"message",astr(message));aappend_value(issues,r[2]);aunroot(&root);
}
static AV avpath(AV path,AV key){AV r[2]={path,key};ARoot root;aroot(&root,r,2);AV result=alist((int)path.p->len,path.p->data);r[0]=result;aappend_value(result,key);aunroot(&root);return result;}
static AV avschema_call(AV env,int argc,AV *argv){if(argc<3||argv[1].t!=ALIST||argv[2].t!=ALIST)return avschema_error("Schema.read expects value, path and issues lists.");return avschema_read(env,argv[0],argv[1],argv[2],argc>3?(int)atonumber(argv[3]):0);}
static AV avschema_new(int kind,AV config,AV child,AV fallback,int has_default) {
  AV r[5]={config,child,fallback,av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,5);r[3]=arecord();r[4]=alist(5,NULL);r[4].p->data[0]=an(kind);r[4].p->data[1]=config;r[4].p->data[2]=child;r[4].p->data[3]=fallback;r[4].p->data[4]=ab(has_default);r[3].p->parent=r[4];r[3].p->name="arya.validation.schema";
  r[4]=afunction(avschema_call,r[3],"schema.read");aput(r[3],"read",r[4]);r[3].p->scope=-2;AV result=r[3];aunroot(&root);return result;
}
static AV avcopy(AV input){AV r=arecord();ARoot root;aroot(&root,&r,1);for(size_t i=0;i<input.p->len;i+=2)aset(r,input.p->data[i],input.p->data[i+1]);aunroot(&root);return r;}
static int avoptions(AV options,int kind) {
  const char *names[4];size_t count=0;
  if(kind==0){names[count++]="min";names[count++]="max";names[count++]="trim";}
  if(kind==1||kind==2){names[count++]="min";names[count++]="max";if(kind==1)names[count++]="integer";names[count++]="coerce";}
  if(kind==3)names[count++]="coerce";if(kind==7){names[count++]="min";names[count++]="max";}if(kind==8)names[count++]="strict";
  if(!aplain_options(options,names,count)){afailed=0;avschema_error("Unknown or invalid schema options.");return 0;}
  AV minimum=aprop(options,"min"),maximum=aprop(options,"max");int length=kind==0||kind==7;
  if((minimum.t!=AUNDEF&&(minimum.t!=ANUM||!isfinite(minimum.n)||(length&&(!ais_safe_integer(minimum)||minimum.n<0))))||(maximum.t!=AUNDEF&&(maximum.t!=ANUM||!isfinite(maximum.n)||(length&&(!ais_safe_integer(maximum)||maximum.n<0))))||(minimum.t!=AUNDEF&&maximum.t!=AUNDEF&&minimum.n>maximum.n)){avschema_error("Invalid schema bounds.");return 0;}
  const char *flags[]={"trim","integer","coerce","strict"};for(int i=0;i<4;i++){AV flag=aprop(options,flags[i]);if(flag.t!=AUNDEF&&flag.t!=ABOOL){avschema_error("Schema flags must be booleans.");return 0;}}
  if(kind==7&&((maximum.t==ANUM&&maximum.n>10000)||(minimum.t==ANUM&&minimum.n>(maximum.t==ANUM?maximum.n:10000)))){avschema_error("Array schemas support at most 10000 items.");return 0;}return 1;
}
static int avnumeric(AV value) {
  if(value.t!=ASTR)return 0;int n=value.p->scope,i=0,before=0,after=0;if(i<n&&(value.p->chars[i]=='+'||value.p->chars[i]=='-'))i++;
  while(i<n&&value.p->chars[i]>='0'&&value.p->chars[i]<='9'){i++;before++;}
  if(i<n&&value.p->chars[i]=='.'){i++;while(i<n&&value.p->chars[i]>='0'&&value.p->chars[i]<='9'){i++;after++;}if(!after)return 0;}
  if(!before&&!after)return 0;if(i<n&&(value.p->chars[i]=='e'||value.p->chars[i]=='E')){i++;if(i<n&&(value.p->chars[i]=='+'||value.p->chars[i]=='-'))i++;int begin=i;while(i<n&&value.p->chars[i]>='0'&&value.p->chars[i]<='9')i++;if(i==begin)return 0;}return i==n;
}
static AV avschema_read(AV schema,AV value,AV path,AV issues,int depth) {
  if(issues.p->len>=32)return av(AUNDEF);if(depth>64){avissue(issues,path,"depth","Input is nested too deeply.");return av(AUNDEF);}
  AV r[8]={schema,value,path,issues,av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,8);
  AV definition=schema.p->parent,options=definition.p->data[1],child=definition.p->data[2];int kind=(int)definition.p->data[0].n;
  double minimum=0,maximum=INFINITY;
  if(options.t==ARECORD){AV min=aprop(options,"min"),max=aprop(options,"max");minimum=min.t==ANUM?min.n:(kind==1||kind==2?-INFINITY:0);maximum=max.t==ANUM?max.n:(kind==7?10000:INFINITY);}
  r[4]=value;
  if(kind==0){if(value.t!=ASTR){avissue(issues,path,"type","Expected text.");r[4]=av(AUNDEF);goto done;}
    if(atruth(aprop(options,"trim"))){size_t start=0,end=(size_t)value.p->scope;while(start<end&&aspace(value.p->chars[start]))start++;while(end>start&&aspace(value.p->chars[end-1]))end--;r[4]=as16(value.p->chars+start,end-start);}
    if(r[4].p->scope<minimum||r[4].p->scope>maximum)avissue(issues,path,"length","Text length is outside the allowed range.");
  }else if(kind==1||kind==2){if(atruth(aprop(options,"coerce"))&&avnumeric(value))r[4]=an(atonumber(value));int integer=kind==2||atruth(aprop(options,"integer"));
    if(r[4].t!=ANUM||!isfinite(r[4].n)||(integer&&!ais_safe_integer(r[4]))){avissue(issues,path,"type",integer?"Expected a safe integer.":"Expected a finite number.");r[4]=av(AUNDEF);goto done;}if(r[4].n<minimum||r[4].n>maximum)avissue(issues,path,"range","Number is outside the allowed range.");
  }else if(kind==3){if(atruth(aprop(options,"coerce"))&&(akey(value,"true")||akey(value,"false")))r[4]=ab(akey(value,"true"));if(r[4].t!=ABOOL){avissue(issues,path,"type","Expected a boolean.");r[4]=av(AUNDEF);}}
  else if(kind==4){int found=0;for(size_t i=0;i<options.p->len;i++)if(aeq(value,options.p->data[i]))found=1;if(!found)avissue(issues,path,"enum","Expected one of the allowed values.");}
  else if(kind==5){if(value.t==AUNDEF&&!definition.p->data[4].n)goto done;if(value.t==AUNDEF)value=definition.p->data[3];r[4]=avschema_read(child,value,path,issues,depth+1);}
  else if(kind==6){if(value.t!=ANULL)r[4]=avschema_read(child,value,path,issues,depth+1);}
  else if(kind==7){if(value.t!=ALIST){avissue(issues,path,"type","Expected a list.");r[4]=av(AUNDEF);goto done;}if(value.p->len<minimum||value.p->len>maximum){avissue(issues,path,"length","List length is outside the allowed range.");r[4]=av(AUNDEF);goto done;}
    r[4]=alist((int)value.p->len,NULL);for(size_t i=0;i<value.p->len&&!afailed;i++){r[5]=avpath(path,an((double)i));r[6]=value.p->data[i].t==AUINIT?av(AUNDEF):value.p->data[i];r[7]=avschema_read(child,r[6],r[5],issues,depth+1);r[4].p->data[i]=r[7];}
  }else if(kind==8){if(value.t!=ARECORD){avissue(issues,path,"type","Expected an object.");r[4]=av(AUNDEF);goto done;}r[4]=arecord();AV strict=aprop(options,"strict");
    if(strict.t==AUNDEF||atruth(strict))for(size_t i=0;i<value.p->len;i+=2){int known=0;for(size_t j=0;j<child.p->len;j+=2)if(aseq(value.p->data[i],child.p->data[j]))known=1;if(!known){r[5]=avpath(path,value.p->data[i]);avissue(issues,r[5],"unknown","Unexpected field.");}}
    for(size_t i=0;i<child.p->len&&!afailed;i+=2){r[5]=avpath(path,child.p->data[i]);r[6]=aget(value,child.p->data[i]);r[7]=avschema_read(child.p->data[i+1],r[6],r[5],issues,depth+1);if(r[7].t!=AUNDEF)aset(r[4],child.p->data[i],r[7]);}
  }
done:;AV result=r[4];aunroot(&root);return result;
}
static AV avalidation(int id,int argc,AV *argv) {
  int kind=id-700;AV r[6]={argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,6);
  if(kind<=3||kind==7||kind==8){int index=kind<=3?0:1;if(r[index].t==AUNDEF)r[index]=arecord();if(!avoptions(r[index],kind))goto done;r[index]=avcopy(r[index]);}
  if(kind<=3)r[5]=avschema_new(kind,r[0],av(AUNDEF),av(AUNDEF),0);
  else if(kind==4){if(r[0].t!=ALIST||!r[0].p->len){avschema_error("enum expects a nonempty list of finite primitive values.");goto done;}for(size_t i=0;i<r[0].p->len;i++){AV v=r[0].p->data[i];if(v.t!=ANULL&&v.t!=ASTR&&v.t!=ABOOL&&(v.t!=ANUM||!isfinite(v.n))){avschema_error("enum expects finite primitive values.");goto done;}}r[2]=alist((int)r[0].p->len,r[0].p->data);r[5]=avschema_new(kind,r[2],av(AUNDEF),av(AUNDEF),0);}
  else if(kind==5||kind==6||kind==7){if(!avschema(r[0])){avschema_error("Expected a schema created by validate.");goto done;}
    if(kind==5&&argc>2){avschema_error("optional accepts one default value.");goto done;}
    if(kind==5&&argc>1){r[2]=alist(0,NULL);r[3]=alist(0,NULL);r[4]=avschema_read(r[0],r[1],r[2],r[3],0);if(r[3].p->len){avschema_error("The optional default must satisfy its schema.");goto done;}}
    r[5]=avschema_new(kind,kind==7?r[1]:av(AUNDEF),r[0],r[4],kind==5&&argc>1);
  }else if(kind==8){if(r[0].t!=ARECORD){avschema_error("object expects named field schemas.");goto done;}for(size_t i=1;i<r[0].p->len;i+=2)if(!avschema(r[0].p->data[i])){avschema_error("Expected field schemas created by validate.");goto done;}r[0]=avcopy(r[0]);r[5]=avschema_new(kind,r[1],r[0],av(AUNDEF),0);}
  else if(kind==9||kind==10){if(!avschema(r[0])){avschema_error("Expected a schema created by validate.");goto done;}r[2]=alist(0,NULL);r[3]=alist(0,NULL);r[4]=avschema_read(r[0],r[1],r[2],r[3],0);r[5]=arecord();aput(r[5],"ok",ab(!r[3].p->len));aput(r[5],r[3].p->len?"issues":"value",r[3].p->len?r[3]:r[4]);
    if(kind==10){if(r[3].p->len){acoded_error("ARYA_VALIDATION","Input validation failed.");r[5]=aerror;afailed=0;aput(r[5],"issues",r[3]);aput(r[5],"aryaHttpStatus",an(400));athrow(r[5]);}else r[5]=r[4];}}
 done:;AV result=r[5];aunroot(&root);return afailed?av(AUNDEF):result;
}
