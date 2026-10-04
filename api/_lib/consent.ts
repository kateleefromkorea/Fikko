// Privacy consents (see migration 022). Each choice is one row in
// consent_records; the latest row per key is the member's current choice.
// Keep POLICY_VERSION and the keys in step with src/lib/consent.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "./devices.js";

/** Bump when the Privacy Policy changes enough that members must agree again. */
export const POLICY_VERSION = "2026-10-04";

export const CONSENT_KEYS = ["terms", "personal_info", "health_data", "overseas_transfer", "ai_processing"] as const;
export type ConsentKey = (typeof CONSENT_KEYS)[number];

export const REGIONS = ["KR", "AU", "SG", "US", "OTHER"] as const;
export type Region = (typeof REGIONS)[number];

/** The notice a country gets: one of Fikko's markets, or the general one. */
export const regionFor = (country: string): Region =>
  (REGIONS as readonly string[]).includes(country) && country !== "OTHER" ? (country as Region) : "OTHER";

/** Two-letter country of the request, from Vercel's edge; "" when unknown (e.g. local dev). */
export const countryOf = (request: Request) =>
  (request.headers.get("x-vercel-ip-country") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);

/** The member's current choice for each consent they've answered. */
export async function currentConsents(db: SupabaseClient, userId: string) {
  const { data } = await db.from("consent_records")
    .select("consent_key, granted, policy_version, region, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const latest: Partial<Record<ConsentKey, { granted: boolean; policy_version: string; region: string; created_at: string }>> = {};
  for (const row of data ?? []) {
    const key = row.consent_key as ConsentKey;
    if (!latest[key]) latest[key] = row;
  }
  return latest;
}

/**
 * Null when the member has granted every consent in `keys`, otherwise a 403
 * the endpoint can return as is. AI features need ai_processing; anything
 * touching health data needs health_data.
 */
export async function consentError(db: SupabaseClient, userId: string, keys: ConsentKey[]) {
  const current = await currentConsents(db, userId);
  const missing = keys.filter((k) => !current[k]?.granted);
  if (!missing.length) return null;
  const error = missing.includes("ai_processing")
    ? "AI features are turned off. You can turn them on in Profile → Privacy."
    : "Please review and agree to Fikko's privacy notice first.";
  return json({ error, consent: missing }, 403);
}
