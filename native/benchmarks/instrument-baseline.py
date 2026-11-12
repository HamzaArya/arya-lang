"""Add matching counters to a saved pre-change generated C, never to timing builds."""
import sys
from pathlib import Path
source = Path(sys.argv[1]).read_text()
assert '#define ARYA_RUNTIME_COUNTERS 1' in source
assert 'ARYA_ALLOCATION_DETAIL' not in source
source = source.replace('static void acounters_report(void) {', '''static size_t abench_bytes,abench_strings,abench_units;
static double abench_gc_ms;
static void acounters_report(void) {
  fprintf(stderr,"ARYA_ALLOCATION_DETAIL {\\"requestedBytes\\":%zu,\\"strings\\":%zu,\\"stringUnits\\":%zu,\\"gcCpuMs\\":%.6f}\\n",abench_bytes,abench_strings,abench_units,abench_gc_ms);''', 1)
source = source.replace('static void *amemory(size_t n) {', 'static void *amemory(size_t n) { abench_bytes+=n?n:1;', 1)
source = source.replace('static AV as16(const uint16_t *s, size_t n) {', 'static AV as16(const uint16_t *s, size_t n) { abench_strings++;abench_units+=n;', 1)
source = source.replace('static void agc(void) {', 'static void agc(void) { clock_t abench_started=clock();', 1)
needle = 'athreshold=aallocated*2+1024*1024; acollections++;'
assert needle in source
source = source.replace(needle, needle + ' abench_gc_ms+=(double)(clock()-abench_started)*1000/CLOCKS_PER_SEC;', 1)
Path(sys.argv[2]).write_text(source)
