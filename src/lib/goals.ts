// A member can pick several goals (say "Weight loss" and "Better nutrition").
// Weight loss, muscle building and maintenance each set the calorie target,
// so only one of those can be on at a time; the rest combine freely.
// profiles.goals holds them all; profiles.primary_goal keeps the one that sets
// the calories (or the first pick), which the calorie maths and older code read.

import { goalByKey } from "./metabolics";
import { GOAL_FOCUS } from "./preferences";

/** True for the goals that set the calorie target. */
export const isCalorieGoal = (key: string) => key === "maintenance" || !!goalByKey(key)?.weightManaging;

/** Adds or removes a goal; picking a calorie goal replaces any other calorie goal. */
export function toggleGoal(goals: string[], key: string): string[] {
  if (goals.includes(key)) return goals.filter((g) => g !== key);
  const rest = isCalorieGoal(key) ? goals.filter((g) => !isCalorieGoal(g)) : goals;
  return [...rest, key];
}

/** The goal that sets the calories, or else the first one picked. */
export const mainGoal = (goals: string[]) => goals.find(isCalorieGoal) ?? goals[0] ?? null;

/** A member's goals, including members who onboarded when there was only one. */
export const goalsOf = (p: { goals?: string[] | null; primary_goal: string | null }) =>
  p.goals?.length ? p.goals : p.primary_goal ? [p.primary_goal] : [];

/** Focus areas offered for these goals, grouped by goal. */
export const focusGroupsFor = (goals: string[]) =>
  goals.flatMap((g) => (GOAL_FOCUS[g] ? [{ goal: g, options: GOAL_FOCUS[g] }] : []));

/** Keeps only the focus areas that belong to one of these goals. */
export const focusWithin = (focus: string[], goals: string[]) => {
  const allowed = new Set(focusGroupsFor(goals).flatMap((g) => g.options.map((o) => o.key)));
  return focus.filter((k) => allowed.has(k));
};
