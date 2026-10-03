// The admin site at /admin: visitor stats for the app and the marketing site,
// plus sign-ups. Everything comes from one database call (admin_stats in
// migration 016), which refuses anyone not listed in the admins table or
// who hasn't entered a code from their authenticator app (migration 017).

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { C, ax, ttStyle } from "../components/dashboard/ui";
import AdminMfa from "./AdminMfa";

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
