/* Filesystem workers own C buffers only. Managed values, roots, errors and
 * UTF-16 conversion remain on the cooperative runtime thread. */
typedef struct {
  int id,error,large,exists; const char *operation; char *path,*bytes;
  size_t length; char **names; size_t count,capacity;
} AFileJob;
static void afile_worker(void *argument) {
  AFileJob *job=argument;job->operation="open";
  if(job->id==13) { job->operation="access";if(!access(job->path,F_OK))job->exists=1;else if(errno!=ENOENT)job->error=errno;return; }
  if(job->id==14) {
    job->operation="scandir";DIR *directory=opendir(job->path);if(!directory){job->error=errno;return;}
    for(;;) {
      errno=0;struct dirent *item=readdir(directory);if(!item){job->error=errno;break;}
      if(!strcmp(item->d_name,".")||!strcmp(item->d_name,".."))continue;
      if(job->count==1000000){job->large=1;break;}
      if(job->count==job->capacity) {size_t capacity=job->capacity?job->capacity*2:32;char **next=realloc(job->names,capacity*sizeof(char*));if(!next){job->error=ENOMEM;break;}job->names=next;job->capacity=capacity;}
      char *name=strdup(item->d_name);if(!name){job->error=ENOMEM;break;}job->names[job->count++]=name;
    }
    closedir(directory);return;
  }
  FILE *file=fopen(job->path,job->id==10||job->id==15?"rb":job->id==17?"ab":"wb");if(!file){job->error=errno;return;}
  if(job->id==10||job->id==15) {
    job->operation="read";size_t capacity=4096;job->bytes=malloc(capacity+1);
    if(!job->bytes)job->error=ENOMEM;
    while(!job->error&&job->bytes) {
      if(job->length==capacity) {
        if(capacity==16*1024*1024) {int extra=fgetc(file);if(extra!=EOF)job->large=1;else if(ferror(file))job->error=errno?errno:EIO;break;}
        capacity*=2;char *next=realloc(job->bytes,capacity+1);if(!next){job->error=ENOMEM;break;}job->bytes=next;
      }
      size_t count=fread(job->bytes+job->length,1,capacity-job->length,file);job->length+=count;
      if(!count){if(ferror(file))job->error=errno?errno:EIO;break;}
    }
    if(job->bytes)job->bytes[job->length]=0;
  } else {
    job->operation="write";if(fwrite(job->bytes,1,job->length,file)!=job->length)job->error=errno?errno:EIO;
  }
  if(fclose(file)&&!job->error)job->error=errno?errno:EIO;
}
static AV afile_operation(int id,int argc,AV *argv,int asynchronous) {
  if(!argc)return afail("TypeError","File path must be a string.");
  if(!apath_argument(argv[0]))return av(AUNDEF);
  /* Validate before opening/truncating the destination. Copy only the view's
   * bytes; worker threads must never retain pointers into managed storage. */
  if((id==16||id==17)&&(argc<2||argv[1].t!=ABYTES))return afail("TypeError","File bytes must be a Buffer.");
  AV roots[3]={argv[0],av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,roots,3);
  AFileJob job={0};job.id=id;job.path=autf8(roots[0]);
  if(id==11){roots[1]=atostring(argc>1?argv[1]:av(AUNDEF));if(!afailed)job.bytes=autf8bytes(roots[1],&job.length);}
  else if(id==16||id==17){roots[1]=argv[1];job.length=(size_t)roots[1].p->scope;job.bytes=amemory(job.length?job.length:1);if(job.length)memcpy(job.bytes,roots[1].p->chars,job.length);}
  if(!afailed&&(asynchronous?anative_job(afile_worker,&job):(afile_worker(&job),1))) {
    if(job.error)aio_error(job.error,job.operation,roots[0]);
    else if(job.large)afail("RangeError",id==14?"Native list limit exceeded.":id==15?"Byte file exceeds 16 MiB.":"Text file exceeds 16 MiB.");
    else if(id==10)roots[2]=astrn(job.bytes,job.length);
    else if(id==15)roots[2]=abytes((unsigned char*)job.bytes,job.length);
    else if(id==13)roots[2]=ab(job.exists);
    else if(id==14){roots[2]=alist(0,NULL);for(size_t i=0;i<job.count&&!afailed;i++){roots[1]=astr(job.names[i]);aappend_value(roots[2],roots[1]);}}
  }
  free(job.path);free(job.bytes);for(size_t i=0;i<job.count;i++)free(job.names[i]);free(job.names);
  AV result=roots[2];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV afile_async(int id,int argc,AV *argv){return afile_operation(id,argc,argv,1);}
