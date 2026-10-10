import { dailyRollup } from "./exportCsv";

// The deep-dive reports (exportReport.ts draws them as a PDF):
//   • monthly: one calendar month against the month before, with highlights,
//     patterns, weekdays against weekends, food and custom habits.
//   • lifetime: everything since the first log, month by month.
// Plain arithmetic on the member's own logs, nothing sent anywhere. A pattern
// needs MIN_DAYS on each side before it's reported.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const MIN_DAYS = 3;

export interface Goals { water: number; sleep: number; calories: number | null }

/** One day, in numbers. Missing means not logged. */
export interface Day {
  date: string;
  calories?: number; protein?: number; carbs?: number; fat?: number;
  water?: number; activity?: number;
  sleepHours?: number; bedtime?: string; rested?: number;
  mood?: number; medsAll?: boolean;
  steps?: number; weight?: number;
  custom: Record<string, number>;
  logged: boolean;
}

export interface Summary {
  from: string; to: string;
  days: number; daysLogged: number;
  calories: number | null; protein: number | null;
  water: number | null; waterGoalDays: number;
  activityTotal: number; activeDays: number;
  sleepHours: number | null; sleepGoalNights: number;
  rested: number | null; mood: number | null;
  medsRate: number | null;
  steps: number | null;
  weightStart: number | null; weightEnd: number | null;
  longestStreak: number;
}

export interface CustomHabitStat { name: string; unit: string; target: number; daysLogged: number; daysAtTarget: number; average: number | null }
export interface FoodStat { name: string; times: number }
export interface SplitRow { label: string; weekday: string; weekend: string }

export interface Report {
  kind: "month" | "lifetime";
  title: string;
  subtitle: string;
  current: Summary;
  /** The month before (monthly reports only). */
  previous: Summary | null;
  /** One row per calendar month (lifetime reports only). */
  months: (Summary & { label: string })[];
  highlights: string[];
  patterns: string[];
  split: SplitRow[];
  topFoods: FoodStat[];
  macroSplit: { protein: number; carbs: number; fat: number } | null;
  customHabits: CustomHabitStat[];
  /** Daily values for the charts (monthly) or monthly averages (lifetime). */
  series: { label: string; water: number | null; sleep: number | null; mood: number | null; activity: number | null }[];
  goals: Goals;
}

// ── Reading the logs ───────────────────────────────────────────────────────

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

function shift(key: string, days: number) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) out.push(d);
  return out;
}

