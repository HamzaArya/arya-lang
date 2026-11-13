/* Shared bounded event queue. Included by exactly one native backend. */
#include "../runtime/gui-platform.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#define AG_MAX_CONTROLS 128
#define AG_MAX_EVENTS 256
#define AG_MAX_WINDOWS 16
static unsigned ag_windows;
static char ag_error[256];
const char *arya_gui_error(void) { return ag_error[0] ? ag_error : "Native GUI operation failed."; }
static int ag_fail(const char *message) { snprintf(ag_error,sizeof ag_error,"%s",message); return 0; }
/* Native editable controls cap input at 16384 UTF-16 units, including paste. */
static char *ag_copy(const char *source) {
  if(!source)source=""; size_t n=0,units=0;
  while(source[n]) { unsigned char c=(unsigned char)source[n];size_t bytes=c<128?1:c<224?2:c<240?3:4,add=bytes==4?2:1;
    if(units+add>16384)break;units+=add;n+=bytes;
  }
  char *result=(char*)malloc(n+1);if(!result)return NULL;memcpy(result,source,n);result[n]=0;return result;
}
void arya_gui_dispose_state(AGuiState *state){free(state->text);state->text=NULL;}
typedef struct { AGuiEvent values[AG_MAX_EVENTS];unsigned head,count;int overflow; } AGuiQueue;
static void ag_push(AGuiQueue *queue,const char *type,const char *id,const AGuiState *state) {
  /* Coalesce only adjacent observations of the same control, preserving clicks. */
  if(queue->count && (!strcmp(type,"change")||!strcmp(type,"resize"))) {
    AGuiEvent *last=&queue->values[(queue->head+queue->count-1)%AG_MAX_EVENTS];
    if(!strcmp(last->type,type)&&!strcmp(last->id,id)) { arya_gui_dispose_state(&last->state);last->state=*state;last->state.text=ag_copy(state->text);if(!last->state.text)queue->overflow=1;return; }
  }
  if(queue->count==AG_MAX_EVENTS){queue->overflow=1;return;}
  AGuiEvent *event=&queue->values[(queue->head+queue->count++)%AG_MAX_EVENTS];
  memset(event,0,sizeof *event);snprintf(event->type,sizeof event->type,"%s",type);snprintf(event->id,sizeof event->id,"%s",id);event->state=*state;event->state.text=ag_copy(state->text);if(!event->state.text)queue->overflow=1;
}
static int ag_pop(AGuiQueue *queue,AGuiEvent *event){
  if(queue->overflow){queue->overflow=0;ag_fail("Native GUI event queue overflowed; read current control state before continuing.");return -2;}
  if(!queue->count)return 0;*event=queue->values[queue->head];memset(&queue->values[queue->head],0,sizeof *event);queue->head=(queue->head+1)%AG_MAX_EVENTS;queue->count--;return 1;
}
static void ag_clear(AGuiQueue *queue){for(unsigned i=0;i<queue->count;i++)arya_gui_dispose_state(&queue->values[(queue->head+i)%AG_MAX_EVENTS].state);memset(queue,0,sizeof *queue);}
