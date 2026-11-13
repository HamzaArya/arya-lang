/* Exercise the production adapter against deterministic in-memory OS seams.
 * Never instantiate a real LAContext, evaluate real biometrics or write Keychain. */
#define ARYA_AUTH_PLATFORM_TEST 1
#include "../desktop/auth.m"
#include <assert.h>
#include <unistd.h>

@interface AryaTestContext : NSObject
@property(atomic, copy) NSString *localizedReason, *localizedFallbackTitle, *localizedCancelTitle;
@property(atomic) NSTimeInterval touchIDAuthenticationAllowableReuseDuration;
@property(atomic) BOOL interactionNotAllowed, invalidated, authenticated;
@property(atomic) LABiometryType biometryType;
@property(atomic) unsigned evaluations;
@end
static void test_policy(AryaTestContext *context, BOOL owner) {
  assert(!context.authenticated);
  assert(context.touchIDAuthenticationAllowableReuseDuration == 0);
  assert(context.localizedReason.length > 0);
  if (!owner) assert([context.localizedFallbackTitle isEqualToString:@""]);
  if ([context.localizedReason isEqualToString:@"mock.title"]) assert([context.localizedCancelTitle isEqualToString:@"Go back"]);
}
@implementation AryaTestContext
- (instancetype)init { if ((self=[super init])) _biometryType=LABiometryTypeTouchID; return self; }
- (BOOL)canEvaluatePolicy:(LAPolicy)policy error:(NSError **)error {
  assert(++self.evaluations == 1);
  if ([self.localizedReason containsString:@"face"]) self.biometryType=LABiometryTypeFaceID;
  NSInteger code = 0;
  if ([self.localizedReason isEqualToString:@"mock.not-enrolled"]) code=LAErrorBiometryNotEnrolled;
  if ([self.localizedReason isEqualToString:@"mock.unavailable"]) code=LAErrorBiometryNotAvailable;
  if ([self.localizedReason isEqualToString:@"mock.passcode"]) code=LAErrorPasscodeNotSet;
  if ([self.localizedReason isEqualToString:@"mock.locked"]) code=LAErrorBiometryLockout;
  if (code) { if(error)*error=[NSError errorWithDomain:LAErrorDomain code:code userInfo:nil]; return NO; }
  return YES;
}
- (void)evaluatePolicy:(LAPolicy)policy localizedReason:(NSString *)reason reply:(void (^)(BOOL, NSError *))reply {
  test_policy(self, policy==LAPolicyDeviceOwnerAuthentication);
  assert(self.evaluations == 1); assert([self.localizedReason isEqualToString:reason]);
  double delay=[reason containsString:@"slow"] ? 0.2 : 0.005;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay*NSEC_PER_SEC)), dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
    NSInteger code=0;
    if (self.interactionNotAllowed) code=LAErrorNotInteractive;
    if ([reason isEqualToString:@"mock.denied"]) code=LAErrorAuthenticationFailed;
    if ([reason isEqualToString:@"mock.user-cancel"]) code=LAErrorUserCancel;
    if ([reason isEqualToString:@"mock.system-cancel"]) code=LAErrorSystemCancel;
    if ([reason isEqualToString:@"mock.fallback"]) code=LAErrorUserFallback;
    if ([reason isEqualToString:@"mock.invalid-context"]) code=LAErrorInvalidContext;
    if ([reason isEqualToString:@"mock.unknown"]) { reply(NO,[NSError errorWithDomain:@"untrusted-domain" code:42 userInfo:@{NSLocalizedDescriptionKey:@"private data"}]); return; }
    if (self.invalidated) code=LAErrorAppCancel;
    self.authenticated=!code;
    reply(!code,code?[NSError errorWithDomain:LAErrorDomain code:code userInfo:nil]:nil);
  });
}
- (void)invalidate { self.invalidated=YES; }
@end
LAContext *arya_auth_test_context(void) { return (LAContext *)[AryaTestContext new]; }

