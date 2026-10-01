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

export type Period = "day" | "week" | "month";

/**
 * First and last day keys (inclusive) of the day, week or calendar month that
 * contains `key`. Weeks run Monday to Sunday, as on the dashboard.
 */
export function periodRange(period: Period, key: string): { from: string; to: string } {
  if (period === "day") return { from: key, to: key };
  const d = new Date(key + "T12:00:00");
  if (period === "week") {
    const from = shiftDateKey(key, -((d.getDay() + 6) % 7));
    return { from, to: shiftDateKey(from, 6) };
  }
  return {
    from: localDateKey(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

/** "2 October 2026", "28 September – 4 October 2026", "October 2026" or "All time". */
export function describeRange(range: { from: string; to: string } | null): string {
  if (!range) return "All time";
  const fmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(key + "T12:00:00").toLocaleDateString(undefined, opts);
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  if (range.from === range.to) return fmt(range.from, full);
  const month = periodRange("month", range.from);
  if (month.from === range.from && month.to === range.to) return fmt(range.from, { month: "long", year: "numeric" });
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${fmt(range.from, sameYear ? { day: "numeric", month: "long" } : full)} – ${fmt(range.to, full)}`;
}
