import { useState, type ReactNode } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BatteryLow, BatteryFull, CheckCircle2, Droplet, Footprints, HeartPulse,
  Moon, SmilePlus, Utensils, Watch, Wind, type LucideIcon,
} from "lucide-react";
import type { HabitData, BiometricData, HabitEntry, BiometricEntry, CustomHabit } from "../types";
import PageHeader from "./PageHeader";
import { CustomHabitIcon, HabitIcon, type HabitHue } from "./HabitCard";
import type { ProfileRow } from "../hooks/useProfile";
import { goalByKey } from "../lib/metabolics";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  data: HabitData;
  biometrics: BiometricData;
  /** Carries the baseline computed at the end of onboarding. */
  profile?: ProfileRow;
}

type Period = "week" | "month" | "year";

const TODAY = new Date().toISOString().split("T")[0];

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

// ── Aggregation ────────────────────────────────────────────────────────────

function last<T extends { date: string }>(entries: T[], days: number): T[] {
  const cutoff = dateString(days - 1);
  return entries.filter((e) => e.date >= cutoff && e.date <= TODAY);
}

function avg(entries: { value: number }[]) {
  return entries.length ? entries.reduce((s, e) => s + e.value, 0) / entries.length : 0;
}

function latest(entries: { value: number }[]) {
  return entries[entries.length - 1]?.value ?? 0;
}

function lastNDays(entries: HabitEntry[] | BiometricEntry[], n: number) {
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = dateString(i);
    const entry = entries.find((e) => e.date === date);
    const label = i === 0 ? "Today" : i === 1 ? "Yest"
      : new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
    result.push({ label, value: entry?.value ?? 0 });
  }
  return result;
}

function groupByWeek(entries: (HabitEntry | BiometricEntry)[], agg: "avg" | "sum" = "avg") {
  const weeks: Record<string, number[]> = {};
  entries.forEach((e) => {
    const d = new Date(e.date + "T00:00:00");
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(e.value);
  });
  return Object.entries(weeks).map(([label, vals]) => ({
    label,
    value: agg === "avg"
      ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
      : vals.reduce((s, v) => s + v, 0),
  }));
}

function groupByMonth(entries: (HabitEntry | BiometricEntry)[], agg: "avg" | "sum" = "avg") {
  const months: Record<string, number[]> = {};
  entries.forEach((e) => {
    const key = new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    if (!months[key]) months[key] = [];
    months[key].push(e.value);
  });
  return Object.entries(months).map(([label, vals]) => ({
    label,
    value: agg === "avg"
      ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
      : vals.reduce((s, v) => s + v, 0),
  }));
}


// ── Shared UI ──────────────────────────────────────────────────────────────

// Chart colours. SVG gradients need literal values, so these mirror the
// habit hues and neutrals in index.css rather than reading the variables.
const C = {
  primary: "#157954",
  teal: "#2DC4B2",
  water: "#5BA9F0",
  meds: "#8FA9E0",
  food: "#F5A623",
  exercise: "#FF7575",
  sleep: "#7E6FD8",
  mood: "#E9B92F",
  grid: "#EBEBEB",
  tick: "#737373",
};

const ttStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E5E5E5",
  boxShadow: "0 4px 12px rgba(0,0,0,.06)",
  background: "#fff",
  color: "#171717",
};

const ax = {
  tick: { fontSize: 11, fill: C.tick },
  axisLine: false as const,
  tickLine: false as const,
};

