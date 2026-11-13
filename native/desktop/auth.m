/* Native local authentication and access-controlled credential storage.
 * Each request owns a fresh LAContext. OS callbacks receive no managed values. */
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#include <pthread.h>
#include <string.h>
#include "../runtime/auth-platform.h"

/* Test-only link seams exercise this adapter without touching the real Keychain
 * or displaying a prompt. Production has no configurable authentication bypass. */
#ifdef ARYA_AUTH_PLATFORM_TEST
extern LAContext *arya_auth_test_context(void);
extern OSStatus arya_auth_test_add(CFDictionaryRef, CFTypeRef *);
extern OSStatus arya_auth_test_copy(CFDictionaryRef, CFTypeRef *);
extern OSStatus arya_auth_test_update(CFDictionaryRef, CFDictionaryRef);
extern OSStatus arya_auth_test_delete(CFDictionaryRef);
extern SecAccessControlRef arya_auth_test_access(CFAllocatorRef, CFTypeRef, SecAccessControlCreateFlags, CFErrorRef *);
#define AAuthContext() arya_auth_test_context()
#define AAuthAdd arya_auth_test_add
#define AAuthCopy arya_auth_test_copy
#define AAuthUpdate arya_auth_test_update
#define AAuthDelete arya_auth_test_delete
#define AAuthAccess arya_auth_test_access
#else
#define AAuthContext() [LAContext new]
#define AAuthAdd SecItemAdd
#define AAuthCopy SecItemCopyMatching
#define AAuthUpdate SecItemUpdate
#define AAuthDelete SecItemDelete
#define AAuthAccess SecAccessControlCreateWithFlags
#endif

static pthread_mutex_t arya_auth_gate = PTHREAD_MUTEX_INITIALIZER;
static BOOL arya_auth_active;
static void arya_auth_clear(void *bytes, size_t size) {
  volatile unsigned char *cursor = bytes; while (size--) *cursor++ = 0;
}
static AryaAuthResult arya_auth_result(int status, const char *detail) {
  return (AryaAuthResult){.status=status, .detail=detail};
}
static int arya_auth_kind(LAContext *context) {
  return context.biometryType == LABiometryTypeTouchID ? 1 : context.biometryType == LABiometryTypeFaceID ? 2 : 0;
}
static AryaAuthResult arya_auth_la_error(NSError *error) {
  AryaAuthResult result = arya_auth_result(ARYA_AUTH_PLATFORM, "platform-error");
  if (![error.domain isEqualToString:LAErrorDomain]) return result;
  result.domain = 1; result.native_code = error.code;
  switch (error.code) {
    case LAErrorBiometryNotAvailable: result.status=ARYA_AUTH_UNAVAILABLE; result.detail="biometry-unavailable"; break;
    case LAErrorPasscodeNotSet: result.status=ARYA_AUTH_UNAVAILABLE; result.detail="passcode-not-set"; break;
    case LAErrorBiometryNotEnrolled: result.status=ARYA_AUTH_NOT_ENROLLED; result.detail="biometry-not-enrolled"; break;
    case LAErrorBiometryLockout: result.status=ARYA_AUTH_LOCKED; result.detail="biometry-lockout"; break;
    case LAErrorUserCancel: result.status=ARYA_AUTH_CANCELLED; result.detail="user-cancelled"; break;
    case LAErrorSystemCancel: result.status=ARYA_AUTH_CANCELLED; result.detail="system-cancelled"; break;
    case LAErrorAppCancel: result.status=ARYA_AUTH_CANCELLED; result.detail="app-cancelled"; break;
    case LAErrorUserFallback: result.status=ARYA_AUTH_CANCELLED; result.detail="fallback-requested"; break;
    case LAErrorAuthenticationFailed: result.status=ARYA_AUTH_DENIED; result.detail="authentication-failed"; break;
    case LAErrorNotInteractive: result.status=ARYA_AUTH_INTERACTION; result.detail="interaction-not-allowed"; break;
    case LAErrorInvalidContext: result.status=ARYA_AUTH_CONTEXT; result.detail="invalid-context"; break;
  }
  return result;
}
static AryaAuthResult arya_auth_sec_error(OSStatus status) {
  AryaAuthResult result = arya_auth_result(ARYA_AUTH_PLATFORM, "platform-error");
  if (status == errSecSuccess) return arya_auth_result(ARYA_AUTH_OK, "ok");
  result.domain = 2; result.native_code = status;
  switch (status) {
    case errSecItemNotFound: result.status=ARYA_AUTH_NOT_FOUND; result.detail="item-not-found"; break;
    case errSecDuplicateItem: result.status=ARYA_AUTH_DUPLICATE; result.detail="duplicate-item"; break;
    case errSecUserCanceled: result.status=ARYA_AUTH_CANCELLED; result.detail="user-cancelled"; break;
    case errSecAuthFailed: result.status=ARYA_AUTH_DENIED; result.detail="authentication-failed"; break;
    case errSecInteractionNotAllowed: result.status=ARYA_AUTH_INTERACTION; result.detail="interaction-not-allowed"; break;
    case errSecNotAvailable: result.status=ARYA_AUTH_UNAVAILABLE; result.detail="keychain-unavailable"; break;
    case errSecMissingEntitlement: result.status=ARYA_AUTH_ENTITLEMENT; result.detail="missing-entitlement"; break;
  }
  return result;
}

