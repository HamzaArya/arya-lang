#ifndef ARYA_AUTH_PLATFORM_H
#define ARYA_AUTH_PLATFORM_H
/* Plain C ABI. Platform workers never receive managed Arya values. */
#include <stddef.h>
#include <stdint.h>
enum {
  ARYA_AUTH_OK, ARYA_AUTH_UNAVAILABLE, ARYA_AUTH_NOT_ENROLLED, ARYA_AUTH_LOCKED,
  ARYA_AUTH_CANCELLED, ARYA_AUTH_DENIED, ARYA_AUTH_TIMEOUT, ARYA_AUTH_NOT_FOUND,
  ARYA_AUTH_DUPLICATE, ARYA_AUTH_PLATFORM, ARYA_AUTH_BUSY, ARYA_AUTH_INTERACTION,
  ARYA_AUTH_ENTITLEMENT, ARYA_AUTH_CONTEXT
};
typedef struct {
  int status, kind, domain, may_have_changed;
  int64_t native_code;
  const char *detail; /* Static, normalized text; never an OS error description. */
} AryaAuthResult;
typedef struct { int available; AryaAuthResult result; } AryaAuthStatus;
typedef struct {
  int operation, owner, interactive; /* -1 evaluate; 0 add; 1 read; 2 remove; 3 replace */
  const char *reason, *cancel_title, *service, *account;
  const unsigned char *input;
  size_t input_size;
} AryaAuthRequest;
AryaAuthStatus arya_auth_status(int owner);
void *arya_auth_operation_begin(const AryaAuthRequest *request);
int arya_auth_operation_poll(void *operation, AryaAuthResult *result);
void arya_auth_operation_cancel(void *operation, int status);
int arya_auth_operation_copy_secret(void *operation, unsigned char **bytes, size_t *size);
void arya_auth_operation_release(void *operation);
#endif