static NSMutableDictionary<NSArray *, NSData *> *test_items;
static SecAccessControlCreateFlags test_access_flags;
static NSArray *test_key(NSDictionary *query) {
  assert([query[(__bridge id)kSecClass] isEqual:(__bridge id)kSecClassGenericPassword]);
  assert([query[(__bridge id)kSecUseDataProtectionKeychain] isEqual:@YES]);
  assert([query[(__bridge id)kSecAttrSynchronizable] isEqual:@NO]);
  NSString *service=query[(__bridge id)kSecAttrService];
  assert([service hasPrefix:@"arya.auth.v1.biometrics:"]||[service hasPrefix:@"arya.auth.v1.owner:"]);
  return @[service,query[(__bridge id)kSecAttrAccount]];
}
static AryaTestContext *test_context(NSDictionary *query) {
  id context=query[(__bridge id)kSecUseAuthenticationContext];
  assert([context isKindOfClass:AryaTestContext.class]); return context;
}
SecAccessControlRef arya_auth_test_access(CFAllocatorRef allocator, CFTypeRef protection, SecAccessControlCreateFlags flags, CFErrorRef *error) {
  assert(CFEqual(protection,kSecAttrAccessibleWhenUnlockedThisDeviceOnly));
  assert(flags==kSecAccessControlBiometryCurrentSet||flags==kSecAccessControlUserPresence);
  test_access_flags=flags;
  return SecAccessControlCreateWithFlags(allocator,protection,flags,error);
}
OSStatus arya_auth_test_add(CFDictionaryRef raw, CFTypeRef *output) {
  NSDictionary *query=(__bridge NSDictionary *)raw; NSArray *key=test_key(query);
  AryaTestContext *context=test_context(query); BOOL owner=[key[0] hasPrefix:@"arya.auth.v1.owner:"];
  test_policy(context,owner); assert(context.evaluations==1);
  assert(test_access_flags==(owner?kSecAccessControlUserPresence:kSecAccessControlBiometryCurrentSet));
  assert(CFGetTypeID((__bridge CFTypeRef)query[(__bridge id)kSecAttrAccessControl])==SecAccessControlGetTypeID());
  if(!test_items)test_items=[NSMutableDictionary new];
  if(test_items[key])return errSecDuplicateItem;
  if(context.invalidated)return errSecUserCanceled;
  test_items[key]=[query[(__bridge id)kSecValueData] copy]; return errSecSuccess;
}
OSStatus arya_auth_test_copy(CFDictionaryRef raw, CFTypeRef *output) {
  NSDictionary *query=(__bridge NSDictionary *)raw; NSArray *key=test_key(query); AryaTestContext *context=test_context(query);
  test_policy(context,[key[0] hasPrefix:@"arya.auth.v1.owner:"]);
  assert([query[(__bridge id)kSecReturnData] isEqual:@YES]);
  assert([query[(__bridge id)kSecMatchLimit] isEqual:(__bridge id)kSecMatchLimitOne]);
  NSString *reason=context.localizedReason;
  if(context.interactionNotAllowed)return errSecInteractionNotAllowed;
  if([reason isEqualToString:@"mock.entitlement"])return errSecMissingEntitlement;
  if([reason isEqualToString:@"mock.keychain-unavailable"])return errSecNotAvailable;
  if([reason isEqualToString:@"mock.denied"])return errSecAuthFailed;
  if([reason isEqualToString:@"mock.user-cancel"])return errSecUserCanceled;
  if([reason containsString:@"read.slow"])usleep(200000);
  else if(context.invalidated)return errSecUserCanceled;
  context.authenticated=YES;
  if([reason isEqualToString:@"mock.invalid-type"]) { *output=CFBridgingRetain(@"not data"); return errSecSuccess; }
  NSData *data=test_items[key];
  if([reason isEqualToString:@"mock.invalid-utf8"]) { unsigned char bytes[]={0xc0,0xaf}; data=[NSData dataWithBytes:bytes length:2]; }
  if([reason isEqualToString:@"mock.empty"])data=[NSData data];
  if([reason isEqualToString:@"mock.oversize"])data=[NSMutableData dataWithLength:16385];
  if(!data)return errSecItemNotFound;
  *output=CFBridgingRetain(data); return errSecSuccess;
}
OSStatus arya_auth_test_update(CFDictionaryRef raw, CFDictionaryRef rawAttributes) {
  NSDictionary *query=(__bridge NSDictionary *)raw, *attributes=(__bridge NSDictionary *)rawAttributes;
  NSArray *key=test_key(query); AryaTestContext *context=test_context(query);
  assert(context.authenticated); assert(!query[(__bridge id)kSecReturnData]); assert(!query[(__bridge id)kSecMatchLimit]);
  assert(attributes.count==1&&attributes[(__bridge id)kSecValueData]);
  if(!test_items[key])return errSecItemNotFound;
  if([context.localizedReason isEqualToString:@"mock.update.fail"])return errSecAuthFailed;
  if([context.localizedReason isEqualToString:@"mock.commit.slow"])usleep(200000); /* Deliberate commit/cancel race. */
  else if(context.invalidated)return errSecUserCanceled;
  test_items[key]=[attributes[(__bridge id)kSecValueData] copy]; return errSecSuccess;
}
OSStatus arya_auth_test_delete(CFDictionaryRef raw) {
  NSDictionary *query=(__bridge NSDictionary *)raw; NSArray *key=test_key(query); AryaTestContext *context=test_context(query);
  assert(context.authenticated); assert(!query[(__bridge id)kSecReturnData]); assert(!query[(__bridge id)kSecMatchLimit]);
  if(!test_items[key])return errSecItemNotFound;
  if(context.invalidated)return errSecUserCanceled;
  [test_items removeObjectForKey:key]; return errSecSuccess;
}
