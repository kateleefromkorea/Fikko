import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, FileText, MessageCircle, Target, Watch } from "lucide-react";
import type { BiometricData, HabitData } from "@/types";
import type { ProfileRow } from "@/hooks/useProfile";
import { usePlan } from "@/hooks/usePlan";
import { withDeviceActivity, type CoreHabit } from "@/lib/completion";
import {
  PERIOD_DAYS, avgOf, buildSeries, byDate, currentStreak, longestStreak, loggedOn, parseJSON, sleepHours, valuesIn,
  type HabitStat, type Period,
} from "@/lib/dashboardStats";
import { cn } from "@/lib/utils";
import ProgressRing from "@/components/ProgressRing";
import FikkoAvatar from "@/components/FikkoAvatar";
import { CustomHabitIcon, HabitIcon } from "@/components/HabitCard";
import type { SleepNote } from "@/components/HabitsView";
import { BaselinePlan } from "@/components/Dashboard";
import { C, Delta } from "@/components/dashboard/ui";
import useDashCtx from "@/components/dashboard/useDashCtx";
import { headline } from "@/components/dashboard/DashboardSummary";
import { comparisonLine } from "@/components/dashboard/headline";
import { ReportDialog } from "@/components/dashboard/WeeklyReport";
import { buildWeeklyReport, nextReportDate, weekLabel, weeksWithHistory } from "@/components/dashboard/reportData";
import WearableSections, { hasWearableData } from "@/components/dashboard/WearableSections";
import {
  CalendarCard, CaloriesCard, CompletionCard, CustomHabitCard, ExerciseCard, LEVELS, MealSplitCard, MedsCard, MoodCard,
  SleepFactorsCard, SleepRestCard, WaterCard, completionSeries, level, patternItems, type Pattern,
} from "@/components/dashboard/DashboardSections";
import {
  HABIT_INFO, PREV_PHRASE, habitLabel, kcal, moodLabel, one, pct, plural, restLabel, val, type DashCtx,
} from "@/components/dashboard/context";
import ScreenTitle, { Segmented } from "@/phone/ScreenTitle";
import Sheet from "@/phone/Sheet";

/** The white, softly lifted surface the phone screens use for cards. */
const SURFACE = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** Each built-in habit's chart colour, for its sparkline. */
const SPARK: Record<CoreHabit, string> = {
  food: C.food, exercise: C.exercise, water: C.water, sleep: C.sleep, mood: C.mood, medication: C.meds,
};

type Detail = { kind: "habit"; stat: HabitStat } | { kind: "consistency" } | { kind: "wearable" };

/**
 * The Progress tab: glance, then drill in. A compact summary, what Fikko
 * noticed, the period's consistency and one row per habit, each opening a
 * sheet with that habit's full charts. The same figures and charts as the
 * desktop Dashboard, one tap deeper.
 */
