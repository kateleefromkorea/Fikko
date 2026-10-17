import type { HabitData, HabitEntry } from "../types";
import type { PaidPlan } from "./paddle";
import { shiftDateKey } from "./dates";

// Why the upgrade window opened, so it can speak to what the member was just
// trying to do. Each has the plan that unlocks it.

export type UpgradeReason =
  | "general" | "ai-limit" | "ai-limit-max" | "history" | "custom-habits" | "vitals" | "insights"
  | "trees" | "export" | "reports" | "interaction-ai" | "adaptive" | "training-days";

export interface UpgradeCopy { title: string; body: string; plan: PaidPlan }

export const UPGRADE_COPY: Record<UpgradeReason, UpgradeCopy> = {
  general: {
    title: "Get more from Fikko",
    body: "Premium unlocks unlimited habits, more AI coaching, a month of history and your wearable's vitals.",
    plan: "premium",
  },
  "ai-limit": {
    title: "You've used your AI messages",
    body: "Free includes 5 AI messages a week. Premium gives you 20 a day for the coach, photo and voice logging.",
    plan: "premium",
  },
  "ai-limit-max": {
    title: "You've used today's AI messages",
    body: "Premium includes 20 AI messages a day. Max gives you 50, plus weekly check-ins from your coach.",
    plan: "max",
  },
  history: {
    title: "See further back",
    body: "Free shows your last 7 days. Premium shows the last 30, and Max keeps everything you've ever logged.",
    plan: "premium",
  },
  "custom-habits": {
    title: "Track more of your own habits",
    body: "Free includes 3 custom habits. Premium lets you track as many as you like.",
    plan: "premium",
  },
  vitals: {
    title: "See everything your wearable knows",
    body: "Premium adds heart rate, HRV, sleep stages, recovery and the rest of your wearable data to your Dashboard.",
    plan: "premium",
  },
  insights: {
    title: "See the patterns in your data",
    body: "Fikko compares your days to find what helps you, like the habits that come before your best sleep. Pattern insights are part of Premium.",
    plan: "premium",
  },
  trees: {
    title: "Plant a real tree for every full bloom",
    body: "On Max, every plant you grow to full bloom gets a real tree donated and planted by Fikko.",
    plan: "max",
  },
  export: {
    title: "Export your data",
    body: "Max lets you download your days and food diary as spreadsheets.",
    plan: "max",
  },
  reports: {
    title: "Monthly and lifetime reports",
    body: "Max turns your logs into a report you can keep or share with your doctor or coach.",
    plan: "max",
  },
  adaptive: {
    title: "A calorie target that learns from you",
    body: "Each week Premium compares what you ate with how your weight moved, and suggests a target that fits your body. You approve every change.",
    plan: "premium",
  },
  "training-days": {
    title: "Eat more on the days you train",
    body: "On Max, your calorie target rises on days you log a workout and dips a little on rest days, so your week still adds up.",
    plan: "max",
  },
  "interaction-ai": {
    title: "Check everything you take",
    body: "Max adds an AI review for medicines and supplements that aren't on Fikko's built-in list.",
    plan: "max",
  },
};

/** The reason to give when a member runs out of AI messages on their plan. */
export const aiLimitReason = (plan: "free" | "premium" | "max"): UpgradeReason | null =>
  plan === "free" ? "ai-limit" : plan === "premium" ? "ai-limit-max" : null;

/**
 * How many days the member has logged, how many of those their plan's history
 * no longer shows, and whether the oldest day in view drops out tomorrow.
 * Used for "You've logged 21 days; Free shows 7".
 */
export function historyBeyondPlan(data: HabitData, historyDays: number | null, today: string): { logged: number; hidden: number; oldestShown: boolean } {
  const days = new Set<string>();
  const add = (entries: HabitEntry[]) => { for (const e of entries) if (e.value > 0 && e.date <= today) days.add(e.date); };
  [data.water, data.medication, data.food, data.exercise, data.sleep, data.mood].forEach(add);
  data.custom.forEach((h) => add(h.entries));
  if (historyDays == null) return { logged: days.size, hidden: 0, oldestShown: false };
  const cutoff = shiftDateKey(today, -(historyDays - 1));
  let hidden = 0;
  for (const d of days) if (d < cutoff) hidden++;
  // The first day still in view is about to drop out tomorrow.
  return { logged: days.size, hidden, oldestShown: days.has(cutoff) };
}
