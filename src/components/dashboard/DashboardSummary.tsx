import type { ReactNode } from "react";
import ProgressRing from "../ProgressRing";
import { HabitIcon } from "../HabitCard";
import { avgOf, currentStreak, loggedOn, longestStreak, parseJSON, sleepHours, valuesIn } from "../../lib/dashboardStats";
import type { SleepNote } from "../HabitsView";
import { Delta } from "./ui";
import { weekLabel } from "./reportData";
import { comparisonLine, dashboardEyebrow } from "./headline";
import {
  HABIT_INFO, PERIOD_PHRASE, PREV_PHRASE, habitLabel, kcal, moodLabel, one, pct, plural, restLabel, type DashCtx,
} from "./context";

export function headline(rate: number, logged: number, noun: string) {
  if (logged === 0) return "Nothing logged yet";
  if (rate >= 0.8) return `An excellent ${noun}`;
  if (rate >= 0.6) return `A strong ${noun}`;
  if (rate >= 0.4) return `A steady ${noun}`;
  return `A light ${noun}`;
}

/**
 * The top of the dashboard, and its page header, kept to a slim band: how the
 * period went overall in one ring, one headline and one line, the four day
 * counts beside it, a single strip with a figure for every habit (hover for
 * the detail), and the weekly report as one row underneath.
 */
export default function DashboardSummary({ ctx, report, toggle, note }: {
  ctx: DashCtx;
  report?: ReactNode;
  /** The Week / Month / Year switch, shown top right. */
  toggle?: ReactNode;
  /** An extra line under the comparison, e.g. that wearable data is included. */
  note?: string;
}) {
  const { data, profile, period, dates, ov, prevOv, stats, m } = ctx;
  const noun = period === "year" ? "year" : period;
  const logTest = (d: string) => loggedOn(data, d);
  const streak = currentStreak(logTest);
  const best = longestStreak(logTest);

  const comparison = comparisonLine(ctx);
  const ranked = [...stats].sort((a, b) => b.rate - a.rate);
  const top = ranked[0];
  const low = ranked[ranked.length - 1];

  // One short line: the detail is in the habit figures below and the sections after.
  let sentence: string;
  if (ov.logged === 0) {
    sentence = `You haven't logged anything in ${PERIOD_PHRASE[period]}. Check in and this summary fills in as you go.`;
  } else {
    sentence = `Logged ${ov.logged} of ${ov.days} days.`;
    if (top && top.rate > 0) sentence += ` ${habitLabel(top)} is your steadiest habit`;
    if (low && top && low !== top && low.rate < top.rate) sentence += `; ${habitLabel(low).toLowerCase()} needs attention.`;
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
  ].filter((g) => g.key !== "medication" || data.tracksMedications !== false);

  const tiles = [
    { label: "Days logged", value: `${ov.logged}/${ov.days}` },
    { label: "Perfect days", value: ov.perfect.toLocaleString() },
    { label: "Streak", value: plural(streak, "day") },
    { label: "Best streak", value: plural(best, "day") },
  ];

  return (
    <section aria-labelledby="summary-title" className="daily-overview overflow-hidden rounded-2xl border border-teal/20 px-5 py-4 shadow-sm sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wider text-primary-ink uppercase">
          {dashboardEyebrow(period)}
          {dates.length > 0 && ` · ${weekLabel({ from: dates[0], to: dates[dates.length - 1] })}`}
        </p>
        {toggle}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ProgressRing value={ov.rate} size={64} stroke={7} label={`${pct(ov.rate)} of habits completed`}>
          <p className="text-base font-semibold tabular-nums">{pct(ov.rate)}</p>
        </ProgressRing>

        <div className="min-w-0 flex-1 basis-64">
          <h1 id="summary-title" className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {headline(ov.rate, ov.logged, noun)}
            {prevOv && (
              <span className="text-sm tracking-normal">
                <Delta value={(ov.rate - prevOv.rate) * 100} suffix=" pts" className="text-sm font-medium" />
                <span className="sr-only"> vs {PREV_PHRASE[period]} ({pct(prevOv.rate)})</span>
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            {sentence}
            {comparison && ` ${comparison}`}
            {note && ` ${note}`}
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
          {tiles.map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="text-foreground/60">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="mt-3 flex flex-wrap items-center justify-around gap-x-5 gap-y-2.5 rounded-xl bg-white/70 px-4 py-2.5 ring-1 ring-foreground/5">
        {glance.map((g) => {
          const info = HABIT_INFO[g.key];
          return (
            <li key={g.key} className="flex items-center gap-2" title={`${info.label}: ${g.sub}`}>
              <HabitIcon icon={info.icon} hue={info.hue} className="size-6 rounded-lg [&>svg]:size-3.5" />
              <span className="sr-only">{info.label}: </span>
              <span className="font-semibold tabular-nums">
                {g.value}
                {g.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{g.unit}</span>}
              </span>
              <span className="sr-only">, {g.sub}</span>
            </li>
          );
        })}
      </ul>

      {report && <div className="mt-2">{report}</div>}
    </section>
  );
}
