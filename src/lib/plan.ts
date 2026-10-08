import { supabase } from "./supabase";
import type { Plan } from "./fikko";

// The member's plan and what it includes (migration 035). Limits only apply
// once `enforced` is true; until paid plans open every member keeps full access
// and the current 20 AI messages a day. Keep PLAN_LIMITS in step with
// api/_lib/plans.ts, which is what the server actually enforces.

export interface PlanState { plan: Plan; enforced: boolean }

export interface PlanLimits {
  customHabits: number | null;
  aiPerWeek: number | null;
  coachPerDay: number | null;
  historyDays: number | null;
  wearableBiometrics: boolean;
  interactionAi: boolean;
  csvExport: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { customHabits: 3, aiPerWeek: 5, coachPerDay: null, historyDays: 7, wearableBiometrics: false, interactionAi: false, csvExport: false },
  premium: { customHabits: null, aiPerWeek: null, coachPerDay: 20, historyDays: 30, wearableBiometrics: true, interactionAi: false, csvExport: false },
  max: { customHabits: null, aiPerWeek: null, coachPerDay: 50, historyDays: null, wearableBiometrics: true, interactionAi: true, csvExport: true },
};

/** Before plans are enforced, everyone has everything. */
const OPEN: PlanLimits = { customHabits: null, aiPerWeek: null, coachPerDay: 20, historyDays: null, wearableBiometrics: true, interactionAi: true, csvExport: true };

export const limitsFor = ({ plan, enforced }: PlanState): PlanLimits => (enforced ? PLAN_LIMITS[plan] : OPEN);

/** AI messages allowed per period; Free's is weekly, the rest daily. */
export function aiAllowance(state: PlanState) {
  const l = limitsFor(state);
  return l.aiPerWeek != null ? { limit: l.aiPerWeek, period: "week" as const } : { limit: l.coachPerDay ?? 20, period: "day" as const };
}

/** The plan to show locks for in My Fikko: Free until plans are enforced, as before. */
export const displayPlan = ({ plan, enforced }: PlanState): Plan => (enforced ? plan : "free");

/** Fails open (everything unlocked) if the migration hasn't run or the call fails, so a hiccup never locks anyone out. */
export async function fetchMyPlan(): Promise<PlanState> {
  const { data, error } = await supabase.rpc("my_plan");
  const plan = (data as { plan?: unknown } | null)?.plan;
  if (error || (plan !== "free" && plan !== "premium" && plan !== "max")) return { plan: "max", enforced: false };
  return { plan, enforced: (data as { enforced?: unknown }).enforced === true };
}

export const PLANS_URL = "https://www.fikko.io/#pricing";
