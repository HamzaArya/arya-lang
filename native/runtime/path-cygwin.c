/* Private path conversion for native Windows editor clients of Cygwin builds.
   Conversion uses the mount table, not an assumed /cygdrive prefix. */
static AV apath_convert(AV value,int windows) {
  if(!apath_argument(value))return av(AUNDEF);
#ifdef __CYGWIN__
  if(!value.p->scope)return value;
  int native=0;
  for(int i=0;i<value.p->scope;i++)if(value.p->chars[i]=='\\')native=1;
  if(value.p->scope>=2&&((value.p->chars[0]>='a'&&value.p->chars[0]<='z')||(value.p->chars[0]>='A'&&value.p->chars[0]<='Z'))&&value.p->chars[1]==':')native=1;
  if(!windows&&!native)return value;
  /* Windows paths are already UTF-16 in the Arya string representation. */
  void *input;
  if(windows)input=autf8(value);
  else{_Static_assert(sizeof(wchar_t)==sizeof(uint16_t),"Cygwin Windows paths require UTF-16 wchar_t");input=amemory(((size_t)value.p->scope+1)*sizeof(wchar_t));memcpy(input,value.p->chars,(size_t)value.p->scope*sizeof(wchar_t));((wchar_t *)input)[value.p->scope]=0;}
  cygwin_conv_path_t mode=windows?CCP_POSIX_TO_WIN_W:(CCP_WIN_W_TO_POSIX|CCP_RELATIVE);
  ssize_t size=cygwin_conv_path(mode,input,NULL,0);
  if(size<0){int saved=errno;free(input);return aio_error(saved,"cygwin_conv_path",value);}
  void *output=amemory((size_t)size);
  if(cygwin_conv_path(mode,input,output,(size_t)size)){int saved=errno;free(input);free(output);return aio_error(saved,"cygwin_conv_path",value);}
  free(input);AV result;
  if(windows)result=as16((const uint16_t *)output,wcslen((const wchar_t *)output));else result=astr((const char *)output);
  free(output);return result;
#else
  (void)windows;return value;
#endif
}
#ifdef __CYGWIN__
/* MoveFileEx without REPLACE_EXISTING is an exclusive same-volume publication.
   Cygwin rename() replaces existing destinations and cannot supply this API. */
static int acygwin_publish_directory(const char *from,const char *to) {
  ssize_t from_size=cygwin_conv_path(CCP_POSIX_TO_WIN_W,from,NULL,0);
  if(from_size<0)return -1;
  ssize_t to_size=cygwin_conv_path(CCP_POSIX_TO_WIN_W,to,NULL,0);
  if(to_size<0)return -1;
  wchar_t *source=malloc((size_t)from_size),*destination=malloc((size_t)to_size);
  if(!source||!destination){free(source);free(destination);errno=ENOMEM;return -1;}
  if(cygwin_conv_path(CCP_POSIX_TO_WIN_W,from,source,(size_t)from_size)||cygwin_conv_path(CCP_POSIX_TO_WIN_W,to,destination,(size_t)to_size)){int saved=errno;free(source);free(destination);errno=saved;return -1;}
  BOOL ok=MoveFileExW(source,destination,0);DWORD error=ok?ERROR_SUCCESS:GetLastError();
  free(source);free(destination);if(ok)return 0;
  switch(error){
    case ERROR_ALREADY_EXISTS:case ERROR_FILE_EXISTS:errno=EEXIST;break;
    case ERROR_FILE_NOT_FOUND:case ERROR_PATH_NOT_FOUND:errno=ENOENT;break;
    case ERROR_ACCESS_DENIED:errno=EACCES;break;
    case ERROR_SHARING_VIOLATION:case ERROR_LOCK_VIOLATION:errno=EBUSY;break;
    case ERROR_NOT_SAME_DEVICE:errno=EXDEV;break;
    case ERROR_DIRECTORY:errno=ENOTDIR;break;
    case ERROR_DIR_NOT_EMPTY:errno=ENOTEMPTY;break;
    case ERROR_INVALID_NAME:case ERROR_INVALID_PARAMETER:errno=EINVAL;break;
    case ERROR_FILENAME_EXCED_RANGE:errno=ENAMETOOLONG;break;
    case ERROR_DISK_FULL:errno=ENOSPC;break;
    default:errno=EIO;break;
  }
  return -1;
}
#endif
