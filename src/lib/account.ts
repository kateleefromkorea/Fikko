import { supabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { todayKey } from "./dates";

// Every table holding a user's data. Row-level security scopes each query to
// the signed-in user, so these reads can only ever return their own rows.
const USER_TABLES = [
  "profiles",
  "habit_entries",
  "custom_habits",
  "custom_habit_entries",
  "medications",
  "food_log_items",
  "custom_foods",
  "community_posts",
  "community_comments",
  "community_cheers",
  "recipes",
  "recipe_saves",
  "points_events",
  "biometric_entries",
] as const;

/**
 * Downloads a complete copy of the user's data as JSON: all history, not just
 * the recent window the app keeps loaded. Covers a user's right to access
 * their data under privacy laws like GDPR and CCPA.
 */
export async function exportAllData(userId: string) {
  const tables: Record<string, unknown[]> = {};
  for (const table of USER_TABLES) {
    tables[table] = await fetchAllRows((from, to) =>
      supabase.from(table).select("*").eq("user_id", userId).order("user_id").range(from, to),
    );
  }

  const payload = { exportedAt: new Date().toISOString(), ...tables };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `fikko-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Permanently deletes the signed-in user's account and all their data via the
 * /api/delete-account server function, then signs out locally.
 */
export async function deleteAccount() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to delete your account.");

  const res = await fetch("/api/delete-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "We couldn't delete your account. Please try again.");

  // The account no longer exists server-side; clear the local session too.
  await supabase.auth.signOut({ scope: "local" });
}