const isWeekend = (key: string) => { const w = new Date(key + "T12:00:00Z").getUTCDay(); return w === 0 || w === 6; };
const monthLabel = (key: string, style: "long" | "short" = "long") =>
  new Date(key.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("en-US", { month: style, year: "numeric", timeZone: "UTC" });
const dayLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function readDays(tables: Tables): Map<string, Day> {
  const { days, customHabits } = dailyRollup(tables);
  const out = new Map<string, Day>();
  for (const [date, d] of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const get = (k: string) => n(d.get(k));
    const custom: Record<string, number> = {};
    for (const h of customHabits) { const v = get(h.header); if (v != null) custom[h.id] = v; }
    const sleepHours = get("Sleep (hours)") ?? get("Sleep (wearable, hours)");
    const day: Day = {
      date,
      calories: get("Calories (kcal)"), protein: get("Protein (g)"), carbs: get("Carbs (g)"), fat: get("Fat (g)"),
      water: get("Water (glasses)"), activity: get("Activity (minutes)"),
      sleepHours: sleepHours && sleepHours > 0 ? sleepHours : undefined,
      bedtime: (d.get("Bedtime") as string) || undefined,
      rested: get("Rested (1-5)"), mood: get("Mood (1-5)"),
      medsAll: d.has("All medications taken") ? d.get("All medications taken") === "Yes" : undefined,
      steps: get("Steps (wearable)"), weight: get("Weight (kg)"),
      custom,
      logged: false,
    };
    day.logged = [day.calories, day.water, day.activity, day.rested, day.mood].some((v) => v != null && v > 0)
      || day.medsAll != null || Object.values(custom).some((v) => v > 0);
    out.set(date, day);
  }
  return out;
}

export function goalsFrom(profile: Row | undefined): Goals {
  return {
    water: n(profile?.water_goal) ?? 8,
    sleep: n(profile?.sleep_goal) ?? 7,
    calories: n(profile?.calorie_goal) ?? null,
  };
}

// ── Summaries ──────────────────────────────────────────────────────────────

function longestRun(dates: string[], test: (d: string) => boolean) {
  let best = 0, run = 0;
  for (const d of dates) { run = test(d) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

export function summarise(all: Map<string, Day>, from: string, to: string, goals: Goals): Summary {
  const dates = eachDay(from, to);
  const days = dates.map((d) => all.get(d)).filter((d): d is Day => !!d);
  const vals = (pick: (d: Day) => number | undefined, keep: (v: number) => boolean = (v) => v > 0) =>
    days.map(pick).filter((v): v is number => v != null && keep(v));
  const water = vals((d) => d.water, () => true);
  const activity = vals((d) => d.activity, () => true);
  const sleep = vals((d) => d.sleepHours);
  const meds = days.filter((d) => d.medsAll != null);
  const weights = days.filter((d) => d.weight != null);
  return {
    from, to,
    days: dates.length,
    daysLogged: days.filter((d) => d.logged).length,
    calories: avg(vals((d) => d.calories)),
    protein: avg(vals((d) => d.protein)),
    water: avg(water),
    waterGoalDays: water.filter((v) => v >= goals.water).length,
    activityTotal: activity.reduce((a, b) => a + b, 0),
    activeDays: activity.filter((v) => v >= 30).length,
    sleepHours: avg(sleep),
    sleepGoalNights: sleep.filter((v) => v >= goals.sleep).length,
    rested: avg(vals((d) => d.rested)),
    mood: avg(vals((d) => d.mood)),
    medsRate: meds.length ? meds.filter((d) => d.medsAll).length / meds.length : null,
    steps: avg(vals((d) => d.steps)),
    weightStart: weights[0]?.weight ?? null,
    weightEnd: weights[weights.length - 1]?.weight ?? null,
    longestStreak: longestRun(dates, (d) => !!all.get(d)?.logged),
  };
}

// ── Highlights and patterns ────────────────────────────────────────────────

function highlights(all: Map<string, Day>, s: Summary, goals: Goals): string[] {
  const out: string[] = [];
  const dates = eachDay(s.from, s.to);
  const days = dates.map((d) => all.get(d)).filter((d): d is Day => !!d);
  if (s.longestStreak >= 3) out.push(`Your longest run of logging was ${s.longestStreak} days in a row.`);
  const waterRun = longestRun(dates, (d) => (all.get(d)?.water ?? 0) >= goals.water);
  if (waterRun >= 3) out.push(`You reached your water goal ${waterRun} days in a row.`);
  if (s.sleepGoalNights >= 3) out.push(`You slept ${goals.sleep}+ hours on ${s.sleepGoalNights} nights.`);
  const mostActive = days.filter((d) => (d.activity ?? 0) > 0).sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0))[0];
  if (mostActive && (mostActive.activity ?? 0) >= 30) out.push(`Your most active day was ${dayLabel(mostActive.date)}, with ${mostActive.activity} minutes.`);
  const great = days.filter((d) => d.mood === 5).length;
  if (great >= 2) out.push(`You felt great (5/5) on ${great} days.`);
  if (s.medsRate != null && s.medsRate >= 0.9) out.push(`You ticked off all your medications on ${Math.round(s.medsRate * 100)}% of the days you tracked them.`);
  return out;
}

function compare(days: Day[], value: (d: Day) => number | undefined, a: (d: Day) => boolean, b: (d: Day) => boolean) {
  const xs = days.filter(a).map(value).filter((v): v is number => v != null && v > 0);
  const ys = days.filter(b).map(value).filter((v): v is number => v != null && v > 0);
  if (xs.length < MIN_DAYS || ys.length < MIN_DAYS) return null;
  return { a: avg(xs)!, b: avg(ys)!, na: xs.length, nb: ys.length };
}

const bedtimeLateness = (t?: string) => {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  return m ? ((Number(m[1]) * 60 + Number(m[2]) - 18 * 60 + 1440) % 1440) : null;
};

function patterns(all: Map<string, Day>, s: Summary, goals: Goals): string[] {
  const days = eachDay(s.from, s.to).map((d) => all.get(d)).filter((d): d is Day => !!d);
  const out: { text: string; size: number }[] = [];
  const sleepy = compare(days, (d) => d.mood, (d) => (d.sleepHours ?? 0) >= goals.sleep, (d) => d.sleepHours != null && d.sleepHours < goals.sleep);
  if (sleepy && Math.abs(sleepy.a - sleepy.b) >= 0.4) {
    out.push({ text: `Your mood averaged ${r1(sleepy.a)}/5 on days after ${goals.sleep}+ hours of sleep, and ${r1(sleepy.b)}/5 after shorter nights.`, size: Math.abs(sleepy.a - sleepy.b) });
  }
  const late = 5.5 * 60;
  const bed = compare(days, (d) => d.rested, (d) => (bedtimeLateness(d.bedtime) ?? Infinity) < late, (d) => (bedtimeLateness(d.bedtime) ?? -1) >= late);
  if (bed && Math.abs(bed.a - bed.b) >= 0.4) {
    out.push({ text: `You woke feeling ${r1(bed.a)}/5 rested after going to bed before 11:30pm, and ${r1(bed.b)}/5 after later nights.`, size: Math.abs(bed.a - bed.b) });
  }
  const moved = compare(days, (d) => d.mood, (d) => (d.activity ?? 0) >= 30, (d) => d.activity != null && d.activity < 30);
  if (moved && Math.abs(moved.a - moved.b) >= 0.4) {
    out.push({ text: `Your mood averaged ${r1(moved.a)}/5 on days with 30+ minutes of activity, and ${r1(moved.b)}/5 on other days.`, size: Math.abs(moved.a - moved.b) });
  }
  const hydrated = compare(days, (d) => d.mood, (d) => (d.water ?? 0) >= goals.water, (d) => d.water != null && d.water < goals.water);
  if (hydrated && Math.abs(hydrated.a - hydrated.b) >= 0.4) {
    out.push({ text: `Your mood averaged ${r1(hydrated.a)}/5 on days you reached your water goal, and ${r1(hydrated.b)}/5 on days you didn't.`, size: Math.abs(hydrated.a - hydrated.b) });
  }
  return out.sort((x, y) => y.size - x.size).map((p) => p.text);
}

function split(all: Map<string, Day>, s: Summary): SplitRow[] {
  const days = eachDay(s.from, s.to).map((d) => all.get(d)).filter((d): d is Day => !!d);
  const side = (weekend: boolean, pick: (d: Day) => number | undefined, digits = 1) => {
    const xs = days.filter((d) => isWeekend(d.date) === weekend).map(pick).filter((v): v is number => v != null && v > 0);
    return xs.length >= 2 ? String(digits ? r1(avg(xs)!) : Math.round(avg(xs)!)) : "–";
  };
  const rows: SplitRow[] = [
    { label: "Water (glasses)", weekday: side(false, (d) => d.water), weekend: side(true, (d) => d.water) },
    { label: "Activity (minutes)", weekday: side(false, (d) => d.activity, 0), weekend: side(true, (d) => d.activity, 0) },
    { label: "Sleep (hours)", weekday: side(false, (d) => d.sleepHours), weekend: side(true, (d) => d.sleepHours) },
    { label: "Mood (out of 5)", weekday: side(false, (d) => d.mood), weekend: side(true, (d) => d.mood) },
  ];
  return rows.filter((r) => r.weekday !== "–" || r.weekend !== "–");
}

function foods(tables: Tables, from: string, to: string): FoodStat[] {
  const counts = new Map<string, { name: string; times: number }>();
  for (const f of tables.food_log_items ?? []) {
    const date = String(f.date);
    if (date < from || date > to || typeof f.name !== "string") continue;
    const key = f.name.trim().toLowerCase();
    const c = counts.get(key) ?? { name: f.name.trim(), times: 0 };
    c.times++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name)).slice(0, 10);
}

