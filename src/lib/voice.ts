import { supabase } from "./supabase";
import type { HabitData, HabitEntry, MealKey } from "../types";
import type { NewFood } from "../hooks/useFoodLog";

// Voice check-ins: the browser's speech recognition turns speech into text,
// /api/voice-log turns the text into a proposal, the member reviews it, and
// applyProposal() writes it into their habits like tapping the cards would.

export type Mode = "add" | "total";

export interface ProposedFood extends NewFood {
  meal: MealKey;
  /** True when the calories are an AI estimate rather than a database match. */
  estimated: boolean;
  matched?: string;
}

export interface VoiceProposal {
  water: { glasses: number; mode: Mode } | null;
  activity: { minutes: number; mode: Mode; what: string } | null;
  /** A key from the Mood card's options, with its 1–5 value. */
  mood: { key: string; value: number } | null;
  sleep: { bedtime: string | null; wake: string | null; rest: number | null } | null;
  medications: { all: boolean; ids: string[] } | null;
  customHabits: { id: string; amount: number; mode: Mode }[];
  foods: ProposedFood[];
  notUnderstood: string | null;
}

export const isEmptyProposal = (p: VoiceProposal) =>
  !p.water && !p.activity && !p.mood && !p.sleep && !p.medications && !p.customHabits.length && !p.foods.length;

// ── Speech recognition ─────────────────────────────────────────────────────

/** The browser's speech recognition, or null where it isn't available (e.g. Firefox). */
export function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

/** The small slice of the Web Speech API used here; it isn't in TypeScript's DOM types everywhere. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

// ── Server ─────────────────────────────────────────────────────────────────

export async function interpret(
  transcript: string,
  meds: { id: string; name: string }[],
  customHabits: { id: string; name: string; unit: string }[],
): Promise<VoiceProposal> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/voice-log", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, tzOffset: new Date().getTimezoneOffset(), meds, customHabits }),
  });
  const out = (await res.json().catch(() => ({}))) as { proposal?: VoiceProposal; error?: string };
  if (!res.ok || !out.proposal) throw new Error(out.error ?? "Something went wrong. Please try again.");
  return out.proposal;
}

// ── Applying ───────────────────────────────────────────────────────────────

function upsert(entries: HabitEntry[], date: string, value: number, note?: string): HabitEntry[] {
  const existing = entries.find((e) => e.date === date);
  if (existing) return entries.map((e) => (e.date === date ? { ...e, value, ...(note !== undefined ? { note } : {}) } : e));
  return [...entries, { date, value, ...(note !== undefined ? { note } : {}) }];
}

const valueOn = (entries: HabitEntry[], date: string) => entries.find((e) => e.date === date)?.value ?? 0;
const combine = (current: number, amount: number, mode: Mode) => (mode === "add" ? current + amount : amount);

function parse<T>(raw?: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * The member's habits with a voice check-in applied for one day. Foods are
 * returned separately, because they go through the food log.
 */
export function applyProposal(data: HabitData, p: VoiceProposal, date: string, medIds: string[]) {
  let next: HabitData = { ...data };
  if (p.water) next = { ...next, water: upsert(next.water, date, combine(valueOn(next.water, date), p.water.glasses, p.water.mode)) };
  if (p.activity) {
    next = { ...next, exercise: upsert(next.exercise, date, Math.min(1440, combine(valueOn(next.exercise, date), p.activity.minutes, p.activity.mode))) };
  }
  if (p.mood) next = { ...next, mood: upsert(next.mood, date, p.mood.value, p.mood.key) };
  if (p.sleep) {
    const entry = next.sleep.find((e) => e.date === date);
    const note = { ...(parse<Record<string, unknown>>(entry?.note) ?? {}) };
    if (p.sleep.bedtime) note.bedtime = p.sleep.bedtime;
    if (p.sleep.wake) note.wake = p.sleep.wake;
    next = { ...next, sleep: upsert(next.sleep, date, p.sleep.rest ?? entry?.value ?? 0, JSON.stringify(note)) };
  }
  if (p.medications && medIds.length) {
    const entry = next.medication.find((e) => e.date === date);
    const checked: Record<string, boolean> = { ...(parse<Record<string, boolean>>(entry?.note) ?? {}) };
    for (const id of p.medications.all ? medIds : p.medications.ids) checked[id] = true;
    // As on the card: the day counts once everything scheduled is ticked.
    const allTaken = medIds.every((id) => checked[id]);
    next = { ...next, medication: upsert(next.medication, date, allTaken ? 1 : 0, JSON.stringify(checked)) };
  }
  if (p.customHabits.length) {
    next = {
      ...next,
      custom: next.custom.map((h) => {
        const update = p.customHabits.find((c) => c.id === h.id);
        if (!update) return h;
        return { ...h, entries: upsert(h.entries, date, combine(valueOn(h.entries, date), update.amount, update.mode)) };
      }),
    };
  }
  return { data: next, foods: p.foods };
}
