// Shared server code for wearable connections. Lives in api/_lib so Vercel
// doesn't expose it as an endpoint. Everything here runs with the Supabase
// secret key, which bypasses row-level security, so callers must have
// already established which member they're acting for.
//
// Each provider (Oura, Google) supplies a small adapter: how to sign in,
// refresh tokens, revoke access and fetch readings. Everything else (state,
// PKCE, storing tokens, syncing) is the same for all of them.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { oura } from "./oura.js";
import { google } from "./google.js";
import { AuthError, type ProviderAdapter, type TokenSet } from "./common.js";
import { decryptToken, encryptToken } from "./tokenCrypto.js";

export { AuthError, decryptToken };
export type { ProviderAdapter };

export const PROVIDERS: Record<string, ProviderAdapter> = { oura, google };
export const providerFor = (id: unknown) => (typeof id === "string" ? PROVIDERS[id] ?? null : null);

/**
 * Providers that only invited members may connect: Google keeps an unverified
 * app to its listed test users. Remove "google" once Google has verified Fikko
 * (and the same in src/lib/devices.ts) to open Fitbit to everyone.
 */
export const INVITE_ONLY: string[] = ["google"];

/** Days fetched on first connect, and overlap re-fetched on later syncs (providers revise recent days). */
const INITIAL_DAYS = 30;
const OVERLAP_DAYS = 3;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function supabaseReady() {
  return !!((process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) && process.env.SUPABASE_SECRET_KEY);
}

export function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  return createClient(url!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The member making this request, from their own session token, or null. */
export async function memberFrom(request: Request, db: SupabaseClient) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

/** Where providers send members back to. Must be registered exactly with each provider. */
export const redirectUri = (request: Request) => `${new URL(request.url).origin}/api/device-callback`;

// ── PKCE ───────────────────────────────────────────────────────────────────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

// ── Tokens ─────────────────────────────────────────────────────────────────

/**
 * Stores a token set. Some providers (Google) don't send a new refresh token
 * on refresh, so the existing one is kept when none comes back. Both tokens
 * are encrypted before they're stored (see tokenCrypto.ts).
 */
export async function saveTokens(db: SupabaseClient, userId: string, provider: ProviderAdapter, t: TokenSet) {
  let refresh = t.refresh_token;
  if (!refresh) {
    const { data } = await db.from("device_connections").select("refresh_token").eq("user_id", userId).eq("provider", provider.id).maybeSingle();
    refresh = data?.refresh_token ? await decryptToken(data.refresh_token) : undefined;
  }
  if (!refresh) throw new Error(`${provider.name} didn't grant ongoing access.`);
  const { error } = await db.from("device_connections").upsert({
    user_id: userId,
    provider: provider.id,
    access_token: await encryptToken(t.access_token),
    refresh_token: await encryptToken(refresh),
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scopes: t.scope ?? null,
    status: "active",
    last_error: null,
  });
  if (error) throw new Error(`Couldn't save the ${provider.name} connection.`);
}

interface Connection { access_token: string; refresh_token: string; expires_at: string; last_synced_at: string | null }

/** A usable access token, refreshed (and saved) first if it expires within five minutes. */
async function accessToken(db: SupabaseClient, userId: string, provider: ProviderAdapter, conn: Connection) {
  if (new Date(conn.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return decryptToken(conn.access_token);
  let t: TokenSet;
  try {
    t = await provider.refresh(await decryptToken(conn.refresh_token));
  } catch {
    throw new AuthError(provider.name);
  }
  await saveTokens(db, userId, provider, t);
  return t.access_token;
}

// ── Sync ───────────────────────────────────────────────────────────────────

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Pulls recent readings from one provider into biometric_entries. The first
 * sync covers 30 days; later ones start a few days before the last sync.
 * Returns how many readings were saved. Failures are recorded on the
 * connection so the member sees them in their Profile.
 */
export async function syncMember(db: SupabaseClient, userId: string, provider: ProviderAdapter): Promise<number> {
  const { data: conn } = await db
    .from("device_connections")
    .select("access_token, refresh_token, expires_at, last_synced_at")
    .eq("user_id", userId)
    .eq("provider", provider.id)
    .maybeSingle();
  if (!conn) throw new Error(`${provider.name} isn't connected.`);

  try {
    const token = await accessToken(db, userId, provider, conn as Connection);
    const from = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() - OVERLAP_DAYS * 864e5 : Date.now() - INITIAL_DAYS * 864e5;
    // Readings are keyed by the member's local day; reaching to tomorrow (UTC) keeps today included in any time zone.
    const readings = await provider.fetchReadings(token, dayKey(from), dayKey(Date.now() + 864e5));

    const now = new Date().toISOString();
    const rows = readings.map((r) => ({ user_id: userId, source: provider.id, updated_at: now, ...r }));
    if (rows.length) {
      const { error } = await db.from("biometric_entries").upsert(rows, { onConflict: "user_id,metric,date,source" });
      if (error) throw new Error("Couldn't save synced readings.");
    }
    await db.from("device_connections")
      .update({ last_synced_at: now, status: "active", last_error: null })
      .eq("user_id", userId).eq("provider", provider.id);
    return rows.length;
  } catch (err) {
    const message = err instanceof AuthError ? err.message : `The last ${provider.name} sync didn't finish. It will try again tomorrow.`;
    await db.from("device_connections")
      .update({ status: "error", last_error: message })
      .eq("user_id", userId).eq("provider", provider.id);
    throw err;
  }
}
