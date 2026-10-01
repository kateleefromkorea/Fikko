import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/fetchAll";
import { daysAgoKey } from "../lib/dates";
import { EMPTY_BIOMETRICS, type BiometricData } from "../types";

// Same window as the habit history, so the Dashboard's year view is complete.
const HISTORY_DAYS = 400;

/**
 * Readings synced from the member's wearables (biometric_entries), shaped
 * like BiometricData. Empty until a device is connected, which keeps the
 * Dashboard and Habits cards showing their "no device data" states.
 */
export function useBiometrics(userId: string | null) {
  const [biometrics, setBiometrics] = useState<BiometricData>(EMPTY_BIOMETRICS);

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
      setBiometrics(next);
    } catch {
      // Before migration 012 runs, or offline: behave as if nothing is synced.
      setBiometrics(EMPTY_BIOMETRICS);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { biometrics, reload };
}
