#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <signal.h>
#include <unistd.h>

static NSString *StringValue(id value) {
    if (!value || value == NSNull.null) return @"";
    return [value isKindOfClass:NSString.class] ? value : [value description];
}
static NSDictionary *Failure(NSString *message) { return @{@"ok":@NO, @"message":message ?: @"Operation failed."}; }
static NSDictionary *RunWorker(NSString *executable, NSString *store, NSString *command, NSDictionary *body) {
    @autoreleasepool {
        NSError *error = nil;
        NSData *input = [NSJSONSerialization dataWithJSONObject:body options:0 error:&error];
        if (!input || input.length > 131072) return Failure(@"The form is too large. Use less than 128 KiB of input.");
        NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
        NSFileManager *fm = NSFileManager.defaultManager;
        if (![fm createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error]) return Failure(error.localizedDescription);
        NSString *outPath = [directory stringByAppendingPathComponent:@"output"];
        NSString *errPath = [directory stringByAppendingPathComponent:@"error"];
        [fm createFileAtPath:outPath contents:nil attributes:@{NSFilePosixPermissions:@0600}];
        [fm createFileAtPath:errPath contents:nil attributes:@{NSFilePosixPermissions:@0600}];
        NSFileHandle *out = [NSFileHandle fileHandleForWritingAtPath:outPath];
        NSFileHandle *err = [NSFileHandle fileHandleForWritingAtPath:errPath];
        NSTask *task = [NSTask new];
        task.executableURL = [NSURL fileURLWithPath:executable];
        task.arguments = @[command, [[NSString alloc] initWithData:input encoding:NSUTF8StringEncoding]];
        NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
        environment[@"DATA_FILE"] = store;
        task.environment = environment;
        task.currentDirectoryURL = [NSURL fileURLWithPath:store.stringByDeletingLastPathComponent];
        task.standardOutput = out; task.standardError = err;
        NSDictionary *answer = nil;
        if (![task launchAndReturnError:&error]) answer = Failure([@"Cannot start the Arya engine: " stringByAppendingString:error.localizedDescription]);
        else {
            NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];
            while (task.running && deadline.timeIntervalSinceNow > 0) [NSThread sleepForTimeInterval:0.02];
            if (task.running) {
                [task terminate];
                for (int i=0; i<50 && task.running; i++) [NSThread sleepForTimeInterval:0.02];
                if (task.running) kill(task.processIdentifier, SIGKILL);
                [task waitUntilExit];
                answer = Failure(@"The operation exceeded 20 seconds. Refresh to check whether it saved before retrying.");
            } else [task waitUntilExit];
            [out closeFile]; [err closeFile];
            unsigned long long size = [[fm attributesOfItemAtPath:outPath error:nil] fileSize];
            NSData *output = size <= 8388608 ? [NSData dataWithContentsOfFile:outPath] : nil;
            if (!answer && task.terminationStatus == 0 && output) {
                id value = [NSJSONSerialization JSONObjectWithData:output options:0 error:&error];
                if ([value isKindOfClass:NSDictionary.class] && [value[@"ok"] isKindOfClass:NSNumber.class]) answer = value;
                else answer = Failure(@"The Arya engine returned an invalid response. Your data was not reset.");
            }
            if (!answer) {
                NSString *detail = [NSString stringWithContentsOfFile:errPath encoding:NSUTF8StringEncoding error:nil];
                if (detail.length > 1800) detail = [detail substringToIndex:1800];
                answer = Failure([NSString stringWithFormat:@"The Arya engine could not complete this operation.\n%@", detail ?: @"Check the data file and available disk space."]);
            }
        }
        [out closeFile]; [err closeFile];
        [fm removeItemAtPath:directory error:nil];
        return answer;
    }
}

@interface NativeController : NSObject <NSApplicationDelegate, NSWindowDelegate, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate>
@property NSDictionary *config;
@property NSString *worker;
@property NSString *store;
@property NSWindow *window;
@property NSTableView *table;
@property NSSearchField *search;
@property NSSegmentedControl *views;
@property NSStackView *actions;
@property NSTextField *summary;
@property NSTextField *status;
@property NSTextView *detail;
@property NSProgressIndicator *progress;
@property NSArray<NSDictionary *> *rows;
@property NSArray<NSDictionary *> *filtered;
@property NSArray<NSDictionary *> *columns;
@property BOOL busy;
@property BOOL editing;
@property int lockFD;
@end

