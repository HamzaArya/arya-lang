/* Native authentication primitives. Cryptography is provided by OpenSSL;
 * session secrets live only as SHA-256 digests in an opaque bounded table. */
#include "auth-platform.h"

static AV aauth_error(const char *code,const char *message) { return asec_error(code,message); }
static int aauth_options(AV value,const char *const *names,size_t count) {
  if(value.t==AUNDEF)return 1;
  if(aplain_options(value,names,count))return 1;
  afailed=0;aauth_error("ARYA_AUTH_INPUT","Authentication options must contain supported data fields.");return 0;
}
static AV aauth_option(AV options,const char *key) { return options.t==AUNDEF?av(AUNDEF):aprop(options,key); }
static int aauth_integer(AV value,double fallback,double minimum,double maximum,double *out) {
  if(value.t==AUNDEF){*out=fallback;return 1;}
  if(!ais_safe_integer(value)||value.n<minimum||value.n>maximum){aauth_error("ARYA_AUTH_INPUT","Authentication integer is outside its allowed range.");return 0;}
  *out=value.n;return 1;
}
static char *aauth_text(AV value,size_t minimum,size_t maximum) {
  if(value.t!=ASTR||value.p->scope<0||(size_t)value.p->scope>maximum)goto invalid;
  for(int i=0;i<value.p->scope;i++) {
    unsigned c=value.p->chars[i];if(!c||c<32||c==127)goto invalid;
    if(c>=0xd800&&c<=0xdbff&&i+1<value.p->scope&&value.p->chars[i+1]>=0xdc00&&value.p->chars[i+1]<=0xdfff){i++;continue;}
    if(c>=0xd800&&c<=0xdfff)goto invalid;
  }
  size_t size=0;char *text=autf8bytes(value,&size);if(size<minimum||size>maximum){free(text);goto invalid;}return text;
 invalid:aauth_error("ARYA_AUTH_INPUT","Expected bounded nonempty Unicode text without control characters.");return NULL;
}
static int aauth_digest(const void *text,size_t size,unsigned char out[32]) {
  unsigned length=0;if(EVP_Digest(text,size,out,&length,EVP_sha256(),NULL)==1&&length==32)return 1;
  aauth_error("ARYA_AUTH_CRYPTO","Native authentication hashing failed.");return 0;
}

/* Open-addressed session table, at most half occupied. Empty/tombstone states
 * preserve probe chains; only issuance/stats/sweep scan expired entries. */
