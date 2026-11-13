/* Find the first JSON quote, escape or control unit. The caller decodes it.
 * No load crosses length, including at a protected-page boundary. */
#ifndef ARYA_JSON_SCAN_H
#define ARYA_JSON_SCAN_H
#include <stddef.h>
#include <stdint.h>
#if defined(__aarch64__) && defined(__ARM_NEON) && __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__ && !defined(ARYA_JSON_SCALAR)
#include <arm_neon.h>
#define ARYA_JSON_NEON 1
#endif
static size_t ajscan_string(const uint16_t *text,size_t at,size_t length) {
#ifdef ARYA_JSON_NEON
  const uint16x8_t quote=vdupq_n_u16('"'),slash=vdupq_n_u16('\\'),control=vdupq_n_u16(32);
  for(;length-at>=8;at+=8){
    uint16x8_t units=vld1q_u16(text+at);
    uint16x8_t stop=vorrq_u16(vorrq_u16(vceqq_u16(units,quote),vceqq_u16(units,slash)),vcltq_u16(units,control));
    /* Eight comparison lanes become eight bytes; the least significant set
     * byte is the first special UTF-16 unit on little-endian AArch64. */
    uint64_t mask=vget_lane_u64(vreinterpret_u64_u8(vshrn_n_u16(stop,8)),0);
    if(mask)return at+((unsigned)__builtin_ctzll(mask)>>3);
  }
#endif
  for(;at<length;at++){uint16_t c=text[at];if(c=='"'||c=='\\'||c<32)break;}
  return at;
}
#endif