@implementation NativeController
- (NSDictionary *)currentView { return self.config[@"views"][self.views.selectedSegment]; }
- (NSString *)viewID { return [self currentView][@"id"]; }
- (NSDictionary *)selection {
    NSInteger index = self.table.selectedRow;
    return index >= 0 && index < (NSInteger)self.filtered.count ? self.filtered[index] : nil;
}
- (NSTextField *)label:(NSString *)text size:(CGFloat)size bold:(BOOL)bold {
    NSTextField *field = [NSTextField labelWithString:text ?: @""];
    field.font = bold ? [NSFont boldSystemFontOfSize:size] : [NSFont systemFontOfSize:size];
    field.lineBreakMode = NSLineBreakByTruncatingTail;
    return field;
}
- (NSButton *)button:(NSString *)title action:(SEL)action {
    NSButton *button = [NSButton buttonWithTitle:title target:self action:action];
    button.bezelStyle = NSBezelStyleRounded;
    return button;
}
- (void)alert:(NSString *)title message:(NSString *)message {
    NSAlert *alert = [NSAlert new]; alert.messageText = title; alert.informativeText = message ?: @"";
    [alert addButtonWithTitle:@"OK"]; [alert beginSheetModalForWindow:self.window completionHandler:nil];
}
- (void)setWorking:(BOOL)working {
    self.busy = working; self.views.enabled = !working;
    for (NSView *view in self.actions.arrangedSubviews) if ([view isKindOfClass:NSButton.class]) ((NSButton *)view).enabled = !working;
    if (working) [self.progress startAnimation:nil]; else [self.progress stopAnimation:nil];
}
- (void)menu {
    NSMenu *bar = [NSMenu new];
    NSMenuItem *app = [NSMenuItem new]; NSMenu *appMenu = [NSMenu new];
    NSMenuItem *about = [appMenu addItemWithTitle:[@"About " stringByAppendingString:self.config[@"name"]] action:@selector(showAbout:) keyEquivalent:@""]; about.target = self;
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Quit" action:@selector(terminate:) keyEquivalent:@"q"];
    app.submenu = appMenu; [bar addItem:app];
    NSMenuItem *file = [NSMenuItem new]; file.title = @"File"; NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
    NSMenuItem *refresh = [fileMenu addItemWithTitle:@"Refresh" action:@selector(refresh:) keyEquivalent:@"r"]; refresh.target=self;
    NSMenuItem *export = [fileMenu addItemWithTitle:@"Export visible rows…" action:@selector(exportCSV:) keyEquivalent:@"e"]; export.target=self;
    NSMenuItem *reveal = [fileMenu addItemWithTitle:@"Show data folder" action:@selector(revealData:) keyEquivalent:@""]; reveal.target=self;
    [fileMenu addItem:NSMenuItem.separatorItem]; [fileMenu addItemWithTitle:@"Close window" action:@selector(performClose:) keyEquivalent:@"w"];
    file.submenu=fileMenu; [bar addItem:file];
    NSMenuItem *edit = [NSMenuItem new]; edit.title=@"Edit"; NSMenu *editMenu=[[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    edit.submenu=editMenu; [bar addItem:edit]; NSApp.mainMenu=bar;
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    [self menu];
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1120,780) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title=self.config[@"name"]; self.window.minSize=NSMakeSize(960,650); self.window.delegate=self; self.window.releasedWhenClosed=NO;
    NSStackView *root=[NSStackView new]; root.orientation=NSUserInterfaceLayoutOrientationVertical; root.alignment=NSLayoutAttributeLeading; root.spacing=12; root.translatesAutoresizingMaskIntoConstraints=NO;
    [self.window.contentView addSubview:root];
    [NSLayoutConstraint activateConstraints:@[[root.leadingAnchor constraintEqualToAnchor:self.window.contentView.leadingAnchor constant:22],[root.trailingAnchor constraintEqualToAnchor:self.window.contentView.trailingAnchor constant:-22],[root.topAnchor constraintEqualToAnchor:self.window.contentView.topAnchor constant:20],[root.bottomAnchor constraintEqualToAnchor:self.window.contentView.bottomAnchor constant:-18]]];
    [root addArrangedSubview:[self label:self.config[@"name"] size:25 bold:YES]];
    NSTextField *subtitle=[self label:self.config[@"subtitle"] size:13 bold:NO]; subtitle.textColor=NSColor.secondaryLabelColor; [root addArrangedSubview:subtitle];
    self.views=[NSSegmentedControl new]; self.views.segmentCount=[self.config[@"views"] count]; self.views.trackingMode=NSSegmentSwitchTrackingSelectOne; self.views.target=self; self.views.action=@selector(changeView:); self.views.selectedSegment=0;
    for (NSInteger i=0;i<self.views.segmentCount;i++) [self.views setLabel:self.config[@"views"][i][@"label"] forSegment:i];
    [root addArrangedSubview:self.views];
    self.actions=[NSStackView new]; self.actions.orientation=NSUserInterfaceLayoutOrientationHorizontal; self.actions.spacing=8; [root addArrangedSubview:self.actions];
    NSStackView *utility=[NSStackView new]; utility.orientation=NSUserInterfaceLayoutOrientationHorizontal; utility.spacing=8;
    self.search=[[NSSearchField alloc] initWithFrame:NSMakeRect(0,0,280,28)]; self.search.placeholderString=@"Search this view"; self.search.delegate=self; self.search.accessibilityLabel=@"Search this view"; [self.search.widthAnchor constraintEqualToConstant:280].active=YES;
    [utility addArrangedSubview:self.search]; [utility addArrangedSubview:[self button:@"Refresh" action:@selector(refresh:)]]; [utility addArrangedSubview:[self button:@"Export CSV…" action:@selector(exportCSV:)]];
    self.progress=[NSProgressIndicator new]; self.progress.style=NSProgressIndicatorStyleSpinning; self.progress.displayedWhenStopped=NO; [utility addArrangedSubview:self.progress]; [root addArrangedSubview:utility];
    self.summary=[self label:@"Loading…" size:13 bold:YES]; [root addArrangedSubview:self.summary];
    self.table=[NSTableView new]; self.table.delegate=self; self.table.dataSource=self; self.table.usesAlternatingRowBackgroundColors=YES; self.table.rowHeight=30; self.table.allowsMultipleSelection=NO; self.table.columnAutoresizingStyle=NSTableViewUniformColumnAutoresizingStyle; self.table.accessibilityLabel=[self.config[@"name"] stringByAppendingString:@" records"];
    NSScrollView *tableScroll=[NSScrollView new]; tableScroll.documentView=self.table; tableScroll.hasVerticalScroller=YES; tableScroll.hasHorizontalScroller=YES; tableScroll.borderType=NSBezelBorder;
    [root addArrangedSubview:tableScroll]; [tableScroll.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES; [tableScroll.heightAnchor constraintGreaterThanOrEqualToConstant:230].active=YES;
    [root addArrangedSubview:[self label:@"Selected record" size:12 bold:YES]];
    self.detail=[NSTextView new]; self.detail.editable=NO; self.detail.selectable=YES; self.detail.font=[NSFont systemFontOfSize:12]; self.detail.textContainerInset=NSMakeSize(10,8); self.detail.accessibilityLabel=@"Selected record details";
    NSScrollView *details=[NSScrollView new]; details.documentView=self.detail; details.hasVerticalScroller=YES; details.borderType=NSBezelBorder; [root addArrangedSubview:details]; [details.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES; [details.heightAnchor constraintEqualToConstant:100].active=YES;
    self.status=[self label:@"Ready" size:12 bold:NO]; self.status.textColor=NSColor.secondaryLabelColor; self.status.accessibilityLabel=@"Operation status"; [root addArrangedSubview:self.status]; [self.status.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES;
    self.rows=@[]; self.filtered=@[];
    [self.window center]; [self.window makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES];
    [self changeView:nil];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { (void)sender; return YES; }
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    (void)sender;
    if (self.busy || self.editing) { if(!self.editing) [self alert:@"Operation in progress" message:@"Wait for the operation to finish before quitting."]; return NSTerminateCancel; }
    return NSTerminateNow;
}
- (BOOL)windowShouldClose:(NSWindow *)sender { (void)sender; return !self.busy && !self.editing; }
- (void)applicationWillTerminate:(NSNotification *)notification { (void)notification; if (self.lockFD>=0) close(self.lockFD); }
- (void)changeView:(id)sender {
    (void)sender; if(self.busy || self.editing) return;
    self.search.stringValue=@""; self.rows=@[]; self.filtered=@[]; [self.table deselectAll:nil]; [self.table reloadData]; self.detail.string=@"Select a row to see its details.";
    for (NSTableColumn *column in [self.table.tableColumns copy]) [self.table removeTableColumn:column];
    self.columns=[self currentView][@"columns"];
    for (NSDictionary *column in self.columns) { NSTableColumn *item=[[NSTableColumn alloc] initWithIdentifier:column[@"key"]]; item.title=column[@"label"]; item.width=column[@"width"] ? [column[@"width"] doubleValue] : 150; item.minWidth=70; [self.table addTableColumn:item]; }
    for (NSView *view in [self.actions.arrangedSubviews copy]) { [self.actions removeArrangedSubview:view]; [view removeFromSuperview]; }
    NSArray *actions=self.config[@"actions"];
    for (NSUInteger i=0;i<actions.count;i++) { NSDictionary *action=actions[i]; if (action[@"view"] && ![action[@"view"] isEqual:[self viewID]]) continue; NSButton *button=[self button:action[@"label"] action:@selector(actionClicked:)]; button.tag=i; [self.actions addArrangedSubview:button]; }
    [self.table reloadData]; [self refresh:nil];
}
- (void)refresh:(id)sender { (void)sender; if(!self.busy && !self.editing) [self invoke:@"list" body:@{@"view":[self viewID]}]; }
- (void)invoke:(NSString *)command body:(NSDictionary *)body {
    if(self.busy || self.editing) return;
    NSString *selected=StringValue([self selection][@"id"]);
    [self setWorking:YES]; self.status.stringValue=@"Working…";
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
        NSDictionary *result=RunWorker(self.worker,self.store,command,body);
        dispatch_async(dispatch_get_main_queue(), ^{
            [self setWorking:NO];
            NSString *message=StringValue(result[@"message"]);
            self.status.stringValue=message.length ? message : @"Ready";
            if (![result[@"ok"] boolValue]) { [self alert:@"Could not complete the operation" message:message]; return; }
            if (![result[@"rows"] isKindOfClass:NSArray.class]) { [self alert:@"Invalid application response" message:@"Expected a list of records. Your data was not reset."]; return; }
            self.rows=result[@"rows"]; self.summary.stringValue=StringValue(result[@"summary"]); [self filterRows];
            for (NSUInteger i=0;i<self.filtered.count;i++) if (selected.length && [StringValue(self.filtered[i][@"id"]) isEqual:selected]) { [self.table selectRowIndexes:[NSIndexSet indexSetWithIndex:i] byExtendingSelection:NO]; break; }
        });
    });
}
- (void)filterRows {
    NSString *query=self.search.stringValue.lowercaseString;
    if (!query.length) self.filtered=self.rows;
    else self.filtered=[self.rows filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSDictionary *row, NSDictionary *bindings) { (void)bindings; for(id value in row.allValues) if ([StringValue(value).lowercaseString containsString:query]) return YES; return NO; }]];
    [self.table reloadData]; [self tableViewSelectionDidChange:[NSNotification notificationWithName:NSTableViewSelectionDidChangeNotification object:self.table]];
}
- (void)controlTextDidChange:(NSNotification *)notification { if(notification.object==self.search) [self filterRows]; }
- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView { (void)tableView; return self.filtered.count; }
- (NSView *)tableView:(NSTableView *)tableView viewForTableColumn:(NSTableColumn *)column row:(NSInteger)row {
    (void)tableView; if(row<0 || row>=(NSInteger)self.filtered.count) return [NSTextField labelWithString:@""]; NSTextField *field=[NSTextField labelWithString:StringValue(self.filtered[row][column.identifier])]; field.lineBreakMode=NSLineBreakByTruncatingTail; field.toolTip=field.stringValue; return field;
}
- (void)tableViewSelectionDidChange:(NSNotification *)notification {
    (void)notification; NSDictionary *row=[self selection];
    if(!row) { self.detail.string=@"Select a row to see its details."; return; }
    NSMutableArray *lines=[NSMutableArray new]; NSMutableSet *shown=[NSMutableSet new];
    for (NSDictionary *column in self.columns) { [lines addObject:[NSString stringWithFormat:@"%@: %@",column[@"label"],StringValue(row[column[@"key"]])]]; [shown addObject:column[@"key"]]; }
    for (NSString *key in [[row allKeys] sortedArrayUsingSelector:@selector(compare:)]) if(![shown containsObject:key] && ![@[@"id",@"version"] containsObject:key]) [lines addObject:[NSString stringWithFormat:@"%@: %@",key,StringValue(row[key])]];
    self.detail.string=[lines componentsJoinedByString:@"\n"];
}
- (void)actionClicked:(NSButton *)button {
    if(self.busy || self.editing) return;
    NSDictionary *action=self.config[@"actions"][button.tag]; NSDictionary *selected=[self selection];
    if([action[@"selection"] boolValue] && !selected) { [self alert:@"Select a record first" message:@"Choose a row in the table, then use this action."]; return; }
    NSMutableDictionary *base=[@{@"view":[self viewID]} mutableCopy];
    if([action[@"selection"] boolValue]) { if(selected[@"id"]) base[@"id"]=selected[@"id"]; if(selected[@"version"]) base[@"version"]=selected[@"version"]; }
    NSArray *fields=action[@"fields"] ?: @[];
    if(fields.count==0) {
        if([action[@"destructive"] boolValue]) { self.editing=YES; NSAlert *alert=[NSAlert new]; alert.messageText=action[@"label"]; alert.informativeText=@"This changes the selected record. Continue?"; [alert addButtonWithTitle:@"Continue"]; [alert addButtonWithTitle:@"Cancel"]; [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) { self.editing=NO; if(response==NSAlertFirstButtonReturn) [self invoke:action[@"command"] body:base]; }]; }
        else [self invoke:action[@"command"] body:base];
        return;
    }
    [self setWorking:YES];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
        NSMutableDictionary *choices=[NSMutableDictionary new]; NSString *failure=nil;
        for(NSDictionary *field in fields) if(field[@"optionsView"]) {
            NSDictionary *result=RunWorker(self.worker,self.store,@"list",@{@"view":field[@"optionsView"]});
            if(![result[@"ok"] boolValue]) { failure=StringValue(result[@"message"]); break; }
            NSMutableArray *values=[NSMutableArray new];
            if(![field[@"required"] boolValue]) [values addObject:@{@"value":@"",@"label":@"Unassigned"}];
            for(NSDictionary *row in result[@"rows"]) [values addObject:@{@"value":StringValue(row[field[@"valueKey"] ?: @"id"]),@"label":StringValue(row[field[@"labelKey"] ?: @"name"])}];
            choices[field[@"key"]]=values;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            [self setWorking:NO];
            if(failure) { [self alert:@"Could not load choices" message:failure]; return; }
            [self presentForm:action fields:fields choices:choices selected:selected base:base];
        });
    });
}
- (void)presentForm:(NSDictionary *)action fields:(NSArray *)fields choices:(NSDictionary *)choices selected:(NSDictionary *)selected base:(NSMutableDictionary *)base {
    self.editing=YES;
    NSAlert *alert=[NSAlert new]; alert.messageText=action[@"label"]; alert.informativeText=action[@"_error"] ?: @"Complete the fields below. Required fields are marked *."; [alert addButtonWithTitle:@"Save"]; [alert addButtonWithTitle:@"Cancel"];
    NSStackView *form=[NSStackView new]; form.orientation=NSUserInterfaceLayoutOrientationVertical; form.alignment=NSLayoutAttributeLeading; form.spacing=7;
    NSMutableDictionary *controls=[NSMutableDictionary new]; NSMutableDictionary *optionValues=[NSMutableDictionary new];
    CGFloat total=0;
    for(NSDictionary *field in fields) {
        NSString *label=field[@"label"]; if([field[@"required"] boolValue]) label=[label stringByAppendingString:@" *"];
        [form addArrangedSubview:[self label:label size:12 bold:YES]]; total+=24;
        NSString *key=field[@"key"]; id initial=nil;
        if(action[@"_error"]) initial=base[key];
        else if([action[@"selection"] boolValue]) initial=selected[field[@"source"] ?: key];
        if(!initial || initial==NSNull.null) initial=field[@"default"] ?: @"";
        NSView *view=nil;
        if([field[@"type"] isEqual:@"multiline"]) {
            NSTextView *input=[NSTextView new]; input.font=[NSFont systemFontOfSize:13]; input.string=StringValue(initial); input.richText=NO; input.automaticQuoteSubstitutionEnabled=NO; input.automaticDashSubstitutionEnabled=NO; input.accessibilityLabel=field[@"label"];
            NSScrollView *scroll=[NSScrollView new]; scroll.documentView=input; scroll.hasVerticalScroller=YES; scroll.borderType=NSBezelBorder; [scroll.heightAnchor constraintEqualToConstant:92].active=YES; controls[key]=input; view=scroll; total+=99;
        } else if([field[@"type"] isEqual:@"choice"]) {
            NSPopUpButton *input=[NSPopUpButton new]; NSArray *options=choices[key] ?: field[@"choices"] ?: @[]; optionValues[key]=options;
            for(NSDictionary *option in options) { NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:option[@"label"] action:nil keyEquivalent:@""]; item.representedObject=option[@"value"]; [input.menu addItem:item]; }
            for(NSUInteger i=0;i<options.count;i++) if([StringValue(options[i][@"value"]) isEqual:StringValue(initial)]) [input selectItemAtIndex:i];
            input.accessibilityLabel=field[@"label"]; controls[key]=input; view=input; total+=32;
        } else {
            NSTextField *input=[NSTextField new]; input.stringValue=StringValue(initial); input.placeholderString=field[@"placeholder"] ?: @""; input.accessibilityLabel=field[@"label"]; controls[key]=input; view=input; total+=30;
        }
        [form addArrangedSubview:view]; [view.widthAnchor constraintEqualToConstant:450].active=YES;
    }
    form.frame=NSMakeRect(0,0,450,total); alert.accessoryView=form;
    [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
        self.editing=NO;
        if(response!=NSAlertFirstButtonReturn) return;
        for(NSDictionary *field in fields) {
            id input=controls[field[@"key"]]; NSString *value=@"";
            if([input isKindOfClass:NSTextView.class]) value=((NSTextView *)input).string;
            else if([input isKindOfClass:NSPopUpButton.class]) { value=StringValue(((NSPopUpButton *)input).selectedItem.representedObject); }
            else value=((NSTextField *)input).stringValue;
            base[field[@"key"]]=value;
        }
        [self setWorking:YES]; self.status.stringValue=@"Saving…";
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
            NSDictionary *result=RunWorker(self.worker,self.store,action[@"command"],base);
            dispatch_async(dispatch_get_main_queue(), ^{
                [self setWorking:NO]; self.status.stringValue=StringValue(result[@"message"]);
                if(![result[@"ok"] boolValue]) {
                    NSMutableDictionary *retry=[action mutableCopy]; retry[@"_error"]=StringValue(result[@"message"]);
                    [self presentForm:retry fields:fields choices:choices selected:selected base:base]; return;
                }
                if(![result[@"rows"] isKindOfClass:NSArray.class]) { [self alert:@"Invalid application response" message:@"Expected a list of records."]; return; }
                self.rows=result[@"rows"]; self.summary.stringValue=StringValue(result[@"summary"]); [self filterRows];
            });
        });
    }];
    id first=fields.count ? controls[fields[0][@"key"]] : nil; if(first) [alert.window makeFirstResponder:first];
}
- (void)exportCSV:(id)sender {
    (void)sender; if(self.busy || self.editing) return;
    NSMutableArray *lines=[NSMutableArray new]; NSMutableArray *header=[NSMutableArray new];
    NSString *(^quote)(NSString *)=^NSString *(NSString *s) { if(s.length && [@[@"=",@"+",@"-",@"@",@"\t",@"\r"] containsObject:[s substringToIndex:1]]) s=[@"'" stringByAppendingString:s]; return [NSString stringWithFormat:@"\"%@\"",[s stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""]]; };
    for(NSDictionary *column in self.columns) [header addObject:quote(column[@"label"])]; [lines addObject:[header componentsJoinedByString:@","]];
    for(NSDictionary *row in self.filtered) { NSMutableArray *cells=[NSMutableArray new]; for(NSDictionary *column in self.columns) [cells addObject:quote(StringValue(row[column[@"key"]]))]; [lines addObject:[cells componentsJoinedByString:@","]]; }
    NSString *csv=[[lines componentsJoinedByString:@"\r\n"] stringByAppendingString:@"\r\n"];
    NSSavePanel *panel=[NSSavePanel savePanel]; panel.allowedContentTypes=@[UTTypeCommaSeparatedText]; panel.nameFieldStringValue=[[self viewID] stringByAppendingString:@".csv"];
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
        if(response!=NSModalResponseOK) return;
        NSError *error=nil; if(![csv writeToURL:panel.URL atomically:YES encoding:NSUTF8StringEncoding error:&error]) [self alert:@"Export failed" message:error.localizedDescription]; else self.status.stringValue=@"CSV exported. Formula-like cells are prefixed with an apostrophe for spreadsheet safety.";
    }];
}
- (void)revealData:(id)sender { (void)sender; [NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:self.store.stringByDeletingLastPathComponent]]; }
- (void)showAbout:(id)sender { (void)sender; [NSApp orderFrontStandardAboutPanelWithOptions:@{NSAboutPanelOptionApplicationName:self.config[@"name"],NSAboutPanelOptionApplicationVersion:@"1.0",NSAboutPanelOptionCredits:[[NSAttributedString alloc] initWithString:@"Native macOS AppKit interface. Application logic compiled from Arya. Local data, no web server."]}]; }
@end

