import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import type { CapReason, Evidence } from "../../lib/adaptiveTdee";
import type { Macros } from "../../lib/macros";
import { kgToLb } from "../../lib/metabolics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ShownSuggestion {
  reason: "lower" | "raise" | "goal-reached";
  previous: number;
  proposed: number;
  tdee: number;
  evidence: Evidence;
  macrosBefore: Macros;
  macrosAfter: Macros;
  /** True when it was applied without asking (auto-apply on): the member can undo. */
  applied: boolean;
}

const kcal = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${kcal(Math.abs(n))}`;

const TITLE: Record<ShownSuggestion["reason"], string> = {
  lower: "Your target could be a little lower",
  raise: "Your target could go up a little",
  "goal-reached": "You've reached your goal weight",
};

/** One plain sentence on why the safety limits shaped the number, if they did. */
function capNote(capped: CapReason[], e: Evidence): string | null {
  if (capped.includes("floor")) return `Fikko never suggests less than your estimated resting burn of about ${kcal(e.floorKcal)} kcal a day.`;
  if (capped.includes("fast-loss")) return `You've been losing more than 1% of your weight a week for two weeks. Eating a bit more keeps it steady and protects your muscle.`;
  if (capped.includes("deficit")) return "We kept this change small. Fikko never suggests more than 25% below what you burn.";
  if (capped.includes("weekly")) return "We kept this change small: at most 150 kcal a week, so your body and routine can catch up.";
  return null;
}

/**
 * The weekly suggestion: the old and new target, the macros that follow, and
 * the numbers behind it. Or, with auto-apply on, a note that it's been applied.
 */
export default function SuggestionDialog({ suggestion, weightUnit, open, onAccept, onKeep, onUndo, onDone, onPause }: {
  suggestion: ShownSuggestion;
  weightUnit: string;
  open: boolean;
  onAccept: () => void;
  onKeep: () => void;
  onUndo: () => void;
  onDone: () => void;
  onPause: () => void;
}) {
  const [explain, setExplain] = useState(false);
  const { previous, proposed, evidence: e, macrosBefore, macrosAfter, applied, reason } = suggestion;
  const lb = weightUnit === "lb";
  const w = (kg: number) => `${(lb ? kgToLb(kg) : kg).toFixed(1)} ${lb ? "lb" : "kg"}`;
  const pace = (kgWeek: number) => `${(lb ? kgToLb(Math.abs(kgWeek)) : Math.abs(kgWeek)).toFixed(1)} ${lb ? "lb" : "kg"} a week`;
  const change = proposed - previous;
  const note = capNote(e.capped, e);
  const today = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  const subtitle = applied
    ? `It was a small change, so Fikko applied it for you. You can undo it.`
    : reason === "goal-reached"
      ? `Want to switch to holding steady? This target matches what you burn.`
      : change < 0
        ? e.planKgWeek !== 0
          ? "Your weight is moving slower than your plan, so Fikko suggests a small step down."
          : "You've been gaining a little, so Fikko suggests a small step down."
        : e.planKgWeek < 0
          ? "You're losing faster than your plan. Eating a bit more keeps you steady and protects your muscle."
          : "You burn more than your target allows for, so Fikko suggests a small step up.";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) (applied ? onDone : onKeep)(); }}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Weekly check-in · {today}</p>
          <DialogTitle className="text-lg font-semibold">{applied ? "We updated your target" : TITLE[reason]}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <section aria-label="Your daily target" className="rounded-xl bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">Daily calories</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
            <span className="text-xl text-muted-foreground line-through decoration-1">{kcal(previous)}</span>
            <ArrowRight className="size-4 self-center text-muted-foreground" aria-label="to" />
            <span className="text-3xl font-semibold tracking-tight">{kcal(proposed)}</span>
            <span className="text-sm text-muted-foreground">kcal</span>
            <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-medium", change < 0 ? "bg-foreground/5" : "bg-primary/10 text-primary-ink")}>{signed(change)}</span>
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {([["Protein", "protein"], ["Carbs", "carbs"], ["Fat", "fat"]] as const).map(([label, k]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">
                  {macrosBefore[k] === macrosAfter[k] ? `${macrosAfter[k]} g` : <>{macrosBefore[k]} → <span className="font-medium">{macrosAfter[k]} g</span></>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="adaptive-evidence">
          <h3 id="adaptive-evidence" className="mb-2 text-sm font-medium">What Fikko saw · last {e.windowDays} days</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Trend weight</dt>
            <dd className="tabular-nums">{w(e.trendStart)} → {w(e.trendEnd)}</dd>
            <dt className="text-muted-foreground">Pace</dt>
            <dd className="tabular-nums">
              {Math.abs(e.paceKgWeek) < 0.05 ? "Holding steady" : `${e.paceKgWeek < 0 ? "Losing" : "Gaining"} ${pace(e.paceKgWeek)}`}
              {e.planKgWeek !== 0 && <span className="text-muted-foreground"> · plan {pace(e.planKgWeek)}</span>}
            </dd>
            <dt className="text-muted-foreground">You ate</dt>
            <dd className="tabular-nums">{kcal(e.avgEaten)} kcal a day, on {e.fullDays} fully logged days</dd>
            <dt className="text-muted-foreground">You burn</dt>
            <dd className="tabular-nums">about {kcal(e.tdee)} kcal a day <span className="text-muted-foreground">(was {kcal(e.previousTdee)})</span></dd>
          </dl>
        </section>

        {note && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {note}
          </p>
        )}

        {explain && (
          <div className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <p>Every week Fikko compares the calories you logged with how your weight trend moved. If your trend fell by 0.5 kg in a week, about 550 kcal a day came from your body's stores, so you burn roughly that much more than you ate.</p>
            <p>It uses a smoothed trend, not single weigh-ins, and leaves out days that look only part-logged. Changes are capped at 150 kcal a week and never go below your estimated resting burn.</p>
            <p>The maths runs on your own logs. Nothing is shared or sold, and there are no ads.</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {applied ? (
            <>
              <Button variant="outline" onClick={onUndo} className="h-10 px-5">Undo, keep {kcal(previous)}</Button>
              <Button onClick={onDone} className="h-10 px-5">Sounds good</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onKeep} className="h-10 px-5">Keep {kcal(previous)}</Button>
              <Button onClick={onAccept} className="h-10 px-5">Use {kcal(proposed)} kcal</Button>
            </>
          )}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={() => setExplain((x) => !x)} className="font-medium text-primary-ink underline-offset-4 hover:underline">
            {explain ? "Hide how this works" : "How this works"}
          </button>
          <button type="button" onClick={onPause} className="text-muted-foreground underline-offset-4 hover:underline">
            Pause suggestions for 2 weeks
          </button>
        </p>
        <p className="text-xs text-muted-foreground">Fikko isn't medical advice. If you're pregnant, have a medical condition or a history of disordered eating, check targets with a doctor or dietitian.</p>
      </DialogContent>
    </Dialog>
  );
}
