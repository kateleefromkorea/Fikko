import type { ReactNode } from "react";
import {
  BedDouble, CalendarDays, Dumbbell, Flame, GlassWater, Lightbulb, Moon, SmilePlus, TrendingUp, Utensils,
} from "lucide-react";
import ProgressRing from "../ProgressRing";
import { CustomHabitIcon, EmptyState, HabitBar, HabitIcon } from "../HabitCard";
import { MEALS, MOODS, SLEEP_FACTORS, type SleepNote } from "../HabitsView";
import { EXERCISE_TARGET_MIN, completion, type CoreHabit } from "../../lib/completion";
import {
  avgOf, buildSeries, byDate, currentStreak, dateKey, loggedOn, mealAverages, parseJSON, sleepHours, averageClock,
  split, valuesIn,
} from "../../lib/dashboardStats";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { BarTrend, C, ChartCard, Delta, InsightRow, ScoreLine, Section, Stat } from "./ui";
import {
  HABIT_INFO, PERIOD_PHRASE, PREV_PHRASE, habitLabel, kcal, moodLabel, one, pct, plural, restLabel, val, type DashCtx,
} from "./context";

const byMonth = (period: DashCtx["period"]) => period === "year";

/** Row of figures under a chart. */
function StatRow({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={cn("mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5", narrow ? "2xl:grid-cols-4" : "sm:grid-cols-4")}>
      {children}
    </div>
  );
}

// ── Consistency ────────────────────────────────────────────────────────────

const HEATMAP_WEEKS = 16;

