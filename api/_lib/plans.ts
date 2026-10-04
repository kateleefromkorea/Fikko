// What each plan includes, in one place, so the server enforces exactly what
// the pricing page promises. Not wired in yet: until payments are live every
// member gets the current shared allowance (DAILY_AI_LIMIT in aiUsage.ts).

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