function macroSplit(all: Map<string, Day>, s: Summary) {
  let p = 0, c = 0, f = 0;
  for (const d of eachDay(s.from, s.to).map((k) => all.get(k))) { p += d?.protein ?? 0; c += d?.carbs ?? 0; f += d?.fat ?? 0; }
  const kcal = p * 4 + c * 4 + f * 9;
  if (kcal <= 0) return null;
  return { protein: Math.round((p * 4 / kcal) * 100), carbs: Math.round((c * 4 / kcal) * 100), fat: Math.round((f * 9 / kcal) * 100) };
}

function customHabitStats(tables: Tables, all: Map<string, Day>, s: Summary): CustomHabitStat[] {
  return (tables.custom_habits ?? []).map((h) => {
    const id = String(h.id), target = n(Number(h.target)) ?? 1;
    const xs = eachDay(s.from, s.to).map((d) => all.get(d)?.custom[id]).filter((v): v is number => v != null && v > 0);
    return { name: String(h.name), unit: String(h.unit ?? ""), target, daysLogged: xs.length, daysAtTarget: xs.filter((v) => v >= target).length, average: avg(xs) };
  }).filter((h) => h.daysLogged > 0);
}

// ── The two reports ────────────────────────────────────────────────────────

const firstName = (tables: Tables) => String(tables.profiles?.[0]?.name ?? "").trim().split(/\s+/)[0] ?? "";

