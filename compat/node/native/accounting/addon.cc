#include <node_api.h>
#include <cmath>
#include <new>
#include "kernel.h"
using namespace arya_accounting;
namespace {
struct Pending {};
void ok(napi_env env,napi_status status) {
  if(status==napi_ok)return;
  bool pending=false;napi_is_exception_pending(env,&pending);
  if(!pending)napi_throw_error(env,"ARYA_ACCOUNTING_NATIVE","Node-API operation failed.");
  throw Pending{};
}
[[noreturn]] void input(napi_env env,const char* message) {napi_throw_type_error(env,"ARYA_ACCOUNTING_INPUT",message);throw Pending{};}
void property(napi_env env,napi_value object,const char* name,napi_value value){ok(env,napi_set_named_property(env,object,name,value));}
napi_value bigint(napi_env env,Wide value) {
  const bool negative=value<0;
  const UWide magnitude=negative?UWide(-(value+1))+1:UWide(value);
  const std::uint64_t words[2]={std::uint64_t(magnitude),std::uint64_t(magnitude>>64)};
  napi_value result;ok(env,napi_create_bigint_words(env,negative?1:0,words[1]?2:1,words,&result));return result;
}
std::uint64_t integer(napi_env env,napi_value value,std::uint64_t maximum) {
  napi_valuetype type;ok(env,napi_typeof(env,value,&type));if(type!=napi_number)input(env,"Expected an integer argument.");
  double number;ok(env,napi_get_value_double(env,value,&number));
  if(!std::isfinite(number)||number<0||number>maximum||std::floor(number)!=number)input(env,"Integer argument outside bounds.");
  return std::uint64_t(number);
}
struct Column {void* data;std::size_t length;};
Column column(napi_env env,napi_value value,napi_typedarray_type expected) {
  bool typed=false;ok(env,napi_is_typedarray(env,value,&typed));if(!typed)input(env,"Expected a typed column array.");
  napi_typedarray_type type;std::size_t length,offset;void* data;napi_value buffer;
  ok(env,napi_get_typedarray_info(env,value,&type,&length,&data,&buffer,&offset));
  bool ordinary=false,detached=false;ok(env,napi_is_arraybuffer(env,buffer,&ordinary));
  if(!ordinary)input(env,"Shared buffers are not accepted.");
  ok(env,napi_is_detached_arraybuffer(env,buffer,&detached));
  if(detached||type!=expected||length>max_rows||(length&&!data))input(env,"Detached, oversized or incorrectly typed column.");
  return {data,length};
}
void status(napi_env env,Status result) {
  if(result.error==Error::none)return;
  napi_value message,error,row;
  const char* code=result.error==Error::range?"ARYA_ACCOUNTING_RANGE":"ARYA_ACCOUNTING_INPUT";
  const char* text=result.error==Error::range?"A line amount exceeds signed 64-bit minor units.":"Invalid native accounting column value.";
  ok(env,napi_create_string_utf8(env,text,NAPI_AUTO_LENGTH,&message));ok(env,napi_create_error(env,nullptr,message,&error));
  napi_value code_value;ok(env,napi_create_string_utf8(env,code,NAPI_AUTO_LENGTH,&code_value));property(env,error,"code",code_value);
  ok(env,napi_create_uint32(env,std::uint32_t(result.row),&row));property(env,error,"row",row);
  ok(env,napi_throw(env,error));throw Pending{};
}
template<typename Action> napi_value guarded(napi_env env,Action action) {
  try{return action();}
  catch(const Pending&){return nullptr;}
  catch(const std::bad_alloc&){napi_throw_error(env,"ARYA_ACCOUNTING_MEMORY","Cannot allocate native accounting result.");return nullptr;}
  catch(...){napi_throw_error(env,"ARYA_ACCOUNTING_NATIVE","Native accounting failure.");return nullptr;}
}
napi_value invoice_call(napi_env env,napi_callback_info info) {
  return guarded(env,[&](){
    std::size_t argc=7;napi_value args[7];ok(env,napi_get_cb_info(env,info,&argc,args,nullptr,nullptr));if(argc!=6)input(env,"invoice requires six arguments.");
    const auto p=column(env,args[0],napi_bigint64_array),q=column(env,args[1],napi_bigint64_array),d=column(env,args[2],napi_uint32_array),t=column(env,args[3],napi_uint32_array);
    if(p.length!=q.length||p.length!=d.length||p.length!=t.length)input(env,"Column lengths must match.");
    const auto divisor=integer(env,args[4],1000000000000ULL),mode=integer(env,args[5],8);if(!divisor)input(env,"Divisor must be positive.");
    InvoiceTotals totals;status(env,invoice(static_cast<const std::int64_t*>(p.data),static_cast<const std::int64_t*>(q.data),static_cast<const std::uint32_t*>(d.data),static_cast<const std::uint32_t*>(t.data),p.length,divisor,mode,totals));
    napi_value result;ok(env,napi_create_object(env,&result));
    property(env,result,"gross",bigint(env,totals.gross));property(env,result,"discount",bigint(env,totals.discount));property(env,result,"net",bigint(env,totals.net));property(env,result,"tax",bigint(env,totals.tax));property(env,result,"total",bigint(env,totals.total));return result;
  });
}
napi_value ledger_call(napi_env env,napi_callback_info info) {
  return guarded(env,[&](){
    std::size_t argc=5;napi_value args[5];ok(env,napi_get_cb_info(env,info,&argc,args,nullptr,nullptr));if(argc!=4)input(env,"ledger requires four arguments.");
    const auto d=column(env,args[0],napi_bigint64_array),c=column(env,args[1],napi_bigint64_array),a=column(env,args[2],napi_uint32_array);
    if(d.length!=c.length||d.length!=a.length)input(env,"Column lengths must match.");const auto count=integer(env,args[3],max_accounts);
    LedgerTotals totals;status(env,ledger(static_cast<const std::int64_t*>(d.data),static_cast<const std::int64_t*>(c.data),static_cast<const std::uint32_t*>(a.data),d.length,count,totals));
    napi_value result,debits,credits;ok(env,napi_create_object(env,&result));ok(env,napi_create_array_with_length(env,count,&debits));ok(env,napi_create_array_with_length(env,count,&credits));
    for(std::uint32_t i=0;i<count;i++){ok(env,napi_set_element(env,debits,i,bigint(env,totals.debits[i])));ok(env,napi_set_element(env,credits,i,bigint(env,totals.credits[i])));}
    property(env,result,"debits",debits);property(env,result,"credits",credits);return result;
  });
}
napi_value init(napi_env env,napi_value exports) {
  return guarded(env,[&](){
    napi_value version;ok(env,napi_create_uint32(env,1,&version));property(env,exports,"abi",version);
    napi_value invoice_fn,ledger_fn;ok(env,napi_create_function(env,"invoice",NAPI_AUTO_LENGTH,invoice_call,nullptr,&invoice_fn));ok(env,napi_create_function(env,"ledger",NAPI_AUTO_LENGTH,ledger_call,nullptr,&ledger_fn));
    property(env,exports,"invoice",invoice_fn);property(env,exports,"ledger",ledger_fn);return exports;
  });
}
}
NAPI_MODULE(arya_accounting,init)
