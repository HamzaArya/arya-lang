/* Direct GTK 3 controls, for the native Linux SDK. Requires a graphical display
   (X11/Wayland, or Xvfb in CI); no webview or browser dependency. */
#include <gtk/gtk.h>
#include "common.h"
typedef struct AGWindow AGWindow;
typedef struct { AGWindow *owner;char id[65];int kind,enabled;GtkWidget *widget,*view;char **items;int count; } AGControl;
struct AGWindow { GtkWidget *window,*layout;AGControl controls[AG_MAX_CONTROLS];int count,closed,updating;AGuiQueue queue; };
const char *arya_gui_platform(void){return "gtk3";}
static AGControl *ag_find(AGWindow *window,const char *id){for(int i=0;i<window->count;i++)if(!strcmp(window->controls[i].id,id))return &window->controls[i];return NULL;}
static AGuiState ag_state(AGControl *control){AGuiState state={0};state.index=-1;const char *text="";gchar *owned=NULL;
  switch(control->kind){case AG_LABEL:text=gtk_label_get_text(GTK_LABEL(control->widget));break;case AG_BUTTON:case AG_CHECKBOX:text=gtk_button_get_label(GTK_BUTTON(control->widget));if(control->kind==AG_CHECKBOX)state.checked=gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(control->widget));break;
    case AG_INPUT:text=gtk_entry_get_text(GTK_ENTRY(control->widget));break;
    case AG_TEXTAREA:{GtkTextBuffer *buffer=gtk_text_view_get_buffer(GTK_TEXT_VIEW(control->widget));GtkTextIter start,end;gtk_text_buffer_get_bounds(buffer,&start,&end);owned=gtk_text_buffer_get_text(buffer,&start,&end,FALSE);text=owned;break;}
    case AG_SELECT:state.index=gtk_combo_box_get_active(GTK_COMBO_BOX(control->widget));break;
    case AG_LIST:{GtkListBoxRow *row=gtk_list_box_get_selected_row(GTK_LIST_BOX(control->widget));if(row)state.index=gtk_list_box_row_get_index(row);break;}
    case AG_PROGRESS:state.value=gtk_progress_bar_get_fraction(GTK_PROGRESS_BAR(control->widget));break;
  }
  if((control->kind==AG_SELECT||control->kind==AG_LIST)&&state.index>=0&&state.index<control->count)text=control->items[state.index];
  state.text=ag_copy(text);g_free(owned);state.width=gtk_widget_get_allocated_width(control->view);state.height=gtk_widget_get_allocated_height(control->view);return state;
}
static void ag_emit(AGControl *control,const char *type){AGWindow *window=control->owner;if(window->closed||window->updating)return;AGuiState state=ag_state(control);if(control->kind==AG_INPUT||control->kind==AG_TEXTAREA){window->updating=1;if(control->kind==AG_INPUT){if(strcmp(gtk_entry_get_text(GTK_ENTRY(control->widget)),state.text))gtk_entry_set_text(GTK_ENTRY(control->widget),state.text);}else{GtkTextBuffer *buffer=gtk_text_view_get_buffer(GTK_TEXT_VIEW(control->widget));GtkTextIter a,b;gtk_text_buffer_get_bounds(buffer,&a,&b);gchar *text=gtk_text_buffer_get_text(buffer,&a,&b,FALSE);if(strcmp(text,state.text))gtk_text_buffer_set_text(buffer,state.text,-1);g_free(text);}window->updating=0;}ag_push(&window->queue,type,control->id,&state);arya_gui_dispose_state(&state);}
static void ag_changed(gpointer widget,gpointer data){(void)widget;ag_emit((AGControl*)data,"change");}
static void ag_clicked(gpointer widget,gpointer data){(void)widget;ag_emit((AGControl*)data,"click");}
static void ag_submit(gpointer widget,gpointer data){(void)widget;ag_emit((AGControl*)data,"submit");}
static void ag_selected(GtkListBox *list,GtkListBoxRow *row,gpointer data){(void)list;(void)row;ag_emit((AGControl*)data,"change");}
static void ag_destroy(GtkWidget *widget,gpointer data){(void)widget;AGWindow *window=(AGWindow*)data;if(!window->closed){window->closed=1;AGuiState state={0};state.index=-1;ag_push(&window->queue,"close","",&state);}}
static gboolean ag_resize(GtkWidget *widget,GdkEventConfigure *event,gpointer data){(void)widget;AGWindow *window=(AGWindow*)data;if(!window->closed){AGuiState state={0};state.index=-1;state.width=event->width;state.height=event->height;ag_push(&window->queue,"resize","",&state);}return FALSE;}
void *arya_gui_window(const char *title,int width,int height){if(ag_windows>=AG_MAX_WINDOWS){ag_fail("At most 16 native windows may be alive.");return NULL;}if(!gtk_init_check(NULL,NULL)){ag_fail("Cannot initialize GTK 3: a graphical display is required.");return NULL;}AGWindow *window=(AGWindow*)calloc(1,sizeof *window);if(!window){ag_fail("Cannot allocate native window.");return NULL;}window->window=gtk_window_new(GTK_WINDOW_TOPLEVEL);gtk_window_set_title(GTK_WINDOW(window->window),title);gtk_window_set_default_size(GTK_WINDOW(window->window),width,height);GdkGeometry geometry={0};geometry.min_width=240;geometry.min_height=160;gtk_window_set_geometry_hints(GTK_WINDOW(window->window),NULL,&geometry,GDK_HINT_MIN_SIZE);window->layout=gtk_fixed_new();gtk_container_add(GTK_CONTAINER(window->window),window->layout);g_signal_connect(window->window,"destroy",G_CALLBACK(ag_destroy),window);g_signal_connect(window->window,"configure-event",G_CALLBACK(ag_resize),window);gtk_widget_show_all(window->window);ag_windows++;return window;}
static void ag_items_free(AGControl *control){for(int i=0;i<control->count;i++)free(control->items[i]);free(control->items);control->items=NULL;control->count=0;}
static int ag_apply(AGWindow *window,AGControl *control,const AGuiSpec *spec){
  /* Allocate before changing widgets, so allocation failure is not partial. */
  char **items=NULL;if(spec->mask&AG_ITEMS){items=(char**)calloc(spec->count?spec->count:1,sizeof(char*));if(!items)return ag_fail("Cannot allocate GUI items.");for(int i=0;i<spec->count;i++){items[i]=ag_copy(spec->items[i]);if(!items[i]){for(int j=0;j<i;j++)free(items[j]);free(items);return ag_fail("Cannot allocate GUI item.");}}}
  window->updating=1;if(spec->mask&AG_RECT){gtk_fixed_move(GTK_FIXED(window->layout),control->view,spec->x,spec->y);gtk_widget_set_size_request(control->view,spec->width,spec->height);}
  if(spec->mask&AG_TEXT){switch(control->kind){case AG_LABEL:gtk_label_set_text(GTK_LABEL(control->widget),spec->text);break;case AG_BUTTON:case AG_CHECKBOX:gtk_button_set_label(GTK_BUTTON(control->widget),spec->text);break;case AG_INPUT:gtk_entry_set_text(GTK_ENTRY(control->widget),spec->text);break;case AG_TEXTAREA:gtk_text_buffer_set_text(gtk_text_view_get_buffer(GTK_TEXT_VIEW(control->widget)),spec->text,-1);break;}}
  if(spec->mask&AG_ITEMS){ag_items_free(control);control->items=items;control->count=spec->count;if(control->kind==AG_SELECT){gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(control->widget));for(int i=0;i<spec->count;i++)gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(control->widget),items[i]);gtk_combo_box_set_active(GTK_COMBO_BOX(control->widget),-1);}else{GList *children=gtk_container_get_children(GTK_CONTAINER(control->widget));for(GList *entry=children;entry;entry=entry->next)gtk_widget_destroy(GTK_WIDGET(entry->data));g_list_free(children);for(int i=0;i<spec->count;i++){GtkWidget *label=gtk_label_new(items[i]);gtk_label_set_xalign(GTK_LABEL(label),0);gtk_list_box_insert(GTK_LIST_BOX(control->widget),label,-1);}gtk_widget_show_all(control->widget);gtk_list_box_unselect_all(GTK_LIST_BOX(control->widget));}}
  if(spec->mask&AG_INDEX){if(control->kind==AG_SELECT)gtk_combo_box_set_active(GTK_COMBO_BOX(control->widget),spec->index);else gtk_list_box_select_row(GTK_LIST_BOX(control->widget),spec->index<0?NULL:gtk_list_box_get_row_at_index(GTK_LIST_BOX(control->widget),spec->index));}
  if(spec->mask&AG_CHECKED)gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(control->widget),spec->checked);
  if(spec->mask&AG_VALUE)gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(control->widget),spec->value);
  if(spec->mask&AG_ENABLED){control->enabled=spec->enabled;gtk_widget_set_sensitive(control->view,spec->enabled);}
  window->updating=0;return 1;
}
int arya_gui_add(void *pointer,const AGuiSpec *spec){AGWindow *window=(AGWindow*)pointer;if(window->closed)return ag_fail("Native window is closed.");if(ag_find(window,spec->id))return ag_fail("Control id already exists.");if(window->count>=AG_MAX_CONTROLS)return ag_fail("At most 128 controls per window.");AGControl *control=&window->controls[window->count];memset(control,0,sizeof *control);control->owner=window;control->kind=spec->kind;snprintf(control->id,sizeof control->id,"%s",spec->id);
  switch(spec->kind){case AG_LABEL:control->widget=gtk_label_new("");gtk_label_set_xalign(GTK_LABEL(control->widget),0);break;
    case AG_BUTTON:control->widget=gtk_button_new();g_signal_connect(control->widget,"clicked",G_CALLBACK(ag_clicked),control);break;
    case AG_INPUT:control->widget=gtk_entry_new();gtk_entry_set_max_length(GTK_ENTRY(control->widget),16384);g_signal_connect(control->widget,"changed",G_CALLBACK(ag_changed),control);g_signal_connect(control->widget,"activate",G_CALLBACK(ag_submit),control);break;
    case AG_TEXTAREA:control->widget=gtk_text_view_new();gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(control->widget),GTK_WRAP_WORD_CHAR);control->view=gtk_scrolled_window_new(NULL,NULL);gtk_container_add(GTK_CONTAINER(control->view),control->widget);g_signal_connect(gtk_text_view_get_buffer(GTK_TEXT_VIEW(control->widget)),"changed",G_CALLBACK(ag_changed),control);break;
    case AG_CHECKBOX:control->widget=gtk_check_button_new();g_signal_connect(control->widget,"toggled",G_CALLBACK(ag_changed),control);break;
    case AG_SELECT:control->widget=gtk_combo_box_text_new();g_signal_connect(control->widget,"changed",G_CALLBACK(ag_changed),control);break;
    case AG_LIST:control->widget=gtk_list_box_new();gtk_list_box_set_selection_mode(GTK_LIST_BOX(control->widget),GTK_SELECTION_SINGLE);control->view=gtk_scrolled_window_new(NULL,NULL);gtk_container_add(GTK_CONTAINER(control->view),control->widget);g_signal_connect(control->widget,"row-selected",G_CALLBACK(ag_selected),control);break;
    case AG_PROGRESS:control->widget=gtk_progress_bar_new();break;default:return ag_fail("Unknown widget type.");}
  if(!control->view)control->view=control->widget;gtk_fixed_put(GTK_FIXED(window->layout),control->view,spec->x,spec->y);if(!ag_apply(window,control,spec)){gtk_widget_destroy(control->view);return 0;}window->count++;gtk_widget_show_all(control->view);return 1;
}
int arya_gui_set(void *pointer,const char *id,const AGuiSpec *spec){AGWindow *window=(AGWindow*)pointer;if(window->closed)return ag_fail("Native window is closed.");AGControl *control=ag_find(window,id);if(!control)return ag_fail("Unknown control id.");return ag_apply(window,control,spec);}
int arya_gui_get(void *pointer,const char *id,AGuiState *state){AGWindow *window=(AGWindow*)pointer;if(window->closed)return ag_fail("Native window is closed.");AGControl *control=ag_find(window,id);if(!control)return ag_fail("Unknown control id.");*state=ag_state(control);return state->text?1:ag_fail("Cannot allocate control state.");}
int arya_gui_poll(void *pointer,AGuiEvent *event){AGWindow *window=(AGWindow*)pointer;for(unsigned i=0;i<32&&gtk_events_pending();i++)gtk_main_iteration_do(FALSE);int result=ag_pop(&window->queue,event);return result?result:window->closed?-1:0;}
void arya_gui_close(void *pointer){AGWindow *window=(AGWindow*)pointer;if(!window->closed)gtk_widget_destroy(window->window);}
void arya_gui_release(void *pointer){AGWindow *window=(AGWindow*)pointer;arya_gui_close(window);ag_clear(&window->queue);for(int i=0;i<window->count;i++)ag_items_free(&window->controls[i]);free(window);if(ag_windows)ag_windows--;}
