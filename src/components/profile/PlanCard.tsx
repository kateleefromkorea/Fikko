import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { usePlan } from "../../hooks/usePlan";
import {
  PRICES, YEARLY_OFF, fetchSubscription, openBillingPortal, openCheckout, type Interval, type PaidPlan, type SubscriptionRow,
} from "../../lib/paddle";
import { PLAN_LABEL } from "../../lib/fikko";
import { friendlyError } from "../../lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PLANS: { id: PaidPlan; blurb: string }[] = [
  { id: "premium", blurb: "Unlimited habits, 20 AI messages a day, 30 days of history and your wearable's vitals." },
  { id: "max", blurb: "Everything in Premium, plus 50 AI messages a day, all your history, CSV export and the AI interaction check." },
];

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Choose or manage a paid plan. Only shown when Paddle is configured (see src/lib/paddle.ts). */
export default function PlanCard({ className }: { className?: string }) {
  const { session } = useAuth();
  const { plan, enforced } = usePlan();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [interval, setInterval_] = useState<Interval>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchSubscription().then((s) => { setSub(s); return s; }).catch(() => null), []);
  useEffect(() => { void load().finally(() => setLoaded(true)); }, [load]);

  // The plan is granted by Paddle's webhook a moment after payment, so look for it for up to 30 seconds.
  async function waitForPlan() {
    setWaiting(true);
    for (let i = 0; i < 15; i++) {
      if (await load()) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    setWaiting(false);
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

  async function manage() {
    setError(null);
    setBusy("manage");
    try {
      window.open(await openBillingPortal(), "_blank", "noopener");
    } catch (err) {
      setError(friendlyError(err, "We couldn't open billing. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  const subscribed = sub && (sub.status !== "canceled" || (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Your plan</CardTitle>
        <CardDescription>
          {subscribed
            ? `${PLAN_LABEL[sub.plan]}${sub.status === "canceled" && sub.currentPeriodEnd ? `, ends ${dateLabel(sub.currentPeriodEnd)}` : sub.currentPeriodEnd ? `, renews ${dateLabel(sub.currentPeriodEnd)}` : ""}`
            : enforced ? `${PLAN_LABEL[plan]}${plan === "premium" ? " (founding member)" : ""}` : "Free during launch. Everything is unlocked for now."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {waiting && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Thanks! Setting up your plan…
          </p>
        )}

        {subscribed ? (
          <Button variant="outline" onClick={manage} disabled={busy === "manage"} className="h-9 px-4">
            {busy === "manage" && <Loader2 className="animate-spin" />}
            Manage billing
          </Button>
        ) : loaded && (
          <>
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
                <div key={id} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div>
                    <p className="font-medium">{PLAN_LABEL[id]}</p>
                    <p className="text-sm tabular-nums">{PRICES[id][interval]} <span className="text-muted-foreground">/ {interval}</span>{interval === "year" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-ink">{YEARLY_OFF[id]}% off</span>}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
                  </div>
                  <Button onClick={() => buy(id)} disabled={busy !== null || waiting} className="mt-auto h-9 px-4">
                    {busy === id && <Loader2 className="animate-spin" />}
                    Get {PLAN_LABEL[id]}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
