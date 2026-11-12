/* Build-time source embedding/amalgamation; no external language interpreter. */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
static FILE *output;
static const char *vendor;
static size_t total;
static int c_mode;
static void quoted(const char *s) {
  static int quotes;
  for(;*s;s++) {
    unsigned char c=(unsigned char)*s;
    if(++total>4000000){fputs("embedded runtime exceeds the native module budget\n",stderr);exit(1);}
    if(!c_mode&&c=='"')quotes++;else quotes=0;
    if(quotes==3){fputs("runtime source contains the raw-string delimiter\n",stderr);exit(1);}
    fputc(c,output);
  }
}
static void expand(const char *path,int depth) {
  if(depth>16){fputs("runtime include depth exceeded\n",stderr);exit(1);}
  FILE *in=fopen(path,"rb");if(!in){perror(path);exit(1);}
  char *line=NULL;size_t cap=0;ssize_t length;
  while((length=getline(&line,&cap,in))>=0) {
    if(memchr(line,0,(size_t)length)){fputs("NUL in runtime source\n",stderr);exit(1);}
    if(!strncmp(line,"#include \"",10)) {
      char *end=strchr(line+10,'"');if(!end){fputs("invalid runtime include\n",stderr);exit(1);}*end=0;
      char included[PATH_MAX];const char *name=line+10;
      if(!strncmp(name,"ryu/",4))snprintf(included,sizeof(included),"%s/%s",vendor,name);
      else {const char *slash=strrchr(path,'/');snprintf(included,sizeof(included),"%.*s/%s",slash?(int)(slash-path):1,slash?path:".",name);}
      expand(included,depth+1);
    } else quoted(line);
  }
  if(ferror(in)){perror(path);exit(1);}free(line);fclose(in);
}
int main(int argc,char **argv) {
  if(argc!=4&&argc!=5){fputs("usage: embed runtime output vendor-root\n",stderr);return 2;}
  vendor=argv[3];output=fopen(argv[2],"wb");if(!output){perror(argv[2]);return 1;}
  c_mode=argc==5;
  if(c_mode)expand(argv[1],0);
  else {fputs("export const source = \"\"\"",output);expand(argv[1],0);fputs("\"\"\"\nexport const notices = \"\"\"",output);expand("native/THIRD-PARTY-NOTICES.txt",0);fputs("\"\"\"\n",output);}
  return fclose(output)?1:0;
}