export default function ProgressScreen({ data: logged, biometrics, profile, onAskCoach, onOpenDevices }: {
  data: HabitData;
  biometrics: BiometricData;
  profile?: ProfileRow;
  onAskCoach?: (question: string) => void;
  /** Goes to where a wearable is connected. */
  onOpenDevices?: () => void;
}) {
  // Activity here is the day's total: logged workouts plus wearable minutes.
  const data = useMemo(() => withDeviceActivity(logged), [logged]);
  const [period, setPeriod] = useState<Period>("week");
  const { limits } = usePlan();
  const ctx = useDashCtx(data, profile, period);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const hasWearable = hasWearableData(biometrics);
  const history = useMemo(() => weeksWithHistory(data), [data]);

  const options = PERIODS.map((p) => {
    const locked = limits.historyDays != null && PERIOD_DAYS[p.id] > limits.historyDays;
    return { ...p, disabled: locked, note: locked ? `Your plan shows the last ${limits.historyDays} days.` : undefined };
  });

  return (
    <div className="screen-in">
      <ScreenTitle>Progress</ScreenTitle>
      {/* Stays pinned under the top bar, so the period is always in view. */}
      <div className="sticky top-(--mobile-header-h) z-30 -mx-4 bg-[#F6F7F8]/90 px-4 py-2 backdrop-blur">
        <Segmented value={period} options={options} onChange={setPeriod} label="Period" className="mb-0" />
      </div>

      <div className="space-y-6 pt-2">
        <Summary ctx={ctx} />
        <Patterns ctx={ctx} onAskCoach={onAskCoach} />
        <Consistency ctx={ctx} onOpen={() => setDetail({ kind: "consistency" })} />

        <section aria-labelledby="habits-title">
          <h2 id="habits-title" className="mb-3 px-1 text-xl font-semibold tracking-tight">Your habits</h2>
          <ul className={cn(SURFACE, "divide-y divide-border/70 overflow-hidden")}>
            {[...ctx.stats].map((s) => (
              <HabitRow key={s.key} ctx={ctx} stat={s} onOpen={() => setDetail({ kind: "habit", stat: s })} />
            ))}
          </ul>
        </section>

        <ul className={cn(SURFACE, "divide-y divide-border/70 overflow-hidden")}>
          <LinkRow
            icon={FileText}
            title="Weekly report"
            sub={history === 0 ? `Your first one arrives ${longDate(nextReportDate())}` : <ReportSub data={data} biometrics={biometrics} profile={profile} />}
            onClick={history === 0 ? undefined : () => setReportOpen(true)}
          />
          {hasWearable ? (
            <LinkRow icon={Watch} title="Wearable data" sub="Vitals, steps, sleep stages and recovery" onClick={() => setDetail({ kind: "wearable" })} />
          ) : (
            <LinkRow icon={Watch} title="Connect a wearable" sub="Fitbit and Pixel Watch now. Apple Health and Garmin next." onClick={onOpenDevices} />
          )}
        </ul>

        <p className="px-1 text-xs text-muted-foreground">Patterns come from your own data. They aren&apos;t medical advice.</p>
      </div>

      <Sheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? sheetTitle(detail) : ""}
      >
        {detail && <DetailBody detail={detail} ctx={ctx} biometrics={biometrics} bio={limits.wearableBiometrics} />}
      </Sheet>
      {history > 0 && (
        <ReportDialog open={reportOpen} onOpenChange={setReportOpen} data={data} biometrics={biometrics} profile={profile} history={history} />
      )}
    </div>
  );
}

const longDate = (key: string) =>
  new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

function rangeLabel({ period, dates }: DashCtx) {
  if (period === "year") return "Last 12 months";
  return weekLabel({ from: dates[0], to: dates[dates.length - 1] });
}

// ── Summary ────────────────────────────────────────────────────────────────

