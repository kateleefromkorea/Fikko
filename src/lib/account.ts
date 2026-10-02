import { supabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { shiftDateKey } from "./dates";

// Every table holding a user's data, and the column that dates each row.
// Row-level security scopes each query to the signed-in user, so these reads
// can only ever return their own rows.
//   • "date": logs kept per calendar day.
//   • "created_at": things done at a moment, like posts and points.
//   • null: settings and saved lists (profile, habits, medications, foods),
//     always exported whole so a dated export still makes sense on its own.
const USER_TABLES = [
  ["profiles", null],
  ["habit_entries", "date"],
  ["custom_habits", null],
  ["custom_habit_entries", "date"],
  ["medications", null],
  ["food_log_items", "date"],
  ["custom_foods", null],
  ["saved_meals", null],
  ["community_posts", "created_at"],
  ["community_comments", "created_at"],
  ["community_cheers", "created_at"],
  ["recipes", "created_at"],
  ["recipe_saves", "created_at"],
  ["points_events", "created_at"],
  ["biometric_entries", "date"],
  ["coach_messages", "created_at"],
] as const;

export type ExportFormat = "pdf" | "json";

/** First and last day keys to export, inclusive. */
export interface ExportRange {
  from: string;
  to: string;
}

/**
 * Downloads the user's data, either everything (no range) or one day, week or
 * month of it. Everything means all history, not just the recent window the
 * app keeps loaded, which covers a user's right to access their data under
 * privacy laws like GDPR and CCPA. JSON is the machine-readable copy; PDF is
 * a readable report of the same rows.
 */
export async function exportAllData(userId: string, format: ExportFormat, range: ExportRange | null = null) {
  // Timestamps are cut at the member's own midnights, matching their day keys.
  const startOf = (key: string) => new Date(key + "T00:00:00").toISOString();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [table, dateColumn] of USER_TABLES) {
    tables[table] = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let q = supabase.from(table).select("*").eq("user_id", userId);
      if (range && dateColumn === "date") q = q.gte("date", range.from).lte("date", range.to);
      if (range && dateColumn === "created_at") {
        q = q.gte("created_at", startOf(range.from)).lt("created_at", startOf(shiftDateKey(range.to, 1)));
      }
      return q.order("user_id").range(from, to);
    });
  }

  const exportedAt = new Date();
  let blob: Blob;
  if (format === "pdf") {
    // Loaded on demand so the PDF library stays out of the main bundle.
    const { buildPdf } = await import("./exportPdf");
    blob = buildPdf(tables, exportedAt, range).output("blob");
  } else {
    const payload = { exportedAt: exportedAt.toISOString(), range: range ?? "all", ...tables };
    blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const span = !range ? "all" : range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
  a.download = `fikko-export-${span}.${format}`;
  a.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Days between asking to delete an account and it being permanently deleted. */
export const DELETION_GRACE_DAYS = 30;

/**
 * Asks the server to delete the signed-in user's account. It is deactivated
 * now and permanently deleted after DELETION_GRACE_DAYS by the nightly job in
 * /api/delete-account; signing back in before then offers to restore it. The
 * optional reason is stored anonymously.
 */
export async function deleteAccount(feedback?: { reason: string; details: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You need to be signed in to delete your account.");

  const res = await fetch("/api/delete-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(feedback ?? {}),
  });
  const body: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "We couldn't delete your account. Please try again.");

  // The server has ended every session; clear this one locally too.
  await supabase.auth.signOut({ scope: "local" });
}

/**
 * Tables cleared by "Reset my data": everything the member has tracked. The
 * account, profile and goals, medication list, custom habits, saved foods and
 * meals, Community posts, recipes, points and wearable data all stay.
 */
const LOG_TABLES = ["habit_entries", "custom_habit_entries", "food_log_items", "coach_messages"] as const;

/** Permanently erases the signed-in member's logs. Row-level security limits each delete to their own rows. */
export async function resetMyLogs(userId: string) {
  const results = await Promise.all(LOG_TABLES.map((t) => supabase.from(t).delete().eq("user_id", userId)));
  if (results.some((r) => r.error)) {
    throw new Error("Some of your data couldn't be reset. Please try again.");
  }
}
