/** ISO date-only strings, instants, and explicit IANA-zone projections. */
export const datetimeRuntime = String.raw`
const __arya_datetime = (() => {
  const fail = message => Object.assign(new RangeError(message), {code: 'ARYA_DATETIME'});
  const date = value => {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) throw fail('Use a date-only string YYYY-MM-DD with year 0001 through 9999.');
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw fail('Invalid calendar date.');
    return value;
  };
  const instant = value => {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) throw fail('Use an ISO instant with seconds and an explicit Z or numeric offset; up to millisecond precision.');
    date(value.slice(0,10));
    const hour = Number(value.slice(11,13)), minute = Number(value.slice(14,16)), second = Number(value.slice(17,19));
    const zone = /([+-])([0-9]{2}):([0-9]{2})$/.exec(value);
    if (hour > 23 || minute > 59 || second > 59 || zone && (Number(zone[2]) > 23 || Number(zone[3]) > 59)) throw fail('Invalid instant time or offset.');
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw fail('Invalid instant.');
    const serialized = parsed.toISOString();
    if (!/^[0-9]{4}-/.test(serialized) || serialized.startsWith('0000')) throw fail('Instant is outside years 0001 through 9999.');
    return serialized;
  };
  const zoned = (value, zone) => {
    if (typeof zone !== 'string' || !zone) throw fail('An explicit time zone is required.');
    const formatter = new Intl.DateTimeFormat('en-CA', {timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', era:'short', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant(value))).map(part => [part.type, part.value]));
    if (parts.era !== 'AD') throw fail('Zoned date is outside years 0001 through 9999.');
    return {date: date(parts.year.padStart(4,'0') + '-' + parts.month + '-' + parts.day), time: parts.hour + ':' + parts.minute + ':' + parts.second, timeZone: formatter.resolvedOptions().timeZone};
  };
  return Object.freeze({date, instant, zoned,
    fromDate: value => { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw fail('Expected a valid JavaScript Date.'); return instant(value.toISOString()); },
    toDate: value => new Date(instant(value)),
    dateAt: (value, zone) => zoned(value, zone).date,
    atOffset: (value, time, offset) => instant(date(value) + 'T' + time + offset),
  });
})();`;
