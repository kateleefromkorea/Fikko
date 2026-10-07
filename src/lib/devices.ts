import { supabase } from "./supabase";

// Wearable connections. Tokens live on the server; the app only ever sees a
// connection's status.

export type Provider = "oura" | "google";

export const PROVIDER_INFO: Record<Provider, { name: string; description: string }> = {
  oura: { name: "Oura Ring", description: "Sleep stages, HRV, resting heart rate, readiness, steps & SpO₂" },
  google: { name: "Fitbit & Pixel Watch", description: "Steps, sleep stages, resting heart rate, HRV & SpO₂ via Google" },
};

export interface Connection {
  provider: Provider;
  status: "active" | "error";
  lastError: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
}

async function call(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof out.error === "string" ? out.error : "Something went wrong. Please try again.");
  return out;
}

export async function fetchConnections(): Promise<Connection[]> {
  const { data, error } = await supabase
    .from("device_connections")
    .select("provider, status, last_error, connected_at, last_synced_at");
  if (error) return [];
  return (data ?? []).map((r) => ({
    provider: r.provider as Provider,
    status: r.status as Connection["status"],
    lastError: r.last_error,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
  }));
}

/** Sends the browser to the provider's sign-in page; it brings the member back afterwards. */
export async function connectDevice(provider: Provider) {
  const { url } = await call("/api/devices", { action: "connect", provider });
  window.location.assign(url as string);
}

export async function syncDevice(provider: Provider) {
  const { saved } = await call("/api/devices", { action: "sync", provider });
  return saved as number;
}

export async function disconnectDevice(provider: Provider, deleteData: boolean) {
  await call("/api/devices", { action: "disconnect", provider, deleteData });
}

// ── Invite-only beta ───────────────────────────────────────────────────────

/**
 * Providers only invited members can connect (Google limits an unverified app
 * to its listed test users). Keep in step with INVITE_ONLY in api/_lib/devices.ts.
 */
export const INVITE_ONLY: Provider[] = ["google"];

export interface BetaAccess { status: "requested" | "invited" | "declined"; googleEmail: string }

/** This member's beta request, or null if they haven't asked (or migration 028 isn't run). */
export async function fetchBetaAccess(provider: Provider): Promise<BetaAccess | null> {
  const { data, error } = await supabase.from("wearable_beta").select("status, google_email").eq("provider", provider).maybeSingle();
  if (error || !data) return null;
  return { status: data.status as BetaAccess["status"], googleEmail: data.google_email };
}

export async function requestBetaInvite(provider: Provider, googleEmail: string) {
  await call("/api/devices", { action: "request-invite", provider, googleEmail });
}
