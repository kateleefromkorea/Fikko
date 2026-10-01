import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface ProfileRow {
  name: string;
  date_of_birth: string | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  calorie_goal: number;
  water_goal: number;
  sleep_goal: number;

  // ── Added by migration 005 (onboarding) ──
  /** Null until the wizard is finished; this is what gates the modal. */
  onboarding_completed_at: string | null;
  primary_goal: string | null;
  target_weight_kg: number | null;
  /** Signed kg/week: negative to lose, positive to gain. */
  weekly_rate_kg: number | null;
  dietary_pattern: string | null;
  allergies: string[];
  wearable: string | null;
  tracking_style: string | null;
  reminders_enabled: boolean;
  height_unit: string;
  weight_unit: string;
  bmr: number | null;
  tdee: number | null;

  // ── Added by migration 013 (deletion grace period) ──
  /** Set when the member has asked to delete their account: the date it will
   *  be permanently deleted. Null for an active account. */
  deletion_scheduled_for: string | null;
}

const EMPTY_PROFILE: ProfileRow = {
  name: "",
  date_of_birth: null,
  gender: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
  calorie_goal: 2000,
  water_goal: 8,
  sleep_goal: 8,
  onboarding_completed_at: null,
  primary_goal: null,
  target_weight_kg: null,
  weekly_rate_kg: null,
  dietary_pattern: null,
  allergies: [],
  wearable: null,
  tracking_style: null,
  reminders_enabled: false,
  height_unit: "cm",
  weight_unit: "kg",
  bmr: null,
  tdee: null,
  deletion_scheduled_for: null,
};

/**
 * Merges a database row over the defaults. Columns that are missing — or null
 * where the app expects a value, like `allergies` on a pre-migration row —
 * keep their default instead of poisoning the state with null.
 */
function mergeRow(row: Partial<ProfileRow>): ProfileRow {
  const merged = { ...EMPTY_PROFILE };
  for (const [key, value] of Object.entries(row)) {
    if (!(key in EMPTY_PROFILE)) continue;
    const k = key as keyof ProfileRow;
    if (value == null && EMPTY_PROFILE[k] != null) continue;
    (merged as Record<string, unknown>)[k] = value;
  }
  return merged;
}

export function useProfile(userId: string | null) {
  const [profile, setProfileState] = useState<ProfileRow>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfileState(EMPTY_PROFILE);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      // Selected wholesale so a database that has not run migration 005 yet
      // still returns a row instead of erroring on unknown columns.
      .select("*")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) setProfileState(mergeRow(data as Partial<ProfileRow>));
        setLoading(false);
      });
  }, [userId]);

  async function updateProfile(patch: Partial<ProfileRow>) {
    setProfileState((p) => ({ ...p, ...patch }));
    if (!userId) return;
    await supabase.from("profiles").update(patch).eq("user_id", userId);
  }

  return { profile, updateProfile, loading };
}
