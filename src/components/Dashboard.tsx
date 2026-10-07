import { useMemo, useState } from "react";
import {
  BarChart, Bar,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  BatteryLow, BatteryFull, CheckCircle2, Droplet, Footprints, HeartPulse, Moon, Watch, Wind, type LucideIcon,
} from "lucide-react";
import type { HabitData, BiometricData, HabitEntry, BiometricEntry } from "../types";
import type { ProfileRow } from "../hooks/useProfile";
import { goalByKey } from "../lib/metabolics";
import { CORE_HABITS, WATER_TARGET, withDeviceActivity } from "../lib/completion";
import { PERIOD_DAYS, byDate, dayRange, habitStats, overview, type Period } from "../lib/dashboardStats";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { C, ChartCard, InsightRow, Section, TrendArea, VitalCard, ax, fmt, ttStyle } from "./dashboard/ui";
import WeeklyReportCard from "./dashboard/WeeklyReport";
import DashboardSummary from "./dashboard/DashboardSummary";
import {
  ConsistencySection, CustomHabitsSection, MoodMedsSection, MovementSection, NutritionSection, PatternsSection,
  ScorecardSection, SleepSection,
} from "./dashboard/DashboardSections";
import type { DashCtx } from "./dashboard/context";
import { daysAgoKey, todayKey } from "../lib/dates";

interface Props {
  data: HabitData;
  biometrics: BiometricData;
  /** Carries the baseline computed at the end of onboarding. */
  profile?: ProfileRow;
}

const TODAY = todayKey();
const dateString = daysAgoKey;

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

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <Tabs value={period} onValueChange={(v) => onChange(v as Period)}>
      {/* Sits on the summary's gradient, so it gets a white track and a solid
          Fikko green for the chosen period to stand out from the panel. */}
      <TabsList className="h-9! bg-white/80 shadow-sm ring-1 ring-primary/15">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <TabsTrigger
            key={p}
            value={p}
            // A period switch with no tab panels, so nothing for aria-controls to point at.
            aria-controls={undefined}
            className="px-4 capitalize data-active:bg-primary! data-active:text-primary-foreground! data-active:shadow-sm"
          >
            {p}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
          Worked out from your height, weight, age and activity
          {profile.target_weight_kg ? ` · target ${profile.target_weight_kg} kg` : ""}
        </CardDescription>
        {goal && (
          <CardAction>
            <Badge variant="outline" className="h-6 border-teal/40 bg-teal/5 px-2.5 text-primary-ink">{goal.label}</Badge>
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
              <p className={cn("text-sm text-muted-foreground", t.accent && "text-primary-ink")}>{t.label}</p>
              <p className={cn("mt-1 text-3xl font-semibold tabular-nums", t.accent && "text-primary-ink")}>
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
          <p className="font-semibold">No wearable connected yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Fitbit or Pixel Watch in Profile and your vitals, sleep stages and recovery trends will appear
            in this space. Apple Health and Garmin are coming next. Everything above is from what you&apos;ve logged in Fikko.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard({ data: logged, biometrics, profile }: Props) {
  // Activity here is the day's total: logged workouts plus wearable minutes.
  const data = useMemo(() => withDeviceActivity(logged), [logged]);
  const [period, setPeriod] = useState<Period>("week");

  const days = PERIOD_DAYS[period];

  // Everything the logged-habit sections read, worked out once per period.
  const ctx = useMemo<DashCtx>(() => {
    const dates = dayRange(days);
    const prevDates = dayRange(days, days);
    const waterTarget = profile?.water_goal ?? WATER_TARGET;
    const ov = overview(data, dates, waterTarget);
    const prev = overview(data, prevDates, waterTarget);
    const prevOv = prev.logged > 0 ? prev : null;
    const m = Object.fromEntries(CORE_HABITS.map((k) => [k, byDate(data[k])])) as DashCtx["m"];
    return {
      data, profile, period, dates, prevDates, ov, prevOv, m, waterTarget,
      stats: habitStats(data, dates, prevDates, prevOv != null, waterTarget),
    };
  }, [data, profile, period, days]);

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


  return (
    <div className="space-y-12">

      {/* ── Summary: also the page header, like the Today card on Habits ── */}
      <DashboardSummary
        ctx={ctx}
        toggle={<PeriodToggle period={period} onChange={setPeriod} />}
        note={hasWearableData ? "Wearable data included." : undefined}
        report={<WeeklyReportCard data={data} biometrics={biometrics} profile={profile} />}
      />
      <ConsistencySection ctx={ctx} />
      <PatternsSection ctx={ctx} />
      <ScorecardSection ctx={ctx} />
      <NutritionSection
        ctx={ctx}
        plan={profile?.bmr != null && profile.tdee != null ? <BaselinePlan profile={profile} /> : undefined}
      />
      <MovementSection ctx={ctx} />
      <SleepSection ctx={ctx} />
      <MoodMedsSection ctx={ctx} />
      <CustomHabitsSection ctx={ctx} />

      {!hasWearableData && <WearableComingSoon />}

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
                aria-label={`Stress level: ${stressNow} out of 100`}
                value={stressNow}
                className={cn("h-2", stressNow > 65 ? "[&>div]:bg-destructive" : stressNow > 40 && "[&>div]:bg-ink")}
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
    </div>
  );
}
