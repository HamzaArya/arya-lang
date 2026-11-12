/* Arya's optional macOS window host. AppKit/WebKit own the browser renderer;
 * application routes, calculations and lifecycle remain in native Arya. */
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AryaWindow : NSObject <NSWindowDelegate, WKNavigationDelegate, WKUIDelegate>
@property(nonatomic,strong) NSWindow *window;
@property(nonatomic,strong) WKWebView *view;
@property(nonatomic,strong) NSURL *origin;
@property(nonatomic) BOOL closed;
@end
@implementation AryaWindow
- (void)windowWillClose:(NSNotification *)notification { (void)notification; self.closed = YES; [self.view stopLoading]; }
- (BOOL)allows:(NSURL *)url {
  if (!url || ![url.scheme.lowercaseString isEqual:self.origin.scheme.lowercaseString]) return NO;
  return [url.host.lowercaseString isEqual:self.origin.host.lowercaseString] && (url.port ?: @80).integerValue == (self.origin.port ?: @80).integerValue;
}
- (void)webView:(WKWebView *)view decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
  (void)view; handler([self allows:action.request.URL] && action.targetFrame != nil ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)view decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))handler {
  (void)view; handler([self allows:response.response.URL] ? WKNavigationResponsePolicyAllow : WKNavigationResponsePolicyCancel);
}
- (WKWebView *)webView:(WKWebView *)view createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
  (void)view;(void)configuration;(void)action;(void)features;return nil;
}
@end
@interface AryaApplication : NSObject <NSApplicationDelegate>
@end
@implementation AryaApplication
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
  for (NSWindow *window in sender.windows) [window performClose:nil];
  return NSTerminateCancel;
}
@end
static AryaApplication *aryaApplication;
static unsigned aryaWindowCount;

void *arya_desktop_open(const char *urlBytes,const char *titleBytes,int width,int height) {
  @autoreleasepool {
    if (![NSThread isMainThread] || aryaWindowCount >= 16) return NULL;
    NSURL *url = [NSURL URLWithString:[NSString stringWithUTF8String:urlBytes]];
    if (![url.scheme.lowercaseString isEqual:@"http"] || ![@[@"127.0.0.1",@"localhost",@"::1"] containsObject:url.host.lowercaseString] || url.user || url.password) return NULL;
    [NSApplication sharedApplication];
    if (!aryaApplication) {
      aryaApplication = [AryaApplication new]; NSApp.delegate = aryaApplication;
      [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
      NSMenu *menu = [NSMenu new]; NSMenuItem *application = [NSMenuItem new]; [menu addItem:application];
      NSMenu *actions = [NSMenu new]; [actions addItemWithTitle:@"Quit" action:@selector(terminate:) keyEquivalent:@"q"]; application.submenu = actions; NSApp.mainMenu = menu;
      [NSApp finishLaunching];
    }
    AryaWindow *holder = [AryaWindow new]; holder.origin = url;
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
    holder.view = [[WKWebView alloc] initWithFrame:NSMakeRect(0,0,width,height) configuration:configuration];
    holder.view.navigationDelegate = holder; holder.view.UIDelegate = holder;
    holder.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,width,height) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    holder.window.releasedWhenClosed = NO; holder.window.delegate = holder;
    holder.window.minSize = NSMakeSize(420,360); holder.window.title = [NSString stringWithUTF8String:titleBytes];
    holder.window.contentView = holder.view; [holder.window center]; [holder.window makeKeyAndOrderFront:nil];
    [holder.view loadRequest:[NSURLRequest requestWithURL:url]]; [NSApp activateIgnoringOtherApps:YES];
    aryaWindowCount++; return (__bridge_retained void *)holder;
  }
}
int arya_desktop_step(void *pointer) {
  @autoreleasepool {
    AryaWindow *holder = (__bridge AryaWindow *)pointer;
    for (unsigned count=0;count<32;count++) {
      NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES];
      if (!event) break; [NSApp sendEvent:event];
    }
    CFRunLoopRunInMode(kCFRunLoopDefaultMode,0,true); [NSApp updateWindows];
    return holder.closed;
  }
}
void arya_desktop_close(void *pointer) { @autoreleasepool { [((__bridge AryaWindow *)pointer).window close]; } }
void arya_desktop_release(void *pointer) {
  @autoreleasepool { AryaWindow *holder = (__bridge_transfer AryaWindow *)pointer; [holder.view stopLoading]; [holder.window close]; if(aryaWindowCount)aryaWindowCount--; }
}
