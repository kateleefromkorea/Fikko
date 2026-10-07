// Who gets a reminder email this hour, and which one. Pure, so it can be
// tested without a database or a clock.
//
// The plan agreed for launch:
//   • at most one email a day, at the member's chosen hour in their time zone;
//   • daily and weekday reminders only go out if nothing is logged yet that day;
//   • the weekly summary goes out on Sundays, logged or not;
//   • after 7 days without logging, everyone drops to one email a week (Sunday);
//   • after 30 days without logging, the emails stop until they log again.

export type Frequency = "daily" | "weekdays" | "weekly" | "off";
export type ReminderKind = "nudge" | "weekly-summary" | "quiet";

export interface Candidate {
  frequency: Frequency;
  send_hour: number;
  time_zone: string;
  last_sent_on: string | null;
  signed_up: string;
  /** Dates the member logged anything on, as YYYY-MM-DD in their own time zone. */
  logged_days: string[];
}

export const QUIET_AFTER_DAYS = 7;
export const STOP_AFTER_DAYS = 30;

/** The member's local date (YYYY-MM-DD), hour and weekday (0 = Sunday) at `now`. Falls back to UTC for an unknown zone. */
export function localNow(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(now);
  } catch {
    return localNow(now, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** What to send this member now, or null. */
export function decide(c: Candidate, now: Date): { kind: ReminderKind; localDate: string; daysLoggedThisWeek: number } | null {
  if (c.frequency === "off") return null;
  const local = localNow(now, c.time_zone);
  if (local.hour !== c.send_hour) return null;
  if (c.last_sent_on === local.date) return null;

  const past = c.logged_days.filter((d) => d <= local.date).sort();
  const lastActive = past.at(-1) ?? null;
  const quietDays = daysBetween(lastActive ?? c.signed_up, local.date);
  const loggedToday = lastActive === local.date;
  const weekStart = shiftDate(local.date, -6);
  const daysLoggedThisWeek = past.filter((d) => d >= weekStart).length;
  const sunday = local.weekday === 0;

  if (quietDays > STOP_AFTER_DAYS) return null;
  if (quietDays >= QUIET_AFTER_DAYS) return sunday ? { kind: "quiet", localDate: local.date, daysLoggedThisWeek } : null;
  if (c.frequency === "weekly") return sunday ? { kind: "weekly-summary", localDate: local.date, daysLoggedThisWeek } : null;
  if (loggedToday) return null;
  if (c.frequency === "weekdays" && (local.weekday === 0 || local.weekday === 6)) return null;
  return { kind: "nudge", localDate: local.date, daysLoggedThisWeek };
}
