// Oura adapter: sign-in, tokens and daily data from the Oura API v2.
// https://cloud.ouraring.com/v2/docs

import { AuthError, tokenRequest, type ProviderAdapter, type Reading } from "./common.js";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const REVOKE_URL = "https://api.ouraring.com/oauth/revoke";
// Only what Fikko shows: daily summaries (sleep, readiness, activity), SpO2 and basic personal info.
const SCOPES = "daily spo2 personal";

const creds = () => ({ client_id: process.env.OURA_CLIENT_ID ?? "", client_secret: process.env.OURA_CLIENT_SECRET ?? "" });

const apiBase = () =>
  process.env.OURA_SANDBOX === "1"
    ? "https://api.ouraring.com/v2/sandbox/usercollection"
    : "https://api.ouraring.com/v2/usercollection";

/** Every document in a collection for a date range, following pagination. */
async function collection<T>(token: string, path: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  do {
    const url = new URL(`${apiBase()}/${path}`);
    url.searchParams.set("start_date", start);
    url.searchParams.set("end_date", end);
    if (next) url.searchParams.set("next_token", next);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new AuthError("Oura");
    if (!res.ok) throw new Error(`Oura ${path} failed (${res.status})`);
    const body = (await res.json()) as { data: T[]; next_token: string | null };
    out.push(...body.data);
    next = body.next_token;
  } while (next);
  return out;
}

// ── Mapping Oura documents to Fikko readings ───────────────────────────────

export interface OuraSleep {
  day: string;
  type: string | null;
  total_sleep_duration: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
}
export interface OuraReadiness { day: string; score: number | null; temperature_deviation: number | null }
export interface OuraActivity { day: string; steps: number; active_calories: number }
export interface OuraSpo2 { day: string; spo2_percentage: { average: number } | null }
export interface OuraVo2 { day: string; vo2_max: number | null }

const hours = (seconds: number | null) => (seconds == null ? null : Math.round((seconds / 3600) * 100) / 100);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Oura's documents as Fikko readings, one value per metric per day. Night
 * metrics come from the main sleep of each day (the longest "long_sleep"),
 * not naps; Oura's lowest overnight heart rate is its resting heart rate.
 */
export function toReadings(d: {
  sleep: OuraSleep[]; readiness: OuraReadiness[]; activity: OuraActivity[]; spo2: OuraSpo2[]; vo2: OuraVo2[];
}): Reading[] {
  const out: Reading[] = [];
  const add = (metric: string, date: string, value: number | null | undefined) => {
    if (value != null && Number.isFinite(value)) out.push({ metric, date, value });
  };

  const mainSleep = new Map<string, OuraSleep>();
  for (const s of d.sleep) {
    if (s.type !== "long_sleep") continue;
    const cur = mainSleep.get(s.day);
    if (!cur || (s.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0)) mainSleep.set(s.day, s);
  }
  for (const s of mainSleep.values()) {
    add("heartRate", s.day, s.lowest_heart_rate);
    add("hrv", s.day, s.average_hrv);
    add("respiratoryRate", s.day, s.average_breath == null ? null : r1(s.average_breath));
    add("sleepRem", s.day, hours(s.rem_sleep_duration));
    add("sleepDeep", s.day, hours(s.deep_sleep_duration));
    add("sleepCore", s.day, hours(s.light_sleep_duration));
  }
  for (const r of d.readiness) {
    add("recoveryScore", r.day, r.score);
    add("bodyTemp", r.day, r.temperature_deviation == null ? null : Math.round(r.temperature_deviation * 100) / 100);
  }
  for (const a of d.activity) {
    add("steps", a.day, a.steps);
    add("activeCalories", a.day, a.active_calories);
  }
  for (const s of d.spo2) add("spo2", s.day, s.spo2_percentage?.average == null ? null : r1(s.spo2_percentage.average));
  for (const v of d.vo2) add("vo2max", v.day, v.vo2_max);
  return out;
}

export const oura: ProviderAdapter = {
  id: "oura",
  name: "Oura",
  ready: () => !!(process.env.OURA_CLIENT_ID && process.env.OURA_CLIENT_SECRET),

  authorizeUrl(redirectUri, state, challenge) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", creds().client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  exchange: (code, verifier, redirectUri) =>
    tokenRequest(TOKEN_URL, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, ...creds() }),

  // Oura refresh tokens are single-use; devices.ts saves the new pair straight away.
  refresh: (refreshToken) => tokenRequest(TOKEN_URL, { grant_type: "refresh_token", refresh_token: refreshToken, ...creds() }),

  async revoke(accessToken) {
    await fetch(`${REVOKE_URL}?access_token=${encodeURIComponent(accessToken)}`).catch(() => undefined);
  },

  async fetchReadings(token, start, end) {
    const [sleep, readiness, activity, spo2, vo2] = await Promise.all([
      collection<OuraSleep>(token, "sleep", start, end),
      collection<OuraReadiness>(token, "daily_readiness", start, end),
      collection<OuraActivity>(token, "daily_activity", start, end),
      collection<OuraSpo2>(token, "daily_spo2", start, end),
      // Not every ring or plan has VO2 max.
      collection<OuraVo2>(token, "vO2_max", start, end).catch((e) => { if (e instanceof AuthError) throw e; return [] as OuraVo2[]; }),
    ]);
    return toReadings({ sleep, readiness, activity, spo2, vo2 });
  },
};