/** The calendar month containing `anyDay` ("2026-10-14" → October 2026), against the month before. */
export function monthlyReport(tables: Tables, anyDay: string, today: string): Report {
  const all = readDays(tables);
  const goals = goalsFrom(tables.profiles?.[0]);
  const from = anyDay.slice(0, 7) + "-01";
  const end = shift(shift(from, 32).slice(0, 7) + "-01", -1);
  const to = end > today ? today : end;
  const prevFrom = shift(from, -1).slice(0, 7) + "-01";
  const current = summarise(all, from, to, goals);
  const previous = summarise(all, prevFrom, shift(from, -1), goals);
  const name = firstName(tables);
  return {
    kind: "month",
    title: `${monthLabel(from)}${name ? ` for ${name}` : ""}`,
    subtitle: to < end ? `So far this month, to ${dayLabel(to)}, compared with ${monthLabel(prevFrom)}` : `Compared with ${monthLabel(prevFrom)}`,
    current, previous: previous.daysLogged ? previous : null, months: [],
    highlights: highlights(all, current, goals),
    patterns: patterns(all, current, goals),
    split: split(all, current),
    topFoods: foods(tables, from, to),
    macroSplit: macroSplit(all, current),
    customHabits: customHabitStats(tables, all, current),
    series: eachDay(from, to).map((d) => {
      const day = all.get(d);
      return { label: String(Number(d.slice(8))), water: day?.water ?? null, sleep: day?.sleepHours ?? null, mood: day?.mood ?? null, activity: day?.activity ?? null };
    }),
    goals,
  };
}

/** Everything from the first logged day to today, with a row per month. */
export function lifetimeReport(tables: Tables, today: string): Report {
  const all = readDays(tables);
  const goals = goalsFrom(tables.profiles?.[0]);
  const logged = [...all.values()].filter((d) => d.logged).map((d) => d.date).sort();
  const from = logged[0] ?? today;
  const current = summarise(all, from, today, goals);
  const months: Report["months"] = [];
  for (let m = from.slice(0, 7) + "-01"; m <= today; m = shift(m, 32).slice(0, 7) + "-01") {
    const end = shift(shift(m, 32).slice(0, 7) + "-01", -1);
    const s = summarise(all, m < from ? from : m, end > today ? today : end, goals);
    months.push({ ...s, label: monthLabel(m, "short") });
  }
  const name = firstName(tables);
  return {
    kind: "lifetime",
    title: `Your Fikko story${name ? `, ${name}` : ""}`,
    subtitle: `Everything since ${new Date(from + "T12:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`,
    current, previous: null, months,
    highlights: highlights(all, current, goals),
    patterns: patterns(all, current, goals),
    split: split(all, current),
    topFoods: foods(tables, from, today),
    macroSplit: macroSplit(all, current),
    customHabits: customHabitStats(tables, all, current),
    series: months.map((m) => ({
      label: m.label.replace(/ \d{4}$/, ""), water: m.water, sleep: m.sleepHours, mood: m.mood,
      activity: m.days ? m.activityTotal / m.days : null,
    })),
    goals,
  };
}
