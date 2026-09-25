import { useState } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import type { HabitData, BiometricData, HabitEntry, BiometricEntry, CustomHabit } from "../types";
import PageHeader from "./PageHeader";
import type { ProfileRow } from "../hooks/useProfile";
import { goalByKey } from "../lib/metabolics";

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

const ttStyle = {
  fontSize: 12, borderRadius: 12,
  border: "1px solid #CFDCF2",
  boxShadow: "0 4px 16px rgba(30,64,175,.1)",
  background: "#fff",
  color: "#0C1A38",
};

const ax = {
  tick: { fontSize: 10, fill: "#5C7299" },
  axisLine: false as const,
  tickLine: false as const,
};

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-secondary">
      {(["week", "month", "year"] as Period[]).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className="px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-all"
          style={period === p ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}>
          {p}
        </button>
      ))}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-extrabold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartCard({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl p-5 border border-border ${className}`}>
      <div className="mb-3">
        <p className="font-bold text-foreground text-sm">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function VitalCard({
  label, value, unit, sub, trend, good,
}: {
  label: string; value: string; unit: string; sub: string; trend?: "up" | "down" | "stable"; good?: "up" | "down";
}) {
  const isPositive = trend === good;
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <div className="rounded-2xl p-5 bg-card border border-border flex flex-col gap-1">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className="text-3xl font-extrabold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{unit}</p>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {trend && <span className="text-sm font-bold" style={{ color: trend === "stable" ? "var(--muted-foreground)" : isPositive ? "var(--teal)" : "var(--coral)" }}>{arrow}</span>}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function MiniSparkline({ data, color = "var(--primary)" }: { data: { label: string; value: number }[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5}
          fill={`url(#spark-${color.replace("#", "")})`} dot={false} />
        <Tooltip contentStyle={{ ...ttStyle, fontSize: 11 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InsightCard({ text, icon }: { text: string; icon: string }) {
  return (
    <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-muted border border-border">
      <span className="text-base mt-0.5">{icon}</span>
      <p className="text-sm text-secondary-foreground leading-relaxed">{text}</p>
    </div>
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
    { label: "BMR", value: Math.round(profile.bmr!).toLocaleString(), unit: "kcal", note: "At complete rest" },
    { label: "TDEE", value: Math.round(profile.tdee!).toLocaleString(), unit: "kcal", note: "With your activity on top" },
    {
      label: "Daily target",
      value: Math.round(profile.calorie_goal).toLocaleString(),
      unit: "kcal",
      note: rate ? `${rate < 0 ? "Deficit" : "Surplus"} for ${Math.abs(rate)} kg / week` : "Holding steady",
      accent: true,
    },
  ];

  return (
    <div className="bg-card rounded-3xl border border-border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <p className="font-bold text-foreground text-sm">Your plan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mifflin-St Jeor, from the details you gave us
            {goal ? ` · ${goal.label.toLowerCase()}` : ""}
            {profile.target_weight_kg ? ` · target ${profile.target_weight_kg} kg` : ""}
          </p>
        </div>
        {goal && <span className="text-2xl">{goal.icon}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl p-4 border"
            style={t.accent
              ? { background: "var(--primary)", borderColor: "var(--primary)" }
              : { background: "var(--muted)", borderColor: "var(--border)" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: t.accent ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)" }}
            >
              {t.label}
            </p>
            <p
              className="text-3xl font-extrabold mt-1"
              style={{ color: t.accent ? "#fff" : "var(--foreground)" }}
            >
              {t.value}
              <span className="text-xs font-semibold ml-1">{t.unit}</span>
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: t.accent ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}
            >
              {t.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ data, biometrics, profile }: Props) {
  const [period, setPeriod] = useState<Period>("week");

  const days = period === "week" ? 7 : period === "month" ? 30 : 365;

  // Slices
  const bm = biometrics;
  const hrSlice   = last(bm.heartRate, days);
  const hrvSlice  = last(bm.hrv, days);
  const spo2Slice = last(bm.spo2, days);
  const rrSlice   = last(bm.respiratoryRate, days);
  const tempSlice = last(bm.bodyTemp, days);
  const stepsSlice   = last(bm.steps, days);
  const calSlice     = last(bm.activeCalories, days);
  const vo2Slice     = last(bm.vo2max, days);
  const standSlice   = last(bm.standHours, days);
  const recSlice     = last(bm.recoveryScore, days);
  const stressSlice  = last(bm.stressScore, days);
  const remSlice     = last(bm.sleepRem, days);
  const deepSlice    = last(bm.sleepDeep, days);
  const coreSlice    = last(bm.sleepCore, days);
  const weightSlice  = last(bm.weight, days);

  const waterSlice    = last(data.water, days);
  const medSlice      = last(data.medication, days);
  const foodSlice     = last(data.food, days);
  const exerciseSlice = last(data.exercise, days);
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
    { name: "REM",  value: todaySleep.rem,  fill: "#1E40AF" },
    { name: "Deep", value: todaySleep.deep, fill: "#2DC4B2" },
    { name: "Core", value: todaySleep.core, fill: "#8FA9E0" },
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
  const insights: { text: string; icon: string }[] = [];
  if (hrvNow < 35) insights.push({ text: `HRV is ${hrvNow}ms — lower than optimal. Prioritise rest and reduce stress today.`, icon: "💓" });
  if (spo2Now < 96) insights.push({ text: `SpO₂ is ${spo2Now}% — slightly below the ideal 97–99% range. Consider checking your device fit.`, icon: "🩸" });
  if (recNow < 50) insights.push({ text: `Recovery score is ${recNow}/100. Your body may need an easier day.`, icon: "🔋" });
  if (recNow >= 80) insights.push({ text: `Recovery score is ${recNow}/100 — excellent. A great day to push a hard workout.`, icon: "⚡" });
  if (stressNow > 65) insights.push({ text: `Stress levels are elevated at ${stressNow}/100. A short walk or breathing exercise can help.`, icon: "🧘" });
  if (todaySleep.deep < 1) insights.push({ text: `Deep sleep was only ${todaySleep.deep}h last night. Avoid screens 1h before bed to improve slow-wave sleep.`, icon: "🌙" });
  if (latest(bm.steps) >= 10000) insights.push({ text: `You hit ${stepsNow} steps today — above the 10,000 target. Great movement!`, icon: "👟" });
  if (hrNow > 72) insights.push({ text: `Resting HR is ${hrNow}bpm — slightly elevated. Could reflect stress, caffeine, or incomplete recovery.`, icon: "❤️" });
  if (insights.length === 0) insights.push({ text: "All vitals look healthy today. Keep up the great work!", icon: "✅" });

  const periodLabel = period === "week" ? "Last 7 days" : period === "month" ? "Last 30 days" : "Last 12 months";

  return (
    <div className="space-y-10">

      {/* ── Header ── */}
      <PageHeader
        title="Dashboard"
        subtitle={`${periodLabel} · synced from Apple Watch & Apple Health`}
        action={<PeriodToggle period={period} onChange={setPeriod} />}
      />

      {/* ── Baseline from onboarding (absent until the wizard is finished) ── */}
      {profile?.bmr != null && profile.tdee != null && <BaselinePlan profile={profile} />}

      {/* ── Today's overview ── */}
      <Section title="Today's Overview" sub="Snapshot from your latest device sync">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Radar */}
          <div className="bg-card rounded-2xl p-5 border border-border">
            <p className="font-bold text-foreground text-sm mb-1">Health Radar</p>
            <p className="text-xs text-muted-foreground mb-2">Across 7 dimensions</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#CFDCF2" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#5C7299" }} />
                <Radar dataKey="A" stroke="#1E40AF" fill="#1E40AF" fillOpacity={0.15} strokeWidth={2} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${Math.round(v)}%`, "Score"]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Recovery + stress */}
          <div className="flex flex-col gap-4">
            <div className="bg-card rounded-2xl p-5 border border-border flex-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Recovery Score</p>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E9EFFA" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2DC4B2" strokeWidth="3"
                      strokeDasharray={`${recNow} 100`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-extrabold text-foreground">{recNow}</span>
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-foreground">
                    {recNow >= 80 ? "Peak" : recNow >= 60 ? "Good" : recNow >= 40 ? "Moderate" : "Low"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Based on HRV, sleep & resting HR</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border flex-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Stress Level</p>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${stressNow}%`, background: stressNow > 65 ? "var(--coral)" : stressNow > 40 ? "var(--amber)" : "var(--teal)" }} />
                </div>
                <span className="text-xl font-extrabold text-foreground w-12 text-right">{stressNow}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stressNow > 65 ? "Elevated — try a breathing exercise" : stressNow > 40 ? "Moderate — manageable" : "Low — you're calm today"}
              </p>
            </div>
          </div>

          {/* Insights */}
          <div className="bg-card rounded-2xl p-5 border border-border flex flex-col">
            <p className="font-bold text-foreground text-sm mb-3">Insights & Alerts</p>
            <div className="space-y-2.5 flex-1">
              {insights.slice(0, 4).map((ins, i) => <InsightCard key={i} {...ins} />)}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Vitals ── */}
      <Section title="Vitals" sub="Heart, oxygen & respiratory data from your wearable">
        {/* Stat row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          <VitalCard label="Resting Heart Rate" value={String(hrNow)} unit="bpm"
            sub={`avg ${Math.round(avg(hrSlice))} bpm this ${period}`} trend={trend(hrSlice)} good="down" />
          <VitalCard label="Heart Rate Variability" value={String(hrvNow)} unit="ms"
            sub={`avg ${Math.round(avg(hrvSlice))} ms this ${period}`} trend={trend(hrvSlice)} good="up" />
          <VitalCard label="Blood Oxygen (SpO₂)" value={String(spo2Now)} unit="%"
            sub={`avg ${avg(spo2Slice).toFixed(1)}% this ${period}`} trend={trend(spo2Slice)} good="up" />
          <VitalCard label="Respiratory Rate" value={String(rrNow)} unit="br/min"
            sub={`avg ${avg(rrSlice).toFixed(1)} this ${period}`} trend={trend(rrSlice)} good="down" />
          <VitalCard label="Body Temperature" value={tempNow >= 0 ? `+${tempNow}` : String(tempNow)} unit="°C"
            sub="deviation from baseline" trend="stable" />
        </div>

        {/* HR + HRV charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Heart Rate Trend" sub="Resting bpm">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData(hrSlice)}>
                <defs>
                  <linearGradient id="gHR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF7575" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#FF7575" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} {...ax} width={28} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v} bpm`, "Heart Rate"]} />
                <Area type="monotone" dataKey="value" stroke="#FF7575" strokeWidth={2} fill="url(#gHR)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Heart Rate Variability" sub="ms — higher is better">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData(hrvSlice)}>
                <defs>
                  <linearGradient id="gHRV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2DC4B2" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2DC4B2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} {...ax} width={28} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v} ms`, "HRV"]} />
                <Area type="monotone" dataKey="value" stroke="#2DC4B2" strokeWidth={2} fill="url(#gHRV)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      {/* ── Activity ── */}
      <Section title="Activity" sub="Steps, calories, VO₂ Max and stand hours">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <VitalCard label="Steps" value={latest(stepsSlice).toLocaleString()} unit="steps"
            sub={`avg ${Math.round(avg(stepsSlice)).toLocaleString()} this ${period}`} trend={trend(stepsSlice)} good="up" />
          <VitalCard label="Active Calories" value={String(calNow)} unit="kcal"
            sub={`avg ${Math.round(avg(calSlice))} kcal this ${period}`} trend={trend(calSlice)} good="up" />
          <VitalCard label="VO₂ Max" value={String(vo2Now)} unit="ml/kg/min"
            sub={`avg ${avg(vo2Slice).toFixed(1)} this ${period}`} trend={trend(vo2Slice)} good="up" />
          <VitalCard label="Stand Hours" value={String(standNow)} unit="hrs"
            sub={`avg ${avg(standSlice).toFixed(1)} hrs this ${period}`} trend={trend(standSlice)} good="up" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Daily Steps">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData(stepsSlice, "avg")} barSize={period === "year" ? 14 : 20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" vertical={false} />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis {...ax} width={40} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${Math.round(v).toLocaleString()}`, "Steps"]} />
                <Bar dataKey="value" fill="#F5A623" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Active Calories Burned">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData(calSlice)}>
                <defs>
                  <linearGradient id="gCal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF7575" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#FF7575" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis {...ax} width={36} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${Math.round(v)} kcal`, "Active Cal"]} />
                <Area type="monotone" dataKey="value" stroke="#FF7575" strokeWidth={2} fill="url(#gCal)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      {/* ── Sleep ── */}
      <Section title="Sleep Analysis" sub="Stages and quality from your wearable">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Stages pie */}
          <ChartCard title="Last Night's Stages" sub={`${sleepTotal.toFixed(1)}h total`}>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={140}>
                <PieChart>
                  <Pie data={sleepPie} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" strokeWidth={0}>
                    {sleepPie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v}h`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {sleepPie.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.fill }} />
                    <span className="text-xs text-muted-foreground">{s.name}</span>
                    <span className="text-xs font-bold text-foreground ml-auto pl-3">{s.value}h</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-xs font-bold text-foreground ml-auto">{sleepTotal.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            </div>
          </ChartCard>

          {/* REM trend */}
          <ChartCard title="REM Sleep Trend" sub="hours — target ≥1.5h">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData(remSlice)}>
                <defs>
                  <linearGradient id="gREM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E40AF" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#1E40AF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 3]} {...ax} width={20} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v}h`, "REM"]} />
                <Area type="monotone" dataKey="value" stroke="#1E40AF" strokeWidth={2} fill="url(#gREM)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Deep Sleep Trend" sub="hours — target ≥1h">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData(deepSlice)}>
                <defs>
                  <linearGradient id="gDeep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2DC4B2" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2DC4B2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 2.5]} {...ax} width={20} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v}h`, "Deep"]} />
                <Area type="monotone" dataKey="value" stroke="#2DC4B2" strokeWidth={2} fill="url(#gDeep)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      {/* ── Recovery & Body ── */}
      <Section title="Recovery & Body" sub="Trends over time">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Recovery Score" sub="0–100 · higher is better">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData(recSlice)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} {...ax} width={24} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${Math.round(v)}`, "Recovery"]} />
                <Line type="monotone" dataKey="value" stroke="#2DC4B2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Stress Score" sub="0–100 · lower is better">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData(stressSlice)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CFDCF2" />
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} {...ax} width={24} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${Math.round(v)}`, "Stress"]} />
                <Line type="monotone" dataKey="value" stroke="#FFB3C1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Body Weight" sub="kg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-extrabold text-foreground">{weightNow} kg</span>
              <span className="text-xs text-muted-foreground">Current</span>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData(weightSlice)}>
                <defs>
                  <linearGradient id="gW8" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8FA9E0" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8FA9E0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} {...ax} width={32} />
                <Tooltip contentStyle={ttStyle} formatter={(v: number) => [`${v} kg`, "Weight"]} />
                <Area type="monotone" dataKey="value" stroke="#8FA9E0" strokeWidth={1.5} fill="url(#gW8)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      {/* ── Habit Trends ── */}
      <Section title="Habit Trends" sub="Logged manually">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ChartCard title="Water" sub="glasses/day">
            <MiniSparkline data={chartData(waterSlice)} color="#5BA9F0" />
            <p className="text-xs text-muted-foreground mt-1">Avg {avg(waterSlice).toFixed(1)} gl · target 8</p>
          </ChartCard>
          <ChartCard title="Activity" sub="steps">
            <MiniSparkline data={chartData(stepsSlice)} color="#FF7575" />
            <p className="text-xs text-muted-foreground mt-1">{last(bm.steps, days).filter(e => e.value >= 10000).length} days hit goal</p>
          </ChartCard>
          <ChartCard title="Mood" sub="1–5 scale">
            <MiniSparkline data={chartData(moodSlice)} color="#FFB3C1" />
            <p className="text-xs text-muted-foreground mt-1">Avg {avg(moodSlice).toFixed(1)}/5 this {period}</p>
          </ChartCard>
          <ChartCard title="Calories" sub="kcal/day">
            <MiniSparkline data={chartData(foodSlice)} color="#F5A623" />
            <p className="text-xs text-muted-foreground mt-1">
              Avg {Math.round(avg(foodSlice)).toLocaleString()} kcal · {medSlice.length ? Math.round((medSlice.filter(e => e.value === 1).length / medSlice.length) * 100) : 0}% med adherence
            </p>
          </ChartCard>
        </div>

        {data.custom.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {data.custom.map((habit: CustomHabit) => {
              const slice = last(habit.entries, days);
              return (
                <div key={habit.id} className="rounded-xl p-4 border border-border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{habit.icon}</span>
                    <span className="font-bold text-foreground text-sm">{habit.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Avg {avg(slice).toFixed(1)} {habit.unit}/day · target {habit.target}</p>
                  <MiniSparkline data={chartData(slice)} color="var(--peach)" />
                </div>
              );
            })}
          </div>
        )}
      </Section>

    </div>
  );
}