/** Recharts hands formatters a loosely typed value; charts here only plot numbers. */
const fmt = (f: (v: number) => [string, string?]) => (v: unknown) => f(Number(v)) as [string, string];

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <Tabs value={period} onValueChange={(v) => onChange(v as Period)}>
      <TabsList className="h-9!">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <TabsTrigger key={p} value={p} className="px-4 capitalize">{p}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function ChartCard({ title, sub, action, children, className }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-5 [--card-spacing:--spacing(6)]", className)}>
      <CardHeader>
        <CardTitle className="font-semibold">{title}</CardTitle>
        {sub && <CardDescription>{sub}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

function VitalCard({
  label, value, unit, sub, trend, good,
}: {
  label: string; value: string; unit: string; sub: string; trend?: "up" | "down" | "stable"; good?: "up" | "down";
}) {
  const isPositive = trend === good;
  const Arrow = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  return (
    <Card className="gap-2 [--card-spacing:--spacing(5)]">
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {value}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend && (
            <Arrow
              className={cn("size-3.5", trend !== "stable" && (isPositive ? "text-primary" : "text-destructive"))}
              aria-hidden="true"
            />
          )}
          {sub}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniSparkline({ data, color = C.primary }: { data: { label: string; value: number }[]; color?: string }) {
  const id = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={false} />
        <Tooltip contentStyle={{ ...ttStyle, fontSize: 11 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TrendArea({ data, color, id, height = 180, domain, unit, name, width = 32 }: {
  data: { label: string; value: number }[]; color: string; id: string; height?: number;
  domain?: [number | "auto", number | "auto"]; unit: string; name: string; width?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
        <YAxis domain={domain ?? ["auto", "auto"]} {...ax} width={width} />
        <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${v}${unit}`, name])} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InsightRow({ text, icon: Icon }: { text: string; icon: LucideIcon }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </li>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * The numbers onboarding just worked out, shown first so a user who has only
 * finished the wizard still lands on something about them.
 */
function BaselinePlan({ profile }: { profile: ProfileRow }) {
  const goal = goalByKey(profile.primary_goal);
  const rate = profile.weekly_rate_kg;

  const tiles = [
    { label: "BMR", value: Math.round(profile.bmr!).toLocaleString(), note: "At complete rest" },
    { label: "TDEE", value: Math.round(profile.tdee!).toLocaleString(), note: "With your activity on top" },
    {
      label: "Daily target",
      value: Math.round(profile.calorie_goal).toLocaleString(),
      note: rate ? `${rate < 0 ? "Deficit" : "Surplus"} for ${Math.abs(rate)} kg / week` : "Holding steady",
      accent: true,
    },
  ];

  return (
    <Card className="gap-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Your plan</CardTitle>
        <CardDescription>
          Mifflin-St Jeor, from the details you gave us
          {profile.target_weight_kg ? ` · target ${profile.target_weight_kg} kg` : ""}
        </CardDescription>
        {goal && (
          <CardAction>
            <Badge variant="outline" className="h-6 border-teal/40 bg-teal/5 px-2.5 text-primary">{goal.label}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div
              key={t.label}
              className={cn(
                "rounded-lg border p-5",
                t.accent && "border-primary/25 bg-primary/5",
              )}
            >
              <p className={cn("text-sm text-muted-foreground", t.accent && "text-primary")}>{t.label}</p>
              <p className={cn("mt-1 text-3xl font-semibold tabular-nums", t.accent && "text-primary")}>
                {t.value}
                <span className="ml-1 text-sm font-normal text-muted-foreground">kcal</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t.note}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WearableComingSoon() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">
          <Watch className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Heart, sleep and activity insights are coming soon</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once Apple Health and other wearables can sync, your vitals, sleep stages and recovery trends will appear
            here. Everything below is from what you've logged in Fikko.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard({ data, biometrics, profile }: Props) {
  const [period, setPeriod] = useState<Period>("week");

  const days = period === "week" ? 7 : period === "month" ? 30 : 365;

  // Slices
  const bm = biometrics;
  // Wearable sections only render when there is real device data. Until a sync
  // integration exists this is false for everyone, and those sections are
  // replaced by a placeholder rather than shown with empty or invented numbers.
  const hasWearableData = Object.values(bm).some((series) => series.length > 0);
  const hrSlice   = last(bm.heartRate, days);
  const hrvSlice  = last(bm.hrv, days);
  const spo2Slice = last(bm.spo2, days);
  const rrSlice   = last(bm.respiratoryRate, days);
  const stepsSlice   = last(bm.steps, days);
  const calSlice     = last(bm.activeCalories, days);
  const vo2Slice     = last(bm.vo2max, days);
  const standSlice   = last(bm.standHours, days);
  const recSlice     = last(bm.recoveryScore, days);
  const stressSlice  = last(bm.stressScore, days);
  const remSlice     = last(bm.sleepRem, days);
  const deepSlice    = last(bm.sleepDeep, days);
  const weightSlice  = last(bm.weight, days);

  const waterSlice    = last(data.water, days);
  const medSlice      = last(data.medication, days);
  const foodSlice     = last(data.food, days);
  const moodSlice     = last(data.mood, days);

  // Latest values
  const hrNow   = latest(bm.heartRate);
  const hrvNow  = latest(bm.hrv);
  const spo2Now = latest(bm.spo2);
  const rrNow   = latest(bm.respiratoryRate);
  const tempNow = latest(bm.bodyTemp);
  const stepsNow   = latest(bm.steps).toLocaleString();
  const calNow     = latest(bm.activeCalories);
  const vo2Now     = latest(bm.vo2max);
  const standNow   = latest(bm.standHours);
  const recNow     = latest(bm.recoveryScore);
  const stressNow  = latest(bm.stressScore);
  const weightNow  = latest(bm.weight);

  // Trends (compare last 3 vs prior 3)
  function trend(slice: { value: number }[]): "up" | "down" | "stable" {
    if (slice.length < 6) return "stable";
    const recent = avg(slice.slice(-3));
    const prior  = avg(slice.slice(-6, -3));
    if (recent > prior + 0.5) return "up";
    if (recent < prior - 0.5) return "down";
    return "stable";
  }

  // Chart builders
  function chartData(entries: (HabitEntry | BiometricEntry)[], agg: "avg" | "sum" = "avg") {
    if (period === "week")  return lastNDays(entries as HabitEntry[], 7);
    if (period === "month") return groupByWeek(entries, agg);
    return groupByMonth(entries, agg);
  }

  // Sleep stages for today's pie
  const todaySleep = {
    rem:  latest(bm.sleepRem),
    deep: latest(bm.sleepDeep),
    core: latest(bm.sleepCore),
  };
  const sleepTotal = todaySleep.rem + todaySleep.deep + todaySleep.core;
  const sleepPie = [
    { name: "REM",  value: todaySleep.rem,  fill: C.sleep },
    { name: "Deep", value: todaySleep.deep, fill: C.primary },
    { name: "Core", value: todaySleep.core, fill: C.teal },
  ];

  // Radar for today
  const radarData = [
    { subject: "Heart",    A: Math.max(0, 100 - Math.abs(hrNow - 65)) },
    { subject: "HRV",      A: Math.min((hrvNow / 65) * 100, 100) },
    { subject: "SpO₂",     A: Math.min(((spo2Now - 90) / 10) * 100, 100) },
    { subject: "Steps",    A: Math.min((latest(bm.steps) / 10000) * 100, 100) },
    { subject: "Recovery", A: recNow },
    { subject: "Sleep",    A: Math.min(((sleepTotal) / 8) * 100, 100) },
    { subject: "Mood",     A: (latest(data.mood) / 5) * 100 },
  ];

  // Insights
  const insights: { text: string; icon: LucideIcon }[] = [];
  if (hrvNow < 35) insights.push({ text: `HRV is ${hrvNow}ms, lower than optimal. Prioritise rest and reduce stress today.`, icon: HeartPulse });
  if (spo2Now < 96) insights.push({ text: `SpO₂ is ${spo2Now}%, slightly below the ideal 97–99% range. Consider checking your device fit.`, icon: Droplet });
  if (recNow < 50) insights.push({ text: `Recovery score is ${recNow}/100. Your body may need an easier day.`, icon: BatteryLow });
  if (recNow >= 80) insights.push({ text: `Recovery score is ${recNow}/100. A great day to push a hard workout.`, icon: BatteryFull });
  if (stressNow > 65) insights.push({ text: `Stress is elevated at ${stressNow}/100. A short walk or breathing exercise can help.`, icon: Wind });
  if (todaySleep.deep < 1) insights.push({ text: `Deep sleep was only ${todaySleep.deep}h last night. Avoid screens an hour before bed.`, icon: Moon });
  if (latest(bm.steps) >= 10000) insights.push({ text: `You hit ${stepsNow} steps today, above the 10,000 target.`, icon: Footprints });
  if (hrNow > 72) insights.push({ text: `Resting HR is ${hrNow}bpm, slightly elevated. Could reflect stress, caffeine or incomplete recovery.`, icon: HeartPulse });
  if (insights.length === 0) insights.push({ text: "All vitals look healthy today.", icon: CheckCircle2 });

  const periodLabel = period === "week" ? "Last 7 days" : period === "month" ? "Last 30 days" : "Last 12 months";

  const habitTrends: { title: string; sub: string; icon: LucideIcon; hue: HabitHue; color: string; slice: HabitEntry[]; note: string }[] = [
    { title: "Water", sub: "glasses / day", icon: Droplet, hue: "water", color: C.water, slice: waterSlice, note: `Avg ${avg(waterSlice).toFixed(1)} · target 8` },
    { title: "Mood", sub: "1–5 scale", icon: SmilePlus, hue: "mood", color: C.mood, slice: moodSlice, note: `Avg ${avg(moodSlice).toFixed(1)} / 5 this ${period}` },
    {
      title: "Calories", sub: "kcal / day", icon: Utensils, hue: "food", color: C.food, slice: foodSlice,
      note: `Avg ${Math.round(avg(foodSlice)).toLocaleString()} kcal · ${medSlice.length ? Math.round((medSlice.filter(e => e.value === 1).length / medSlice.length) * 100) : 0}% med adherence`,
    },
  ];

  return (
    <div className="space-y-12">

      {/* ── Header ── */}
      <PageHeader
        title="Dashboard"
        subtitle={hasWearableData ? `${periodLabel} · synced from your wearable` : `${periodLabel} · from what you've logged`}
        action={<PeriodToggle period={period} onChange={setPeriod} />}
      />

      <div className="space-y-6">
        {/* ── Baseline from onboarding (absent until the wizard is finished) ── */}
        {profile?.bmr != null && profile.tdee != null && <BaselinePlan profile={profile} />}

        {!hasWearableData && <WearableComingSoon />}
      </div>

      {hasWearableData && (<>
      {/* ── Today's overview ── */}
      <Section title="Today's overview" sub="Snapshot from your latest device sync">
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title="Health radar" sub="Across 7 dimensions">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={C.grid} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: C.tick }} />
                <Radar dataKey="A" stroke={C.primary} fill={C.primary} fillOpacity={0.12} strokeWidth={2} />
                <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${Math.round(v)}%`, "Score"])} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="flex flex-col gap-6">
            <ChartCard title="Recovery score" className="flex-1">
              <div className="flex items-center gap-5">
                <div className="relative size-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="size-20 -rotate-90" aria-hidden="true">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={C.grid} strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={C.primary} strokeWidth="3"
                      strokeDasharray={`${recNow} 100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{recNow}</span>
                </div>
                <div>
                  <p className="text-xl font-semibold">
                    {recNow >= 80 ? "Peak" : recNow >= 60 ? "Good" : recNow >= 40 ? "Moderate" : "Low"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Based on HRV, sleep and resting HR</p>
                </div>
              </div>
            </ChartCard>
            <ChartCard title="Stress level" className="flex-1" action={<span className="text-lg font-semibold tabular-nums">{stressNow}</span>}>
              <Progress
                value={stressNow}
                className={cn("h-2", stressNow > 65 ? "[&>div]:bg-destructive" : stressNow > 40 && "[&>div]:bg-food")}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                {stressNow > 65 ? "Elevated. Try a breathing exercise." : stressNow > 40 ? "Moderate and manageable." : "Low. You're calm today."}
              </p>
            </ChartCard>
          </div>

          <ChartCard title="Insights">
            <ul className="space-y-2">
              {insights.slice(0, 4).map((ins, i) => <InsightRow key={i} {...ins} />)}
            </ul>
          </ChartCard>
        </div>
      </Section>

      {/* ── Vitals ── */}
      <Section title="Vitals" sub="Heart, oxygen and respiratory data from your wearable">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <VitalCard label="Resting heart rate" value={String(hrNow)} unit="bpm"
            sub={`avg ${Math.round(avg(hrSlice))} this ${period}`} trend={trend(hrSlice)} good="down" />
          <VitalCard label="HRV" value={String(hrvNow)} unit="ms"
            sub={`avg ${Math.round(avg(hrvSlice))} this ${period}`} trend={trend(hrvSlice)} good="up" />
          <VitalCard label="Blood oxygen" value={String(spo2Now)} unit="%"
            sub={`avg ${avg(spo2Slice).toFixed(1)} this ${period}`} trend={trend(spo2Slice)} good="up" />
          <VitalCard label="Respiratory rate" value={String(rrNow)} unit="br/min"
            sub={`avg ${avg(rrSlice).toFixed(1)} this ${period}`} trend={trend(rrSlice)} good="down" />
          <VitalCard label="Body temperature" value={tempNow >= 0 ? `+${tempNow}` : String(tempNow)} unit="°C"
            sub="vs. baseline" trend="stable" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Heart rate" sub="Resting bpm">
            <TrendArea data={chartData(hrSlice)} color={C.exercise} id="gHR" unit=" bpm" name="Heart rate" width={28} />
          </ChartCard>
          <ChartCard title="Heart rate variability" sub="ms, higher is better">
            <TrendArea data={chartData(hrvSlice)} color={C.teal} id="gHRV" unit=" ms" name="HRV" width={28} />
          </ChartCard>
        </div>
      </Section>

      {/* ── Activity ── */}
      <Section title="Activity" sub="Steps, calories, VO₂ max and stand hours">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <VitalCard label="Steps" value={latest(stepsSlice).toLocaleString()} unit="steps"
            sub={`avg ${Math.round(avg(stepsSlice)).toLocaleString()} this ${period}`} trend={trend(stepsSlice)} good="up" />
          <VitalCard label="Active calories" value={String(calNow)} unit="kcal"
            sub={`avg ${Math.round(avg(calSlice))} this ${period}`} trend={trend(calSlice)} good="up" />
          <VitalCard label="VO₂ max" value={String(vo2Now)} unit="ml/kg/min"
            sub={`avg ${avg(vo2Slice).toFixed(1)} this ${period}`} trend={trend(vo2Slice)} good="up" />
          <VitalCard label="Stand hours" value={String(standNow)} unit="hrs"
            sub={`avg ${avg(standSlice).toFixed(1)} this ${period}`} trend={trend(standSlice)} good="up" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Daily steps">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData(stepsSlice, "avg")} barSize={period === "year" ? 14 : 20}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis {...ax} width={40} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${Math.round(v).toLocaleString()}`, "Steps"])} />
                <Bar dataKey="value" fill={C.primary} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Active calories burned">
            <TrendArea data={chartData(calSlice)} color={C.food} id="gCal" unit=" kcal" name="Active kcal" width={36} />
          </ChartCard>
        </div>
      </Section>

      {/* ── Sleep ── */}
      <Section title="Sleep" sub="Stages and quality from your wearable">
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title="Last night's stages" sub={`${sleepTotal.toFixed(1)}h total`}>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={140}>
                <PieChart>
                  <Pie data={sleepPie} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" strokeWidth={0}>
                    {sleepPie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${v}h`])} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2 text-sm">
                {sleepPie.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.fill }} aria-hidden="true" />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="ml-auto font-medium tabular-nums">{s.value}h</span>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>
          <ChartCard title="REM sleep" sub="hours, target 1.5h or more">
            <TrendArea data={chartData(remSlice)} color={C.sleep} id="gREM" height={140} domain={[0, 3]} unit="h" name="REM" width={20} />
          </ChartCard>
          <ChartCard title="Deep sleep" sub="hours, target 1h or more">
            <TrendArea data={chartData(deepSlice)} color={C.primary} id="gDeep" height={140} domain={[0, 2.5]} unit="h" name="Deep" width={20} />
          </ChartCard>
        </div>
      </Section>

      {/* ── Recovery & Body ── */}
      <Section title="Recovery and body" sub="Trends over time">
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title="Recovery score" sub="0–100, higher is better">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData(recSlice)}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} {...ax} width={24} />
                <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${Math.round(v)}`, "Recovery"])} />
                <Line type="monotone" dataKey="value" stroke={C.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Stress score" sub="0–100, lower is better">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData(stressSlice)}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} {...ax} width={24} />
                <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${Math.round(v)}`, "Stress"])} />
                <Line type="monotone" dataKey="value" stroke={C.exercise} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Body weight" sub="kg" action={<span className="text-lg font-semibold tabular-nums">{weightNow} kg</span>}>
            <TrendArea data={chartData(weightSlice)} color={C.meds} id="gW8" height={140} unit=" kg" name="Weight" />
          </ChartCard>
        </div>
      </Section>

      </>)}

      {/* ── Habit Trends ── */}
      <Section title="Habit trends" sub="From what you've logged">
        <div className={cn("grid gap-6", hasWearableData ? "lg:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
          {habitTrends.map((h) => (
            <Card key={h.title} className="gap-4 [--card-spacing:--spacing(6)]">
              <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
                <HabitIcon icon={h.icon} hue={h.hue} className="row-span-2 size-9" />
                <CardTitle className="font-semibold">{h.title}</CardTitle>
                <CardDescription className="col-start-2">{h.sub}</CardDescription>
              </CardHeader>
              <CardContent>
                <MiniSparkline data={chartData(h.slice)} color={h.color} />
                <p className="mt-3 text-sm text-muted-foreground">{h.note}</p>
              </CardContent>
            </Card>
          ))}
          {hasWearableData && (
            <Card className="gap-4 [--card-spacing:--spacing(6)]">
              <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
                <HabitIcon icon={Footprints} hue="exercise" className="row-span-2 size-9" />
                <CardTitle className="font-semibold">Activity</CardTitle>
                <CardDescription className="col-start-2">steps</CardDescription>
              </CardHeader>
              <CardContent>
                <MiniSparkline data={chartData(stepsSlice)} color={C.exercise} />
                <p className="mt-3 text-sm text-muted-foreground">{last(bm.steps, days).filter(e => e.value >= 10000).length} days hit goal</p>
              </CardContent>
            </Card>
          )}
        </div>

        {data.custom.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.custom.map((habit: CustomHabit) => {
              const slice = last(habit.entries, days);
              return (
                <Card key={habit.id} className="gap-4 [--card-spacing:--spacing(6)]">
                  <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
                    <CustomHabitIcon icon={habit.icon} className="row-span-2 size-9" />
                    <CardTitle className="truncate font-semibold">{habit.name}</CardTitle>
                    <CardDescription className="col-start-2">{habit.unit} / day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MiniSparkline data={chartData(slice)} color={C.teal} />
                    <p className="mt-3 text-sm text-muted-foreground">Avg {avg(slice).toFixed(1)} · target {habit.target}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

    </div>
  );
}
