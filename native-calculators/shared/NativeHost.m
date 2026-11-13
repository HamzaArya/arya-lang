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
@interface CalculatorStatus : NSTextField
@end
@implementation CalculatorStatus
- (void)setStringValue:(NSString *)value { [super setStringValue:value]; self.toolTip=value; }
@end

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
@property NSTextField *expression;
@property NSTextField *resultDisplay;
@property NSTextField *memoryDisplay;
@property NSMutableDictionary<NSString *, NSPopUpButton *> *optionControls;
@property NSMutableArray<NSControl *> *calculatorControls;
@property NSString *lastResult;
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
    for (NSControl *control in self.calculatorControls) control.enabled = !working;
    for (NSView *view in self.actions.arrangedSubviews) if ([view isKindOfClass:NSButton.class]) ((NSButton *)view).enabled = !working;
    if (working) [self.progress startAnimation:nil]; else { [self.progress stopAnimation:nil]; [self.window makeFirstResponder:self.expression]; }
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
- (NSStackView *)stack:(BOOL)vertical {
    NSStackView *stack=[NSStackView new]; stack.orientation=vertical ? NSUserInterfaceLayoutOrientationVertical : NSUserInterfaceLayoutOrientationHorizontal;
    stack.alignment=vertical ? NSLayoutAttributeLeading : NSLayoutAttributeCenterY; stack.spacing=10; return stack;
}
- (NSButton *)calculatorButton:(NSString *)title action:(SEL)action {
    NSButton *button=[self button:title action:action]; button.refusesFirstResponder=YES;
    [self.calculatorControls addObject:button]; return button;
}
- (NSMutableDictionary *)calculationBody {
    NSMutableDictionary *body=[@{@"view":[self viewID]} mutableCopy];
    for(NSString *key in self.optionControls) body[key]=StringValue(self.optionControls[key].selectedItem.representedObject);
    return body;
}
- (void)applyResult:(NSDictionary *)result {
    self.lastResult=StringValue(result[@"result"]); if(!self.lastResult.length) self.lastResult=@"0";
    self.resultDisplay.stringValue=self.lastResult; self.resultDisplay.toolTip=self.lastResult;
    self.resultDisplay.font=[NSFont monospacedDigitSystemFontOfSize:self.lastResult.length>22 ? 22 : 36 weight:NSFontWeightMedium];
    self.memoryDisplay.stringValue=[@"Memory: " stringByAppendingString:StringValue(result[@"memory"] ?: @"0")];
    self.memoryDisplay.toolTip=self.memoryDisplay.stringValue;
    self.rows=result[@"rows"]; self.summary.stringValue=StringValue(result[@"summary"]); self.summary.toolTip=self.summary.stringValue;
    [self filterRows];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification; [self menu]; self.lastResult=@"0"; self.calculatorControls=[NSMutableArray new]; self.optionControls=[NSMutableDictionary new];
    self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1100,760) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title=self.config[@"name"]; self.window.minSize=NSMakeSize(1000,720); self.window.delegate=self; self.window.releasedWhenClosed=NO;
    NSStackView *root=[self stack:YES]; root.spacing=12; root.translatesAutoresizingMaskIntoConstraints=NO; [self.window.contentView addSubview:root];
    [NSLayoutConstraint activateConstraints:@[[root.leadingAnchor constraintEqualToAnchor:self.window.contentView.leadingAnchor constant:24],[root.trailingAnchor constraintEqualToAnchor:self.window.contentView.trailingAnchor constant:-24],[root.topAnchor constraintEqualToAnchor:self.window.contentView.topAnchor constant:20],[root.bottomAnchor constraintEqualToAnchor:self.window.contentView.bottomAnchor constant:-18]]];
    [root addArrangedSubview:[self label:self.config[@"name"] size:26 bold:YES]];
    NSTextField *subtitle=[self label:self.config[@"subtitle"] size:13 bold:NO]; subtitle.textColor=NSColor.secondaryLabelColor; subtitle.toolTip=subtitle.stringValue; [root addArrangedSubview:subtitle]; [subtitle.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES;
    self.views=[NSSegmentedControl new]; self.views.segmentCount=[self.config[@"views"] count]; self.views.selectedSegment=0;
    NSStackView *workspace=[self stack:NO]; workspace.alignment=NSLayoutAttributeTop; workspace.spacing=24; [root addArrangedSubview:workspace]; [workspace.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES;
    NSStackView *calculator=[self stack:YES]; calculator.spacing=6; [workspace addArrangedSubview:calculator]; [calculator.widthAnchor constraintEqualToConstant:440].active=YES;
    [calculator addArrangedSubview:[self label:@"EXPRESSION" size:11 bold:YES]];
    self.expression=[NSTextField new]; self.expression.placeholderString=self.config[@"calculator"][@"placeholder"] ?: @"Enter a calculation"; self.expression.font=[NSFont monospacedSystemFontOfSize:20 weight:NSFontWeightRegular]; self.expression.accessibilityLabel=@"Expression"; self.expression.target=self; self.expression.action=@selector(calculate:); [calculator addArrangedSubview:self.expression]; [self.expression.widthAnchor constraintEqualToAnchor:calculator.widthAnchor].active=YES; [self.expression.heightAnchor constraintEqualToConstant:34].active=YES; [self.calculatorControls addObject:self.expression];
    self.resultDisplay=[self label:@"0" size:36 bold:YES]; self.resultDisplay.alignment=NSTextAlignmentRight; self.resultDisplay.selectable=YES; self.resultDisplay.accessibilityLabel=@"Result"; [calculator addArrangedSubview:self.resultDisplay]; [self.resultDisplay.widthAnchor constraintEqualToAnchor:calculator.widthAnchor].active=YES; [self.resultDisplay.heightAnchor constraintEqualToConstant:48].active=YES;
    NSStackView *resultTools=[self stack:NO]; [resultTools addArrangedSubview:[self calculatorButton:@"Use result" action:@selector(useResult:)]]; [resultTools addArrangedSubview:[self button:@"Copy result" action:@selector(copyResult:)]]; [resultTools addArrangedSubview:[self button:@"Guide" action:@selector(showGuide:)]]; [calculator addArrangedSubview:resultTools];
    NSArray *options=self.config[@"calculator"][@"options"] ?: @[];
    if(options.count) { NSStackView *settings=[self stack:NO];
        for(NSDictionary *option in options) { [settings addArrangedSubview:[self label:option[@"label"] size:12 bold:YES]];
            NSPopUpButton *popup=[NSPopUpButton new]; popup.accessibilityLabel=option[@"label"]; popup.target=self; popup.action=@selector(optionChanged:); popup.identifier=option[@"key"];
            NSString *saved=[NSUserDefaults.standardUserDefaults stringForKey:[@"calculator.option." stringByAppendingString:option[@"key"]]] ?: option[@"default"];
            for(NSDictionary *choice in option[@"choices"]) { NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:choice[@"label"] action:nil keyEquivalent:@""]; item.representedObject=choice[@"value"]; [popup.menu addItem:item]; if([StringValue(choice[@"value"]) isEqual:saved]) [popup selectItem:item]; }
            self.optionControls[option[@"key"]]=popup; [self.calculatorControls addObject:popup]; [settings addArrangedSubview:popup];
        } [calculator addArrangedSubview:settings];
    }
    self.memoryDisplay=[self label:@"Memory: 0" size:12 bold:NO]; self.memoryDisplay.textColor=NSColor.secondaryLabelColor;
    if([self.config[@"calculator"][@"memory"] boolValue]) { NSStackView *memory=[self stack:NO];
        NSArray *titles=@[@"MC",@"MR",@"MS",@"M+",@"M−"]; NSArray *commands=@[@"memory-clear",@"memory-recall",@"memory-store",@"memory-add",@"memory-subtract"];
        for(NSUInteger i=0;i<titles.count;i++) { NSButton *button=[self calculatorButton:titles[i] action:@selector(memory:)]; button.identifier=commands[i]; button.toolTip=commands[i]; [memory addArrangedSubview:button]; }
        [memory addArrangedSubview:self.memoryDisplay]; [self.memoryDisplay.widthAnchor constraintLessThanOrEqualToConstant:150].active=YES; [calculator addArrangedSubview:memory];
    }
    for(NSArray *keys in self.config[@"calculator"][@"keys"]) { NSStackView *row=[self stack:NO]; row.distribution=NSStackViewDistributionFillEqually; row.spacing=8;
        for(NSString *key in keys) { NSButton *button=[self calculatorButton:key action:@selector(keypad:)]; button.font=[NSFont monospacedSystemFontOfSize:18 weight:NSFontWeightMedium]; button.bezelStyle=NSBezelStyleRegularSquare; button.identifier=key; button.accessibilityLabel=key; [row addArrangedSubview:button]; [button.heightAnchor constraintEqualToConstant:36].active=YES; }
        [calculator addArrangedSubview:row]; [row.widthAnchor constraintEqualToAnchor:calculator.widthAnchor].active=YES;
    }
    NSStackView *controls=[self stack:NO]; controls.distribution=NSStackViewDistributionFillEqually; controls.spacing=8;
    [controls addArrangedSubview:[self calculatorButton:@"Clear" action:@selector(clearExpression:)]]; [controls addArrangedSubview:[self calculatorButton:@"⌫" action:@selector(backspace:)]];
    NSButton *equals=[self calculatorButton:@"=" action:@selector(calculate:)]; equals.keyEquivalent=@"\r"; equals.bezelColor=NSColor.controlAccentColor; [controls addArrangedSubview:equals];
    for(NSView *control in controls.arrangedSubviews) [control.heightAnchor constraintEqualToConstant:34].active=YES;
    [calculator addArrangedSubview:controls]; [controls.widthAnchor constraintEqualToAnchor:calculator.widthAnchor].active=YES;
    NSStackView *history=[self stack:YES]; history.spacing=10; [workspace addArrangedSubview:history]; [history.heightAnchor constraintEqualToAnchor:workspace.heightAnchor].active=YES; [history.widthAnchor constraintEqualToAnchor:workspace.widthAnchor constant:-464].active=YES;
    [history addArrangedSubview:[self label:@"Calculation history" size:17 bold:YES]];
    self.summary=[self label:@"Loading…" size:12 bold:NO]; [history addArrangedSubview:self.summary]; [self.summary.widthAnchor constraintEqualToAnchor:history.widthAnchor].active=YES;
    self.search=[[NSSearchField alloc] initWithFrame:NSMakeRect(0,0,280,28)]; self.search.placeholderString=@"Search history"; self.search.delegate=self; self.search.accessibilityLabel=@"Search history"; [history addArrangedSubview:self.search]; [self.search.widthAnchor constraintEqualToAnchor:history.widthAnchor].active=YES;
    self.table=[NSTableView new]; self.table.delegate=self; self.table.dataSource=self; self.table.usesAlternatingRowBackgroundColors=YES; self.table.rowHeight=30; self.table.allowsMultipleSelection=NO; self.table.columnAutoresizingStyle=NSTableViewUniformColumnAutoresizingStyle; self.table.accessibilityLabel=@"Calculation history"; self.table.target=self; self.table.doubleAction=@selector(useHistory:);
    NSScrollView *tableScroll=[NSScrollView new]; tableScroll.documentView=self.table; tableScroll.hasVerticalScroller=YES; tableScroll.hasHorizontalScroller=YES; tableScroll.borderType=NSBezelBorder;
    [history addArrangedSubview:tableScroll]; [tableScroll.widthAnchor constraintEqualToAnchor:history.widthAnchor].active=YES; [tableScroll.heightAnchor constraintGreaterThanOrEqualToConstant:180].active=YES; [tableScroll setContentHuggingPriority:1 forOrientation:NSLayoutConstraintOrientationVertical];
    NSStackView *historyTools=[self stack:NO]; [historyTools addArrangedSubview:[self calculatorButton:@"Use selected" action:@selector(useHistory:)]]; [historyTools addArrangedSubview:[self button:@"Export CSV…" action:@selector(exportCSV:)]]; [historyTools addArrangedSubview:[self calculatorButton:@"Clear history…" action:@selector(clearHistory:)]]; [history addArrangedSubview:historyTools];
    self.detail=[NSTextView new]; self.detail.editable=NO; self.detail.selectable=YES; self.detail.font=[NSFont systemFontOfSize:12]; self.detail.textContainerInset=NSMakeSize(8,8); self.detail.accessibilityLabel=@"Calculation details";
    NSScrollView *details=[NSScrollView new]; details.documentView=self.detail; details.hasVerticalScroller=YES; details.borderType=NSBezelBorder; [history addArrangedSubview:details]; [details.widthAnchor constraintEqualToAnchor:history.widthAnchor].active=YES; [details.heightAnchor constraintEqualToConstant:100].active=YES;
    self.actions=[self stack:NO]; [history addArrangedSubview:self.actions];
    NSStackView *statusBar=[self stack:NO]; self.progress=[NSProgressIndicator new]; self.progress.style=NSProgressIndicatorStyleSpinning; self.progress.displayedWhenStopped=NO; [statusBar addArrangedSubview:self.progress];
    self.status=[CalculatorStatus labelWithString:@"Ready"]; self.status.font=[NSFont systemFontOfSize:12]; self.status.textColor=NSColor.secondaryLabelColor; self.status.accessibilityLabel=@"Operation status"; [statusBar addArrangedSubview:self.status]; [root addArrangedSubview:statusBar]; [statusBar.widthAnchor constraintEqualToAnchor:root.widthAnchor].active=YES;
    self.rows=@[]; self.filtered=@[]; [self.window center]; [self.window makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES]; [self.window makeFirstResponder:self.expression]; [self changeView:nil];
}
- (void)optionChanged:(NSPopUpButton *)sender { [NSUserDefaults.standardUserDefaults setObject:sender.selectedItem.representedObject forKey:[@"calculator.option." stringByAppendingString:sender.identifier]]; }
- (void)calculate:(id)sender { (void)sender; if(self.busy || self.editing) return; NSMutableDictionary *body=[self calculationBody]; body[@"expression"]=self.expression.stringValue; [self invoke:@"calculate" body:body]; }
- (void)insertToken:(NSString *)token {
    if(self.busy || self.editing) return;
    NSText *editor=self.expression.currentEditor;
    if(editor) { NSRange range=editor.selectedRange; NSString *value=self.expression.stringValue; if(NSMaxRange(range)>value.length) range=NSMakeRange(value.length,0); self.expression.stringValue=[value stringByReplacingCharactersInRange:range withString:token]; [self.window makeFirstResponder:self.expression]; self.expression.currentEditor.selectedRange=NSMakeRange(range.location+token.length,0); }
    else { self.expression.stringValue=[self.expression.stringValue stringByAppendingString:token]; [self.window makeFirstResponder:self.expression]; self.expression.currentEditor.selectedRange=NSMakeRange(self.expression.stringValue.length,0); }
}
- (void)keypad:(NSButton *)sender { [self insertToken:sender.identifier]; }
- (void)clearExpression:(id)sender { (void)sender; if(self.busy || self.editing) return; self.expression.stringValue=@""; [self.window makeFirstResponder:self.expression]; }
- (void)backspace:(id)sender { (void)sender; if(self.busy || self.editing) return; NSText *editor=self.expression.currentEditor; NSString *value=self.expression.stringValue; NSRange range=editor ? editor.selectedRange : NSMakeRange(value.length,0); if(NSMaxRange(range)>value.length) return; if(!range.length && range.location) range=[value rangeOfComposedCharacterSequenceAtIndex:range.location-1]; self.expression.stringValue=[value stringByReplacingCharactersInRange:range withString:@""]; [self.window makeFirstResponder:self.expression]; self.expression.currentEditor.selectedRange=NSMakeRange(range.location,0); }
- (void)useResult:(id)sender { (void)sender; if(self.busy || self.editing) return; self.expression.stringValue=self.lastResult; [self.window makeFirstResponder:self.expression]; self.expression.currentEditor.selectedRange=NSMakeRange(self.expression.stringValue.length,0); }
- (void)copyResult:(id)sender { (void)sender; [NSPasteboard.generalPasteboard clearContents]; [NSPasteboard.generalPasteboard setString:self.lastResult ?: @"0" forType:NSPasteboardTypeString]; self.status.stringValue=@"Result copied."; }
- (void)memory:(NSButton *)sender { NSMutableDictionary *body=[self calculationBody]; body[@"value"]=self.lastResult ?: @"0"; [self invoke:sender.identifier body:body]; }
- (void)useHistory:(id)sender { (void)sender; if(self.busy || self.editing) return; NSDictionary *row=[self selection]; if(!row) { self.status.stringValue=@"Select a calculation from history first."; return; } BOOL reusable=!row[@"reusable"] || [row[@"reusable"] boolValue]; self.expression.stringValue=StringValue(row[reusable ? @"expression" : @"result"]); [self.window makeFirstResponder:self.expression]; if(!reusable) self.status.stringValue=@"Worksheet result inserted. Use the worksheet button to calculate with new inputs."; }
- (void)clearHistory:(id)sender {
    (void)sender; if(self.busy || self.editing) return;
    self.editing=YES; NSAlert *alert=[NSAlert new]; alert.messageText=@"Clear calculation history?"; alert.informativeText=@"The saved history for this calculator will be removed."; [alert addButtonWithTitle:@"Clear history"]; [alert addButtonWithTitle:@"Cancel"];
    [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) { self.editing=NO; if(response==NSAlertFirstButtonReturn) [self invoke:@"clear-history" body:[self calculationBody]]; }];
}
- (void)showGuide:(id)sender {
    (void)sender; if(self.busy || self.editing) return; self.editing=YES;
    NSAlert *alert=[NSAlert new]; alert.messageText=[self.config[@"name"] stringByAppendingString:@" Guide"]; alert.informativeText=@"Supported operations, examples, and numerical limits."; [alert addButtonWithTitle:@"Done"];
    NSTextView *text=[NSTextView new]; text.string=[NSString stringWithContentsOfFile:[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"README.md"] encoding:NSUTF8StringEncoding error:nil] ?: @"Guide unavailable."; text.editable=NO; text.font=[NSFont systemFontOfSize:13]; text.textContainerInset=NSMakeSize(12,12);
    NSScrollView *scroll=[[NSScrollView alloc] initWithFrame:NSMakeRect(0,0,580,360)]; scroll.documentView=text; scroll.hasVerticalScroller=YES; alert.accessoryView=scroll;
    [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) { (void)response; self.editing=NO; }];
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
    [self.table sizeToFit]; [self.table reloadData]; [self refresh:nil];
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
            self.status.stringValue=message.length ? message : @"Ready"; self.status.toolTip=message; self.status.textColor=[result[@"ok"] boolValue] ? NSColor.secondaryLabelColor : NSColor.systemRedColor;
            if (![result[@"ok"] boolValue]) { if(![command isEqual:@"calculate"]) [self alert:@"Could not complete the operation" message:message]; return; }
            if (![result[@"rows"] isKindOfClass:NSArray.class]) { [self alert:@"Invalid application response" message:@"Expected a list of records. Your data was not reset."]; return; }
            [self applyResult:result];
            if([command isEqual:@"memory-recall"]) [self useResult:nil];
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
    for (NSString *key in [[row allKeys] sortedArrayUsingSelector:@selector(compare:)]) if(![shown containsObject:key] && ![@[@"id",@"version",@"reusable"] containsObject:key]) [lines addObject:[NSString stringWithFormat:@"%@: %@",key,StringValue(row[key])]];
    self.detail.string=[lines componentsJoinedByString:@"\n"];
}
- (void)actionClicked:(NSButton *)button {
    if(self.busy || self.editing) return;
    NSDictionary *action=self.config[@"actions"][button.tag]; NSDictionary *selected=[self selection];
    if([action[@"selection"] boolValue] && !selected) { [self alert:@"Select a record first" message:@"Choose a row in the table, then use this action."]; return; }
    NSMutableDictionary *base=[self calculationBody];
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
    NSAlert *alert=[NSAlert new]; alert.messageText=action[@"label"]; alert.informativeText=action[@"_error"] ?: @"Complete the fields below. Required fields are marked *."; [alert addButtonWithTitle:@"Calculate"]; [alert addButtonWithTitle:@"Cancel"];
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
                [self applyResult:result];
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
