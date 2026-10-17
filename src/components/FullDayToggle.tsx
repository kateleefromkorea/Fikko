import { useEffect, useState } from "react";
import { usePlan } from "../hooks/usePlan";
import { fetchCompleteDays, setDayComplete } from "../lib/adaptiveData";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * "I logged everything I ate today." A light day the member marks counts
 * towards adaptive targets; without it, days under half the target are left out
 * as probably part-logged (see lib/adaptiveTdee). Only for plans with adaptive targets.
 */
export default function FullDayToggle({ userId, date }: { userId: string | null; date: string }) {
  const { limits } = usePlan();
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!userId) return;
    let alive = true;
    fetchCompleteDays(userId, date).then((days) => { if (alive) { setChecked(days.has(date)); setReady(true); } });
    return () => { alive = false; };
  }, [userId, date]);

  if (!limits.adaptiveTargets || !userId || !ready) return null;

  const toggle = (next: boolean) => {
    setChecked(next);
    setDayComplete(userId, date, next).catch(() => setChecked(!next));
  };

  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => toggle(v === true)} />
      I logged everything I ate this day
    </label>
  );
}
