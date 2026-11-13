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
