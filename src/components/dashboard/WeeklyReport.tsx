import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileText, Lightbulb, Target, X } from "lucide-react";
import type { BiometricData, HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import { CustomHabitIcon, HabitBar, HabitIcon } from "../HabitCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Delta, InsightRow } from "./ui";
import { HABIT_INFO, pct } from "./context";
import { buildReport, nextReportDate, periodsWithHistory, REPORT_NAME, REPORT_NEXT, type PeriodReport, type ReportPeriod } from "./reportData";

interface Props {
  data: HabitData; biometrics: BiometricData; profile?: ProfileRow;
  /** Which report: weekly (the default), monthly or yearly. Follows the Dashboard's Week / Month / Year. */
  period?: ReportPeriod;
}

const longDate = (key: string) =>
  new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/** "weekly", "monthly" or "yearly". */
const nameOf = (period: ReportPeriod) => REPORT_NAME[period].toLowerCase();

/**
 * The report strip inside the dashboard summary: the last finished week,
 * month or 12 months at a glance (following the period toggle), opening the
 * full report, where earlier ones can be browsed.
 */
export default function WeeklyReportCard({ data, biometrics, profile, period = "week" }: Props) {
  const [open, setOpen] = useState(false);
  const history = useMemo(() => periodsWithHistory(data, period), [data, period]);
  const report = useMemo(() => buildReport(period, data, biometrics, profile, 0), [period, data, biometrics, profile]);

  // Brand new: nothing logged before this period, so there's no report yet.
  if (history === 0) {
    return (
      <p className="flex items-center gap-2 px-1 text-sm">
        <FileText className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-medium">Your first {nameOf(period)} report arrives on {longDate(nextReportDate(period))}.</span>{" "}
          <span className="text-muted-foreground">
            {period === "week" ? "Every Monday" : "On the 1st of each month"} Fikko looks back at your {period === "year" ? "last 12 months" : period} and picks one thing to focus on.
          </span>
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
      <FileText className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{REPORT_NAME[period]} report · {report.label}</span>
        {report.logged > 0 ? (
          <>
            <span className="text-muted-foreground">{pct(report.rate)}</span>
            {report.prevRate != null && (
              <Delta value={(report.rate - report.prevRate) * 100} suffix=" pts" className="text-sm" />
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Nothing logged in that {period}.</span>
        )}
      </p>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="ml-auto h-8 gap-1 px-2 font-semibold text-primary-ink hover:bg-white/60 hover:text-primary-ink">
        {report.logged > 0 ? `Read your ${nameOf(period)} report` : "See past reports"}
        <ChevronRight />
      </Button>

      <ReportDialog open={open} onOpenChange={setOpen} data={data} biometrics={biometrics} profile={profile} history={history} period={period} />
    </div>
  );
}

export function ReportDialog({ open, onOpenChange, data, biometrics, profile, history, period = "week" }: Props & {
  open: boolean; onOpenChange: (o: boolean) => void; history: number;
}) {
  const [back, setBack] = useState(0);
  const report = useMemo(
    () => (open ? buildReport(period, data, biometrics, profile, back) : null),
    [open, period, data, biometrics, profile, back],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setBack(0); }}>
      <DialogContent showCloseButton={false} className="block max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
        {report && (
          <>
            <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-2 border-b bg-background px-6 py-4 text-left">
              <Button
                variant="ghost" size="icon" className="size-8"
                onClick={() => setBack((b) => b + 1)}
                disabled={back + 1 >= history}
                aria-label={`Previous ${period}`}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <DialogTitle className="text-base font-semibold">{REPORT_NAME[period]} report</DialogTitle>
                <DialogDescription className="text-xs">{report.label}</DialogDescription>
              </div>
              <Button
                variant="ghost" size="icon" className="size-8"
                onClick={() => setBack((b) => b - 1)}
                disabled={back === 0}
                aria-label={`Next ${period}`}
              >
                <ChevronRight />
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Close">
                  <X />
                </Button>
              </DialogClose>
            </DialogHeader>
            <ReportBody report={report} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function ReportBody({ report: r }: { report: PeriodReport }) {
  const noun = r.period;
  if (r.logged === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-semibold">Nothing logged this {noun}</p>
        <p className="mt-1 text-sm text-muted-foreground">Use the arrows to look at other {noun}s.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-6 py-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{r.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{r.summary}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Consistency", value: pct(r.rate), extra: r.prevRate != null ? <Delta value={(r.rate - r.prevRate) * 100} suffix=" pts" /> : null },
            { label: "Days logged", value: `${r.logged}/${r.days}`, extra: null },
            { label: "Perfect days", value: String(r.perfect), extra: null },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-muted/60 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{t.value}</dd>
              {t.extra}
            </div>
          ))}
        </dl>
      </div>

      {r.focus && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
          <Target className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Focus for {REPORT_NEXT[noun]}: {r.focus.label}</p>
            <p className="mt-0.5 text-sm text-foreground/80">{r.focus.text}</p>
          </div>
        </div>
      )}

      {(r.highlights.length > 0 || r.watch.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {r.highlights.length > 0 && (
            <Block title="What went well">
              <ul className="space-y-2">{r.highlights.map((h) => <InsightRow key={h.id} icon={h.icon} text={h.text} />)}</ul>
            </Block>
          )}
          {r.watch.length > 0 && (
            <Block title="Worth a look">
              <ul className="space-y-2">{r.watch.map((h) => <InsightRow key={h.id} icon={h.icon} text={h.text} />)}</ul>
            </Block>
          )}
        </div>
      )}

      <Block title="Habit by habit" sub={`Days each habit was done, out of ${r.days}${r.prevRate != null ? `, with the change on the ${noun} before` : ""}.`}>
        <ul className="divide-y rounded-xl border">
          {r.habits.map((h) => (
            <li key={h.key} className="flex items-center gap-3 px-4 py-3">
              {h.core
                ? <HabitIcon icon={HABIT_INFO[h.core].icon} hue={HABIT_INFO[h.core].hue} className="size-8 [&>svg]:size-4" />
                : <CustomHabitIcon icon={h.custom!.icon} className="size-8 text-base [&>svg]:size-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{h.label}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{h.done}/{r.days}</p>
                </div>
                <HabitBar value={h.done} max={r.days} hue={h.core ? HABIT_INFO[h.core].hue : "custom"} className="mt-1.5 h-1.5" label={`${h.label}: ${h.done} of ${r.days} days`} />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">{h.figure}</p>
                  {h.prevDone != null && <Delta value={h.done - h.prevDone} suffix={Math.abs(h.done - h.prevDone) === 1 ? " day" : " days"} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Block>

      {r.wearable.length > 0 && (
        <Block title="From your wearable" sub={`Daily averages for the ${noun}, with the change on the ${noun} before.`}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {r.wearable.map((w) => (
              <div key={w.label} className="rounded-xl bg-muted/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">{w.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {w.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{w.unit}</span>
                </dd>
                {w.change != null && <Delta value={w.change} suffix={` ${w.deltaUnit}`} goodWhen={w.goodWhen} />}
              </div>
            ))}
          </dl>
        </Block>
      )}

      <Block title="Patterns" sub={`${noun === "week" ? "From the four weeks up to this one" : `From this ${noun}`}. These are patterns, not medical advice.`}>
        {r.patterns.length ? (
          <ul className="space-y-2">{r.patterns.map((p) => <InsightRow key={p.id} icon={p.icon} text={p.text} />)}</ul>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
            Nothing clear yet. Patterns show up after a couple of weeks of check-ins, especially mood and sleep.
          </p>
        )}
      </Block>
    </div>
  );
}
