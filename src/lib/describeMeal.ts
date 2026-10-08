import { supabase } from "./supabase";
import { notifyAiUsed } from "./aiCredits";
import type { MealKey } from "../types";
import type { ProposedFood } from "./voice";

// "Describe it" in the food window: a typed or spoken description of one meal
// goes to /api/voice-log in meal mode and comes back as foods with everyday
// portions ("1 plate"), which the member adjusts before adding.

export interface MealPortion {
  /** How many of the unit, in quarters. */
  count: number;
  /** "plate", "bowl", "cup" and so on. */
  unit: string;
  /** Grams in one of the unit. */
  gramsEach: number;
  /** People who shared it, counting the member. */
  sharedBy: number;
}

export interface DescribedFood extends ProposedFood {
  portion: MealPortion;
}

export async function describeMeal(text: string, meal: MealKey): Promise<{ foods: DescribedFood[]; notUnderstood: string | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/voice-log", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: text, mode: "meal", meal, tzOffset: new Date().getTimezoneOffset() }),
  });
  const out = (await res.json().catch(() => ({}))) as { foods?: DescribedFood[]; notUnderstood?: string | null; error?: string };
  notifyAiUsed();
  if (!res.ok || !out.foods) throw new Error(out.error ?? "We couldn't work that meal out. Please try again.");
  return { foods: out.foods, notUnderstood: out.notUnderstood ?? null };
}

/** Grams the member actually ate: the portions, divided between the people who shared them. */
export const gramsEaten = (p: MealPortion) => (p.gramsEach * p.count) / Math.max(1, p.sharedBy);

/** "1 plate", "1½ bowls", "½ cup". */
export function portionText(p: MealPortion) {
  const whole = Math.floor(p.count);
  const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[p.count - whole] ?? "";
  const unit = p.count > 1 ? (p.unit === "glass" ? "glasses" : `${p.unit}s`) : p.unit;
  return `${whole || ""}${frac || (whole ? "" : "0")} ${unit}`;
}
