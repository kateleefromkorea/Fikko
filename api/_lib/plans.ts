// What each plan includes, in one place, so the server enforces exactly what
// the pricing page promises. Limits apply only once enforcement is switched on
// (plan_settings.enforced, migration 035); until then every member keeps the
// current shared allowance (DAILY_AI_LIMIT in aiUsage.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "premium" | "max";

/**
 * The quiet ceiling on anything sold as "unlimited" AI. Every AI call costs
 * money, so a heavy user or a script can't run up a bill; the Terms say fair
 * use applies. Not shown in the app unless someone reaches it.
 */
export const FAIR_USE_DAILY_AI = 100;

export interface PlanLimits {
  customHabits: number | null;
  /** Free's allowance is weekly; null when the plan uses daily limits instead. */
  aiPerWeek: number | null;
  /** AI coach messages a day. */
  coachPerDay: number | null;
  /** All AI a day, including voice, photo and interaction checks. */
  aiPerDay: number;
  /** Days of history the dashboard shows; null for all of it. */
  historyDays: number | null;
  /** Sleep stages, HRV, heart rate and the rest of the wearable biometrics. */
  wearableBiometrics: boolean;
  /** The interaction check's AI review, for items the built-in list doesn't know. */
  interactionAi: boolean;
  csvExport: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    customHabits: 3, aiPerWeek: 5, coachPerDay: null, aiPerDay: FAIR_USE_DAILY_AI,
    historyDays: 7, wearableBiometrics: false, interactionAi: false, csvExport: false,
  },
  premium: {
    customHabits: null, aiPerWeek: null, coachPerDay: 20, aiPerDay: FAIR_USE_DAILY_AI,
    historyDays: 30, wearableBiometrics: true, interactionAi: false, csvExport: false,
  },
  max: {
    customHabits: null, aiPerWeek: null, coachPerDay: 50, aiPerDay: FAIR_USE_DAILY_AI,
    historyDays: null, wearableBiometrics: true, interactionAi: true, csvExport: true,
  },
};

export interface PlanState {
  plan: Plan;
  /** False until paid plans open; limits are not applied while it is. */
  enforced: boolean;
}

/** The member's plan and whether limits are on. Fails open (not enforced) if migration 035 hasn't run. */
export async function planOf(db: SupabaseClient, userId: string): Promise<PlanState> {
  const { data, error } = await db.rpc("plan_state", { p_user: userId });
  const plan = (data as { plan?: unknown } | null)?.plan;
  if (error || (plan !== "free" && plan !== "premium" && plan !== "max")) return { plan: "max", enforced: false };
  return { plan, enforced: (data as { enforced?: unknown }).enforced === true };
}
