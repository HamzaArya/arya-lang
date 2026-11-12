/* Explicit native environment reads. */
static int aenv_name(AV name) {
  if(name.t!=ASTR||name.p->scope<1)return 0;
  for(int i=0;i<name.p->scope;i++){unsigned c=name.p->chars[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||c=='_'||(i&&c>='0'&&c<='9')))return 0;}return 1;
}
static AV aenvironment(int id,int argc,AV *argv) {
  if(!argc||!aenv_name(argv[0]))return acoded_error("ARYA_ENV_NAME","Environment names must start with a letter or underscore and contain letters, digits or underscores.");
  char *name=autf8(argv[0]);const char *text=getenv(name);free(name);
  AV r[2]={argc>1?argv[1]:(id==500?av(ANULL):av(AUNDEF)),av(AUNDEF)};ARoot root;aroot(&root,r,2);if(text)r[0]=astr(text);
  if(id==500){AV result=r[0];aunroot(&root);return result;}
  if(id==501){int empty=r[0].t!=ASTR;if(!empty){empty=1;for(int i=0;i<r[0].p->scope;i++)if(!aspace(r[0].p->chars[i]))empty=0;}
    if(empty)acoded_error("ARYA_ENV_REQUIRED","Set the required environment variable before starting the application.");}
  if(id==502){int valid=r[0].t==ANUM;if(r[0].t==ASTR){int i=0,n=r[0].p->scope;if(i<n&&(r[0].p->chars[i]=='+'||r[0].p->chars[i]=='-'))i++;valid=i<n;for(;i<n;i++)if(r[0].p->chars[i]<'0'||r[0].p->chars[i]>'9')valid=0;}
    double number=valid?atonumber(r[0]):NAN;r[0]=an(number);if(!ais_safe_integer(r[0]))acoded_error("ARYA_ENV_VALUE","Environment value must be a safe integer.");}
  if(id==503){if(r[0].t==ASTR){char *value=autf8(r[0]);for(char *c=value;*c;c++)if(*c>='A'&&*c<='Z')*c=(char)(*c+32);
      if(!strcmp(value,"true")||!strcmp(value,"1"))r[0]=ab(1);else if(!strcmp(value,"false")||!strcmp(value,"0"))r[0]=ab(0);free(value);}
    if(r[0].t!=ABOOL)acoded_error("ARYA_ENV_VALUE","Environment value must be true, false, 1 or 0.");}
  AV result=r[0];aunroot(&root);return afailed?av(AUNDEF):result;
}
