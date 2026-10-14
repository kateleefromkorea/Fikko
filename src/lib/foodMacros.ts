import { supabase } from "./supabase";

// "Estimate with AI" under the macro bars: asks /api/food-macros to fill in protein, carbs
// and fat for foods saved without them (see api/food-macros.ts).

export interface MacroFill { updated: number; remaining: number }

export async function estimateMissingMacros(): Promise<MacroFill> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/food-macros", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const out = (await res.json().catch(() => ({}))) as Partial<MacroFill> & { error?: string };
  if (!res.ok) throw new Error(out.error ?? "That didn't work. Please try again.");
  return { updated: out.updated ?? 0, remaining: out.remaining ?? 0 };
}
