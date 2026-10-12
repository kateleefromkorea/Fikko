import { useMemo } from "react";
import type { HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import { CORE_HABITS, WATER_TARGET } from "../../lib/completion";
import { PERIOD_DAYS, byDate, dayRange, habitStats, overview, type Period } from "../../lib/dashboardStats";
import type { DashCtx } from "./context";

/**
 * Everything the logged-habit sections read, worked out once per period.
 * Shared by the desktop Dashboard and the phone's Progress tab.
 */
export default function useDashCtx(data: HabitData, profile: ProfileRow | undefined, period: Period): DashCtx {
  return useMemo<DashCtx>(() => {
    const days = PERIOD_DAYS[period];
    const dates = dayRange(days);
    const prevDates = dayRange(days, days);
    const waterTarget = profile?.water_goal ?? WATER_TARGET;
    const ov = overview(data, dates, waterTarget);
    const prev = overview(data, prevDates, waterTarget);
    const prevOv = prev.logged > 0 ? prev : null;
    const m = Object.fromEntries(CORE_HABITS.map((k) => [k, byDate(data[k])])) as DashCtx["m"];
    return {
      data, profile, period, dates, prevDates, ov, prevOv, m, waterTarget,
      stats: habitStats(data, dates, prevDates, prevOv != null, waterTarget),
    };
  }, [data, profile, period]);
}
