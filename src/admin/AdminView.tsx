// The admin site at /admin: visitor stats for the app and the marketing site,
// plus launch metrics (admin_launch_metrics in migration 029), sign-ups, AI
// spend (admin_ai_costs in migration 024) and Fitbit beta
// invites (admin_wearable_beta in migration 028). Everything comes from one database call (admin_stats in
// migration 016), which refuses anyone not listed in the admins table or
// who hasn't entered a code from their authenticator app (migration 017).

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { C, ax, ttStyle } from "../components/dashboard/ui";
import AdminMfa from "./AdminMfa";
import { FOUNDING_PLACES, fetchPlacesLeft } from "../lib/founding";

interface Stats {
  daily: { day: string; views: number; visitors: number; signups: number }[];
  pages: { site: string; path: string; views: number }[];
  referrers: { referrer: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  countries: { country: string; visitors: number }[];
  members: number;
}

const RANGES = [7, 30, 90] as const;
const SITES = [
  { id: "all", label: "Both" },
  { id: "web", label: "Website" },
  { id: "app", label: "App" },
] as const;

type Site = (typeof SITES)[number]["id"];

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const sum = (rows: Stats["daily"], k: "views" | "visitors" | "signups") => rows.reduce((n, r) => n + Number(r[k]), 0);

export default function AdminView() {
  const [status, setStatus] = useState<"checking" | "needs_mfa" | "ok" | "error">("checking");

  const check = () =>
    supabase.rpc("admin_status").then(({ data, error }) => {
      if (error) return setStatus("error");
      // Anyone who isn't an admin just lands on the normal app, so the page gives nothing away.
      if (data === "none") return window.location.replace("/");
      setStatus(data === "ok" ? "ok" : "needs_mfa");
    });

  useEffect(() => { void check(); }, []);

  if (status === "checking") return <div className="min-h-screen bg-background" />;
  if (status === "error") {
    return (
      <Shell>
        <p className="text-sm text-destructive">Couldn't check access. Has migration 017 been run?</p>
      </Shell>
    );
  }
  if (status === "needs_mfa") {
    return (
      <Shell>
        <AdminMfa onVerified={() => void check()} />
      </Shell>
    );
  }
  return <StatsView />;
}

function StatsView() {
  const [days, setDays] = useState<number>(30);
  const [site, setSite] = useState<Site>("all");
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let live = true;
    supabase.rpc("admin_stats", { p_days: days, p_site: site === "all" ? null : site }).then(({ data, error }) => {
      if (!live) return;
      if (error) return setState("error");
      setStats(data as Stats);
      setState("ready");
    });
    return () => { live = false; };
  }, [days, site]);

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={site} onValueChange={(v) => setSite(v as Site)}>
          <TabsList>
            {SITES.map((s) => <TabsTrigger key={s.id} value={s.id} className="px-3">{s.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {RANGES.map((d) => <TabsTrigger key={d} value={String(d)} className="px-3">{d} days</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      {state === "error" && <p className="text-sm text-destructive">Couldn't load stats. Try reloading the page.</p>}
      <LaunchMetrics days={days} />

      <h2 className="pt-4 text-lg font-semibold">Visitors</h2>
      {state === "loading" && !stats && <p className="text-sm text-muted-foreground">Loading…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Visitors" value={sum(stats.daily, "visitors")} />
            <Tile label="Page views" value={sum(stats.daily, "views")} />
            <Tile label="Sign-ups" value={sum(stats.daily, "signups")} />
            <Tile label="Members in total" value={stats.members} />
          </div>

          <Card>
            <CardHeader><CardTitle>Visitors and page views</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={stats.daily}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} {...ax} minTickGap={24} />
                  <YAxis allowDecimals={false} width={36} {...ax} />
                  <Tooltip contentStyle={ttStyle} labelFormatter={(d) => shortDay(String(d))} />
                  <Line dataKey="visitors" name="Visitors" stroke={C.primary} strokeWidth={2} dot={false} />
                  <Line dataKey="views" name="Page views" stroke={C.teal} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sign-ups</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.daily}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} {...ax} minTickGap={24} />
                  <YAxis allowDecimals={false} width={36} {...ax} />
                  <Tooltip contentStyle={ttStyle} labelFormatter={(d) => shortDay(String(d))} />
                  <Bar dataKey="signups" name="Sign-ups" fill={C.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <List
              title="Top pages"
              rows={stats.pages.map((p) => [site === "all" ? `${p.site === "web" ? "Website" : "App"} ${p.path}` : p.path, p.views])}
            />
            <List title="Where visitors came from" rows={stats.referrers.map((r) => [r.referrer, r.visitors])} />
            <List title="Devices" rows={stats.devices.map((d) => [d.device, d.visitors])} />
            <List title="Countries" rows={stats.countries.map((c) => [c.country === "--" ? "Unknown" : c.country, c.visitors])} />
          </div>
          <p className="text-xs text-muted-foreground">
            Anonymous counts: no cookies, no personal data. Days are in UTC. Stats are kept for 400 days.
          </p>
        </>
      )}

      <AiSpend days={days} />
      <WearableBeta />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" /> App
          </a>
          <span className="text-lg font-bold tracking-wide">FIKKO admin</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function List({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[1])));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map(([name, n]) => (
              <li key={name} className="relative flex items-center justify-between gap-3 px-2 py-1 text-sm">
                <span className="absolute inset-y-0 left-0 rounded bg-primary/8" style={{ width: `${(Number(n) / max) * 100}%` }} aria-hidden="true" />
                <span className="relative truncate">{name}</span>
                <span className="relative tabular-nums text-muted-foreground">{Number(n).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── AI spend ───────────────────────────────────────────────────────────────

interface AiCosts {
  daily: { day: string; cost: number; calls: number; members: number; per_member: number }[];
  features: { feature: string; cost: number; calls: number }[];
  top_member_days: { day: string; member: string; cost: number; calls: number }[];
  cache_hit_rate: number;
  today: number;
  month_to_date: number;
  days_into_month: number;
  days_in_month: number;
}

const FEATURE_LABEL: Record<string, string> = {
  coach: "Coach replies",
  coach_screen: "Coach safety screen",
  coach_review: "Coach reply review",
  voice: "Voice check-ins",
  photo: "Photo logging",
  interactions: "Interaction check",
  recipe: "Recipe ideas",
};

/** US$ with enough decimals to see fractions of a cent. */
const usd = (n: number) => {
  const v = Number(n);
  return `US$${v >= 10 ? v.toFixed(2) : v >= 0.1 ? v.toFixed(3) : v.toFixed(4)}`;
};

function AiSpend({ days }: { days: number }) {
  const [data, setData] = useState<AiCosts | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let live = true;
    supabase.rpc("admin_ai_costs", { p_days: days }).then(({ data, error }) => {
      if (!live) return;
      if (error) return setState("error");
      setData(data as AiCosts);
      setState("ready");
    });
    return () => { live = false; };
  }, [days]);

  if (state === "error") {
    return <p className="text-sm text-destructive">Couldn't load AI spend. Has migration 024 been run?</p>;
  }
  if (!data) return null;

  const projected = data.days_into_month > 0 ? (Number(data.month_to_date) / data.days_into_month) * data.days_in_month : 0;
  const withMembers = data.daily.filter((d) => d.members > 0);
  const perMember = withMembers.length ? withMembers.reduce((n, d) => n + Number(d.per_member), 0) / withMembers.length : 0;

  return (
    <>
      <h2 className="pt-4 text-lg font-semibold">AI spend</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MoneyTile label="Today so far" value={usd(data.today)} />
        <MoneyTile label="This month so far" value={usd(data.month_to_date)} />
        <MoneyTile label="This month, projected" value={usd(projected)} />
        <MoneyTile label={`Per member per day (${days}-day average)`} value={usd(perMember)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Daily AI spend (US$)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.daily}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} {...ax} minTickGap={24} />
              <YAxis width={48} {...ax} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(d) => shortDay(String(d))} formatter={(v) => usd(Number(v))} />
              <Bar dataKey="cost" name="Spend" fill={C.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Spend per member per day (US$)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data.daily}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} {...ax} minTickGap={24} />
              <YAxis width={56} {...ax} tickFormatter={(v) => `$${Number(v).toFixed(3)}`} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(d) => shortDay(String(d))} formatter={(v) => usd(Number(v))} />
              <Line dataKey="per_member" name="Average per member using AI" stroke={C.teal} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            Average across members who used an AI feature that day. Coach prompt cache hit rate: {Math.round(Number(data.cache_hit_rate) * 100)}%.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <MoneyList
          title="By feature"
          rows={data.features.map((f) => [FEATURE_LABEL[f.feature] ?? f.feature, Number(f.cost), `${f.calls.toLocaleString()} calls`])}
        />
        <MoneyList
          title="Highest member-days"
          rows={data.top_member_days.map((m) => [`${shortDay(m.day)} · member ${m.member}`, Number(m.cost), `${m.calls} calls`])}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Worked out from token counts at Anthropic's list prices (api/_lib/aiCost.ts), so it can differ slightly from the invoice. Days are in UTC. Members are shown by the start of their id only.
      </p>
    </>
  );
}

