import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileText, Lightbulb, Target, X } from "lucide-react";
import type { BiometricData, HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import { CustomHabitIcon, HabitBar, HabitIcon } from "../HabitCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Delta, InsightRow } from "./ui";
import { HABIT_INFO, pct } from "./context";
import { buildWeeklyReport, nextReportDate, weeksWithHistory, type WeeklyReport } from "./reportData";

interface Props { data: HabitData; biometrics: BiometricData; profile?: ProfileRow }

const longDate = (key: string) =>
  new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/**
 * The weekly report strip inside the dashboard summary: the last finished
 * Monday-to-Sunday week at a glance, opening the full report, where past weeks can be browsed.
 */
export default function WeeklyReportCard({ data, biometrics, profile }: Props) {
  const [open, setOpen] = useState(false);
  const history = useMemo(() => weeksWithHistory(data), [data]);
  const report = useMemo(() => buildWeeklyReport(data, biometrics, profile, 0), [data, biometrics, profile]);

  // Brand new: nothing logged before this week, so there's no report yet.
  if (history === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-white/70 p-4 ring-1 ring-foreground/5">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your first weekly report arrives on {longDate(nextReportDate())}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every Monday, Fikko looks back at your week: what went well, what slipped, the patterns in your data and one thing to focus on next.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white/70 p-4 ring-1 ring-foreground/5 md:flex-row md:items-center">
      <FileText className="hidden size-5 shrink-0 text-primary-ink md:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">Weekly report · {report.label}</span>
          {report.logged > 0 && (
            <>
              <span className="text-muted-foreground">{pct(report.rate)} consistency</span>
              {report.prevRate != null && (
                <Delta value={(report.rate - report.prevRate) * 100} suffix=" pts vs the week before" className="text-sm" />
              )}
            </>
          )}
        </p>
        {report.focus && report.logged > 0 ? (
          <p className="mt-1 flex items-start gap-2 text-sm text-foreground/80">
            <Target className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
            <span><span className="font-medium">Next week:</span> {report.focus.text}</span>
          </p>
        ) : report.logged === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">Nothing logged that week.</p>
        )}
      </div>
      <Button onClick={() => setOpen(true)} className="h-10 shrink-0 px-5">
        <FileText />
        {report.logged > 0 ? "Read your weekly report" : "See past reports"}
      </Button>

      <ReportDialog open={open} onOpenChange={setOpen} data={data} biometrics={biometrics} profile={profile} history={history} />
    </div>
  );
}

function ReportDialog({ open, onOpenChange, data, biometrics, profile, history }: Props & {
  open: boolean; onOpenChange: (o: boolean) => void; history: number;
}) {
  const [weeksAgo, setWeeksAgo] = useState(0);
  const report = useMemo(
    () => (open ? buildWeeklyReport(data, biometrics, profile, weeksAgo) : null),
    [open, data, biometrics, profile, weeksAgo],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setWeeksAgo(0); }}>
      <DialogContent showCloseButton={false} className="block max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
        {report && (
          <>
            <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-2 border-b bg-background px-6 py-4 text-left">
              <Button
                variant="ghost" size="icon" className="size-8"
                onClick={() => setWeeksAgo((w) => w + 1)}
                disabled={weeksAgo + 1 >= history}
                aria-label="Previous week"
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <DialogTitle className="text-base font-semibold">Weekly report</DialogTitle>
                <DialogDescription className="text-xs">{report.label}</DialogDescription>
              </div>
              <Button
                variant="ghost" size="icon" className="size-8"
                onClick={() => setWeeksAgo((w) => w - 1)}
                disabled={weeksAgo === 0}
                aria-label="Next week"
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

function ReportBody({ report: r }: { report: WeeklyReport }) {
  if (r.logged === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-semibold">Nothing logged this week</p>
        <p className="mt-1 text-sm text-muted-foreground">Use the arrows to look at other weeks.</p>
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
            { label: "Days logged", value: `${r.logged}/7`, extra: null },
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
            <p className="text-sm font-semibold">Focus for next week: {r.focus.label}</p>
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

      <Block title="Habit by habit" sub="Days each habit was done, out of 7, with the change on the week before.">
        <ul className="divide-y rounded-xl border">
          {r.habits.map((h) => (
            <li key={h.key} className="flex items-center gap-3 px-4 py-3">
              {h.core
                ? <HabitIcon icon={HABIT_INFO[h.core].icon} hue={HABIT_INFO[h.core].hue} className="size-8 [&>svg]:size-4" />
                : <CustomHabitIcon icon={h.custom!.icon} className="size-8 text-base [&>svg]:size-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{h.label}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{h.done}/7</p>
                </div>
                <HabitBar value={h.done} max={7} hue={h.core ? HABIT_INFO[h.core].hue : "custom"} className="mt-1.5 h-1.5" label={`${h.label}: ${h.done} of 7 days`} />
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
        <Block title="From your wearable" sub="Daily averages for the week, with the change on the week before.">
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

      <Block title="Patterns" sub="From the four weeks up to this one. These are patterns, not medical advice.">
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
