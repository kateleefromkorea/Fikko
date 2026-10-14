import { useMemo } from "react";
import type { HabitData } from "../types";
import { usePlan } from "../hooks/usePlan";
import { useUpgrade } from "../hooks/useUpgrade";
import { PLAN_LABEL } from "../lib/fikko";
import { todayKey } from "../lib/dates";
import { historyBeyondPlan } from "../lib/upgrade";
import UpgradeNote from "./UpgradeNote";

/**
 * Tells a member when their plan's history is hiding days they've logged, or
 * is about to start (their first week rolling out of view). Nothing otherwise.
 */
export default function HistoryNote({ data, className }: { data: HabitData; className?: string }) {
  const { plan, enforced, limits } = usePlan();
  const openUpgrade = useUpgrade();
  const days = limits.historyDays;
  const { logged, hidden, oldestShown } = useMemo(() => historyBeyondPlan(data, days, todayKey()), [data, days]);

  if (!enforced || days == null || !openUpgrade) return null;
  const next = plan === "free" ? "Premium shows a month, and Max shows everything." : "Max shows all of them.";

  if (hidden > 0) {
    return (
      <UpgradeNote
        className={className}
        reason="history"
        title={`You've logged ${logged} days. ${PLAN_LABEL[plan]} shows the last ${days}.`}
        body={`${hidden} of your days are out of view. They're kept safe. ${next}`}
      />
    );
  }
  // Only once there's a real first week to lose.
  if (oldestShown && logged >= 5) {
    return (
      <UpgradeNote
        className={className}
        reason="history"
        title={plan === "free" ? "Your first week drops out of view tomorrow" : "Your oldest day drops out of view tomorrow"}
        body={`${PLAN_LABEL[plan]} shows your last ${days} days. Your logs are kept safe. ${next}`}
      />
    );
  }
  return null;
}