@interface AryaAuthOperation : NSObject {
@public
  NSLock *guard;
  LAContext *context;
  AryaAuthResult result;
  BOOL terminal, ownsGate, mutationStarted;
  unsigned char *secretBytes;
  size_t secretSize;
}
@property(nonatomic) int operation, owner;
@property(nonatomic, copy) NSString *reason, *service, *account;
@property(nonatomic, strong) NSMutableData *input;
- (BOOL)pending;
- (BOOL)beginMutation;
- (void)finish:(AryaAuthResult)value secret:(NSData *)secret;
- (void)cancel:(int)status;
@end
@implementation AryaAuthOperation
- (instancetype)init {
  if ((self = [super init])) { guard = [NSLock new]; result = arya_auth_result(ARYA_AUTH_PLATFORM, "platform-error"); }
  return self;
}
- (BOOL)pending { [guard lock]; BOOL value = !terminal; [guard unlock]; return value; }
- (BOOL)beginMutation {
  [guard lock]; BOOL value = !terminal; if (value) mutationStarted = YES; [guard unlock]; return value;
}
- (void)finish:(AryaAuthResult)value secret:(NSData *)secret {
  [guard lock];
  if (!terminal) {
    result = value;
    if (value.status == ARYA_AUTH_OK && secret) {
      secretSize = secret.length; secretBytes = malloc(secretSize);
      if (secretBytes) memcpy(secretBytes, secret.bytes, secretSize);
      else { secretSize = 0; result = arya_auth_sec_error(errSecAllocate); }
    }
    terminal = YES;
  }
  /* A cancelled caller can finish early, but the gate stays held until the
   * actual OS operation settles. Late callbacks cannot publish a secret. */
  LAContext *finishedContext = context; context = nil;
  if (ownsGate) {
    ownsGate = NO;
    pthread_mutex_lock(&arya_auth_gate); arya_auth_active = NO; pthread_mutex_unlock(&arya_auth_gate);
  }
  [guard unlock];
  [finishedContext invalidate];
}
- (void)cancel:(int)status {
  [guard lock];
  if (!terminal) {
    result = arya_auth_result(status, status == ARYA_AUTH_TIMEOUT ? "deadline-exceeded" : "request-cancelled");
    result.may_have_changed = mutationStarted; terminal = YES;
  }
  LAContext *cancelContext = context;
  [guard unlock];
  [cancelContext invalidate];
}
- (void)dealloc {
  if (secretBytes) { arya_auth_clear(secretBytes, secretSize); free(secretBytes); }
  if (_input.length) arya_auth_clear(_input.mutableBytes, _input.length);
}
@end