int main(int argc,const char **argv) {
    @autoreleasepool {
        NSBundle *bundle=NSBundle.mainBundle;
        NSString *resource=bundle.resourcePath;
        NSString *worker=[bundle.bundlePath stringByAppendingPathComponent:@"Contents/MacOS/arya-worker"];
        NSDictionary *config=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[resource stringByAppendingPathComponent:@"ui.json"]] ?: [NSData data] options:0 error:nil];
        if(![config isKindOfClass:NSDictionary.class] || ![config[@"name"] isKindOfClass:NSString.class] || ![config[@"views"] isKindOfClass:NSArray.class] || [config[@"views"] count]==0) { fprintf(stderr,"Missing or invalid ui.json in app bundle.\n"); return 1; }
        NSString *store=NSProcessInfo.processInfo.environment[@"DATA_FILE"];
        if(!store.length) { NSString *support=[NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory,NSUserDomainMask,YES) firstObject]; store=[[[support stringByAppendingPathComponent:@"Arya Native"] stringByAppendingPathComponent:config[@"id"]] stringByAppendingPathComponent:@"data.json"]; }
        store=store.stringByStandardizingPath;
        NSError *error=nil;
        if(![NSFileManager.defaultManager createDirectoryAtPath:store.stringByDeletingLastPathComponent withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error]) { fprintf(stderr,"Cannot create data folder: %s\n",error.localizedDescription.UTF8String); return 1; }
        int lockFD=open([[store stringByAppendingString:@".lock"] fileSystemRepresentation],O_CREAT|O_RDWR|O_CLOEXEC,0600);
        if(lockFD<0 || flock(lockFD,LOCK_EX|LOCK_NB)!=0) {
            [NSApplication sharedApplication]; NSAlert *alert=[NSAlert new]; alert.messageText=@"Application data is already open"; alert.informativeText=@"Close the other instance before opening this data file."; [alert runModal]; return 1;
        }
        if(argc>1 && strcmp(argv[1],"--protocol-check")==0) {
            NSMutableArray *results=[NSMutableArray new]; BOOL ok=YES;
            for(NSDictionary *view in config[@"views"]) { NSDictionary *r=RunWorker(worker,store,@"list",@{@"view":view[@"id"]}); if(![r[@"ok"] boolValue] || ![r[@"rows"] isKindOfClass:NSArray.class]) ok=NO; [results addObject:@{@"view":view[@"id"],@"response":r}]; }
            NSData *json=[NSJSONSerialization dataWithJSONObject:@{@"ok":@(ok),@"views":results} options:NSJSONWritingPrettyPrinted error:nil]; fwrite(json.bytes,1,json.length,stdout); fputc('\n',stdout); close(lockFD); return ok?0:1;
        }
        [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        NativeController *controller=[NativeController new]; controller.config=config; controller.worker=worker; controller.store=store; controller.lockFD=lockFD; NSApp.delegate=controller; [NSApp run];
    }
    return 0;
}
