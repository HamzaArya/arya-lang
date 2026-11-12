#include "kernel.h"
#include <cassert>
#include <iostream>
using namespace arya_accounting;
int main(){
  const int positive[]={3,2,3,2,3,2,2,3,2},negative[]={-3,-2,-2,-3,-3,-2,-2,-2,-3};
  for(unsigned mode=0;mode<9;mode++){
    assert(rounded(25,10,mode)==positive[mode]);assert(rounded(-25,10,mode)==negative[mode]);
    assert(rounded(20,10,mode)==2);assert(rounded(-20,10,mode)==-2);
  }
  const std::int64_t prices[]={1995,-1995},quantities[]={1000000,1000000};const std::uint32_t discounts[]={100000,100000},taxes[]={75000,75000};
  InvoiceTotals total;assert(invoice(prices,quantities,discounts,taxes,2,1000000,6,total).error==Error::none);assert(total.total==0);
  const std::int64_t limit[]={std::numeric_limits<std::int64_t>::max()},one[]={1000000},two[]={2000000};const std::uint32_t zero[]={0},id[]={0};
  InvoiceTotals big;assert(invoice(limit,one,zero,zero,1,1000000,6,big).error==Error::none);assert(big.total==limit[0]);
  InvoiceTotals overflow;assert(invoice(limit,two,zero,zero,1,1000000,6,overflow).error==Error::range);
  const std::int64_t minimum[]={std::numeric_limits<std::int64_t>::min()};InvoiceTotals min;assert(invoice(minimum,one,zero,zero,1,1000000,6,min).error==Error::none);assert(min.total==minimum[0]);
  LedgerTotals ledger_result;assert(ledger(limit,limit,id,1,1,ledger_result).error==Error::none);assert(ledger_result.debits[0]==limit[0]);
  // Exercise products near the signed-128 boundary under address/UB sanitizers.
  for(std::int64_t i=1;i<100000;i++){
    const Wide product=Wide(limit[0]-i)*Wide(limit[0]-i);
    for(unsigned mode=0;mode<9;mode++)assert(rounded(product,1000000,mode)>0);
  }
  std::cout<<"Native kernel sanitizer checks passed\n";
}
