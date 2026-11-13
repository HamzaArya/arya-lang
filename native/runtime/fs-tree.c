/* Compiler-private exact metadata snapshot. Keep one native buffer instead of
 * constructing thousands of managed path, stat-record and function values.
 * Names are length-prefixed hexadecimal bytes: no encoding/delimiter aliases. */
static int afile_name_order(const void *a,const void *b) {return strcmp(*(const char *const*)a,*(const char *const*)b);}
static void afile_tree_name(AJWriter *out,const char *name) {
  char prefix[32];size_t n=strlen(name);int length=snprintf(prefix,sizeof(prefix),"%zu:",n);ajappend(out,prefix,(size_t)length);
  const char *hex="0123456789abcdef";char bytes[256];size_t used=0;
  for(size_t i=0;i<n&&!afailed;i++){unsigned c=(unsigned char)name[i];bytes[used++]=hex[c>>4];bytes[used++]=hex[c&15];if(used==sizeof(bytes)){ajappend(out,bytes,used);used=0;}}
  if(used)ajappend(out,bytes,used);ajappend(out,"\n",1);
}
static void afile_tree_walk(const char *path,AJWriter *out,size_t *count,int depth) {
  if(depth>24||*count>=8192){afail("RangeError","Native SDK cache fingerprint exceeds its file limit.");return;}(*count)++;
  afile_tree_name(out,path);if(afailed)return;
  struct stat info;
  if(lstat(path,&info)){int error=errno;if(error==ENOENT||error==ENOTDIR){ajappend(out,"missing\n",8);return;}aio_error(error,"lstat",astr(path));return;}
  char metadata[256];
#ifdef __APPLE__
  long long modified=info.st_mtimespec.tv_sec,changed=info.st_ctimespec.tv_sec;long modified_ns=info.st_mtimespec.tv_nsec,changed_ns=info.st_ctimespec.tv_nsec;
#else
  long long modified=info.st_mtim.tv_sec,changed=info.st_ctim.tv_sec;long modified_ns=info.st_mtim.tv_nsec,changed_ns=info.st_ctim.tv_nsec;
#endif
  int length=snprintf(metadata,sizeof(metadata),"%llu %llu %u %lld %lld:%ld %lld:%ld\n",(unsigned long long)info.st_dev,(unsigned long long)info.st_ino,(unsigned)info.st_mode,(long long)info.st_size,modified,modified_ns,changed,changed_ns);
  ajappend(out,metadata,(size_t)length);if(afailed||!S_ISDIR(info.st_mode))return;
  DIR *directory=opendir(path);if(!directory){int error=errno;aio_error(error,"scandir",astr(path));return;}
  char **names=NULL;size_t size=0,capacity=0;
  while(!afailed) {
    errno=0;struct dirent *entry=readdir(directory);if(!entry){int error=errno;if(error)aio_error(error,"scandir",astr(path));break;}
    if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;
    if(size+*count>=8192){afail("RangeError","Native SDK cache fingerprint exceeds its file limit.");break;}
    if(size==capacity){capacity=capacity?capacity*2:32;char **next=realloc(names,capacity*sizeof(char*));if(!next){afail("Error","Cannot allocate SDK file names.");break;}names=next;}
    names[size]=strdup(entry->d_name);if(!names[size]){afail("Error","Cannot allocate SDK file name.");break;}size++;
  }
  closedir(directory);if(size>1)qsort(names,size,sizeof(char*),afile_name_order);
  for(size_t i=0;i<size&&!afailed;i++) {
    size_t n=strlen(path)+strlen(names[i])+2;char *child=amemory(n);snprintf(child,n,"%s/%s",path,names[i]);afile_tree_walk(child,out,count,depth+1);free(child);
  }
  for(size_t i=0;i<size;i++)free(names[i]);free(names);
}
static AV afile_tree_info(int argc,AV *argv) {
  if(!argc)return afail("TypeError","File path must be a string.");
  if(!apath_argument(argv[0]))return av(AUNDEF);
  char *path=autf8(argv[0]);AJWriter out={0};size_t count=0;afile_tree_walk(path,&out,&count,0);free(path);
  AV result=afailed?av(AUNDEF):astrn(out.data?out.data:"",out.length);free(out.data);return result;
}
