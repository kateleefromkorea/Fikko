import { supabase } from "./supabase";
import { notifyAiUsed } from "./aiCredits";

// The AI coach. Messages are read straight from the database (members can
// see and clear their own); sending goes through /api/coach, which holds the
// Anthropic key, applies the daily limit and saves both sides of the chat.
// Weekly check-ins are written by /api/coach-checkin and arrive in the same chat.

/** AI messages a member gets per local day before plans are enforced (see usePlan for the rest). Keep in step with api/_lib/aiUsage.ts. */
export const COACH_DAILY_LIMIT = 20;

export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** A weekly check-in Fikko sent on its own (api/coach-checkin.ts). */
  checkin?: boolean;
}

export async function fetchCoachMessages(): Promise<CoachMessage[]> {
  const load = (columns: string) => supabase.from("coach_messages").select(columns).order("created_at", { ascending: true }).limit(200);
  // Falls back to the older columns if migration 036 hasn't run, so the chat never breaks over it.
  let res = await load("id, role, content, created_at, kind");
  if (res.error) res = await load("id, role, content, created_at");
  if (res.error) throw new Error("We couldn't load your chat. Please refresh.");
  return ((res.data ?? []) as unknown as { id: string; role: "user" | "assistant"; content: string; created_at: string; kind?: string }[])
    .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at, checkin: m.kind === "checkin" }));
}

// ── Weekly check-ins (migration 036) ───────────────────────────────────────

/** Check-ins the member hasn't seen yet, for the dot on the Coach tab. 0 if anything's missing. */
export async function fetchUnreadCheckins(): Promise<number> {
  const { count, error } = await supabase.from("coach_messages").select("id", { count: "exact", head: true })
    .eq("kind", "checkin").is("read_at", null);
  return error ? 0 : count ?? 0;
}

export async function markCheckinsRead() {
  await supabase.rpc("mark_coach_checkins_read");
}

/** Whether weekly check-ins are on: true unless the member switched them off. */
export async function fetchCheckinsEnabled(): Promise<boolean> {
  const { data } = await supabase.from("coach_checkin_settings").select("enabled").maybeSingle();
  return data?.enabled ?? true;
}

const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

export async function saveCheckinsEnabled(userId: string, enabled: boolean) {
  const { error } = await supabase.from("coach_checkin_settings")
    .upsert({ user_id: userId, enabled, time_zone: browserTimeZone(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("That setting didn't save. Please try again.");
}

/** Check-ins arrive on Monday morning local time, so follow the member if they travel. */
export async function syncCheckinTimeZone(userId: string) {
  const tz = browserTimeZone();
  const { data, error } = await supabase.from("coach_checkin_settings").select("time_zone").maybeSingle();
  if (error || data?.time_zone === tz) return;
  if (data) await supabase.from("coach_checkin_settings").update({ time_zone: tz, updated_at: new Date().toISOString() }).eq("user_id", userId);
  else await supabase.from("coach_checkin_settings").insert({ user_id: userId, time_zone: tz });
}

/** Ended a streamed reply that failed part-way. The server now checks and sends whole replies, so this only guards older deploys. */
const ERROR_MARKER = "\u0000coach-error:";

/**
 * Messages the member has sent since their local midnight (or in the last 7 days for Free). Read from the
 * usage log rather than the chat, so clearing the chat doesn't reset it.
 */
export async function fetchUsedToday(period: "day" | "week" = "day"): Promise<number> {
  // Free's allowance is per rolling 7 days; the others reset at local midnight.
  const midnight = period === "week" ? new Date(Date.now() - 7 * 86_400_000) : new Date();
  if (period === "day") midnight.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("coach_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", midnight.toISOString());
  return count ?? 0;
}

/**
 * Sends a message and streams the reply, calling `onText` with the reply so
 * far as it arrives. Resolves with the full reply, or rejects with a
 * readable reason if the coach couldn't finish.
 */
export async function sendCoachMessage(message: string, onText: (soFar: string) => void): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");

  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, tzOffset: new Date().getTimezoneOffset() }),
  });
  if (!res.ok || !res.body) {
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(out.error ?? "The coach couldn't reply. Please try again.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const cut = text.indexOf(ERROR_MARKER);
    onText(cut === -1 ? text : text.slice(0, cut));
  }
  notifyAiUsed();
  const cut = text.indexOf(ERROR_MARKER);
  // A reply that failed part-way isn't saved or counted; show why instead.
  if (cut !== -1) throw new Error(text.slice(cut + ERROR_MARKER.length));
  return text;
}

export async function clearCoachChat() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in again to continue.");
  const { error } = await supabase.from("coach_messages").delete().eq("user_id", userId);
  if (error) throw new Error("We couldn't clear your chat. Please try again.");
}
