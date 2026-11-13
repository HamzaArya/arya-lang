/* Direct AppKit controls. No WebKit, HTTP server, JavaScript or external host. */
#import <Cocoa/Cocoa.h>
#include "common.h"
@interface AGFlipped : NSView @end
@implementation AGFlipped
- (BOOL)isFlipped { return YES; }
@end
@class AGWindow;
@interface AGControl : NSObject <NSTableViewDataSource,NSTableViewDelegate,NSTextFieldDelegate,NSTextViewDelegate>
@property(nonatomic,weak) AGWindow *owner;
@property(nonatomic,copy) NSString *identifier;
@property(nonatomic) int kind;
@property(nonatomic,strong) NSView *view;
@property(nonatomic,strong) NSView *widget;
@property(nonatomic,strong) NSArray<NSString *> *items;
@end
@interface AGWindow : NSObject <NSWindowDelegate> { @public AGuiQueue _queue; }
@property(nonatomic,strong) NSWindow *window;
@property(nonatomic,strong) NSMutableDictionary<NSString *,AGControl *> *controls;
@property(nonatomic) BOOL closed;
@property(nonatomic) BOOL updating;
- (void)emit:(NSString *)type control:(AGControl *)control;
@end
static NSString *ag_string(const char *text){return [NSString stringWithUTF8String:text ?: ""] ?: @"";}
static AGuiState ag_state(AGControl *control){
  AGuiState state={0};state.index=-1;NSString *text=@"";
  switch(control.kind){
    case AG_LABEL:case AG_INPUT:text=((NSTextField *)control.widget).stringValue;break;
    case AG_BUTTON:text=((NSButton *)control.widget).title;break;
    case AG_TEXTAREA:text=((NSTextView *)control.widget).string;break;
    case AG_CHECKBOX:text=((NSButton *)control.widget).title;state.checked=((NSButton *)control.widget).state==NSControlStateValueOn;break;
    case AG_SELECT:state.index=(int)((NSPopUpButton *)control.widget).indexOfSelectedItem;if(state.index>=0&&state.index<(int)control.items.count)text=control.items[state.index];break;
    case AG_LIST:state.index=(int)((NSTableView *)control.widget).selectedRow;if(state.index>=0&&state.index<(int)control.items.count)text=control.items[state.index];break;
    case AG_PROGRESS:state.value=((NSProgressIndicator *)control.widget).doubleValue;break;
  }
  state.text=ag_copy(text.UTF8String);state.width=(int)control.view.frame.size.width;state.height=(int)control.view.frame.size.height;return state;
}
@implementation AGControl
- (void)activate:(id)sender { (void)sender;[self.owner emit:self.kind==AG_BUTTON?@"click":self.kind==AG_INPUT?@"submit":@"change" control:self]; }
- (void)controlTextDidChange:(NSNotification *)notification { (void)notification;NSTextField *field=(NSTextField *)self.widget;if(field.stringValue.length>16384){char *text=ag_copy(field.stringValue.UTF8String);field.stringValue=ag_string(text);free(text);}[self.owner emit:@"change" control:self]; }
- (void)textDidChange:(NSNotification *)notification { (void)notification;NSTextView *field=(NSTextView *)self.widget;if(field.string.length>16384){char *text=ag_copy(field.string.UTF8String);field.string=ag_string(text);free(text);}[self.owner emit:@"change" control:self]; }
- (NSInteger)numberOfRowsInTableView:(NSTableView *)table { (void)table;return self.items.count; }
- (id)tableView:(NSTableView *)table objectValueForTableColumn:(NSTableColumn *)column row:(NSInteger)row { (void)table;(void)column;return self.items[row]; }
- (void)tableViewSelectionDidChange:(NSNotification *)notification { (void)notification;[self.owner emit:@"change" control:self]; }
@end
@implementation AGWindow
- (void)emit:(NSString *)type control:(AGControl *)control { if(self.updating||self.closed)return;AGuiState state=ag_state(control);ag_push(&_queue,type.UTF8String,control.identifier.UTF8String,&state);arya_gui_dispose_state(&state); }
- (void)windowWillClose:(NSNotification *)notification { (void)notification;if(!self.closed){self.closed=YES;AGuiState state={0};state.index=-1;ag_push(&_queue,"close","",&state);} }
- (void)windowDidResize:(NSNotification *)notification { (void)notification;if(self.closed)return;AGuiState state={0};state.index=-1;state.width=(int)self.window.contentView.bounds.size.width;state.height=(int)self.window.contentView.bounds.size.height;ag_push(&_queue,"resize","",&state); }
@end
@interface AGApplication : NSObject <NSApplicationDelegate> @end
@implementation AGApplication
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)application { for(NSWindow *window in application.windows)[window performClose:nil];return NSTerminateCancel; }
@end
static AGApplication *ag_application;
const char *arya_gui_platform(void){return "appkit";}
void *arya_gui_window(const char *title,int width,int height){@autoreleasepool{
  if(![NSThread isMainThread]){ag_fail("GUI must be created on the main thread.");return NULL;}if(ag_windows>=AG_MAX_WINDOWS){ag_fail("At most 16 native windows may be alive.");return NULL;}
  [NSApplication sharedApplication];if(!ag_application){ag_application=[AGApplication new];NSApp.delegate=ag_application;[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    NSMenu *menu=[NSMenu new];NSMenuItem *app=[NSMenuItem new];[menu addItem:app];NSMenu *actions=[NSMenu new];[actions addItemWithTitle:@"Quit" action:@selector(terminate:) keyEquivalent:@"q"];app.submenu=actions;
    NSMenuItem *edit=[NSMenuItem new];edit.title=@"Edit";[menu addItem:edit];NSMenu *editing=[[NSMenu alloc]initWithTitle:@"Edit"];[editing addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];[editing addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];[editing addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];[editing addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];[editing addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];edit.submenu=editing;NSApp.mainMenu=menu;[NSApp finishLaunching];}
  AGWindow *holder=[AGWindow new];holder.controls=[NSMutableDictionary new];holder.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,width,height) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];holder.window.releasedWhenClosed=NO;holder.window.delegate=holder;holder.window.title=ag_string(title);holder.window.contentMinSize=NSMakeSize(240,160);holder.window.contentView=[[AGFlipped alloc]initWithFrame:NSMakeRect(0,0,width,height)];[holder.window center];[holder.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];ag_windows++;return (__bridge_retained void *)holder;
}}
static int ag_alive(AGWindow *window){return window&&!window.closed?1:ag_fail("Native window is closed.");}
static int ag_apply(AGWindow *window,AGControl *control,const AGuiSpec *spec){
  window.updating=YES;
  if(spec->mask&AG_RECT){control.view.frame=NSMakeRect(spec->x,spec->y,spec->width,spec->height);if(control.kind==AG_LIST){NSTableView *table=(NSTableView *)control.widget;table.tableColumns.firstObject.width=MAX(40,spec->width-4);}}
  if(spec->mask&AG_TEXT){NSString *text=ag_string(spec->text);switch(control.kind){case AG_LABEL:case AG_INPUT:((NSTextField *)control.widget).stringValue=text;break;case AG_BUTTON:case AG_CHECKBOX:((NSButton *)control.widget).title=text;break;case AG_TEXTAREA:((NSTextView *)control.widget).string=text;break;}}
  if(spec->mask&AG_ITEMS){NSMutableArray *items=[NSMutableArray new];for(int i=0;i<spec->count;i++)[items addObject:ag_string(spec->items[i])];control.items=items;
    if(control.kind==AG_SELECT){NSPopUpButton *popup=(NSPopUpButton *)control.widget;[popup removeAllItems];for(NSString *text in items){NSMenuItem *item=[[NSMenuItem alloc]initWithTitle:text action:nil keyEquivalent:@""];[popup.menu addItem:item];}[popup selectItemAtIndex:-1];}
    if(control.kind==AG_LIST){NSTableView *table=(NSTableView *)control.widget;[table reloadData];[table deselectAll:nil];}}
  if(spec->mask&AG_INDEX){if(control.kind==AG_SELECT)[(NSPopUpButton *)control.widget selectItemAtIndex:spec->index];else if(control.kind==AG_LIST){NSTableView *table=(NSTableView *)control.widget;if(spec->index<0)[table deselectAll:nil];else{[table selectRowIndexes:[NSIndexSet indexSetWithIndex:spec->index] byExtendingSelection:NO];[table scrollRowToVisible:spec->index];}}}
  if(spec->mask&AG_CHECKED)((NSButton *)control.widget).state=spec->checked?NSControlStateValueOn:NSControlStateValueOff;
  if(spec->mask&AG_VALUE)((NSProgressIndicator *)control.widget).doubleValue=spec->value;
  if(spec->mask&AG_ENABLED){if([control.widget isKindOfClass:NSControl.class])((NSControl *)control.widget).enabled=spec->enabled;if(control.kind==AG_TEXTAREA)((NSTextView *)control.widget).editable=spec->enabled;}
  window.updating=NO;return 1;
}
int arya_gui_add(void *pointer,const AGuiSpec *spec){@autoreleasepool{AGWindow *window=(__bridge AGWindow *)pointer;if(!ag_alive(window))return 0;NSString *identifier=ag_string(spec->id);if(window.controls[identifier])return ag_fail("Control id already exists.");if(window.controls.count>=AG_MAX_CONTROLS)return ag_fail("At most 128 controls per window.");
  AGControl *control=[AGControl new];control.owner=window;control.identifier=identifier;control.kind=spec->kind;control.items=@[];NSRect rect=NSMakeRect(spec->x,spec->y,spec->width,spec->height);
  switch(spec->kind){
    case AG_LABEL:control.widget=[NSTextField labelWithString:ag_string(spec->text)];break;
    case AG_BUTTON:case AG_CHECKBOX:{NSButton *button=[NSButton new];button.buttonType=spec->kind==AG_CHECKBOX?NSButtonTypeSwitch:NSButtonTypeMomentaryPushIn;button.bezelStyle=NSBezelStyleRounded;button.target=control;button.action=@selector(activate:);control.widget=button;break;}
    case AG_INPUT:{NSTextField *field=[NSTextField new];field.delegate=control;field.target=control;field.action=@selector(activate:);control.widget=field;break;}
    case AG_TEXTAREA:{NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:rect];scroll.borderType=NSBezelBorder;scroll.hasVerticalScroller=YES;NSTextView *text=[[NSTextView alloc]initWithFrame:scroll.contentView.bounds];text.richText=NO;text.allowsUndo=YES;text.font=[NSFont systemFontOfSize:13];text.verticallyResizable=YES;text.horizontallyResizable=NO;text.autoresizingMask=NSViewWidthSizable;text.textContainer.widthTracksTextView=YES;text.delegate=control;scroll.documentView=text;control.widget=text;control.view=scroll;break;}
    case AG_SELECT:{NSPopUpButton *popup=[[NSPopUpButton alloc]initWithFrame:rect pullsDown:NO];popup.target=control;popup.action=@selector(activate:);control.widget=popup;break;}
    case AG_LIST:{NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:rect];scroll.hasVerticalScroller=YES;scroll.borderType=NSBezelBorder;NSTableView *table=[[NSTableView alloc]initWithFrame:scroll.contentView.bounds];NSTableColumn *column=[[NSTableColumn alloc]initWithIdentifier:@"value"];column.width=MAX(40,spec->width-4);[table addTableColumn:column];table.headerView=nil;table.allowsEmptySelection=YES;table.allowsMultipleSelection=NO;table.delegate=control;table.dataSource=control;scroll.documentView=table;control.widget=table;control.view=scroll;break;}
    case AG_PROGRESS:{NSProgressIndicator *progress=[NSProgressIndicator new];progress.indeterminate=NO;progress.minValue=0;progress.maxValue=1;control.widget=progress;break;}
    default:return ag_fail("Unknown widget type.");
  }
  if(!control.view)control.view=control.widget;window.controls[identifier]=control;[window.window.contentView addSubview:control.view];return ag_apply(window,control,spec);
}}
int arya_gui_set(void *pointer,const char *id,const AGuiSpec *spec){@autoreleasepool{AGWindow *window=(__bridge AGWindow *)pointer;if(!ag_alive(window))return 0;AGControl *control=window.controls[ag_string(id)];if(!control)return ag_fail("Unknown control id.");return ag_apply(window,control,spec);}}
int arya_gui_get(void *pointer,const char *id,AGuiState *state){@autoreleasepool{AGWindow *window=(__bridge AGWindow *)pointer;if(!ag_alive(window))return 0;AGControl *control=window.controls[ag_string(id)];if(!control)return ag_fail("Unknown control id.");*state=ag_state(control);return state->text?1:ag_fail("Cannot allocate control state.");}}
int arya_gui_poll(void *pointer,AGuiEvent *event){@autoreleasepool{AGWindow *window=(__bridge AGWindow *)pointer;for(unsigned i=0;i<32;i++){NSEvent *next=[NSApp nextEventMatchingMask:NSEventMaskAny untilDate:NSDate.distantPast inMode:NSDefaultRunLoopMode dequeue:YES];if(!next)break;[NSApp sendEvent:next];}CFRunLoopRunInMode(kCFRunLoopDefaultMode,0,true);[NSApp updateWindows];int result=ag_pop(&window->_queue,event);return result?result:window.closed?-1:0;}}
void arya_gui_close(void *pointer){@autoreleasepool{AGWindow *window=(__bridge AGWindow *)pointer;if(!window.closed)[window.window close];}}
void arya_gui_release(void *pointer){@autoreleasepool{AGWindow *window=(__bridge_transfer AGWindow *)pointer;if(!window.closed)[window.window close];ag_clear(&window->_queue);window.window.delegate=nil;[window.controls removeAllObjects];if(ag_windows)ag_windows--;}}
