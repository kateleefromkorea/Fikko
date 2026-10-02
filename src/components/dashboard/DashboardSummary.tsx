import type { ReactNode } from "react";
import { CalendarCheck, Flame, Sparkles, Trophy } from "lucide-react";
import ProgressRing from "../ProgressRing";
import { HabitIcon } from "../HabitCard";
import { avgOf, currentStreak, loggedOn, longestStreak, parseJSON, sleepHours, valuesIn } from "../../lib/dashboardStats";
import type { SleepNote } from "../HabitsView";
import { Delta } from "./ui";
import { weekLabel } from "./reportData";
import {
  HABIT_INFO, PERIOD_PHRASE, PREV_PHRASE, habitLabel, kcal, moodLabel, one, pct, plural, restLabel, type DashCtx,
} from "./context";

function headline(rate: number, logged: number, noun: string) {
  if (logged === 0) return "Nothing logged yet";
  if (rate >= 0.8) return `An excellent ${noun}`;
  if (rate >= 0.6) return `A strong ${noun}`;
  if (rate >= 0.4) return `A steady ${noun}`;
  return `A light ${noun}`;
}

/**
 * The top of the dashboard: how the period went overall, in one ring, one
 * sentence and a figure for every habit, with the weekly report underneath.
 */
export default function DashboardSummary({ ctx, report }: { ctx: DashCtx; report?: ReactNode }) {
  const { data, profile, period, dates, ov, prevOv, stats, m } = ctx;
  const noun = period === "year" ? "year" : period;
  const logTest = (d: string) => loggedOn(data, d);
  const streak = currentStreak(logTest);
  const best = longestStreak(logTest);

  const ranked = [...stats].sort((a, b) => b.rate - a.rate);
  const top = ranked[0];
  const low = ranked[ranked.length - 1];

  let sentence: string;
  if (ov.logged === 0) {
    sentence = `You haven't logged anything in ${PERIOD_PHRASE[period]}. Check in on the Habits page and this summary fills in as you go.`;
  } else {
    sentence = `You logged ${ov.logged} of ${ov.days} days and completed ${pct(ov.rate)} of your habits.`;
    if (top && top.rate > 0) sentence += ` ${habitLabel(top)} was your most consistent habit`;
    if (low && top && low !== top && low.rate < top.rate) sentence += `, and ${habitLabel(low).toLowerCase()} needs the most attention.`;
    else if (top && top.rate > 0) sentence += ".";
  }

  // ── Per-habit figures ──
  const calAvg = avgOf(valuesIn(data.food, dates, (e) => e.value > 0));
  const exTotal = valuesIn(data.exercise, dates).reduce((s, v) => s + v, 0);
  const exDays = valuesIn(data.exercise, dates, (e) => e.value > 0).length;
  const waterAvg = avgOf(valuesIn(data.water, dates, (e) => e.value > 0));
  const restAvg = avgOf(valuesIn(data.sleep, dates, (e) => e.value > 0));
  const hoursAvg = avgOf(
    dates
      .map((d) => { const n = parseJSON<SleepNote>(m.sleep.get(d)?.note); return sleepHours(n?.bedtime, n?.wake); })
      .filter((h): h is number => h != null),
  );
  const moodAvg = avgOf(valuesIn(data.mood, dates, (e) => e.value > 0));
  const medsAll = valuesIn(data.medication, dates, (e) => e.value === 1).length;
  const goal = profile?.calorie_goal;

  const glance = [
    {
      key: "food" as const,
      value: calAvg != null ? kcal(calAvg) : "—",
      unit: calAvg != null ? "kcal" : undefined,
      sub: calAvg != null ? `a day on average${goal ? ` · target ${kcal(goal)}` : ""}` : "No meals logged",
    },
    {
      key: "exercise" as const,
      value: exTotal ? kcal(exTotal) : "—",
      unit: exTotal ? "min" : undefined,
      sub: exTotal ? `across ${plural(exDays, "day")}` : "No activity logged",
    },
    {
      key: "water" as const,
      value: waterAvg != null ? one(waterAvg) : "—",
      unit: waterAvg != null ? "glasses" : undefined,
      sub: waterAvg != null ? "a day on average" : "No water logged",
    },
    {
      key: "sleep" as const,
      value: restAvg != null ? restLabel(restAvg) : "—",
      sub: restAvg != null
        ? `${one(restAvg)} / 5${hoursAvg != null ? ` · ${one(hoursAvg)}h a night` : ""}`
        : "No sleep logged",
    },
    {
      key: "mood" as const,
      value: moodAvg != null ? moodLabel(moodAvg) : "—",
      sub: moodAvg != null ? `${one(moodAvg)} / 5 on average` : "No check-ins",
    },
    {
      key: "medication" as const,
      value: `${medsAll}/${ov.days}`,
      sub: "days everything taken",
    },
  ];

  const tiles = [
    { icon: CalendarCheck, label: "Days logged", value: `${ov.logged}/${ov.days}` },
    { icon: Trophy, label: "Perfect days", value: ov.perfect.toLocaleString() },
    { icon: Flame, label: "Current streak", value: plural(streak, "day") },
    { icon: Sparkles, label: "Best streak", value: plural(best, "day") },
  ];

  return (
    <section aria-labelledby="summary-title" className="fresh-panel overflow-hidden rounded-2xl border border-teal/20 p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">
        Summary · {PERIOD_PHRASE[period]}
        {dates.length > 0 && ` · ${weekLabel({ from: dates[0], to: dates[dates.length - 1] })}`}
      </p>

      <div className="mt-6 grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <ProgressRing value={ov.rate} size={200} stroke={14} label={`${pct(ov.rate)} of habits completed`} className="mx-auto md:mx-0">
          <div>
            <p className="font-display text-7xl leading-none font-medium">
              {Math.round(ov.rate * 100)}
              <span className="text-3xl text-foreground/50">%</span>
            </p>
            <p className="mt-2 text-xs tracking-wider text-foreground/60 uppercase">consistency</p>
          </div>
        </ProgressRing>

        <div className="min-w-0">
          <h2 id="summary-title" className="font-display text-3xl font-medium sm:text-4xl">{headline(ov.rate, ov.logged, noun)}</h2>
          <p className="mt-3 max-w-2xl text-base text-foreground/70">{sentence}</p>
          {prevOv && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-foreground/60">
              <Delta value={(ov.rate - prevOv.rate) * 100} suffix=" pts" className="text-sm font-medium" />
              <span>vs {PREV_PHRASE[period]} ({pct(prevOv.rate)})</span>
            </p>
          )}
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 ring-1 ring-foreground/5">
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {glance.map((g) => {
          const info = HABIT_INFO[g.key];
          return (
            <div key={g.key} className="rounded-xl bg-white/70 p-4 ring-1 ring-foreground/5">
              <div className="flex items-center gap-2">
                <HabitIcon icon={info.icon} hue={info.hue} className="size-7 [&>svg]:size-4" />
                <p className="text-sm text-muted-foreground">{info.label}</p>
              </div>
              <p className="mt-3 text-xl font-semibold tracking-tight tabular-nums">
                {g.value}
                {g.unit && <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{g.unit}</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{g.sub}</p>
            </div>
          );
        })}
      </div>

      {report && <div className="mt-3">{report}</div>}
    </section>
  );
}
