// The monthly tree rule, shared by the app (the Garden's progress card) and the
// server (api/trees.ts, which records the trees owed). Keep this file free of
// imports other than "./completion.js" and "./dates.js", and use the ".js"
// extension, so the server can load it as well as the app.
//
// Fikko donates and plants a real tree for every calendar month in which every
// habit was done on every day. A day with nothing logged that a rain cloud
// covers still counts. Rain clouds follow the plant's rules (one for every
// RAIN_CLOUD_EVERY complete days in a row, hold up to MAX_RAIN_CLOUDS, used up
// on the next day with nothing logged), replayed from TREE_LOOKBACK_DAYS before
// the month starts so the app and the server always see the same days.

import type { HabitData } from "../types";
import { CORE_HABITS, completion } from "./completion.js";
import { shiftDateKey } from "./dates.js";

export const RAIN_CLOUD_EVERY = 7;
export const MAX_RAIN_CLOUDS = 3;
/** How far before a month the rain clouds are replayed from. */
export const TREE_LOOKBACK_DAYS = 92;

export type TreeDay = "done" | "missed" | "today" | "upcoming";

export interface MonthStatus {
  /** "YYYY-MM". */
  month: string;
  /** One entry per day of the month. */
  days: TreeDay[];
  completeDays: number;
  /** No day missed so far. */
  onTrack: boolean;
  /** The month is over and every day counted: a tree is owed. */
  complete: boolean;
}

/** Anything logged on a day. */
export function loggedOn(data: HabitData, date: string): boolean {
  return (
    CORE_HABITS.some((k) => data[k].some((e) => e.date === date)) ||
    data.custom.some((h) => h.entries.some((e) => e.date === date && e.value > 0))
  );
}

/** "YYYY-MM-01" and the month's last day. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, length: last };
}

/** The month before "YYYY-MM". */
export function previousMonth(month: string) {
  return shiftDateKey(`${month}-01`, -1).slice(0, 7);
}

/** How a calendar month went for the tree, as of `today` (the member's local date). */
export function monthStatus(data: HabitData, month: string, today: string, waterTarget?: number): MonthStatus {
  const { from, to, length } = monthRange(month);
  const days: TreeDay[] = [];
  let streak = 0;
  let clouds = 0;

  for (let date = shiftDateKey(from, -TREE_LOOKBACK_DAYS); date <= to; date = shiftDateKey(date, 1)) {
    const inMonth = date >= from;
    if (date > today) {
      if (inMonth) days.push("upcoming");
      continue;
    }
    const isToday = date === today;
    const { done, total } = completion(data, date, waterTarget);
    const complete = total > 0 && done === total;
    const covered = !complete && !isToday && clouds > 0 && !loggedOn(data, date);
    if (covered) clouds--;

    if (complete) {
      streak++;
      if (streak % RAIN_CLOUD_EVERY === 0) clouds = Math.min(clouds + 1, MAX_RAIN_CLOUDS);
    } else if (!isToday && !covered) streak = 0;

    if (inMonth) days.push(complete || covered ? "done" : isToday ? "today" : "missed");
  }

  const completeDays = days.filter((d) => d === "done").length;
  return {
    month,
    days,
    completeDays,
    onTrack: !days.includes("missed"),
    complete: completeDays === length,
  };
}
