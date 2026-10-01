// Day keys ("YYYY-MM-DD") for habit entries, in the member's own time zone.
//
// Entries used to be keyed by the UTC date, so for anyone ahead of UTC the day
// rolled over in the morning (8am in Singapore) instead of at midnight. These
// helpers keep everything on the local calendar.

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar date of `d` as a day key. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's day key, in local time. */
export const todayKey = () => localDateKey();

/** The day key `days` after (or before, if negative) another day key. */
export function shiftDateKey(key: string, days: number): string {
  // Noon avoids any daylight-saving edge pushing the date across midnight.
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** The day key `daysAgo` days before today. */
export const daysAgoKey = (daysAgo: number) => shiftDateKey(todayKey(), -daysAgo);
