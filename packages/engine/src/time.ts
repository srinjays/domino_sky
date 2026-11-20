/**
 * Time utilities. All engine arithmetic uses integer minutes since 00:00 of
 * the operating day. Values >= 1440 represent the following calendar day
 * (e.g. 1500 = 01:00 next day). No Date objects, no time zones, no floats.
 */

/** Integer minutes since 00:00 of the operating day. */
export type Minutes = number;

export const MINUTES_PER_DAY = 1440;
/** Latest representable time: 47:59 (end of the following day). */
export const MAX_MINUTES = 47 * 60 + 59;

const HHMM = /^(\d{1,2}):([0-5]\d)$/;

/** Parse "HH:MM" (HH may be 00-47 to express next-day times) into minutes. */
export function parseHHMM(value: string): Minutes {
  const match = HHMM.exec(value.trim());
  if (!match) {
    throw new RangeError(`Invalid time "${value}" - expected HH:MM`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 47) {
    throw new RangeError(`Invalid time "${value}" - hour must be 0-47`);
  }
  return hours * 60 + minutes;
}

/** True when the string is a valid HH:MM time accepted by {@link parseHHMM}. */
export function isHHMM(value: string): boolean {
  const match = HHMM.exec(value.trim());
  return match !== null && Number(match[1]) <= 47;
}

/**
 * Format minutes as a 24h clock "HH:MM". Times on the next day are wrapped
 * and suffixed with "+1" (e.g. 1500 -> "01:00+1").
 */
export function formatClock(value: Minutes): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Cannot format time ${value}`);
  }
  const dayOffset = Math.floor(value / MINUTES_PER_DAY);
  const inDay = value % MINUTES_PER_DAY;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return dayOffset === 0 ? `${hh}:${mm}` : `${hh}:${mm}+${dayOffset}`;
}

/** Format a duration in minutes as e.g. "1h 30m", "45m", "2h". */
export function formatDuration(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