AryaAuthStatus arya_auth_status(int owner) {
  @autoreleasepool {
    LAContext *context = AAuthContext(); NSError *error = nil;
    BOOL available = [context canEvaluatePolicy:owner ? LAPolicyDeviceOwnerAuthentication : LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error];
    AryaAuthResult result = available ? arya_auth_result(ARYA_AUTH_OK, "ok") : arya_auth_la_error(error);
    result.kind = arya_auth_kind(context); [context invalidate];
    return (AryaAuthStatus){available, result};
  }
}
static void arya_auth_vault_work(AryaAuthOperation *op, LAContext *context) {
  if (![op pending]) { [op finish:arya_auth_result(ARYA_AUTH_CANCELLED, "request-cancelled") secret:nil]; return; }
  NSMutableDictionary *query = [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: [NSString stringWithFormat:@"arya.auth.v1.%@:%@", op.owner ? @"owner" : @"biometrics", op.service],
    (__bridge id)kSecAttrAccount: op.account,
    (__bridge id)kSecAttrSynchronizable: @NO,
    (__bridge id)kSecUseDataProtectionKeychain: @YES,
    (__bridge id)kSecUseAuthenticationContext: context
  } mutableCopy];
  OSStatus status = errSecUserCanceled;
  if (op.operation == 0) {
    NSError *failure = nil;
    if (![context canEvaluatePolicy:op.owner ? LAPolicyDeviceOwnerAuthentication : LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&failure]) {
      AryaAuthResult result = arya_auth_la_error(failure); result.kind = arya_auth_kind(context); [op finish:result secret:nil]; return;
    }
    CFErrorRef failureAccess = NULL;
    SecAccessControlRef access = AAuthAccess(NULL, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      op.owner ? kSecAccessControlUserPresence : kSecAccessControlBiometryCurrentSet, &failureAccess);
    if (!access) {
      if (failureAccess) CFRelease(failureAccess);
      [op finish:arya_auth_result(ARYA_AUTH_PLATFORM, "access-control-unavailable") secret:nil]; return;
    }
    query[(__bridge id)kSecAttrAccessControl] = (__bridge id)access;
    query[(__bridge id)kSecValueData] = op.input;
    if ([op beginMutation]) status = AAuthAdd((__bridge CFDictionaryRef)query, NULL);
    CFRelease(access);
  } else {
    NSMutableDictionary *readQuery = [query mutableCopy];
    readQuery[(__bridge id)kSecReturnData] = @YES;
    readQuery[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef found = NULL;
    /* Authenticate against the existing item's ACL before updating or deleting.
     * Update changes only the value; accessibility and enrollment binding stay. */
    status = AAuthCopy((__bridge CFDictionaryRef)readQuery, &found);
    NSData *secret = nil;
    if (status == errSecSuccess) {
      if (!found || CFGetTypeID(found) != CFDataGetTypeID()) status = errSecDecode;
      else if (op.operation == 1) {
        NSData *data = (__bridge NSData *)found;
        if (data.length < 1 || data.length > 16384 || ![[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]) status = errSecDecode;
        else secret = data;
      } else if ([op beginMutation]) {
        status = op.operation == 2 ? AAuthDelete((__bridge CFDictionaryRef)query)
          : AAuthUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)@{(__bridge id)kSecValueData: op.input});
      }
    }
    AryaAuthResult value = arya_auth_sec_error(status); value.kind = arya_auth_kind(context);
    [op finish:value secret:secret]; if (found) CFRelease(found); return;
  }
  AryaAuthResult value = arya_auth_sec_error(status); value.kind = arya_auth_kind(context); [op finish:value secret:nil];
}
void *arya_auth_operation_begin(const AryaAuthRequest *request) {
  @autoreleasepool {
    AryaAuthOperation *op = [AryaAuthOperation new];
    pthread_mutex_lock(&arya_auth_gate);
    if (arya_auth_active) {
      pthread_mutex_unlock(&arya_auth_gate); op->terminal = YES; op->result = arya_auth_result(ARYA_AUTH_BUSY, "request-in-progress");
      return (__bridge_retained void *)op;
    }
    arya_auth_active = YES; op->ownsGate = YES; pthread_mutex_unlock(&arya_auth_gate);
    op.operation = request->operation; op.owner = request->owner;
    op.reason = [NSString stringWithUTF8String:request->reason];
    if (request->service) op.service = [NSString stringWithUTF8String:request->service];
    if (request->account) op.account = [NSString stringWithUTF8String:request->account];
    if (request->input) op.input = [NSMutableData dataWithBytes:request->input length:request->input_size];
    LAContext *context = AAuthContext(); op->context = context;
    context.touchIDAuthenticationAllowableReuseDuration = 0;
    context.interactionNotAllowed = !request->interactive;
    context.localizedReason = op.reason;
    if (!request->owner) context.localizedFallbackTitle = @"";
    if (request->cancel_title) context.localizedCancelTitle = [NSString stringWithUTF8String:request->cancel_title];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      @autoreleasepool {
        if (![op pending]) { [op finish:arya_auth_result(ARYA_AUTH_CANCELLED, "request-cancelled") secret:nil]; return; }
        if (op.operation >= 0) { arya_auth_vault_work(op, context); return; }
        LAPolicy policy = op.owner ? LAPolicyDeviceOwnerAuthentication : LAPolicyDeviceOwnerAuthenticationWithBiometrics;
        NSError *error = nil;
        if (![context canEvaluatePolicy:policy error:&error]) {
          AryaAuthResult value = arya_auth_la_error(error); value.kind = arya_auth_kind(context); [op finish:value secret:nil]; return;
        }
        [context evaluatePolicy:policy localizedReason:op.reason reply:^(BOOL success, NSError *failure) {
          AryaAuthResult value = success ? arya_auth_result(ARYA_AUTH_OK, "ok") : arya_auth_la_error(failure);
          value.kind = arya_auth_kind(context); [op finish:value secret:nil];
        }];
      }
    });
    return (__bridge_retained void *)op;
  }
}
int arya_auth_operation_poll(void *operation, AryaAuthResult *result) {
  AryaAuthOperation *op = (__bridge AryaAuthOperation *)operation;
  [op->guard lock]; BOOL done = op->terminal; if (done) *result = op->result; [op->guard unlock]; return done;
}
void arya_auth_operation_cancel(void *operation, int status) { [(__bridge AryaAuthOperation *)operation cancel:status]; }
int arya_auth_operation_copy_secret(void *operation, unsigned char **bytes, size_t *size) {
  AryaAuthOperation *op = (__bridge AryaAuthOperation *)operation;
  [op->guard lock];
  BOOL valid = op->terminal && op->result.status == ARYA_AUTH_OK && op->secretBytes;
  if (valid) { *size = op->secretSize; *bytes = malloc(*size); if (*bytes) memcpy(*bytes, op->secretBytes, *size); else valid = NO; }
  [op->guard unlock]; return valid;
}
void arya_auth_operation_release(void *operation) { AryaAuthOperation *op = (__bridge_transfer AryaAuthOperation *)operation; (void)op; }
