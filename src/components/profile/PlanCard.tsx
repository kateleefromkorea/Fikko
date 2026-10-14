import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { usePlan } from "../../hooks/usePlan";
import { fetchSubscription, openBillingPortal, type SubscriptionRow } from "../../lib/paddle";
import { onTrial } from "../../lib/plan";
import PlanPicker from "./PlanPicker";
import { PLAN_LABEL } from "../../lib/fikko";
import { friendlyError } from "../../lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Choose or manage a paid plan. Only shown when Paddle is configured (see src/lib/paddle.ts). */
export default function PlanCard({ className }: { className?: string }) {
  const planState = usePlan();
  const { plan, enforced, trialEndsAt } = planState;
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => fetchSubscription().then((s) => { setSub(s); return s; }).catch(() => null), []);
  useEffect(() => { void load().finally(() => setLoaded(true)); }, [load]);

  async function manage() {
    setError(null);
    setBusy(true);
    try {
      window.open(await openBillingPortal(), "_blank", "noopener");
    } catch (err) {
      setError(friendlyError(err, "We couldn't open billing. Please try again."));
    } finally {
      setBusy(false);
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
            : !enforced ? "Free during launch. Everything is unlocked for now."
            : onTrial(planState) ? `${PLAN_LABEL[plan]} free trial, ends ${dateLabel(trialEndsAt!)}. Choose a plan to keep it.`
            : `${PLAN_LABEL[plan]}${plan === "premium" ? " (founding member)" : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscribed ? (
          <Button variant="outline" onClick={manage} disabled={busy} className="h-9 px-4">
            {busy && <Loader2 className="animate-spin" />}
            Manage billing
          </Button>
        ) : loaded && <PlanPicker onDone={() => void load()} />}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