/** Sixteen weeks of days, Monday at the top, shaded by how much got done. */
function ConsistencyCalendar({ data, waterTarget }: { data: DashCtx["data"]; waterTarget: number }) {
  const today = new Date(dateKey(0) + "T00:00:00");
  const weekday = (today.getDay() + 6) % 7; // Monday = 0
  const firstDaysAgo = weekday + (HEATMAP_WEEKS - 1) * 7;
  const cells = Array.from({ length: HEATMAP_WEEKS * 7 }, (_, i) => {
    const daysAgo = firstDaysAgo - i;
    if (daysAgo < 0) return null;
    const date = dateKey(daysAgo);
    const { done, total } = completion(data, date, waterTarget);
    return { date, done, total, logged: loggedOn(data, date) };
  });

  const shade = (done: number, total: number) => {
    const f = total ? done / total : 0;
    if (f === 0) return "bg-foreground/[0.06]";
    if (f <= 0.25) return "bg-primary/20";
    if (f <= 0.5) return "bg-primary/40";
    if (f <= 0.75) return "bg-primary/65";
    return "bg-primary";
  };

  return (
    <div>
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-none text-muted-foreground" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <span key={i} className="flex items-center">{d}</span>)}
        </div>
        <div
          className="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Habits completed each day for the last ${HEATMAP_WEEKS} weeks`}
        >
          {cells.map((c, i) =>
            c ? (
              <span
                key={c.date}
                title={`${new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${c.done} of ${c.total} habits`}
                className={cn("aspect-square rounded-[3px]", shade(c.done, c.total), c.date === dateKey(0) && "ring-1 ring-foreground/40")}
              />
            ) : (
              <span key={`future-${i}`} className="aspect-square" />
            ),
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Less
        {["bg-foreground/[0.06]", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"].map((c) => (
          <span key={c} className={cn("size-3 rounded-[3px]", c)} aria-hidden="true" />
        ))}
        More
      </div>
    </div>
  );
}

export function ConsistencySection({ ctx }: { ctx: DashCtx }) {
  const { data, period, dates, ov } = ctx;
  const perDay = new Map(ov.perDay.map((d) => [d.date, d]));
  const series = buildSeries(dates, period, (d) => {
    const p = perDay.get(d)!;
    return p.total ? Math.round((p.done / p.total) * 100) : 0;
  }, true);

  return (
    <Section title="Consistency" sub="How much of your routine you got through, day by day">
      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard
          title="Habits completed"
          sub={byMonth(period) ? "Monthly average, share of habits done" : "Share of your habits done each day"}
          className="lg:col-span-3"
        >
          <BarTrend data={series} color={C.primary} name="Completed" format={(v) => `${v}%`} domain={[0, 100]} width={40} />
        </ChartCard>
        <ChartCard title="Consistency calendar" sub={`The last ${HEATMAP_WEEKS} weeks`} className="lg:col-span-2">
          <ConsistencyCalendar data={data} waterTarget={ctx.waterTarget} />
        </ChartCard>
      </div>
    </Section>
  );
}

// ── Scorecard ──────────────────────────────────────────────────────────────

export function ScorecardSection({ ctx }: { ctx: DashCtx }) {
  const { stats, period, dates, waterTarget } = ctx;
  return (
    <Section title="Habit scorecard" sub={`Every habit over ${PERIOD_PHRASE[period]}, most consistent first`}>
      <Card className="[--card-spacing:--spacing(2)]">
        <CardContent>
          <ul className="divide-y">
            {[...stats].sort((a, b) => b.rate - a.rate).map((s) => {
              const core = s.custom ? null : HABIT_INFO[s.key as CoreHabit];
              return (
                <li key={s.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,14rem)_1fr_4rem_8rem_7rem]">
                  <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    {core ? <HabitIcon icon={core.icon} hue={core.hue} className="size-9" /> : <CustomHabitIcon icon={s.custom!.icon} className="size-9" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{habitLabel(s)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {core ? (s.key === "water" ? `${waterTarget}+ glasses` : core.target) : `${s.custom!.target} ${s.custom!.unit} a day`}
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums md:order-3">{pct(s.rate)}</p>
                  <div className="col-span-3 md:order-2 md:col-span-1">
                    <HabitBar value={s.rate * 100} max={100} hue={core ? core.hue : "custom"} />
                    <p className="mt-1.5 text-xs text-muted-foreground md:hidden">
                      {s.done} of {dates.length} days
                      {s.streak > 0 && ` · ${s.streak}-day streak`}
                    </p>
                  </div>
                  <p className="hidden text-xs text-muted-foreground md:order-4 md:block">
                    {s.done} of {dates.length} days
                    {s.streak > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-foreground">
                        <Flame className="size-3.5 text-primary-ink" aria-hidden="true" />
                        {s.streak}-day streak
                      </span>
                    )}
                  </p>
                  <div className="hidden text-right md:order-5 md:block">
                    {s.prevRate != null
                      ? <Delta value={(s.rate - s.prevRate) * 100} suffix=" pts" />
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </Section>
  );
}

// ── Nutrition ──────────────────────────────────────────────────────────────

export function NutritionSection({ ctx, plan }: { ctx: DashCtx; plan?: ReactNode }) {
  const { data, profile, period, dates, m } = ctx;
  const goal = profile?.calorie_goal ?? 2000;
  const logged = valuesIn(data.food, dates, (e) => e.value > 0);
  const avg = avgOf(logged);
  const onTarget = logged.filter((v) => Math.abs(v - goal) <= goal * 0.1).length;
  const meals = mealAverages(data.food, dates);
  const mealTotal = meals ? meals.breakfast + meals.lunch + meals.dinner + meals.snacks : 0;
  const series = buildSeries(dates, period, (d) => { const v = val(m.food, d); return v && v > 0 ? v : null; });

  return (
    <Section title="Nutrition" sub="Calories from the meals you've logged">
      {plan}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Calories"
          sub={byMonth(period) ? "Monthly average on days logged" : "Per day, against your daily target"}
          className="lg:col-span-2"
        >
          {logged.length ? (
            <>
              <BarTrend data={series} color={C.food} name="Calories" format={(v) => `${kcal(v)} kcal`} target={goal} targetLabel={`Daily target: ${kcal(goal)} kcal`} width={44} />
              <StatRow>
                <Stat label="Daily average" value={avg != null ? kcal(avg) : "—"} unit="kcal"
                  sub={avg != null && <Delta value={avg - goal} suffix=" vs target" tolerance={goal * 0.05} goodWhen={profile?.weekly_rate_kg && profile.weekly_rate_kg > 0 ? "up" : "down"} />} />
                <Stat label="Days on target" value={`${onTarget}/${logged.length}`} sub="within 10%" />
                <Stat label="Highest day" value={kcal(Math.max(...logged))} unit="kcal" />
                <Stat label="Lowest day" value={kcal(Math.min(...logged))} unit="kcal" />
              </StatRow>
            </>
          ) : (
            <EmptyState icon={Utensils} title="No meals logged" body={`Meals you log in ${PERIOD_PHRASE[ctx.period]} will chart here against your target.`} />
          )}
        </ChartCard>

        <ChartCard title="Where calories come from" sub="Average per meal on days logged">
          {meals && mealTotal > 0 ? (
            <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
              <ProgressRing
                size={132}
                stroke={14}
                segments={MEALS.map((ml) => ({ value: meals[ml.key] / mealTotal, color: ml.color }))}
                label={`About ${kcal(mealTotal)} kcal a day across meals`}
              >
                <div>
                  <p className="text-xl font-semibold tabular-nums">{kcal(mealTotal)}</p>
                  <p className="text-xs text-muted-foreground">kcal / day</p>
                </div>
              </ProgressRing>
              <ul className="w-full flex-1 space-y-3 text-sm">
                {MEALS.map((ml) => (
                  <li key={ml.key} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: ml.color }} aria-hidden="true" />
                    <span className="text-muted-foreground">{ml.label}</span>
                    <span className="ml-auto font-medium tabular-nums">{kcal(meals[ml.key])}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(meals[ml.key] / mealTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={Utensils} title="No meal breakdown yet" body="Log food by meal to see how your day splits." />
          )}
        </ChartCard>
      </div>
    </Section>
  );
}

// ── Activity and water ─────────────────────────────────────────────────────

export function MovementSection({ ctx }: { ctx: DashCtx }) {
  const { data, period, dates, m, waterTarget } = ctx;
  const weeks = dates.length / 7;

  const exAll = valuesIn(data.exercise, dates);
  const exTotal = exAll.reduce((s, v) => s + v, 0);
  const activeDays = exAll.filter((v) => v >= EXERCISE_TARGET_MIN).length;
  const exSeries = buildSeries(dates, period, (d) => val(m.exercise, d));

  const water = valuesIn(data.water, dates, (e) => e.value > 0);
  const waterAvg = avgOf(water);
  const waterHit = water.filter((v) => v >= waterTarget).length;
  const waterTotal = water.reduce((s, v) => s + v, 0);
  const waterSeries = buildSeries(dates, period, (d) => val(m.water, d));

  return (
    <Section title="Activity and hydration" sub="Minutes moved and glasses of water">
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Exercise" sub={byMonth(period) ? "Monthly average minutes on days logged" : "Minutes per day"}>
          {exAll.length ? (
            <>
              <BarTrend data={exSeries} color={C.exercise} name="Exercise" format={(v) => `${Math.round(v)} min`} target={EXERCISE_TARGET_MIN} targetLabel={`Target: ${EXERCISE_TARGET_MIN} min`} />
              <StatRow narrow>
                <Stat label="Total" value={kcal(exTotal)} unit="min" />
                <Stat label="Active days" value={`${activeDays}/${dates.length}`} sub={`${EXERCISE_TARGET_MIN}+ minutes`} />
                <Stat label="Per week" value={kcal(exTotal / weeks)} unit="min" sub="guideline 150" />
                <Stat label="Longest session" value={kcal(Math.max(...exAll))} unit="min" />
              </StatRow>
            </>
          ) : (
            <EmptyState icon={Dumbbell} title="No activity logged" body="Minutes you log on the Habits page will chart here." />
          )}
        </ChartCard>

        <ChartCard title="Water" sub={byMonth(period) ? "Monthly average glasses on days logged" : "Glasses per day"}>
          {water.length ? (
            <>
              <BarTrend data={waterSeries} color={C.water} name="Water" format={(v) => `${one(v)} glasses`} target={waterTarget} targetLabel={`Target: ${waterTarget} glasses`} width={28} />
              <StatRow narrow>
                <Stat label="Daily average" value={waterAvg != null ? one(waterAvg) : "—"} unit="glasses" />
                <Stat label="Days on target" value={`${waterHit}/${dates.length}`} sub={`${waterTarget}+ glasses`} />
                <Stat label="Total" value={kcal(waterTotal)} unit="glasses" sub={`about ${one(waterTotal * 0.25)} litres`} />
                <Stat label="Streak" value={plural(ctx.stats.find((s) => s.key === "water")?.streak ?? 0, "day")} sub="on target" />
              </StatRow>
            </>
          ) : (
            <EmptyState icon={GlassWater} title="No water logged" body="Glasses you log on the Habits page will chart here." />
          )}
        </ChartCard>
      </div>
    </Section>
  );
}

// ── Sleep ──────────────────────────────────────────────────────────────────

export function SleepSection({ ctx }: { ctx: DashCtx }) {
  const { data, profile, period, dates, m } = ctx;
  const rest = valuesIn(data.sleep, dates, (e) => e.value > 0);
  const restAvg = avgOf(rest);
  const notes = dates
    .map((d) => ({ date: d, rest: val(m.sleep, d), note: parseJSON<SleepNote>(m.sleep.get(d)?.note) ?? {} }))
    .filter((n) => m.sleep.has(n.date));
  const hours = notes.map((n) => sleepHours(n.note.bedtime, n.note.wake)).filter((h): h is number => h != null);
  const hoursAvg = avgOf(hours);
  const bed = averageClock(notes.map((n) => n.note.bedtime ?? "").filter(Boolean), true);
  const wake = averageClock(notes.map((n) => n.note.wake ?? "").filter(Boolean), false);
  const series = buildSeries(dates, period, (d) => { const v = val(m.sleep, d); return v && v > 0 ? v : null; });

  const factors = SLEEP_FACTORS.map((f) => {
    const withF = notes.filter((n) => n.note.factors?.includes(f.id) && n.rest);
    const without = notes.filter((n) => !n.note.factors?.includes(f.id) && n.rest);
    return {
      ...f,
      nights: notes.filter((n) => n.note.factors?.includes(f.id)).length,
      restWith: avgOf(withF.map((n) => n.rest!)),
      withN: withF.length,
      restWithout: without.length >= 2 ? avgOf(without.map((n) => n.rest!)) : null,
    };
  }).filter((f) => f.nights > 0).sort((a, b) => b.nights - a.nights);

  return (
    <Section title="Sleep" sub="How rested you felt, and what got in the way">
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="How rested you felt" sub={byMonth(period) ? "Monthly average, 1 to 5" : "Each morning, 1 (exhausted) to 5 (fully rested)"} className="lg:col-span-2">
          {rest.length ? (
            <>
              <ScoreLine data={series} color={C.sleep} name="Rest" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} format={(v) => `${one(v)} · ${restLabel(v)}`} />
              <StatRow>
                <Stat label="Average rest" value={restAvg != null ? restLabel(restAvg) : "—"} sub={restAvg != null && `${one(restAvg)} / 5`} />
                <Stat label="Time asleep" value={hoursAvg != null ? one(hoursAvg) : "—"} unit={hoursAvg != null ? "h" : undefined}
                  sub={hoursAvg != null ? `goal ${profile?.sleep_goal ?? 8}h` : "Add bed and wake times"} />
                <Stat label="Usual bedtime" value={bed ?? "—"} />
                <Stat label="Usual wake time" value={wake ?? "—"} />
              </StatRow>
            </>
          ) : (
            <EmptyState icon={Moon} title="No sleep logged" body="Rate how rested you feel each morning to see the trend." />
          )}
        </ChartCard>

        <ChartCard title="What affected your sleep" sub="Factors you tagged, and your rest on those nights">
          {factors.length ? (
            <ul className="space-y-3">
              {factors.map((f) => {
                const worse = f.withN >= 2 && f.restWith != null && f.restWithout != null && f.restWith < f.restWithout - 0.25;
                return (
                  <li key={f.id} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">
                      <f.icon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {plural(f.nights, "night")}
                        {f.restWith != null && ` · rest ${one(f.restWith)}`}
                        {f.restWithout != null && ` vs ${one(f.restWithout)} without`}
                      </p>
                    </div>
                    {worse && <span className="text-xs font-medium text-destructive">Lower rest</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={BedDouble} title="No factors tagged" body="Tag things like caffeine or late screens on the Sleep card to see their effect." />
          )}
        </ChartCard>
      </div>
    </Section>
  );
}

// ── Mood and medications ───────────────────────────────────────────────────

export function MoodMedsSection({ ctx }: { ctx: DashCtx }) {
  const { data, period, dates, m } = ctx;
  const moods = valuesIn(data.mood, dates, (e) => e.value > 0);
  const moodAvg = avgOf(moods);
  const counts = MOODS.map((md) => ({ ...md, n: moods.filter((v) => v === md.value).length }));
  const maxCount = Math.max(1, ...counts.map((c) => c.n));
  const series = buildSeries(dates, period, (d) => { const v = val(m.mood, d); return v && v > 0 ? v : null; });

  const medDays = dates.filter((d) => m.medication.has(d));
  const allTaken = medDays.filter((d) => val(m.medication, d) === 1).length;
  const partly = medDays.length - allTaken;
  const medStat = ctx.stats.find((s) => s.key === "medication");

  return (
    <Section title="Mood and medications" sub="Daily check-ins and how often everything got taken">
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Mood" sub={byMonth(period) ? "Monthly average, 1 to 5" : "Each check-in, 1 (rough) to 5 (great)"} className="lg:col-span-2">
          {moods.length ? (
            <div className="grid gap-6 md:grid-cols-[1fr_14rem]">
              <div className="min-w-0">
                <ScoreLine data={series} color={C.mood} name="Mood" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} format={(v) => `${one(v)} · ${moodLabel(v)}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{moodAvg != null ? moodLabel(moodAvg) : "—"}</p>
                <p className="text-xs text-muted-foreground">{moodAvg != null && `${one(moodAvg)} / 5 over ${plural(moods.length, "check-in")}`}</p>
                <ul className="mt-5 space-y-2">
                  {[...counts].reverse().map((c) => (
                    <li key={c.value} className="flex items-center gap-2 text-xs">
                      <c.icon className="size-4 shrink-0" style={{ color: "var(--mood-strong)" }} aria-hidden="true" />
                      <span className="w-10 text-muted-foreground">{c.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <span className="block h-full rounded-full bg-mood-strong" style={{ width: `${(c.n / maxCount) * 100}%` }} />
                      </span>
                      <span className="w-5 text-right tabular-nums">{c.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState icon={SmilePlus} title="No check-ins" body="One tap on the Mood card each day builds this picture." />
          )}
        </ChartCard>

        <ChartCard title="Medications" sub="Days everything scheduled was taken">
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <ProgressRing value={dates.length ? allTaken / dates.length : 0} size={132} stroke={12} label={`${allTaken} of ${dates.length} days all taken`}>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{allTaken}/{dates.length}</p>
                <p className="text-xs text-muted-foreground">days</p>
              </div>
            </ProgressRing>
            <div className="grid w-full grid-cols-2 gap-4 border-t pt-5 text-left">
              <Stat label="Partly taken" value={partly} sub={partly === 1 ? "day" : "days"} />
              <Stat label="Streak" value={plural(medStat?.streak ?? 0, "day")} sub="all taken" />
            </div>
          </div>
        </ChartCard>
      </div>
    </Section>
  );
}

// ── Custom habits ──────────────────────────────────────────────────────────

export function CustomHabitsSection({ ctx }: { ctx: DashCtx }) {
  const { data, period, dates } = ctx;
  if (!data.custom.length) return null;
  return (
    <Section title="Your custom habits" sub="Against the daily targets you set">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {data.custom.map((habit) => {
          const map = byDate(habit.entries);
          const vals = valuesIn(habit.entries, dates, (e) => e.value > 0);
          const hit = dates.filter((d) => (map.get(d)?.value ?? 0) >= habit.target).length;
          const stat = ctx.stats.find((s) => s.key === habit.id);
          return (
            <ChartCard
              key={habit.id}
              title={<span className="flex items-center gap-3"><CustomHabitIcon icon={habit.icon} className="size-8" /><span className="truncate">{habit.name}</span></span>}
              action={<span className="text-sm font-semibold tabular-nums">{pct(dates.length ? hit / dates.length : 0)}</span>}
            >
              <BarTrend
                data={buildSeries(dates, period, (d) => map.get(d)?.value ?? null)}
                color={C.teal}
                name={habit.name}
                format={(v) => `${one(v)} ${habit.unit}`}
                target={habit.target}
                targetLabel={`Target: ${one(habit.target)} ${habit.unit}`}
                height={140}
                width={32}
              />
              <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                <Stat label="Average" value={vals.length ? one(avgOf(vals)!) : "—"} sub={habit.unit} />
                <Stat label="On target" value={`${hit}/${dates.length}`} sub="days" />
                <Stat label="Streak" value={stat?.streak ?? 0} sub={(stat?.streak ?? 0) === 1 ? "day" : "days"} />
              </div>
            </ChartCard>
          );
        })}
      </div>
    </Section>
  );
}

// ── Patterns ───────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export interface Pattern { id: string; icon: typeof Lightbulb; text: string }

/**
 * Plain-language connections between habits, only where the data backs them.
 * Shared with the weekly report, which leaves out the ones about today
 * (`relative: false`) because a report describes a finished week.
 */
export function patternItems(ctx: DashCtx, { relative = true } = {}): Pattern[] {
  const { data, profile, period, dates, ov, prevOv, m, waterTarget } = ctx;
  const items: Pattern[] = [];

  if (relative && prevOv) {
    const diff = Math.round((ov.rate - prevOv.rate) * 100);
    if (Math.abs(diff) >= 5) {
      items.push({
        id: "consistency",
        icon: TrendingUp,
        text: diff > 0
          ? `Your consistency is up ${diff} points on ${PREV_PHRASE[period]}. Whatever you changed is working.`
          : `Your consistency is down ${-diff} points on ${PREV_PHRASE[period]}. Pick one habit to focus on this week.`,
      });
    }
  }

  const moodOf = (d: string) => { const v = val(m.mood, d); return v && v > 0 ? v : null; };

  const exMood = split(dates, (d) => (val(m.exercise, d) ?? 0) >= EXERCISE_TARGET_MIN, moodOf);
  if (exMood && exMood.withAvg - exMood.withoutAvg >= 0.3) {
    items.push({ id: "exercise-mood", icon: Dumbbell, text: `On days you exercised ${EXERCISE_TARGET_MIN}+ minutes, your mood averaged ${one(exMood.withAvg)} vs ${one(exMood.withoutAvg)} on other days.` });
  }

  const sleepMood = split(dates, (d) => { const r = val(m.sleep, d); return r && r > 0 ? r >= 4 : null; }, moodOf);
  if (sleepMood && sleepMood.withAvg - sleepMood.withoutAvg >= 0.3) {
    items.push({ id: "sleep-mood", icon: Moon, text: `After nights you woke up rested, your mood averaged ${one(sleepMood.withAvg)} vs ${one(sleepMood.withoutAvg)} otherwise.` });
  }

  const waterMood = split(dates, (d) => (val(m.water, d) ?? 0) >= waterTarget, moodOf);
  if (waterMood && waterMood.withAvg - waterMood.withoutAvg >= 0.3) {
    items.push({ id: "water-mood", icon: GlassWater, text: `Days you hit your water target came with a better mood: ${one(waterMood.withAvg)} vs ${one(waterMood.withoutAvg)}.` });
  }

  // Worst sleep factor, when it clearly lowers rest.
  let worst: { label: string; gap: number; with: number; without: number } | null = null;
  for (const f of SLEEP_FACTORS) {
    const s = split(
      dates,
      (d) => (m.sleep.has(d) ? (parseJSON<SleepNote>(m.sleep.get(d)?.note)?.factors ?? []).includes(f.id) : null),
      (d) => { const r = val(m.sleep, d); return r && r > 0 ? r : null; },
    );
    if (s && s.withoutAvg - s.withAvg >= 0.5 && (!worst || s.withoutAvg - s.withAvg > worst.gap)) {
      worst = { label: f.label.toLowerCase(), gap: s.withoutAvg - s.withAvg, with: s.withAvg, without: s.withoutAvg };
    }
  }
  if (worst) {
    items.push({ id: "sleep-factor", icon: BedDouble, text: `Nights with ${worst.label} averaged a rest score of ${one(worst.with)}, against ${one(worst.without)} without.` });
  }

  // Best and worst weekday, once there are a few of each.
  if (dates.length >= 28) {
    const byDay = Array.from({ length: 7 }, () => [] as number[]);
    for (const d of ov.perDay) if (d.total) byDay[new Date(d.date + "T00:00:00").getDay()].push(d.done / d.total);
    const avgs = byDay.map((v) => avgOf(v) ?? 0);
    const hi = avgs.indexOf(Math.max(...avgs));
    const lo = avgs.indexOf(Math.min(...avgs));
    if (avgs[hi] - avgs[lo] >= 0.15) {
      items.push({ id: "weekday", icon: CalendarDays, text: `You're most consistent on ${WEEKDAYS[hi]} (${pct(avgs[hi])}) and least on ${WEEKDAYS[lo]} (${pct(avgs[lo])}).` });
    }
  }

  const cal = avgOf(valuesIn(data.food, dates, (e) => e.value > 0));
  const goal = profile?.calorie_goal;
  if (cal != null && goal && Math.abs(cal - goal) > goal * 0.1) {
    items.push({
      id: "calories",
      icon: Utensils,
      text: `You averaged ${kcal(cal)} kcal on days you logged food, about ${kcal(Math.abs(cal - goal))} ${cal > goal ? "above" : "below"} your ${kcal(goal)} target.`,
    });
  }

  if (relative) {
    const streak = currentStreak((d) => loggedOn(data, d));
    if (streak >= 3) items.push({ id: "streak", icon: Flame, text: `You've checked in ${streak} days in a row. Keep it going.` });
  }
  return items;
}

export function PatternsSection({ ctx }: { ctx: DashCtx }) {
  const items = patternItems(ctx);
  return (
    <Section title="What we noticed" sub="Connections in your own data. These are patterns, not medical advice.">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardContent>
          {items.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((it) => <InsightRow key={it.id} icon={it.icon} text={it.text} />)}
            </ul>
          ) : (
            <EmptyState icon={Lightbulb} title="Nothing to point out yet" body="Keep logging. Patterns show up after a week or two of check-ins." />
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