/** How the period went: one ring, one headline, the change, and three figures. */
function Summary({ ctx }: { ctx: DashCtx }) {
  const { data, period, ov, prevOv } = ctx;
  const logTest = (d: string) => loggedOn(data, d);
  const streak = currentStreak(logTest);
  const best = longestStreak(logTest);
  const comparison = comparisonLine(ctx);

  const figures = [
    { label: "Days logged", value: `${ov.logged}/${ov.days}` },
    { label: "Perfect days", value: ov.perfect.toLocaleString() },
    { label: "Streak", value: plural(streak, "day"), sub: best > streak ? `best ${best}` : undefined },
  ];

  return (
    // The locked daily-overview colours, as on the desktop Dashboard's hero.
    <section aria-labelledby="summary-title" className="daily-overview rounded-2xl border border-teal/20 p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <ProgressRing value={ov.rate} size={84} stroke={8} label={`${pct(ov.rate)} of habits completed`}>
          <p className="text-xl font-semibold tracking-tight tabular-nums">{pct(ov.rate)}</p>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-primary-ink">{rangeLabel(ctx)}</p>
          <h2 id="summary-title" className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">
            {headline(ov.rate, ov.logged, period)}
          </h2>
          {prevOv ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-foreground/60">
              <Delta value={(ov.rate - prevOv.rate) * 100} suffix=" pts" className="text-[13px] font-medium" />
              <span>vs {PREV_PHRASE[period]}</span>
            </p>
          ) : comparison && (
            <p className="mt-1 text-[13px] text-foreground/60">{comparison}</p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.label} className="rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-foreground/5">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="text-[17px] font-semibold tabular-nums">
              {f.value}
              {f.sub && <span className="block text-[11px] font-normal text-muted-foreground">{f.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Fikko noticed ──────────────────────────────────────────────────────────

/** How strongly a pattern stands out: the gap between its two averages, as a share of the scale. */
const strength = (p: Pattern) => (p.compare ? Math.abs(p.compare.with - p.compare.without) / p.compare.max : 0);

/** The patterns in the member's data, strongest first, one card at a time to swipe through. */
function Patterns({ ctx, onAskCoach }: { ctx: DashCtx; onAskCoach?: (question: string) => void }) {
  const items = patternItems(ctx)
    .filter((p) => p.id !== "streak")
    .sort((a, b) => strength(b) - strength(a));
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  const onScroll = () => {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    setAt(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
  };

  return (
    <section aria-labelledby="patterns-title">
      <div className="mb-3 flex items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#DDF5F1]" aria-hidden="true">
          <FikkoAvatar plain className="size-5" />
        </span>
        <h2 id="patterns-title" className="text-xl font-semibold tracking-tight">Fikko noticed</h2>
        {items.length > 1 && (
          <span className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">{Math.min(at, items.length - 1) + 1} of {items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className={cn(SURFACE, "p-4")}>
          <p className="font-semibold">Nothing to point out yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Keep logging. Patterns show up after a week or two of check-ins.</p>
        </div>
      ) : (
        <>
          <div
            ref={track}
            onScroll={onScroll}
            className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((p, i) => (
              <PatternCard key={p.id} pattern={p} strongest={i === 0 && p.compare != null} onAskCoach={onAskCoach} single={items.length === 1} />
            ))}
          </div>
          {items.length > 1 && (
            <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">
              {items.map((p, i) => (
                <span key={p.id} className={cn("h-1.5 rounded-full transition-all", i === at ? "w-4 bg-primary" : "w-1.5 bg-foreground/15")} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PatternCard({ pattern: p, strongest, onAskCoach, single }: {
  pattern: Pattern; strongest: boolean; onAskCoach?: (question: string) => void; single: boolean;
}) {
  const c = p.compare;
  return (
    <article
      className={cn(
        "flex shrink-0 snap-start flex-col rounded-2xl border border-[#1A9C8C]/20 bg-[#F4FBFA] p-4",
        single ? "w-full" : "w-[calc(100%-1.75rem)]",
      )}
    >
      {strongest && (
        <span className="mb-2 self-start rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-[#0A6E63] ring-1 ring-[#1A9C8C]/25">
          Your strongest pattern
        </span>
      )}
      {c ? (
        <>
          <h3 className="text-lg leading-snug font-semibold">{p.headline}</h3>
          <div className="mt-3 space-y-2" role="img" aria-label={`${c.measure}: ${one(c.with)} ${c.withPhrase}, ${one(c.without)} ${c.withoutPhrase}, out of ${c.max}`}>
            {[
              { label: c.withLabel, value: c.with, strong: true },
              { label: c.withoutLabel, value: c.without, strong: false },
            ].map((b) => (
              <div key={b.label}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-muted-foreground">{b.label}</span>
                  <span className="font-semibold tabular-nums">{one(b.value)}<span className="font-normal text-muted-foreground"> / {c.max}</span></span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#1A9C8C]/10">
                  <div className={cn("h-full rounded-full", b.strong ? "bg-[#1A9C8C]" : "bg-[#9FD9CF]")} style={{ width: `${(b.value / c.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{c.measure} on a 1 to 5 scale, from {plural(c.days, "day")}.</p>
          {p.tryText && (
            <p className="mt-3 flex items-start gap-2 text-sm font-medium text-[#0A6E63]">
              <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>Try {p.tryText}</span>
            </p>
          )}
        </>
      ) : (
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#DDF5F1] text-[#0A6E63]" aria-hidden="true">
            <p.icon className="size-4" />
          </span>
          <p className="text-[15px] leading-snug">{p.text}</p>
        </div>
      )}
      {onAskCoach && (
        <button
          onClick={() => onAskCoach(`${p.text} What could I try to make the most of this?`)}
          className="press mt-auto flex h-11 items-center gap-2 self-start pt-3 text-[15px] font-semibold text-primary-ink"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Ask Fikko about this
        </button>
      )}
    </article>
  );
}

// ── Consistency ────────────────────────────────────────────────────────────

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The period's days at a glance, shaded by how much got done: a row of days
 * for a week, a grid for a month, a bar per month for a year. Opens the full
 * chart and calendar.
 */
function Consistency({ ctx, onOpen }: { ctx: DashCtx; onOpen: () => void }) {
  const { period, ov } = ctx;
  const today = ov.perDay[ov.perDay.length - 1]?.date;

  return (
    <section aria-labelledby="consistency-title">
      <button onClick={onOpen} className={cn(SURFACE, "press block w-full p-4 text-left")} aria-describedby="consistency-sub">
        <div className="flex items-center gap-2">
          <h2 id="consistency-title" className="text-[17px] font-semibold">Consistency</h2>
          <span className="ml-auto flex items-center text-sm font-medium text-primary-ink">
            Calendar
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </div>

        {period === "week" && (
          <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
            {ov.perDay.map((d) => {
              const lv = LEVELS[level(d.done, d.total)];
              const isToday = d.date === today;
              return (
                <li key={d.date} className="flex flex-col items-center gap-1">
                  <span className={cn("text-[11px] font-medium", isToday ? "text-primary-ink" : "text-muted-foreground")}>
                    {WEEKDAY_LETTERS[new Date(d.date + "T12:00:00").getDay()]}
                  </span>
                  <span
                    className={cn(
                      "grid aspect-square w-full place-items-center rounded-lg text-[13px] font-semibold tabular-nums",
                      lv.cls,
                      // Today is still going, so it's outlined rather than judged.
                      isToday && d.done < d.total && "bg-transparent text-foreground outline-2 outline-offset-[-2px] outline-dashed outline-primary/50",
                    )}
                  >
                    {Number(d.date.slice(8))}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {period === "month" && (
          <div className="mt-3 grid grid-cols-10 gap-1" aria-hidden="true">
            {ov.perDay.map((d) => (
              <span key={d.date} className={cn("aspect-square rounded-[5px]", LEVELS[level(d.done, d.total)].cls)} />
            ))}
          </div>
        )}

        {period === "year" && (
          <div className="mt-3 flex h-20 items-end gap-1" aria-hidden="true">
            {/* Twelve months back can start and end in the same month, so keys are positions. */}
            {completionSeries(ctx).map((p, i) => (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="w-full rounded-t-[4px] bg-primary" style={{ height: `${Math.max(3, p.value * 0.8)}%`, opacity: p.value ? 1 : 0.15 }} />
                <span className="text-[10px] text-muted-foreground">{p.label[0]}</span>
              </div>
            ))}
          </div>
        )}

        <p id="consistency-sub" className="mt-3 text-[13px] text-muted-foreground">
          {ov.logged === 0
            ? "Nothing logged yet in this period."
            : <><span className="font-medium text-foreground">{plural(ov.perfect, "day")}</span> with every habit done{period === "week" && ", and today is still going"}.</>}
        </p>
      </button>
    </section>
  );
}

// ── Habits ─────────────────────────────────────────────────────────────────

/** The one figure that sums up a habit over the period, in words. */
function figure(ctx: DashCtx, s: HabitStat): string {
  const { data, dates, m } = ctx;
  if (s.custom) {
    const a = avgOf(valuesIn(s.custom.entries, dates, (e) => e.value > 0));
    return a != null ? `${one(a)} ${s.custom.unit} a day` : "Nothing logged";
  }
  const logged = (k: CoreHabit) => avgOf(valuesIn(data[k], dates, (e) => e.value > 0));
  switch (s.key as CoreHabit) {
    case "food": {
      const a = logged("food");
      return a != null ? `${kcal(a)} kcal a day` : "No meals logged";
    }
    case "exercise": {
      const total = valuesIn(data.exercise, dates).reduce((sum, v) => sum + v, 0);
      return total ? `${kcal(total)} min in total` : "No activity logged";
    }
    case "water": {
      const a = logged("water");
      return a != null ? `${one(a)} glasses a day` : "No water logged";
    }
    case "sleep": {
      const a = logged("sleep");
      const hours = avgOf(
        dates
          .map((d) => { const n = parseJSON<SleepNote>(m.sleep.get(d)?.note); return sleepHours(n?.bedtime, n?.wake); })
          .filter((h): h is number => h != null),
      );
      return a != null ? `${restLabel(a)}${hours != null ? ` · ${one(hours)}h a night` : ""}` : "No sleep logged";
    }
    case "mood": {
      const a = logged("mood");
      return a != null ? `${moodLabel(a)} on average` : "No check-ins";
    }
    case "medication":
      return `All taken: ${s.done}/${dates.length} days`;
  }
}

/** A habit's values across the period, for its sparkline. */
function sparkSeries(ctx: DashCtx, s: HabitStat) {
  const { dates, period, m } = ctx;
  if (s.custom) {
    const map = byDate(s.custom.entries);
    return { points: buildSeries(dates, period, (d) => map.get(d)?.value ?? null), max: undefined, color: C.teal };
  }
  const key = s.key as CoreHabit;
  const scale = key === "mood" || key === "sleep" ? 5 : key === "medication" ? 1 : undefined;
  return {
    points: buildSeries(dates, period, (d) => { const v = val(m[key], d); return v && v > 0 ? v : null; }),
    max: scale,
    color: SPARK[key],
  };
}

/** Tiny bars for each day (or month), so a habit's shape shows without a chart. */
function Sparkline({ points, max, color }: { points: { value: number }[]; max?: number; color: string }) {
  const top = max ?? Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const W = 52;
  const H = 24;
  const gap = n > 12 ? 1 : 2;
  const w = (W - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-[52px] shrink-0" aria-hidden="true">
      {points.map((p, i) => {
        const h = p.value > 0 ? Math.max(3, (Math.min(p.value, top) / top) * H) : 2;
        return (
          <rect key={i} x={i * (w + gap)} y={H - h} width={w} height={h} rx={Math.min(1.5, w / 2)}
            fill={p.value > 0 ? color : "#001F27"} fillOpacity={p.value > 0 ? 0.85 : 0.1} />
        );
      })}
    </svg>
  );
}

function HabitRow({ ctx, stat: s, onOpen }: { ctx: DashCtx; stat: HabitStat; onOpen: () => void }) {
  const core = s.custom ? null : HABIT_INFO[s.key as CoreHabit];
  const label = habitLabel(s);
  const sub = figure(ctx, s);
  const spark = sparkSeries(ctx, s);
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex min-h-16 w-full items-center gap-2.5 px-3.5 py-3 text-left active:bg-foreground/[0.03]"
        aria-label={`${label}: ${sub}, done on ${s.done} of ${ctx.dates.length} days. Open`}
      >
        {core ? <HabitIcon icon={core.icon} hue={core.hue} className="size-10" /> : <CustomHabitIcon icon={s.custom!.icon} className="size-10" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{label}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
        </span>
        <Sparkline {...spark} />
        <span className="w-10 shrink-0 text-right text-[15px] font-semibold tabular-nums">{pct(s.rate)}</span>
        <ChevronRight className="-mx-1 size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      </button>
    </li>
  );
}

// ── Rows at the end ────────────────────────────────────────────────────────

function LinkRow({ icon: Icon, title, sub, onClick }: { icon: typeof Watch; title: string; sub: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{sub}</span>
      </span>
      {onClick && <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left active:bg-foreground/[0.03]">{inner}</button>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-3.5 py-3">{inner}</div>
      )}
    </li>
  );
}

/** The last finished week's consistency, under the Weekly report row. */
function ReportSub({ data, biometrics, profile }: { data: HabitData; biometrics: BiometricData; profile?: ProfileRow }) {
  const report = useMemo(() => buildWeeklyReport(data, biometrics, profile, 0), [data, biometrics, profile]);
  return <>{report.label}{report.logged > 0 && ` · ${pct(report.rate)}`}</>;
}

// ── Detail sheets ──────────────────────────────────────────────────────────

function sheetTitle(detail: Detail) {
  if (detail.kind === "consistency") return "Consistency";
  if (detail.kind === "wearable") return "Wearable data";
  return habitLabel(detail.stat);
}

function DetailBody({ detail, ctx, biometrics, bio }: { detail: Detail; ctx: DashCtx; biometrics: BiometricData; bio: boolean }) {
  if (detail.kind === "consistency") {
    return (
      <div className="space-y-4 pb-2">
        <CompletionCard ctx={ctx} />
        <CalendarCard ctx={ctx} />
      </div>
    );
  }
  if (detail.kind === "wearable") {
    return (
      <div className="space-y-10 pb-2">
        <WearableSections data={ctx.data} biometrics={biometrics} period={ctx.period} bio={bio} />
      </div>
    );
  }

  // Look the stat up again so the sheet follows a period change.
  const s = ctx.stats.find((x) => x.key === detail.stat.key) ?? detail.stat;
  const { profile } = ctx;
  let cards: ReactNode;
  if (s.custom) cards = <CustomHabitCard ctx={ctx} habit={s.custom} />;
  else switch (s.key as CoreHabit) {
    case "food":
      cards = <>
        <CaloriesCard ctx={ctx} />
        <MealSplitCard ctx={ctx} />
        {profile?.bmr != null && profile.tdee != null && <BaselinePlan profile={profile} />}
      </>;
      break;
    case "exercise": cards = <ExerciseCard ctx={ctx} />; break;
    case "water": cards = <WaterCard ctx={ctx} />; break;
    case "sleep": cards = <><SleepRestCard ctx={ctx} /><SleepFactorsCard ctx={ctx} /></>; break;
    case "mood": cards = <MoodCard ctx={ctx} />; break;
    case "medication": cards = <MedsCard ctx={ctx} />; break;
  }

  const change = s.prevRate != null ? Math.round((s.rate - s.prevRate) * 100) : null;
  const figures = [
    { label: "Done", value: `${s.done}/${ctx.dates.length}`, sub: "days" },
    { label: "Streak", value: s.streak.toLocaleString(), sub: s.streak === 1 ? "day" : "days" },
    {
      label: "Change",
      value: change == null ? "—" : (
        <span className={cn(change > 0 && "text-primary-ink", change < 0 && "text-destructive")}>
          {change > 0 ? "+" : change < 0 ? "−" : ""}{Math.abs(change)}
        </span>
      ),
      sub: s.prevRate != null ? `pts, was ${pct(s.prevRate)}` : "nothing before",
    },
  ];

  return (
    <div className="space-y-4 pb-2">
      <p className="-mt-2 text-sm text-muted-foreground">{figure(ctx, s)} · {rangeLabel(ctx)}</p>
      <dl className="grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.label} className="rounded-xl bg-muted/60 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="text-[17px] font-semibold tabular-nums">{f.value}</dd>
            <dd className="text-[11px] text-muted-foreground">{f.sub}</dd>
          </div>
        ))}
      </dl>
      {cards}
    </div>
  );
}
