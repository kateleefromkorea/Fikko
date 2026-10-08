import { supabase } from "./supabase";
import type { Plan } from "./fikko";

// Paddle checkout (Paddle.js). The plan card only appears when
// VITE_PADDLE_CLIENT_TOKEN is set, so leaving it unset keeps payments hidden.
// The webhook (api/paddle-webhook.ts) does the real work of granting a plan;
// this just opens checkout and waits for that to land.

const env = import.meta.env;
const TOKEN = env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const SANDBOX = env.VITE_PADDLE_ENV !== "production";

export const paddleEnabled = !!TOKEN;

export type Interval = "month" | "year";
export type PaidPlan = Exclude<Plan, "free">;

const PRICE_IDS: Record<PaidPlan, Record<Interval, string | undefined>> = {
  premium: { month: env.VITE_PADDLE_PRICE_PREMIUM_MONTHLY, year: env.VITE_PADDLE_PRICE_PREMIUM_YEARLY },
  max: { month: env.VITE_PADDLE_PRICE_MAX_MONTHLY, year: env.VITE_PADDLE_PRICE_MAX_YEARLY },
};

/** Shown on the plan card; Paddle charges the amounts set on its prices. */
export const PRICES: Record<PaidPlan, Record<Interval, string>> = {
  premium: { month: "$12.99", year: "$124.68" },
  max: { month: "$21.99", year: "$211.08" },
};

interface PaddleJs {
  Environment: { set(env: "sandbox" | "production"): void };
  Initialize(opts: { token: string; eventCallback?: (e: { name?: string }) => void }): void;
  Checkout: { open(opts: Record<string, unknown>): void };
}

let loading: Promise<PaddleJs> | null = null;
let onCompleted: (() => void) | null = null;

function loadPaddle(): Promise<PaddleJs> {
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
      if (!paddle || !TOKEN) return reject(new Error("Paddle didn't load."));
      if (SANDBOX) paddle.Environment.set("sandbox");
      paddle.Initialize({ token: TOKEN, eventCallback: (e) => { if (e.name === "checkout.completed") onCompleted?.(); } });
      resolve(paddle);
    };
    script.onerror = () => { loading = null; reject(new Error("We couldn't load checkout. Check your connection and try again.")); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens Paddle's checkout over the page. `onDone` runs once payment succeeds. */
export async function openCheckout(plan: PaidPlan, interval: Interval, member: { id: string; email?: string }, onDone: () => void) {
  const priceId = PRICE_IDS[plan][interval];
  if (!priceId) throw new Error("This plan isn't available yet.");
  const paddle = await loadPaddle();
  onCompleted = onDone;
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: member.id },
    ...(member.email ? { customer: { email: member.email } } : {}),
    settings: { displayMode: "overlay", theme: "light" },
  });
}

export interface SubscriptionRow {
  plan: PaidPlan;
  status: "active" | "trialing" | "past_due" | "canceled";
  source: string;
  currentPeriodEnd: string | null;
}

/** This member's subscription, or null (none, or migration 035 not run). */
export async function fetchSubscription(): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase.from("subscriptions").select("plan, status, source, current_period_end").maybeSingle();
  if (error || !data) return null;
  return { plan: data.plan, status: data.status, source: data.source, currentPeriodEnd: data.current_period_end };
}

/** A link to Paddle's customer portal (update card, invoices, cancel). */
export async function openBillingPortal(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/billing", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "We couldn't open billing. Please try again.");
  return body.url;
}
