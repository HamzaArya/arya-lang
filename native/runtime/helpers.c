/* Rooted property helpers shared by the native library implementations. */
static AV aprop(AV object,const char *name) {
  int ascii=1;for(const unsigned char *s=(const unsigned char*)name;*s;s++)if(*s>=128){ascii=0;break;}
  if(ascii&&(object.t==ARECORD||object.t==AFUNC)){
    for(size_t i=0;i<object.p->len;i+=2)if(akey(object.p->data[i],name)){ARoot root;aroot(&root,&object,1);AV result=aread(object.p->data[i+1]);aunroot(&root);return result;}
    return av(AUNDEF);
  }
  AV r[2]={object,av(AUNDEF)};ARoot root;aroot(&root,r,2);
  r[1]=astr(name);AV result=aget(object,r[1]);aunroot(&root);return result;
}
static AV aput(AV object,const char *name,AV value) {
  int ascii=1;for(const unsigned char *s=(const unsigned char*)name;*s;s++)if(*s>=128){ascii=0;break;}
  if(ascii&&(object.t==ARECORD||object.t==AFUNC))for(size_t i=0;i<object.p->len;i+=2)if(akey(object.p->data[i],name))return aset(object,object.p->data[i],value);
  AV r[3]={object,value,av(AUNDEF)};ARoot root;aroot(&root,r,3);
  r[2]=astr(name);AV result=aset(object,r[2],value);aunroot(&root);return result;
}
static int ais_safe_integer(AV value) {return value.t==ANUM&&isfinite(value.n)&&floor(value.n)==value.n&&fabs(value.n)<=9007199254740991.0;}
static int apath_argument(AV value) {
  if(value.t!=ASTR){afail("TypeError","File paths must be strings.");return 0;}
  for(int i=0;i<value.p->scope;i++)if(!value.p->chars[i]){afail("TypeError","File paths cannot contain NUL.");return 0;}
  return 1;
}
static const char *aerrno_code(int number) {
  if(number==EADDRINUSE)return "EADDRINUSE";if(number==EADDRNOTAVAIL)return "EADDRNOTAVAIL";if(number==ECONNREFUSED)return "ECONNREFUSED";if(number==ECONNRESET)return "ECONNRESET";if(number==ETIMEDOUT)return "ETIMEDOUT";if(number==EHOSTUNREACH)return "EHOSTUNREACH";if(number==ENETUNREACH)return "ENETUNREACH";if(number==EPIPE)return "EPIPE";
  switch(number){case ENOENT:return "ENOENT";case ENOTDIR:return "ENOTDIR";case EACCES:return "EACCES";case EPERM:return "EPERM";case EEXIST:return "EEXIST";case EISDIR:return "EISDIR";case ENOTEMPTY:return "ENOTEMPTY";case ELOOP:return "ELOOP";case ENAMETOOLONG:return "ENAMETOOLONG";case EMFILE:return "EMFILE";case ENFILE:return "ENFILE";case ENOSPC:return "ENOSPC";case EROFS:return "EROFS";case EXDEV:return "EXDEV";case EINVAL:return "EINVAL";case EIO:return "EIO";default:return "ARYA_IO";}
}
static AV aio_error(int number,const char *operation,AV path) {
  if(afailed)return av(AUNDEF);
  AV r[2]={path,av(AUNDEF)};ARoot root;aroot(&root,r,2);afail("IOError",strerror(number));r[1]=aerror;afailed=0;
  aput(r[1],"code",astr(aerrno_code(number)));aput(r[1],"errno",an(-number));aput(r[1],"syscall",astr(operation));aput(r[1],"path",path);aerror=r[1];afailed=1;
  aunroot(&root);return av(AUNDEF);
}
static int amkdir_checked(const char *path) {
  if(!mkdir(path,0777))return 0;
  if(errno!=EEXIST)return -1;
  struct stat info;if(stat(path,&info))return -1;
  if(S_ISDIR(info.st_mode))return 0;errno=EEXIST;return -1;
}
static int aplain_options(AV value,const char *const *names,size_t count) {
  if(value.t!=ARECORD){afail("TypeError","Options must be a record.");return 0;}
  for(size_t i=0;i<value.p->len;i+=2){if(value.p->data[i+1].t==AGETTER){afail("TypeError","Options must contain data fields.");return 0;}int known=0;for(size_t j=0;j<count;j++)if(akey(value.p->data[i],names[j]))known=1;
    if(!known){afail("TypeError","Unknown option.");return 0;}}
  return 1;
}
