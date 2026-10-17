import { supabase } from "./supabase";
import type { Evidence } from "./adaptiveTdee";

// Reading and saving what adaptive targets need (migration 042). Every call
// fails soft before the migration has run: reads come back empty.

export interface AdaptiveSettings {
  enabled: boolean;
  tdee_estimate: number | null;
  auto_apply_small: boolean;
  auto_apply_asked_at: string | null;
  paused_until: string | null;
  last_checked_on: string | null;
  /** Training-day targets (Max, migration 043). */
  training_days: boolean;
}

export const DEFAULT_SETTINGS: AdaptiveSettings = {
  enabled: true, tdee_estimate: null, auto_apply_small: false, auto_apply_asked_at: null, paused_until: null, last_checked_on: null,
  training_days: false,
};

/** Tells open screens the settings changed (e.g. training days turned on in Profile). */
export const ADAPTIVE_SETTINGS_EVENT = "fikko-adaptive-settings-changed";

export type SuggestionStatus = "pending" | "accepted" | "kept" | "auto" | "undone";

export interface Suggestion {
  id: string;
  created_at: string;
  status: SuggestionStatus;
  previous_kcal: number;
  proposed_kcal: number;
  tdee_estimate: number;
  evidence: Evidence;
}

/** Tells open screens that weigh-ins changed, so charts and the weekly check pick them up. */
export const WEIGH_INS_EVENT = "fikko-weigh-ins-changed";

// ── Weigh-ins ─────────────────────────────────────────────────────────────

export async function fetchWeighIns(userId: string, since: string): Promise<{ date: string; kg: number }[]> {
  const { data, error } = await supabase.from("weigh_ins").select("date, kg").eq("user_id", userId).gte("date", since).order("date");
  if (error || !data) return [];
  return data.map((r) => ({ date: r.date as string, kg: Number(r.kg) }));
}

export async function saveWeighIn(userId: string, date: string, kg: number) {
  const { error } = await supabase.from("weigh_ins").upsert({ user_id: userId, date, kg: Math.round(kg * 100) / 100 }, { onConflict: "user_id,date" });
  if (error) throw new Error(error.code === "42P01" ? "Weigh-ins aren't set up yet." : "We couldn't save your weight. Please try again.");
  window.dispatchEvent(new Event(WEIGH_INS_EVENT));
}

export async function deleteWeighIn(userId: string, date: string) {
  const { error } = await supabase.from("weigh_ins").delete().eq("user_id", userId).eq("date", date);
  if (error) throw new Error("We couldn't remove that weigh-in. Please try again.");
  window.dispatchEvent(new Event(WEIGH_INS_EVENT));
}

// ── Fully logged days ─────────────────────────────────────────────────────

export async function fetchCompleteDays(userId: string, since: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("food_days_complete").select("date").eq("user_id", userId).gte("date", since);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.date as string));
}

export async function setDayComplete(userId: string, date: string, complete: boolean) {
  const { error } = complete
    ? await supabase.from("food_days_complete").upsert({ user_id: userId, date }, { onConflict: "user_id,date" })
    : await supabase.from("food_days_complete").delete().eq("user_id", userId).eq("date", date);
  if (error) throw new Error("We couldn't save that. Please try again.");
}

// ── Settings ──────────────────────────────────────────────────────────────

/** The member's settings, or the defaults (on, ask every time) if they've never changed them. */
export async function fetchAdaptiveSettings(userId: string): Promise<AdaptiveSettings> {
  const { data, error } = await supabase.from("adaptive_targets").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(data as Partial<AdaptiveSettings>), tdee_estimate: data.tdee_estimate == null ? null : Number(data.tdee_estimate) };
}

export async function saveAdaptiveSettings(userId: string, patch: Partial<AdaptiveSettings>) {
  const { error } = await supabase.from("adaptive_targets")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("We couldn't save your settings. Please try again.");
  window.dispatchEvent(new Event(ADAPTIVE_SETTINGS_EVENT));
}

// ── Suggestions ───────────────────────────────────────────────────────────

export async function fetchSuggestions(userId: string, limit = 12): Promise<Suggestion[]> {
  const { data, error } = await supabase.from("target_suggestions")
    .select("id, created_at, status, previous_kcal, proposed_kcal, tdee_estimate, evidence")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as Suggestion[];
}

export async function createSuggestion(userId: string, s: { status: SuggestionStatus; previous: number; proposed: number; tdee: number; evidence: Evidence }): Promise<string | null> {
  const { data, error } = await supabase.from("target_suggestions").insert({
    user_id: userId,
    status: s.status,
    previous_kcal: s.previous,
    proposed_kcal: s.proposed,
    tdee_estimate: s.tdee,
    evidence: s.evidence,
    answered_at: s.status === "pending" ? null : new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return null;
  return data.id as string;
}

export async function answerSuggestion(id: string, status: Exclude<SuggestionStatus, "pending">) {
  await supabase.from("target_suggestions").update({ status, answered_at: new Date().toISOString() }).eq("id", id);
}