typedef struct {char subject[257],methods[8][33];unsigned method_count;} AAuthIdentity;
typedef struct {unsigned char state,digest[32];AAuthIdentity *identity;double issued,expires,deadline;} AAuthEntry;
typedef struct {AAuthEntry *entries;size_t capacity,limit,count,used;double ttl,next_expiry;} AAuthSessions;
static void aauth_session_release(AAuthSessions *s) {
  if(!s)return;aallocated-=sizeof(*s)+s->capacity*sizeof(AAuthEntry)+s->count*sizeof(AAuthIdentity);
  for(size_t i=0;i<s->capacity;i++)if(s->entries[i].state==1)asec_free((unsigned char*)s->entries[i].identity,sizeof(AAuthIdentity));
  asec_free((unsigned char*)s->entries,s->capacity*sizeof(AAuthEntry));free(s);
}
static void aauth_session_finalize(AH *handle) { aauth_session_release(handle->external);handle->external=NULL; }
static void aauth_session_delete(AAuthSessions *s,size_t index) {
  AAuthEntry *entry=&s->entries[index];if(entry->state!=1)return;
  aallocated-=sizeof(AAuthIdentity);asec_free((unsigned char*)entry->identity,sizeof(AAuthIdentity));memset(entry,0,sizeof(*entry));entry->state=2;s->count--;
}
static size_t aauth_session_find(AAuthSessions *s,const unsigned char digest[32],int insert) {
  uint64_t hash;memcpy(&hash,digest,sizeof(hash));size_t index=(size_t)hash&(s->capacity-1),deleted=SIZE_MAX;
  for(size_t n=0;n<s->capacity;n++,index=(index+1)&(s->capacity-1)) {
    AAuthEntry *entry=&s->entries[index];
    if(!entry->state)return insert?(deleted!=SIZE_MAX?deleted:index):SIZE_MAX;
    if(entry->state==2){if(deleted==SIZE_MAX)deleted=index;continue;}
    if(CRYPTO_memcmp(entry->digest,digest,32)==0)return index;
  }
  return insert?deleted:SIZE_MAX;
}
static void aauth_session_rehash(AAuthSessions *s) {
  AAuthEntry *old=s->entries;s->entries=amemory(s->capacity*sizeof(*s->entries));s->used=0;
  for(size_t i=0;i<s->capacity;i++)if(old[i].state==1){size_t at=aauth_session_find(s,old[i].digest,1);s->entries[at]=old[i];s->used++;}
  asec_free((unsigned char*)old,s->capacity*sizeof(*old));
}
static size_t aauth_session_sweep(AAuthSessions *s,double now) {
  size_t removed=0;s->next_expiry=INFINITY;
  for(size_t i=0;i<s->capacity;i++)if(s->entries[i].state==1) {
    if(s->entries[i].deadline<=now){aauth_session_delete(s,i);removed++;}
    else if(s->entries[i].deadline<s->next_expiry)s->next_expiry=s->entries[i].deadline;
  }
  return removed;
}
static int aauth_session_token(AV token,unsigned char digest[32]) {
  if(token.t!=ASTR||token.p->scope!=43)return 0;
  char bytes[43];int last=0;
  for(int i=0;i<43;i++) {
    unsigned c=token.p->chars[i];int n=c>='A'&&c<='Z'?(int)c-'A':c>='a'&&c<='z'?(int)c-'a'+26:c>='0'&&c<='9'?(int)c-'0'+52:c=='-'?62:c=='_'?63:-1;
    if(n<0)return 0;bytes[i]=(char)c;last=n;
  }
  return !(last&3)&&aauth_digest(bytes,sizeof(bytes),digest);
}
static AV aauth_session_view(const AAuthEntry *entry) {
  AV r[2]={arecord(),av(AUNDEF)};ARoot root;aroot(&root,r,2);
  aput(r[0],"subject",astr(entry->identity->subject));aput(r[0],"issuedAt",an(entry->issued));aput(r[0],"expiresAt",an(entry->expires));
  r[1]=alist(0,NULL);for(unsigned i=0;i<entry->identity->method_count;i++)aappend_value(r[1],astr(entry->identity->methods[i]));
  r[1].p->scope=-2;aput(r[0],"methods",r[1]);r[0].p->scope=-2;AV result=r[0];aunroot(&root);return result;
}
static int aauth_identity(AV subject,AV options,AAuthIdentity *identity) {
  const char *names[]={"methods"};if(!aauth_options(options,names,1))return 0;
  char *text=aauth_text(subject,1,256);if(!text)return 0;strcpy(identity->subject,text);free(text);
  AV methods=aauth_option(options,"methods");if(methods.t==AUNDEF)return 1;
  if(methods.t!=ALIST||methods.p->len>8){aauth_error("ARYA_AUTH_INPUT","Session methods must be a list of at most eight method names.");return 0;}
  for(size_t i=0;i<methods.p->len;i++) {
    AV method=methods.p->data[i];char *name=aauth_text(method,1,32);if(!name)return 0;
    for(char *p=name;*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='0'&&*p<='9')||*p=='-')){free(name);aauth_error("ARYA_AUTH_INPUT","Session methods use lowercase ASCII names.");return 0;}
    for(unsigned j=0;j<identity->method_count;j++)if(!strcmp(identity->methods[j],name)){free(name);aauth_error("ARYA_AUTH_INPUT","Duplicate authentication method.");return 0;}
    strcpy(identity->methods[identity->method_count++],name);free(name);
  }
  return 1;
}
static AV aauth_session_method(AV env,int argc,AV *argv) {
  AV r[4]={env,argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,4);
  AV handle=env.p->data[0];int method=(int)env.p->data[1].n;AAuthSessions *s=handle.p->external;
  if(method==8){aauth_session_finalize(handle.p);aunroot(&root);return av(AUNDEF);}
  if(!s){aauth_error("ARYA_AUTH_CLOSED","This authentication store is closed.");goto done;}
  double now=amonotonic();
  if(method==6){r[3]=an((double)aauth_session_sweep(s,now));goto done;}
  if(method==7){aauth_session_sweep(s,now);r[3]=arecord();aput(r[3],"active",an((double)s->count));aput(r[3],"maxSessions",an((double)s->limit));r[3].p->scope=-2;goto done;}
  if(method==5) {
    char *subject=aauth_text(r[1],1,256);if(!subject)goto done;size_t count=0;
    for(size_t i=0;i<s->capacity;i++)if(s->entries[i].state==1&&!strcmp(s->entries[i].identity->subject,subject)){aauth_session_delete(s,i);count++;}
    free(subject);r[3]=an((double)count);goto done;
  }
  AAuthIdentity identity={0};AAuthEntry previous={0};size_t index=SIZE_MAX;unsigned char digest[32]={0};
  if(method!=0) {
    if(aauth_session_token(r[1],digest))index=aauth_session_find(s,digest,0);
    if(index!=SIZE_MAX&&s->entries[index].deadline<=now){aauth_session_delete(s,index);index=SIZE_MAX;}
    if(index==SIZE_MAX){r[3]=method==4?ab(0):av(ANULL);goto done;}
    if(method==4){aauth_session_delete(s,index);r[3]=ab(1);goto done;}
    if(method==1||method==2){r[3]=aauth_session_view(&s->entries[index]);if(method==2&&!afailed)aauth_session_delete(s,index);goto done;}
    previous=s->entries[index];identity=*previous.identity;
  } else {
    if(!aauth_identity(r[1],r[2],&identity))goto done;
    if(now>=s->next_expiry)aauth_session_sweep(s,now);
    if(s->count>=s->limit){aauth_error("ARYA_AUTH_CAPACITY","Authentication store is full; revoke or expire entries before issuing more.");goto done;}
  }
  /* Bound tombstones under sustained login/logout churn, keeping unsuccessful
   * lookups short as well as successful ones. No live session is evicted. */
  if(s->used*4>=s->capacity*3){aauth_session_rehash(s);if(method==3)index=aauth_session_find(s,digest,0);}
  /* Generate the replacement before invalidating an old token. Rotation keeps
   * the original absolute expiry and never silently extends authentication. */
  unsigned char bytes[32];char *token=NULL;size_t target=SIZE_MAX;
  for(int tries=0;tries<4;tries++) {
    if(RAND_bytes(bytes,32)!=1){aauth_error("ARYA_AUTH_CRYPTO","Cannot obtain secure authentication randomness.");break;}
    token=asec_b64_c(bytes,32);OPENSSL_cleanse(bytes,32);
    if(!aauth_digest(token,43,digest)){asec_free((unsigned char*)token,43);token=NULL;break;}
    if(aauth_session_find(s,digest,0)==SIZE_MAX){target=aauth_session_find(s,digest,1);break;}
    asec_free((unsigned char*)token,43);token=NULL;
  }
  if(target==SIZE_MAX){if(token)asec_free((unsigned char*)token,43);if(!afailed)aauth_error("ARYA_AUTH_CRYPTO","Cannot allocate a unique session token.");goto done;}
  AAuthEntry fresh={0};fresh.state=1;memcpy(fresh.digest,digest,32);fresh.identity=&identity;
  fresh.issued=method==3?previous.issued:(double)time(NULL);fresh.expires=method==3?previous.expires:fresh.issued+s->ttl;fresh.deadline=method==3?previous.deadline:now+s->ttl;
  r[3]=arecord();r[2]=astr(token);asec_free((unsigned char*)token,43);aput(r[3],"token",r[2]);r[2]=aauth_session_view(&fresh);aput(r[3],"session",r[2]);r[3].p->scope=-2;
  if(!afailed) {
    AAuthIdentity *owned=amemory(sizeof(identity));aallocated+=sizeof(identity);memcpy(owned,&identity,sizeof(identity));fresh.identity=owned;
    if(method==3)aauth_session_delete(s,index);if(!s->entries[target].state)s->used++;s->entries[target]=fresh;s->count++;if(fresh.deadline<s->next_expiry)s->next_expiry=fresh.deadline;
  }
 done:;AV result=r[3];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aauth_sessions(AV options) {
  const char *names[]={"ttlSeconds","maxSessions"};if(!aauth_options(options,names,2))return av(AUNDEF);
  double ttl,limit;if(!aauth_integer(aauth_option(options,"ttlSeconds"),3600,1,2592000,&ttl)||!aauth_integer(aauth_option(options,"maxSessions"),4096,1,65536,&limit))return av(AUNDEF);
  AV r[3]={ap(aalloc(AHANDLE,0)),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,3);
  AAuthSessions *s=amemory(sizeof(*s));s->ttl=ttl;s->limit=(size_t)limit;s->capacity=2;while(s->capacity<s->limit*2)s->capacity*=2;
  s->entries=amemory(s->capacity*sizeof(*s->entries));s->next_expiry=INFINITY;
  r[0].p->name="arya.auth.sessions";r[0].p->external=s;r[0].p->finalize=aauth_session_finalize;
  aallocated+=sizeof(*s)+s->capacity*sizeof(*s->entries);if(aallocated>apeakh)apeakh=aallocated;r[1]=arecord();
  const char *methods[]={"issue","verify","consume","rotate","revoke","revokeAll","sweep","stats","close"};
  for(int i=0;i<9;i++){AV pair[2]={r[0],an(i)};r[2]=alist(2,pair);r[2]=afunction(aauth_session_method,r[2],methods[i]);aput(r[1],methods[i],r[2]);}
  r[1].p->scope=-2;AV result=r[1];aunroot(&root);return result;
}

static const char aauth_base32[]="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
static int aauth_secret(AV value,unsigned char bytes[64],size_t *length) {
  if(value.t!=ASTR||value.p->scope<32||value.p->scope>103)goto invalid;
  uint32_t buffer=0;int bits=0;size_t at=0;
  for(int i=0;i<value.p->scope;i++) {
    unsigned c=value.p->chars[i];int n=c>='A'&&c<='Z'?(int)c-'A':c>='2'&&c<='7'?(int)c-'2'+26:-1;if(n<0)goto invalid;
    buffer=(buffer<<5)|(unsigned)n;bits+=5;if(bits>=8){bits-=8;if(at>=64)goto invalid;bytes[at++]=(unsigned char)(buffer>>bits);}
  }
  if(at<20||(int)((at*8+4)/5)!=value.p->scope||(bits&&(buffer&((1U<<bits)-1))))goto invalid;*length=at;return 1;
 invalid:OPENSSL_cleanse(bytes,64);aauth_error("ARYA_AUTH_INPUT","TOTP secrets must be canonical uppercase unpadded Base32 encoding 20 to 64 bytes.");return 0;
}
static AV aauth_generate_secret(AV count) {
  double size;if(!aauth_integer(count,20,20,64,&size))return av(AUNDEF);unsigned char bytes[64];char text[104];
  if(RAND_bytes(bytes,(int)size)!=1)return aauth_error("ARYA_AUTH_CRYPTO","Cannot obtain secure TOTP randomness.");
  uint32_t buffer=0;int bits=0;size_t at=0;
  for(int i=0;i<(int)size;i++){buffer=(buffer<<8)|bytes[i];bits+=8;while(bits>=5){bits-=5;text[at++]=aauth_base32[(buffer>>bits)&31];}}
  if(bits)text[at++]=aauth_base32[(buffer<<(5-bits))&31];text[at]=0;OPENSSL_cleanse(bytes,sizeof(bytes));AV result=astr(text);OPENSSL_cleanse(text,sizeof(text));return result;
}
static AV aauth_totp(AV secret,AV code,AV options,int verify) {
  const char *names[]={"algorithm","digits","period","time","window","lastCounter"};if(!aauth_options(options,names,6))return av(AUNDEF);
  double digits,period,seconds,window,last;
  if(!aauth_integer(aauth_option(options,"digits"),6,6,8,&digits)|| (digits!=6&&digits!=8))return afailed?av(AUNDEF):aauth_error("ARYA_AUTH_INPUT","TOTP digits must be 6 or 8.");
  if(!aauth_integer(aauth_option(options,"period"),30,15,120,&period)||!aauth_integer(aauth_option(options,"time"),(double)time(NULL),0,253402300799.0,&seconds)||!aauth_integer(aauth_option(options,"window"),1,0,2,&window)||!aauth_integer(aauth_option(options,"lastCounter"),-1,-1,253402300799.0,&last))return av(AUNDEF);
  const EVP_MD *algorithm=EVP_sha1();AV name=aauth_option(options,"algorithm");
  if(name.t!=AUNDEF){if(akey(name,"SHA256"))algorithm=EVP_sha256();else if(akey(name,"SHA512"))algorithm=EVP_sha512();else if(!akey(name,"SHA1"))return aauth_error("ARYA_AUTH_INPUT","TOTP algorithm must be SHA1, SHA256 or SHA512.");}
  unsigned char key[64]={0};size_t key_size=0;if(!aauth_secret(secret,key,&key_size))return av(AUNDEF);
  char supplied[9]={0};int valid=code.t==ASTR&&code.p->scope==(int)digits;
  if(verify&&valid)for(int i=0;i<(int)digits;i++){unsigned c=code.p->chars[i];if(c<'0'||c>'9')valid=0;supplied[i]=(char)c;}
  int64_t counter=(int64_t)(seconds/period),matched=-1;char result[9]={0};
  for(int offset=verify?-(int)window:0;offset<=(verify?(int)window:0);offset++) {
    int64_t candidate=counter+offset;if(candidate<0)continue;
    unsigned char message[8],digest[EVP_MAX_MD_SIZE];uint64_t moving=(uint64_t)candidate;
    for(int i=7;i>=0;i--){message[i]=(unsigned char)moving;moving>>=8;}unsigned size=0;
    if(!HMAC(algorithm,key,(int)key_size,message,8,digest,&size)||size<20){OPENSSL_cleanse(key,sizeof(key));return aauth_error("ARYA_AUTH_CRYPTO","Native TOTP calculation failed.");}
    unsigned at=digest[size-1]&15;uint32_t number=((uint32_t)(digest[at]&127)<<24)|((uint32_t)digest[at+1]<<16)|((uint32_t)digest[at+2]<<8)|digest[at+3];
    snprintf(result,sizeof(result),"%0*u",(int)digits,number%(digits==6?1000000U:100000000U));OPENSSL_cleanse(digest,sizeof(digest));
    int equal=CRYPTO_memcmp(result,supplied,(size_t)digits)==0;if(verify&&valid&&equal&&candidate>(int64_t)last)matched=candidate;
  }
  OPENSSL_cleanse(key,sizeof(key));if(!verify)return astr(result);
  AV value=arecord();ARoot root;aroot(&root,&value,1);aput(value,"ok",ab(matched>=0));aput(value,"counter",matched>=0?an((double)matched):av(ANULL));value.p->scope=-2;aunroot(&root);return value;
}
static AV aauth_pkce(AV verifier) {
  char *text=NULL;
  if(verifier.t==AUNDEF){unsigned char bytes[32];if(RAND_bytes(bytes,32)!=1)return aauth_error("ARYA_AUTH_CRYPTO","Cannot obtain secure PKCE randomness.");text=asec_b64_c(bytes,32);OPENSSL_cleanse(bytes,32);}
  else {
    text=asec_ascii(verifier,128);size_t size=text?strlen(text):0;int valid=size>=43&&size<=128;
    for(size_t i=0;valid&&i<size;i++){char c=text[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'||c=='.'||c=='_'||c=='~'))valid=0;}
    if(!valid){free(text);return aauth_error("ARYA_AUTH_INPUT","PKCE verifier must contain 43 to 128 RFC 7636 unreserved ASCII characters.");}
  }
  unsigned char digest[32];if(!aauth_digest(text,strlen(text),digest)){asec_free((unsigned char*)text,strlen(text));return av(AUNDEF);}
  AV value=arecord();ARoot root;aroot(&root,&value,1);aput(value,"verifier",astr(text));asec_free((unsigned char*)text,strlen(text));aput(value,"challenge",asec_b64(digest,32));aput(value,"method",astr("S256"));value.p->scope=-2;aunroot(&root);return value;
}

static const char *aauth_status_code(int status) {
  const char *codes[]={"ok","unavailable","not-enrolled","locked","cancelled","denied","timeout","not-found","duplicate","platform-error","busy","not-interactive","missing-entitlement","invalid-context"};
  return codes[status>=0&&status<=13?status:9];
}
static int aauth_policy(AV value,int *owner) {
  if(value.t==AUNDEF||akey(value,"biometrics")){*owner=0;return 1;}if(akey(value,"device-owner")){*owner=1;return 1;}
  aauth_error("ARYA_AUTH_INPUT","Local authentication policy must be biometrics or device-owner.");return 0;
}
/* Recognize the native AbortSignal by its unforgeable state/identity link.
 * Inspect stored fields directly: never execute an untrusted signal getter. */
static AV aauth_signal(AV signal) {
  if(signal.t==AUNDEF)return signal;
  if(signal.t==ARECORD)for(size_t i=0;i+1<signal.p->len;i+=2)if(akey(signal.p->data[i],"aborted")) {
    AV getter=signal.p->data[i+1];if(getter.t!=AGETTER)break;
    AV fn=getter.p->parent;if(fn.t!=AFUNC||fn.p->code!=aabort_method)break;
    AV env=fn.p->parent;if(env.t!=ALIST||env.p->len!=2||env.p->data[1].t!=ANUM||env.p->data[1].n!=0)break;
    AV state=env.p->data[0];
    if(state.t==ALIST&&state.p->len==4&&state.p->data[0].t==ABOOL&&state.p->data[3].p==signal.p)return state;
    break;
  }
  return aauth_error("ARYA_AUTH_INPUT","signal must be a native AbortSignal.");
}
static void aauth_result_fields(AV value,AryaAuthResult result,int owner) {
  aput(value,"code",astr(aauth_status_code(result.status)));
  aput(value,"detail",astr(result.detail?result.detail:"platform-error"));
  aput(value,"kind",astr(result.kind==1?"touch-id":result.kind==2?"face-id":"none"));
  aput(value,"policy",astr(owner?"device-owner":"biometrics"));
  aput(value,"nativeDomain",result.domain?astr(result.domain==1?"LocalAuthentication":"Security"):av(ANULL));
  aput(value,"nativeCode",result.domain?an((double)result.native_code):av(ANULL));
  aput(value,"retryable",ab(result.status==ARYA_AUTH_CANCELLED||result.status==ARYA_AUTH_DENIED||result.status==ARYA_AUTH_TIMEOUT||result.status==ARYA_AUTH_BUSY||result.status==ARYA_AUTH_INTERACTION));
  aput(value,"outcomeUnknown",ab(result.may_have_changed));
}
#if defined(__APPLE__) && !defined(ARYA_AUTH_PORTABLE)
#define ARYA_AUTH_APPLE 1
static void aauth_native_finalize(AH *handle) {
  if(handle->external){arya_auth_operation_cancel(handle->external,ARYA_AUTH_CANCELLED);arya_auth_operation_release(handle->external);handle->external=NULL;}
}
#endif
static AV aauth_biometric_status(AV options) {
  const char *names[]={"policy"};if(!aauth_options(options,names,1))return av(AUNDEF);int owner;if(!aauth_policy(aauth_option(options,"policy"),&owner))return av(AUNDEF);
  AryaAuthStatus status={.result={.status=ARYA_AUTH_UNAVAILABLE,.detail="platform-unavailable"}};
#ifdef ARYA_AUTH_APPLE
  status=arya_auth_status(owner);
#endif
  AV value=arecord();ARoot root;aroot(&root,&value,1);
  aput(value,"supported",ab(
#ifdef ARYA_AUTH_APPLE
  1
#else
  0
#endif
  ));aput(value,"available",ab(status.available));aauth_result_fields(value,status.result,owner);value.p->scope=-2;aunroot(&root);return value;
}
static AV aauth_local(int operation,int argc,AV *argv) {
  AV r[7]={argc?argv[0]:av(AUNDEF),argc>1?argv[1]:av(AUNDEF),argc>2?argv[2]:av(AUNDEF),argc>3?argv[3]:av(AUNDEF),av(AUNDEF),av(AUNDEF),av(AUNDEF)};ARoot root;aroot(&root,r,7);
  AryaAuthRequest request={.operation=operation,.interactive=1};
  char *reason=NULL,*service=NULL,*account=NULL,*cancel_title=NULL;unsigned char *input=NULL,*output=NULL;size_t output_size=0;
  AV options=operation<0?r[0]:r[3];
  const char *names[]={"reason","policy","timeoutMs","signal","interactive","cancelTitle"};if(!aauth_options(options,names,6))goto done;
  if(!aauth_policy(aauth_option(options,"policy"),&request.owner))goto done;
  double timeout;if(!aauth_integer(aauth_option(options,"timeoutMs"),30000,1,120000,&timeout))goto done;
  reason=aauth_text(aauth_option(options,"reason"),1,256);if(!reason)goto done;request.reason=reason;
  AV interactive=aauth_option(options,"interactive");
  if(interactive.t!=AUNDEF){if(interactive.t!=ABOOL){aauth_error("ARYA_AUTH_INPUT","interactive must be a boolean.");goto done;}request.interactive=interactive.n!=0;}
  AV title=aauth_option(options,"cancelTitle");if(title.t!=AUNDEF){cancel_title=aauth_text(title,1,64);if(!cancel_title)goto done;request.cancel_title=cancel_title;}
  r[6]=aauth_signal(aauth_option(options,"signal"));if(afailed)goto done;
  if(operation>=0) {
    service=aauth_text(r[0],1,128);if(!service)goto done;request.service=service;
    account=aauth_text(r[1],1,256);if(!account)goto done;request.account=account;
    if(operation==0||operation==3){input=asec_text(r[2],1,16384,1,&request.input_size);if(!input)goto done;request.input=input;}
  }
  AryaAuthResult status={.status=ARYA_AUTH_UNAVAILABLE,.detail="platform-unavailable"};
  if(r[6].t==ALIST&&r[6].p->data[0].n)status=(AryaAuthResult){.status=ARYA_AUTH_CANCELLED,.detail="request-cancelled"};
#ifdef ARYA_AUTH_APPLE
  else {
    r[5]=ap(aalloc(AHANDLE,0));r[5].p->finalize=aauth_native_finalize;
    double deadline=amonotonic()+timeout/1000.0;
    r[5].p->external=arya_auth_operation_begin(&request);
    while(!arya_auth_operation_poll(r[5].p->external,&status)) {
      if(afailed||acurrent_task->cancelled)goto done;
      double now=amonotonic();
      if(r[6].t==ALIST&&r[6].p->data[0].n)arya_auth_operation_cancel(r[5].p->external,ARYA_AUTH_CANCELLED);
      else if(now>=deadline)arya_auth_operation_cancel(r[5].p->external,ARYA_AUTH_TIMEOUT);
      else aasync_suspend(av(AUNDEF),fmin(now+0.008,deadline));
    }
    if(operation==1&&status.status==ARYA_AUTH_OK&&!arya_auth_operation_copy_secret(r[5].p->external,&output,&output_size))status=(AryaAuthResult){.status=ARYA_AUTH_PLATFORM,.detail="credential-copy-failed"};
  }
#endif
  if(operation<0) {
    r[4]=arecord();aauth_result_fields(r[4],status,request.owner);aput(r[4],"ok",ab(status.status==ARYA_AUTH_OK));aput(r[4],"method",astr(request.owner?"device-owner":"biometrics"));r[4].p->scope=-2;
  } else if(status.status==ARYA_AUTH_OK)r[4]=operation==1?astrn((const char*)output,output_size):ab(1);
  else if(status.status==ARYA_AUTH_NOT_FOUND)r[4]=operation==1?av(ANULL):ab(0);
  else {
    const char *codes[]={"ARYA_AUTH_PLATFORM","ARYA_AUTH_UNAVAILABLE","ARYA_AUTH_NOT_ENROLLED","ARYA_AUTH_LOCKED","ARYA_AUTH_CANCELLED","ARYA_AUTH_DENIED","ARYA_AUTH_TIMEOUT","ARYA_AUTH_PLATFORM","ARYA_AUTH_DUPLICATE","ARYA_AUTH_PLATFORM","ARYA_AUTH_BUSY","ARYA_AUTH_NOT_INTERACTIVE","ARYA_AUTH_ENTITLEMENT","ARYA_AUTH_CONTEXT"};
    aauth_error(codes[status.status>=0&&status.status<=13?status.status:9],"Native credential operation failed.");
    r[4]=aerror;afailed=0;aauth_result_fields(r[4],status,request.owner);
    /* Keep exception code distinct from the normalized result code. */
    aput(r[4],"code",astr(codes[status.status>=0&&status.status<=13?status.status:9]));athrow(r[4]);
  }
 done:
#ifdef ARYA_AUTH_APPLE
  if(r[5].t==AHANDLE)aauth_native_finalize(r[5].p);
#endif
  free(reason);free(service);free(account);free(cancel_title);asec_free(input,request.input_size);asec_free(output,output_size);
  AV result=r[4];aunroot(&root);return afailed?av(AUNDEF):result;
}
static AV aauth_operation(int id,int argc,AV *argv) {
  AV x=argc?argv[0]:av(AUNDEF),y=argc>1?argv[1]:av(AUNDEF),z=argc>2?argv[2]:av(AUNDEF);
  switch(id-2000) {
    case 0:return aauth_sessions(x);
    case 1:return aauth_generate_secret(x);
    case 2:return aauth_totp(x,av(AUNDEF),y,0);
    case 3:return aauth_totp(x,y,z,1);
    case 4:return aauth_pkce(x);
    case 5:return aauth_biometric_status(x);
    case 6:return aauth_local(-1,argc,argv);
    case 7:case 8:case 9:return aauth_local(id-2007,argc,argv);
    case 10:return an(amonotonic());
    case 11:return aauth_local(3,argc,argv);
  }
  return aauth_error("ARYA_AUTH_INPUT","Unknown native authentication operation.");
}
