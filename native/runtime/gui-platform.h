#ifndef ARYA_GUI_PLATFORM_H
#define ARYA_GUI_PLATFORM_H
/* Platform ABI for std gui. Strings are UTF-8; caller owns input strings.
   get/poll return allocated text freed by arya_gui_dispose_state. All calls
   run on the process GUI thread, never from a platform callback into Arya. */
enum { AG_LABEL, AG_BUTTON, AG_INPUT, AG_TEXTAREA, AG_CHECKBOX, AG_SELECT, AG_LIST, AG_PROGRESS };
enum { AG_TEXT=1, AG_ENABLED=2, AG_CHECKED=4, AG_INDEX=8, AG_ITEMS=16, AG_RECT=32, AG_VALUE=64 };
typedef struct { const char *id,*text; int kind,x,y,width,height,enabled,checked,index; double value; const char **items; int count; unsigned mask; } AGuiSpec;
typedef struct { char *text; int checked,index,width,height; double value; } AGuiState;
typedef struct { char type[16],id[65]; AGuiState state; } AGuiEvent;
void *arya_gui_window(const char *title,int width,int height);
const char *arya_gui_platform(void);
const char *arya_gui_error(void);
int arya_gui_add(void *window,const AGuiSpec *spec);
int arya_gui_set(void *window,const char *id,const AGuiSpec *spec);
int arya_gui_get(void *window,const char *id,AGuiState *state);
int arya_gui_poll(void *window,AGuiEvent *event); /* 1 event, 0 idle, -1 closed, -2 error */
void arya_gui_close(void *window);
void arya_gui_release(void *window);
void arya_gui_dispose_state(AGuiState *state);
#endif
