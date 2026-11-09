import { unzipSync, zipSync } from 'fflate';

// ZIP timestamps have two-second precision. fflate supports 1980–2099.
const firstZipSecond = Date.UTC(1980, 0, 1) / 1000;
const lastZipSecond = Date.UTC(2099, 11, 31, 23, 59, 58) / 1000;

export function archiveEpoch(value = process.env.SOURCE_DATE_EPOCH) {
  if (value === undefined || value === '') return firstZipSecond;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('SOURCE_DATE_EPOCH must be a nonnegative integer number of seconds.');
  return Math.max(firstZipSecond, Math.min(lastZipSecond, Number(value) - Number(value) % 2));
}

/** Canonical file order, metadata, and permissions, retaining every file payload.
 * Shebang scripts remain executable when the kit/VSIX is extracted on Unix.
 * fflate encodes DOS dates through local Date getters, so set UTC only during
 * its synchronous call and restore the caller's timezone before returning.
 */
export function deterministicZip(files, epoch = archiveEpoch()) {
  const entries = Object.create(null);
  for (const name of Object.keys(files).sort()) {
    const bytes = files[name], directory = name.endsWith('/');
    const mode = directory ? 0o40755 : bytes[0] === 35 && bytes[1] === 33 ? 0o100755 : 0o100644;
    entries[name] = [bytes, { level: 9, mtime: new Date(epoch * 1000), os: 3, attrs: (mode << 16) | (directory ? 16 : 0) }];
  }
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'UTC';
  try { return zipSync(entries); }
  finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
}

/** Remove VSCE's filesystem/current-time metadata without changing payloads. */
export function normalizeVsix(bytes, epoch = archiveEpoch()) {
  return deterministicZip(unzipSync(bytes), epoch);
}
