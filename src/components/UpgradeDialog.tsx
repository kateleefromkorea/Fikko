import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import { paddleEnabled } from "../lib/paddle";
import { PLANS_URL, TRIAL_DAYS, startTrial } from "../lib/plan";
import { UPGRADE_COPY, type UpgradeReason } from "../lib/upgrade";
import { friendlyError } from "../lib/errors";
import PlanPicker from "./profile/PlanPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/**
 * The upgrade window: opens where the member hit a limit, offers the free
 * trial if they haven't had it, and checkout without leaving the app.
 */
export default function UpgradeDialog({ reason, open, onOpenChange }: {
  reason: UpgradeReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { plan, trialAvailable, refresh } = usePlan();
  const copy = UPGRADE_COPY[reason];
  const [starting, setStarting] = useState(false);
  const [trialEnds, setTrialEnds] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setError(null); setTrialEnds(null); } }, [open]);

  // The trial is Premium, so only offer it where Premium is the answer.
  const showTrial = trialAvailable && plan === "free" && copy.plan === "premium";

  async function beginTrial() {
    setError(null);
    setStarting(true);
    try {
      setTrialEnds(await startTrial());
      await refresh();
    } catch (err) {
      setError(friendlyError(err, "We couldn't start your trial. Please try again."));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-6 sm:max-w-2xl">
        {trialEnds ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary-ink" aria-hidden="true">
              <Check className="size-6" />
            </span>
            <DialogHeader className="mt-4 items-center">
              <DialogTitle className="text-lg font-semibold">Premium is on</DialogTitle>
              <DialogDescription>
                Everything in Premium is yours until {dateLabel(trialEnds)}. Nothing is charged, and you go back to Free afterwards unless you choose a plan.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => onOpenChange(false)} className="mt-6 h-10 px-6">Start exploring</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">{copy.title}</DialogTitle>
              <DialogDescription>{copy.body}</DialogDescription>
            </DialogHeader>

            {showTrial && (
              <div className="flex flex-col gap-3 rounded-xl bg-primary/[0.07] p-4 sm:flex-row sm:items-center">
                <Sparkles className="hidden size-5 shrink-0 text-primary-ink sm:block" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Try Premium free for {TRIAL_DAYS} days</p>
                  <p className="text-sm text-muted-foreground">No card needed. You go back to Free afterwards unless you choose a plan.</p>
                </div>
                <Button onClick={beginTrial} disabled={starting} className="h-10 shrink-0 px-5">
                  {starting && <Loader2 className="animate-spin" />}
                  Start free trial
                </Button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            {paddleEnabled ? (
              <>
                {showTrial && <p className="text-sm font-medium text-muted-foreground">Or choose a plan</p>}
                <PlanPicker highlight={copy.plan} onDone={() => onOpenChange(false)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Paid plans open soon.</p>
            )}

            <a href={PLANS_URL} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
              Compare all plans
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
