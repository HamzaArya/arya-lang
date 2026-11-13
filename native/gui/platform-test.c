/* Native toolkit action probes for Linux and Windows CI. These are automated
   OS-control actions/messages, not human interaction or a substituted backend. */
#include <assert.h>
#if defined(_WIN32) || defined(__CYGWIN__)
#include "win32.c"
#else
#include "gtk.c"
#endif
static void expect_event(AGWindow *window,const char *type,const char *id,int index){
  int seen=0;for(int i=0;i<100;i++){AGuiEvent event={0};int result=arya_gui_poll(window,&event);assert(result>=0);if(result==1){if(!strcmp(event.type,type)&&!strcmp(event.id,id)){assert(event.state.index==index);seen=1;}arya_gui_dispose_state(&event.state);}if(seen)break;}
  if(!seen)fprintf(stderr,"Missing native event: %s for '%s'\n",type,id);
  assert(seen);printf("Native event PASS: %s for '%s'\n",type,id);fflush(stdout);
}
int main(void){
  AGWindow *window=(AGWindow*)arya_gui_window("Arya native toolkit actions",480,420);assert(window);
  AGuiSpec spec={0};spec.kind=AG_BUTTON;spec.id="button";spec.text="Click";spec.x=20;spec.y=20;spec.width=140;spec.height=32;spec.enabled=1;spec.index=-1;spec.mask=AG_RECT|AG_TEXT|AG_ENABLED;assert(arya_gui_add(window,&spec));
  AGControl *button=ag_find(window,"button");
#if defined(_WIN32) || defined(__CYGWIN__)
  SetActiveWindow(window->window);
  SendMessageW(button->widget,BM_CLICK,0,0);
#else
  gtk_button_clicked(GTK_BUTTON(button->widget));
#endif
  expect_event(window,"click","button",-1);
  const char *items[]={"Same","Same","Other"};spec.kind=AG_SELECT;spec.id="choice";spec.y=70;spec.items=items;spec.count=3;spec.index=1;spec.mask=AG_RECT|AG_ITEMS|AG_INDEX|AG_ENABLED;assert(arya_gui_add(window,&spec));
  AGuiState selected={0};assert(arya_gui_get(window,"choice",&selected));assert(selected.index==1&&!strcmp(selected.text,"Same"));arya_gui_dispose_state(&selected);AGControl *choice=ag_find(window,"choice");
#if defined(_WIN32) || defined(__CYGWIN__)
  assert(SendMessageW(choice->widget,CB_GETCOUNT,0,0)==3);SendMessageW(choice->widget,CB_SETCURSEL,2,0);SendMessageW(window->window,WM_COMMAND,MAKEWPARAM(choice->number,CBN_SELCHANGE),(LPARAM)choice->widget);
#else
  gtk_combo_box_set_active(GTK_COMBO_BOX(choice->widget),2);
#endif
  expect_event(window,"change","choice",2);
  spec.kind=AG_INPUT;spec.id="input";spec.y=120;spec.text="before";spec.mask=AG_RECT|AG_TEXT|AG_ENABLED;assert(arya_gui_add(window,&spec));AGControl *input=ag_find(window,"input");
#if defined(_WIN32) || defined(__CYGWIN__)
  SetWindowTextW(input->widget,L"after");
#else
  gtk_entry_set_text(GTK_ENTRY(input->widget),"after");
#endif
  expect_event(window,"change","input",-1);
#if defined(_WIN32) || defined(__CYGWIN__)
  SetFocus(input->widget);PostMessageW(input->widget,WM_KEYDOWN,VK_RETURN,0);
#else
  g_signal_emit_by_name(input->widget,"activate");
#endif
  expect_event(window,"submit","input",-1);
  spec.kind=AG_TEXTAREA;spec.id="notes";spec.y=170;spec.height=120;assert(arya_gui_add(window,&spec));AGControl *notes=ag_find(window,"notes");
#if defined(_WIN32) || defined(__CYGWIN__)
  /* WM_SETTEXT deliberately omits EN_CHANGE for multiline Win32 edits.
     Replace the selected content through an edit operation instead. */
  SendMessageW(notes->widget,EM_SETSEL,0,-1);
  SendMessageW(notes->widget,EM_REPLACESEL,TRUE,(LPARAM)L"line1\r\nline2");
#else
  gtk_text_buffer_set_text(gtk_text_view_get_buffer(GTK_TEXT_VIEW(notes->widget)),"line1\nline2",-1);
#endif
  expect_event(window,"change","notes",-1);
  arya_gui_close(window);expect_event(window,"close","",-1);AGuiEvent event={0};assert(arya_gui_poll(window,&event)==-1);arya_gui_release(window);assert(ag_windows==0);
  void *closed[20];for(int i=0;i<20;i++){closed[i]=arya_gui_window("Closed window lifetime",240,160);assert(closed[i]);arya_gui_close(closed[i]);}assert(ag_windows==0);for(int i=0;i<20;i++)arya_gui_release(closed[i]);
  printf("%s native actions PASS: button, duplicate choices, input/change/submit, multiline, close, retained closed handles.\n",arya_gui_platform());return 0;
}
