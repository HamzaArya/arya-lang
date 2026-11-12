#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>
#ifndef __SIZEOF_INT128__
#error "This optional kernel requires a compiler with signed 128-bit integers."
#endif
namespace arya_accounting {
using Wide = __int128_t;
using UWide = __uint128_t;
constexpr std::size_t max_rows = 1000000;
constexpr std::size_t max_accounts = 100000;
struct InvoiceTotals { Wide gross=0,discount=0,net=0,tax=0,total=0; };
struct LedgerTotals { std::vector<Wide> debits,credits; };
enum class Error {none, input, range};
struct Status { Error error=Error::none; std::size_t row=0; };
inline bool fits(Wide value) {return value>=std::numeric_limits<std::int64_t>::min()&&value<=std::numeric_limits<std::int64_t>::max();}
// denominator is positive and <= 1000000000000. A signed 64 x signed 64 product
// fits in Wide, as do all per-line rate products and <= 1M-row aggregates.
inline Wide rounded(Wide value,Wide denominator,unsigned mode) {
  const Wide quotient=value/denominator,remainder=value%denominator;
  if(!remainder)return quotient;
  const bool negative=value<0;
  const Wide absolute=remainder<0?-remainder:remainder,twice=absolute*2;
  bool increment=false;
  switch(mode){
    case 0:increment=true;break;
    case 1:break;
    case 2:increment=!negative;break;
    case 3:increment=negative;break;
    case 4:increment=twice>=denominator;break;
    case 5:increment=twice>denominator;break;
    case 6:increment=twice>denominator||(twice==denominator&&quotient%2!=0);break;
    case 7:increment=twice>denominator||(twice==denominator&&!negative);break;
    case 8:increment=twice>denominator||(twice==denominator&&negative);break;
  }
  return quotient+(increment?(negative?-1:1):0);
}
inline Status invoice(const std::int64_t* prices,const std::int64_t* quantities,const std::uint32_t* discounts,const std::uint32_t* taxes,std::size_t length,std::uint64_t divisor,unsigned mode,InvoiceTotals& totals) {
  if(length>max_rows||!divisor||divisor>1000000000000ULL||mode>8)return {Error::input,0};
  for(std::size_t i=0;i<length;i++){
    if(quantities[i]<0||discounts[i]>1000000||taxes[i]>100000000)return {Error::input,i};
    const Wide gross=rounded(Wide(prices[i])*Wide(quantities[i]),divisor,mode);
    if(!fits(gross))return {Error::range,i};
    const Wide discount=rounded(gross*discounts[i],1000000,mode),net=gross-discount;
    if(!fits(discount)||!fits(net))return {Error::range,i};
    const Wide tax=rounded(net*taxes[i],1000000,mode),total=net+tax;
    if(!fits(tax)||!fits(total))return {Error::range,i};
    totals.gross+=gross;totals.discount+=discount;totals.net+=net;totals.tax+=tax;totals.total+=total;
  }
  return {};
}
inline Status ledger(const std::int64_t* debits,const std::int64_t* credits,const std::uint32_t* accounts,std::size_t length,std::size_t count,LedgerTotals& result) {
  if(length>max_rows||count>max_accounts)return {Error::input,0};
  result.debits.assign(count,0);result.credits.assign(count,0);
  for(std::size_t i=0;i<length;i++){
    if(accounts[i]>=count||debits[i]<0||credits[i]<0)return {Error::input,i};
    result.debits[accounts[i]]+=debits[i];result.credits[accounts[i]]+=credits[i];
  }
  return {};
}
}
