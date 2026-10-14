import { useState } from "react";
import { Loader2, LockKeyhole, RotateCcw, Receipt } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { usePlan } from "../../hooks/usePlan";
import { PRICES, YEARLY_OFF, fetchSubscription, openCheckout, type Interval, type PaidPlan } from "../../lib/paddle";
import { PLAN_LABEL } from "../../lib/fikko";
import { friendlyError } from "../../lib/errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS: { id: PaidPlan; blurb: string }[] = [
  { id: "premium", blurb: "Unlimited habits, 20 AI messages a day, 30 days of history and your wearable's vitals." },
  { id: "max", blurb: "Everything in Premium, plus 50 AI messages a day, weekly coach check-ins, monthly and lifetime reports, all your history, CSV export and the AI interaction check." },
];

/** What people want to know before they pay. Keep in step with the terms. */
const REASSURANCE = [
  { icon: RotateCcw, text: "Cancel any time and pay only for the days you use. Email hello@fikko.io to stop right away and we'll refund the days you haven't used." },
  { icon: LockKeyhole, text: "Checkout is run by Paddle, our payment partner. Fikko never sees your card details." },
  { icon: Receipt, text: "Your total, including any tax where you live, is shown before you pay." },
];

/**
 * Monthly or yearly, Premium or Max, and Paddle checkout. Used by the plan card
 * on Profile and by the upgrade window. `highlight` marks the plan that fits
 * what the member was trying to do; `onDone` runs once the plan has landed.
 */
export default function PlanPicker({ highlight, onDone }: { highlight?: PaidPlan; onDone?: () => void }) {
  const { session } = useAuth();
  const { refresh } = usePlan();
  const [interval, setInterval_] = useState<Interval>("year");
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The plan is granted by Paddle's webhook a moment after payment, so look for it for up to 30 seconds.
  async function waitForPlan() {
    setWaiting(true);
    for (let i = 0; i < 15; i++) {
      if (await fetchSubscription().catch(() => null)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await refresh();
    setWaiting(false);
    onDone?.();
  }

  async function buy(choice: PaidPlan) {
    if (!session) return;
    setError(null);
    setBusy(choice);
    try {
      await openCheckout(choice, interval, { id: session.user.id, email: session.user.email }, () => void waitForPlan());
    } catch (err) {
      setError(friendlyError(err, "We couldn't open checkout. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  if (waiting) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Thanks! Setting up your plan…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Billing" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {(["month", "year"] as Interval[]).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval_(i)}
            className={cn("rounded-md px-3 py-1 text-sm text-muted-foreground", interval === i && "bg-background font-medium text-foreground shadow-sm")}
          >
            {i === "year" ? <>Yearly <span className="font-medium text-primary-ink">Save {Math.min(...Object.values(YEARLY_OFF))}%</span></> : "Monthly"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANS.map(({ id, blurb }) => (
          <div key={id} className={cn("flex flex-col gap-3 rounded-xl border p-4", highlight === id && "border-primary ring-1 ring-primary")}>
            <div>
              <p className="flex items-center gap-2 font-medium">
                {PLAN_LABEL[id]}
                {highlight === id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-ink">Best fit</span>}
              </p>
              <p className="text-sm tabular-nums">{PRICES[id][interval]} <span className="text-muted-foreground">/ {interval}</span>{interval === "year" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-ink">{YEARLY_OFF[id]}% off</span>}</p>
              <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
            </div>
            <Button onClick={() => buy(id)} disabled={busy !== null} variant={highlight && highlight !== id ? "outline" : "default"} className="mt-auto h-9 px-4">
              {busy === id && <Loader2 className="animate-spin" />}
              Get {PLAN_LABEL[id]}
            </Button>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-1.5">
        {REASSURANCE.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2 text-xs text-muted-foreground">
            <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
