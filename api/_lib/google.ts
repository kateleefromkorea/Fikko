// Google Health API adapter: Fitbit trackers and Pixel Watch.
// https://developers.google.com/health  (discovery: health.googleapis.com/$discovery/rest?version=v4)

import { AuthError, tokenRequest, type ProviderAdapter, type Reading } from "./common.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://health.googleapis.com/v4/users/me/dataTypes";
// Read-only, and only the three groups Fikko shows.
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");

const creds = () => ({ client_id: process.env.GOOGLE_HEALTH_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_HEALTH_CLIENT_SECRET ?? "" });

interface GDate { year: number; month: number; day: number }
const iso = (d: GDate) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
const gdate = (key: string): GDate => { const [y, m, d] = key.split("-").map(Number); return { year: y, month: m, day: d }; };
const nextDay = (key: string) => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const r1 = (n: number) => Math.round(n * 10) / 10;

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status === 401) throw new AuthError("Google");
  // 403: the member didn't grant this data group, or it isn't available to them. Treat as no data.
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Health ${res.status}`);
  return res.json();
}

/** Every data point of one type matching a filter, following pagination. */
async function list<T>(token: string, type: string, filter: string, pageSize: number): Promise<T[]> {
  const out: T[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${API}/${type}/dataPoints`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = (await call(url.toString(), { headers: { Authorization: `Bearer ${token}` } })) as { dataPoints?: T[]; nextPageToken?: string } | null;
    if (!body) return out;
    out.push(...(body.dataPoints ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** One total per local day for a summable type, via dailyRollUp. */
async function rollUp<T>(token: string, type: string, start: string, end: string): Promise<T[]> {
  const body = (await call(`${API}/${type}/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range: { start: { date: gdate(start) }, end: { date: gdate(nextDay(end)) } }, windowSizeDays: 1 }),
  })) as { rollupDataPoints?: T[] } | null;
  return body?.rollupDataPoints ?? [];
}

// ── Response shapes (only the fields Fikko uses) ───────────────────────────

export interface GSleep {
  sleep: {
    interval?: { civilEndTime?: { date?: GDate } };
    metadata?: { nap?: boolean; mainSleep?: boolean };
    summary?: { minutesAsleep?: string; stagesSummary?: { type: string; minutes?: string }[] };
  };
}
export interface GRestingHr { dailyRestingHeartRate: { date: GDate; beatsPerMinute?: string } }
export interface GHrv { dailyHeartRateVariability: { date: GDate; averageHeartRateVariabilityMilliseconds?: number } }
export interface GSpo2 { dailyOxygenSaturation: { date: GDate; averagePercentage?: number } }
export interface GResp { dailyRespiratoryRate: { date: GDate; breathsPerMinute?: number } }
export interface GTemp { dailySleepTemperatureDerivations: { date: GDate; nightlyTemperatureCelsius?: number; baselineTemperatureCelsius?: number } }
export interface GVo2 { dailyVo2Max: { date: GDate; vo2Max?: number } }
export interface GStepsRoll { civilStartTime?: { date?: GDate }; steps?: { countSum?: string } }
export interface GKcalRoll { civilStartTime?: { date?: GDate }; activeEnergyBurned?: { kcalSum?: number } }
export interface GActiveRoll {
  civilStartTime?: { date?: GDate };
  activeMinutes?: { activeMinutesRollupByActivityLevel?: { activityLevel?: string; activeMinutesSum?: string }[] };
}

/**
 * Google's data points as Fikko readings. Sleep comes from each day's main
 * sleep (not naps), dated by the day it ended, like Oura. Body temperature is
 * the night's reading relative to the member's own baseline.
 */
export function toReadings(d: {
  sleep: GSleep[]; restingHr: GRestingHr[]; hrv: GHrv[]; spo2: GSpo2[]; resp: GResp[]; temp: GTemp[]; vo2: GVo2[];
  steps: GStepsRoll[]; kcal: GKcalRoll[]; active?: GActiveRoll[];
}): Reading[] {
  const out: Reading[] = [];
  const add = (metric: string, date: string | null, value: number | null | undefined) => {
    if (date && value != null && Number.isFinite(value)) out.push({ metric, date, value });
  };

  const main = new Map<string, GSleep["sleep"]>();
  for (const { sleep } of d.sleep) {
    const date = sleep.interval?.civilEndTime?.date;
    if (!date || sleep.metadata?.nap) continue;
    const key = iso(date);
    const cur = main.get(key);
    const asleep = num(sleep.summary?.minutesAsleep) ?? 0;
    // Prefer the session Google marks as the main sleep, then the longest.
    if (!cur || (sleep.metadata?.mainSleep && !cur.metadata?.mainSleep) || (!!sleep.metadata?.mainSleep === !!cur.metadata?.mainSleep && asleep > (num(cur.summary?.minutesAsleep) ?? 0))) {
      main.set(key, sleep);
    }
  }
  for (const [date, s] of main) {
    const stage = (t: string) => {
      const m = num(s.summary?.stagesSummary?.find((x) => x.type === t)?.minutes);
      return m == null ? null : Math.round((m / 60) * 100) / 100;
    };
    add("sleepRem", date, stage("REM"));
    add("sleepDeep", date, stage("DEEP"));
    add("sleepCore", date, stage("LIGHT"));
  }

  for (const { dailyRestingHeartRate: x } of d.restingHr) add("heartRate", iso(x.date), num(x.beatsPerMinute));
  for (const { dailyHeartRateVariability: x } of d.hrv) add("hrv", iso(x.date), x.averageHeartRateVariabilityMilliseconds == null ? null : Math.round(x.averageHeartRateVariabilityMilliseconds));
  for (const { dailyOxygenSaturation: x } of d.spo2) add("spo2", iso(x.date), x.averagePercentage == null ? null : r1(x.averagePercentage));
  for (const { dailyRespiratoryRate: x } of d.resp) add("respiratoryRate", iso(x.date), x.breathsPerMinute == null ? null : r1(x.breathsPerMinute));
  for (const { dailySleepTemperatureDerivations: x } of d.temp) {
    if (x.nightlyTemperatureCelsius != null && x.baselineTemperatureCelsius != null) {
      add("bodyTemp", iso(x.date), Math.round((x.nightlyTemperatureCelsius - x.baselineTemperatureCelsius) * 100) / 100);
    }
  }
  for (const { dailyVo2Max: x } of d.vo2) add("vo2max", iso(x.date), x.vo2Max == null ? null : r1(x.vo2Max));
  for (const p of d.steps) add("steps", p.civilStartTime?.date ? iso(p.civilStartTime.date) : null, num(p.steps?.countSum));
  for (const p of d.kcal) add("activeCalories", p.civilStartTime?.date ? iso(p.civilStartTime.date) : null, p.activeEnergyBurned?.kcalSum == null ? null : Math.round(p.activeEnergyBurned.kcalSum));
  // Moderate and vigorous only, like the Activity goal: light movement such as pottering about doesn't count.
  for (const p of d.active ?? []) {
    const levels = p.activeMinutes?.activeMinutesRollupByActivityLevel ?? [];
    const minutes = levels
      .filter((l) => l.activityLevel === "MODERATE" || l.activityLevel === "VIGOROUS")
      .reduce((sum, l) => sum + (num(l.activeMinutesSum) ?? 0), 0);
    add("activeMinutes", p.civilStartTime?.date ? iso(p.civilStartTime.date) : null, levels.length ? minutes : null);
  }
  return out;
}

export const google: ProviderAdapter = {
  id: "google",
  name: "Fitbit & Pixel Watch",
  ready: () => !!(process.env.GOOGLE_HEALTH_CLIENT_ID && process.env.GOOGLE_HEALTH_CLIENT_SECRET),

  authorizeUrl(redirectUri, state, challenge) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", creds().client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    // A refresh token for the nightly sync, and the consent screen every time so one is always issued.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  },

  exchange: (code, verifier, redirectUri) =>
    tokenRequest(TOKEN_URL, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, ...creds() }),

  refresh: (refreshToken) => tokenRequest(TOKEN_URL, { grant_type: "refresh_token", refresh_token: refreshToken, ...creds() }),

  async revoke(accessToken) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, { method: "POST" }).catch(() => undefined);
  },

  async fetchReadings(token, start, end) {
    const until = nextDay(end);
    const daily = (member: string) => `${member}.date >= "${start}" AND ${member}.date < "${until}"`;
    const [sleep, restingHr, hrv, spo2, resp, temp, vo2, steps, kcal, active] = await Promise.all([
      list<GSleep>(token, "sleep", `sleep.interval.end_time >= "${start}T00:00:00Z" AND sleep.interval.end_time < "${until}T23:59:59Z"`, 25),
      list<GRestingHr>(token, "daily-resting-heart-rate", daily("dailyRestingHeartRate"), 400),
      list<GHrv>(token, "daily-heart-rate-variability", daily("dailyHeartRateVariability"), 400),
      list<GSpo2>(token, "daily-oxygen-saturation", daily("dailyOxygenSaturation"), 400),
      list<GResp>(token, "daily-respiratory-rate", daily("dailyRespiratoryRate"), 400),
      list<GTemp>(token, "daily-sleep-temperature-derivations", daily("dailySleepTemperatureDerivations"), 400),
      list<GVo2>(token, "daily-vo2-max", daily("dailyVo2Max"), 400),
      rollUp<GStepsRoll>(token, "steps", start, end),
      rollUp<GKcalRoll>(token, "active-energy-burned", start, end),
      rollUp<GActiveRoll>(token, "active-minutes", start, end),
    ]);
    return toReadings({ sleep, restingHr, hrv, spo2, resp, temp, vo2, steps, kcal, active });
  },
};