function MoneyTile({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function MoneyList({ title, rows }: { title: string; rows: [string, number, string][] }) {
  const max = Math.max(0.000001, ...rows.map((r) => r[1]));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map(([name, cost, note]) => (
              <li key={name} className="relative flex items-center justify-between gap-3 px-2 py-1 text-sm">
                <span className="absolute inset-y-0 left-0 rounded bg-primary/8" style={{ width: `${(cost / max) * 100}%` }} aria-hidden="true" />
                <span className="relative truncate">{name}</span>
                <span className="relative shrink-0 tabular-nums text-muted-foreground">{usd(cost)} · {note}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface BetaRequest {
  user_id: string;
  email: string;
  google_email: string;
  status: "requested" | "invited" | "declined";
  requested_at: string;
  decided_at: string | null;
  connected: boolean;
}

/** Google lets an unverified app's test-user list hold at most this many accounts. */
const GOOGLE_TEST_USER_LIMIT = 100;

const STATUS_LABEL: Record<BetaRequest["status"], string> = { requested: "Waiting", invited: "Invited", declined: "Declined" };

/**
 * Fitbit beta requests. Approving here only lets the member start connecting:
 * their Google account must also be on the test-user list in Google Cloud, or
 * Google blocks the sign-in.
 */
function WearableBeta() {
  const [rows, setRows] = useState<BetaRequest[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () =>
    supabase.rpc("admin_wearable_beta").then(({ data, error }) => {
      if (error) return setState("error");
      setRows(data as BetaRequest[]);
      setState("ready");
    });

  useEffect(() => { void load(); }, []);

  async function decide(userId: string, status: BetaRequest["status"]) {
    setBusy(userId);
    const { error } = await supabase.rpc("admin_wearable_beta_decide", { p_user: userId, p_status: status });
    setBusy(null);
    if (error) return setState("error");
    await load();
  }

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      setTimeout(() => setCopied((c) => (c === email ? null : c)), 2000);
    } catch { /* the address is on screen to copy by hand */ }
  }

  if (state === "error") {
    return <p className="text-sm text-destructive">Couldn't load Fitbit beta requests. Has migration 028 been run?</p>;
  }
  if (!rows) return null;

  const invited = rows.filter((r) => r.status === "invited").length;
  const waiting = rows.filter((r) => r.status === "requested");
  const others = rows.filter((r) => r.status !== "requested");

  const row = (r: BetaRequest) => (
    <li key={r.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="break-all">{r.google_email}</span>
          <Badge variant={r.status === "invited" ? "default" : "secondary"}>{STATUS_LABEL[r.status]}</Badge>
          {r.connected && <Badge variant="outline">Connected</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          Fikko account {r.email} · asked {shortDay(r.requested_at.slice(0, 10))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copy(r.google_email)}>
          {copied === r.google_email ? "Copied" : "Copy Google email"}
        </Button>
        {r.status !== "invited" && (
          <Button size="sm" disabled={busy !== null} onClick={() => decide(r.user_id, "invited")}>Approve</Button>
        )}
        {r.status !== "declined" && (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => decide(r.user_id, "declined")}>
            {r.status === "invited" ? "Remove" : "Decline"}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <h2 className="pt-4 text-lg font-semibold">Fitbit beta</h2>
      <Card>
        <CardHeader>
          <CardTitle>{waiting.length} waiting · {invited} of {GOOGLE_TEST_USER_LIMIT} invited</CardTitle>
          <CardDescription>
            To approve someone: copy their Google email, add it in Google Cloud → Google Auth Platform → Audience → Test users, then press Approve.
            If you remove someone, also remove them from the test users to free the place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="divide-y">{[...waiting, ...others].map(row)}</ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Launch metrics ─────────────────────────────────────────────────────────

interface Funnel { signed_up: number; confirmed: number; onboarded: number; logged: number; active_7d: number }
interface Launch {
  funnel: Funnel;
  funnel_range: Funnel;
  founding_qualified: number;
  active_7d: number;
  active_30d: number;
  daily_active: { day: string; active: number }[];
  weekly_active: { week: string; active: number }[];
  day1: { members: number; returned: number };
  week2: { members: number; returned: number };
  features: {
    habits: Record<string, number>;
    food_items: number;
    custom_habits: number;
    ai: Record<string, number>;
    fitbit_connected: number;
    fitbit_requests: number;
    my_fikko_seed: number;
  };
}


const FUNNEL_STEPS: { key: keyof Funnel; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "confirmed", label: "Confirmed their email" },
  { key: "onboarded", label: "Finished setup" },
  { key: "logged", label: "Logged a habit" },
  { key: "active_7d", label: "Active in the last 7 days" },
];

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

function LaunchMetrics({ days }: { days: number }) {
  const [data, setData] = useState<Launch | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [cohort, setCohort] = useState<"all" | "range">("all");
  // Recorded places (migration 030); until it's run, an estimate from who qualifies.
  const [placesLeft, setPlacesLeft] = useState<number | null>(null);
  useEffect(() => { void fetchPlacesLeft().then(setPlacesLeft); }, []);

  useEffect(() => {
    let live = true;
    supabase.rpc("admin_launch_metrics", { p_days: days }).then(({ data, error }) => {
      if (!live) return;
      if (error) return setState("error");
      setData(data as Launch);
      setState("ready");
    });
    return () => { live = false; };
  }, [days]);

  if (state === "error") {
    return <p className="text-sm text-destructive">Couldn't load launch metrics. Has migration 029 been run?</p>;
  }
  if (!data) return state === "loading" ? <p className="text-sm text-muted-foreground">Loading…</p> : null;

  const f = cohort === "all" ? data.funnel : data.funnel_range;
  const founding = placesLeft != null ? FOUNDING_PLACES - placesLeft : Math.min(FOUNDING_PLACES, Number(data.founding_qualified));
  const h = data.features.habits;
  const ai = data.features.ai;
  const features: [string, number][] = (
    [
      ["Food (meal log)", data.features.food_items],
      ["Water", h.water ?? 0],
      ["Activity", h.exercise ?? 0],
      ["Sleep", h.sleep ?? 0],
      ["Mood", h.mood ?? 0],
      ["Medications", h.medication ?? 0],
      ["Custom habits", data.features.custom_habits],
      ["AI coach", ai.coach ?? 0],
      ["Voice check-ins", ai.voice ?? 0],
      ["Photo logging", ai.photo ?? 0],
      ["Interaction check (AI)", ai.interactions ?? 0],
      ["Recipe ideas", ai.recipe ?? 0],
    ] as [string, number][]
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <>
      <h2 className="text-lg font-semibold">Launch</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">Founding places taken</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{founding} <span className="text-base font-normal text-muted-foreground">of {FOUNDING_PLACES}</span></p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(founding / FOUNDING_PLACES) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Tile label="Active in the last 7 days" value={Number(data.active_7d)} />
        <Tile label="Active in the last 30 days" value={Number(data.active_30d)} />
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">Fitbit</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{Number(data.features.fitbit_connected)} <span className="text-base font-normal text-muted-foreground">connected</span></p>
            <p className="text-xs text-muted-foreground">{Number(data.features.fitbit_requests)} waiting for an invite</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>From sign-up to habit</CardTitle>
          <Tabs value={cohort} onValueChange={(v) => setCohort(v as "all" | "range")}>
            <TabsList>
              <TabsTrigger value="all" className="px-3">Everyone</TabsTrigger>
              <TabsTrigger value="range" className="px-3">Signed up in the last {days} days</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {FUNNEL_STEPS.map((step, i) => {
              const n = Number(f[step.key]);
              const prev = i === 0 ? n : Number(f[FUNNEL_STEPS[i - 1].key]);
              return (
                <li key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)_7rem]">
                  <span className="text-sm">{step.label}</span>
                  <span className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${f.signed_up ? (n / Number(f.signed_up)) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    {n.toLocaleString()}
                    {i > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{pct(n, prev)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">The percentage is of the step before. Admin accounts are left out.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ReturnTile
          label="Came back the next day"
          hint="Logged something the day after finishing setup."
          {...data.day1}
        />
        <ReturnTile
          label="Still logging in week 2"
          hint="Logged something 7 to 13 days after finishing setup."
          {...data.week2}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Active members each week</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.weekly_active}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="week" tickFormatter={shortDay} {...ax} minTickGap={24} />
              <YAxis allowDecimals={false} width={36} {...ax} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(d) => `Week of ${shortDay(String(d))}`} />
              <Bar dataKey="active" name="Members who logged" fill={C.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Active members each day</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data.daily_active}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} {...ax} minTickGap={24} />
              <YAxis allowDecimals={false} width={36} {...ax} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(d) => shortDay(String(d))} />
              <Line dataKey="active" name="Members who logged" stroke={C.primary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <List title={`Members using each feature (last ${days} days)`} rows={features} />
      <p className="text-xs text-muted-foreground">
        Counts of members only, never who. {Number(data.features.my_fikko_seed)} members have planted a My Fikko seed. Logged days are each member&apos;s own date; sign-up and setup days are in UTC.
      </p>
    </>
  );
}

function ReturnTile({ label, hint, members, returned }: { label: string; hint: string; members: number; returned: number }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{pct(Number(returned), Number(members))}</p>
        <p className="text-xs text-muted-foreground">
          {Number(members) > 0 ? `${Number(returned)} of ${Number(members)} members. ${hint}` : `Not enough members yet. ${hint}`}
        </p>
      </CardContent>
    </Card>
  );
}
