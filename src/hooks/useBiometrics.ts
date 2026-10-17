import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/fetchAll";
import { daysAgoKey } from "../lib/dates";
import { EMPTY_BIOMETRICS, type BiometricData } from "../types";
import { WEIGH_INS_EVENT, fetchWeighIns } from "../lib/adaptiveData";

// Same window as the habit history, so the Dashboard's year view is complete.
const HISTORY_DAYS = 400;

/**
 * Readings synced from the member's wearables (biometric_entries), shaped
 * like BiometricData, plus weigh-ins they typed in themselves (weigh_ins,
 * migration 042), which win over a scale's reading on the same day. Empty until a device is connected, which keeps the
 * Dashboard and Habits cards showing their "no device data" states.
 */
export function useBiometrics(userId: string | null) {
  const [biometrics, setBiometrics] = useState<BiometricData>(EMPTY_BIOMETRICS);
  // Whose readings have finished loading, so callers can wait for the first load.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return setBiometrics(EMPTY_BIOMETRICS);
    try {
      const rows = await fetchAllRows<{ metric: keyof BiometricData; date: string; value: number }>((from, to) =>
        supabase
          .from("biometric_entries")
          .select("metric, date, value")
          .eq("user_id", userId)
          .gte("date", daysAgoKey(HISTORY_DAYS))
          .order("date")
          .order("metric")
          .order("source")
          .range(from, to),
      );
      const next: BiometricData = Object.fromEntries(Object.keys(EMPTY_BIOMETRICS).map((k) => [k, []])) as unknown as BiometricData;
      // If two devices report the same metric on the same day, the first one wins.
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.metric}|${r.date}`;
        if (!next[r.metric] || seen.has(key)) continue;
        seen.add(key);
        next[r.metric].push({ date: r.date, value: Number(r.value) });
      }
      // The member's own weigh-ins: theirs wins on a day the scale also reported.
      const typed = await fetchWeighIns(userId, daysAgoKey(HISTORY_DAYS));
      if (typed.length) {
        const byDate = new Map(next.weight.map((e) => [e.date, e.value]));
        for (const w of typed) byDate.set(w.date, w.kg);
        next.weight = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
      }
      setBiometrics(next);
    } catch {
      // Before migration 012 runs, or offline: behave as if nothing is synced.
      setBiometrics(EMPTY_BIOMETRICS);
    }
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    void reload();
    // A weigh-in typed anywhere in the app shows up straight away.
    const onWeighIn = () => void reload();
    window.addEventListener(WEIGH_INS_EVENT, onWeighIn);
    return () => window.removeEventListener(WEIGH_INS_EVENT, onWeighIn);
  }, [reload]);

  return { biometrics, reload, loaded: !!userId && loadedFor === userId };
}
