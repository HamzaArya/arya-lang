/* Binary64 text conversion: Ryu plus ECMAScript decimal layout. */
#define RYU_OPTIMIZE_SIZE 1
#include "ryu/d2s.c"
static void aformat_number(double value, char *out) {
  if(isnan(value)){strcpy(out,"NaN");return;}
  if(isinf(value)){strcpy(out,signbit(value)?"-Infinity":"Infinity");return;}
  if(value==0){strcpy(out,"0");return;}
  char raw[64],digits[32];int length=d2s_buffered_n(value,raw);raw[length]=0;
  int at=0,begin=0;if(raw[0]=='-'){out[at++]='-';begin=1;}
  char *exponent=strchr(raw,'E');if(!exponent)exponent=strchr(raw,'e');
  int power=exponent?atoi(exponent+1):0,count=0,decimal=0,point=0;
  for(char *p=raw+begin;p!=(exponent?exponent:raw+length);p++) {
    if(*p=='.'){point=1;continue;}digits[count++]=*p;if(!point)decimal++;
  }
  decimal+=power;
  while(count>1&&digits[count-1]=='0')count--;
  if(decimal>0&&decimal<=21){for(int i=0;i<decimal;i++)out[at++]=i<count?digits[i]:'0';if(count>decimal){out[at++]='.';for(int i=decimal;i<count;i++)out[at++]=digits[i];}}
  else if(decimal<=0&&decimal>-6){out[at++]='0';out[at++]='.';for(int i=0;i< -decimal;i++)out[at++]='0';for(int i=0;i<count;i++)out[at++]=digits[i];}
  else {out[at++]=digits[0];if(count>1){out[at++]='.';for(int i=1;i<count;i++)out[at++]=digits[i];}out[at++]='e';if(decimal-1>=0)out[at++]='+';at+=sprintf(out+at,"%d",decimal-1);}
  out[at]=0;
}
