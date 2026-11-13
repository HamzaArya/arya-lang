/* Synchronous atomic replacement. The random sibling is opened exclusively,
 * never through a predictable .tmp name. This promises atomic visibility,
 * not crash durability or compare-and-swap between independent writers. */
static AV afile_atomic(int id,int argc,AV *argv) {
  if(!argc||!apath_argument(argv[0]))return afailed?av(AUNDEF):afail("TypeError","File path must be a string.");
  if(argc<2||(id==18?argv[1].t!=ASTR:argv[1].t!=ABYTES))return afail("TypeError",id==18?"File text must be a string.":"File bytes must be a Buffer.");
  AV roots[2]={argv[0],argv[1]};ARoot root;aroot(&root,roots,2);
  char *path=autf8(roots[0]),*stage=NULL,*owned=NULL;const unsigned char *bytes=NULL;size_t length=0;
  int error=0,descriptor=-1,created=0;const char *operation="lstat";struct stat original;
  if(lstat(path,&original)==0) {
    if(!S_ISREG(original.st_mode)){free(path);aunroot(&root);return acoded_error("ARYA_FS_TARGET","Atomic destination must be absent or a regular file, not a symlink or directory.");}
  } else if(errno!=ENOENT){error=errno;goto done;}
  if(id==18){owned=autf8bytes(roots[1],&length);bytes=(const unsigned char*)owned;}
  else {bytes=(const unsigned char*)roots[1].p->chars;length=(size_t)roots[1].p->scope;}
  if(length>16*1024*1024){free(path);free(owned);aunroot(&root);return afail("RangeError","Atomic file exceeds 16 MiB.");}
  size_t size=strlen(path);stage=amemory(size+14);memcpy(stage,path,size);memcpy(stage+size,".stage-XXXXXX",14);
  operation="mkstemp";descriptor=mkstemp(stage);if(descriptor<0){error=errno;goto done;}created=1;
  operation="write";size_t written=0;
  while(written<length){ssize_t count=write(descriptor,bytes+written,length-written);if(count<0&&errno==EINTR)continue;if(count<=0){error=count<0?errno:EIO;goto done;}written+=(size_t)count;}
  operation="close";if(close(descriptor)){error=errno;descriptor=-1;goto done;}descriptor=-1;
  /* Recheck immediately before replacement. rename itself never follows the
   * target symlink, including one introduced concurrently after this check. */
  operation="lstat";
  if(lstat(path,&original)==0) {
    if(!S_ISREG(original.st_mode)){unlink(stage);free(stage);free(path);free(owned);aunroot(&root);return acoded_error("ARYA_FS_TARGET","Atomic destination must be absent or a regular file, not a symlink or directory.");}
  } else if(errno!=ENOENT){error=errno;goto done;}
  operation="rename";if(rename(stage,path)){error=errno;goto done;}created=0;
done:
  if(descriptor>=0)close(descriptor);
  if(created&&unlink(stage)&&!error){error=errno;operation="unlink";}
  free(stage);free(path);free(owned);
  AV result=error?aio_error(error,operation,roots[0]):av(AUNDEF);aunroot(&root);return result;
}
