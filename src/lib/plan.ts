import { supabase } from "./supabase";
import type { Plan } from "./fikko";

// The member's plan and what it includes (migration 035). Limits only apply
// once `enforced` is true; until then every member keeps full access
// and the current 20 AI messages a day. Keep PLAN_LIMITS in step with
// api/_lib/plans.ts, which is what the server actually enforces.

export interface PlanState {
  plan: Plan;
  enforced: boolean;
  /** When the member's free trial ends (or ended); null if they've never had one (migration 040). */
  trialEndsAt?: string | null;
  /** Whether a "Start free trial" button should show: on Free, never trialled, plans enforced. */
  trialAvailable?: boolean;
}

/** Length of the no-card Premium trial; the server's start_trial() sets the real end. */
export const TRIAL_DAYS = 7;

export interface PlanLimits {
  customHabits: number | null;
  aiPerWeek: number | null;
  coachPerDay: number | null;
  historyDays: number | null;
  wearableBiometrics: boolean;
  interactionAi: boolean;
  csvExport: boolean;
  deepDiveReports: boolean;
  proactiveCoach: boolean;
  /** Pattern insight cards; on Free a locked card says one was found. */
  patternInsights: boolean;
  /** Weekly adaptive calorie target suggestions (lib/adaptiveTdee.ts). */
  adaptiveTargets: boolean;
  /** Training-day calorie targets (lib/trainingDays.ts). */
  trainingDays: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { customHabits: 3, aiPerWeek: 5, coachPerDay: null, historyDays: 7, wearableBiometrics: false, interactionAi: false, csvExport: false, deepDiveReports: false, proactiveCoach: false, patternInsights: false, adaptiveTargets: false, trainingDays: false },
  premium: { customHabits: null, aiPerWeek: null, coachPerDay: 20, historyDays: 30, wearableBiometrics: true, interactionAi: false, csvExport: false, deepDiveReports: false, proactiveCoach: false, patternInsights: true, adaptiveTargets: true, trainingDays: false },
  max: { customHabits: null, aiPerWeek: null, coachPerDay: 50, historyDays: null, wearableBiometrics: true, interactionAi: true, csvExport: true, deepDiveReports: true, proactiveCoach: true, patternInsights: true, adaptiveTargets: true, trainingDays: true },
};

/** Before plans are enforced, everyone has everything. */
const OPEN: PlanLimits = { customHabits: null, aiPerWeek: null, coachPerDay: 20, historyDays: null, wearableBiometrics: true, interactionAi: true, csvExport: true, deepDiveReports: true, proactiveCoach: true, patternInsights: true, adaptiveTargets: true, trainingDays: true };

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
  const row = data as { enforced?: unknown; trial_ends_at?: unknown; trial_available?: unknown };
  return {
    plan,
    enforced: row.enforced === true,
    trialEndsAt: typeof row.trial_ends_at === "string" ? row.trial_ends_at : null,
    trialAvailable: row.trial_available === true,
  };
}

/** Starts the member's 7-day Premium trial (migration 040). Resolves to when it ends. */
export async function startTrial(): Promise<string> {
  const { data, error } = await supabase.rpc("start_trial");
  if (error) throw new Error(error.code === "PGRST202" ? "Free trials aren't available yet." : error.message);
  return data as string;
}

/** True while a trial is running. */
export const onTrial = (s: PlanState) => !!s.trialEndsAt && new Date(s.trialEndsAt) > new Date() && s.plan !== "free";

/**
 * A preview of the Free plan's locks for checking the upgrade screens before
 * plans are enforced: open the app with ?plan=free. Only changes what this
 * browser shows; the server still treats the member as before.
 */
export const previewPlan = (): Plan | null => {
  const key = "fikko-plan-preview";
  let p = new URLSearchParams(window.location.search).get("plan");
  try {
    // Kept for the visit, so it survives moving between pages; ?plan=off ends it.
    if (p) { if (p === "off") sessionStorage.removeItem(key); else sessionStorage.setItem(key, p); }
    else p = sessionStorage.getItem(key);
  } catch { /* storage blocked: the query alone still works */ }
  return p === "free" || p === "premium" ? p : null;
};

export const PLANS_URL = "https://www.fikko.io/#pricing";
