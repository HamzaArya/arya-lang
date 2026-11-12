/* Embed an optional foreign worker as inert bytes with a C-only build tool. */
#include <stdio.h>
#include <stddef.h>
int main(int argc,char **argv){if(argc!=3)return 2;FILE *in=fopen(argv[1],"rb");if(!in){perror(argv[1]);return 1;}FILE *out=fopen(argv[2],"wb");if(!out){perror(argv[2]);fclose(in);return 1;}fputs("/* Generated from native/python/worker.py by native/bootstrap/bytes.c. */\nstatic const char apython_worker[]={\n",out);size_t n=0;int c;while((c=fgetc(in))!=EOF){if(++n>65536){fclose(in);fclose(out);return 1;}fprintf(out,"%d,",c);if(n%24==0)fputc('\n',out);}int failed=ferror(in);fclose(in);fputs("0};\n",out);return fclose(out)||failed?1:0;}
