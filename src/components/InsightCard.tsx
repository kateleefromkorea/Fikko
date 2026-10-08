import { useMemo, useState } from "react";
import { Footprints, Trophy, Utensils, X, type LucideIcon } from "lucide-react";
import type { BiometricData, HabitData } from "../types";
import { DEMO_INSIGHTS, pickInsights, type Insight } from "../lib/insights";
import { todayKey } from "../lib/dates";

const SECTION_ICON: Record<Insight["section"], LucideIcon> = { nutrition: Utensils, movement: Footprints };

/** How long a dismissed insight stays hidden. */
const DISMISS_DAYS = 14;
const storeKey = (userId: string | null) => `fikko-insights-dismissed-${userId ?? "anon"}`;

function readDismissed(userId: string | null): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(storeKey(userId)) ?? "{}") as Record<string, number>;
    const cutoff = Date.now() - DISMISS_DAYS * 86_400_000;
    return Object.fromEntries(Object.entries(all).filter(([, at]) => at > cutoff));
  } catch {
    return {};
  }
}

/**
 * The insights to show today, and a way to dismiss one. Nothing on past days:
 * someone filling in yesterday doesn't need today's tips.
 */
export function useInsights({ data, biometrics, userId, activeDate, calorieTarget }: {
  data: HabitData; biometrics: BiometricData; userId: string | null; activeDate: string; calorieTarget: number;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));
  const demo = useMemo(() => new URLSearchParams(window.location.search).get("insights") === "demo", []);
  const today = todayKey();

  const insights = useMemo(() => {
    if (activeDate !== today) return [];
    const hidden = new Set(Object.keys(dismissed));
    if (demo) return DEMO_INSIGHTS.filter((i) => !hidden.has(i.id));
    return pickInsights({ data, biometrics, today, hour: new Date().getHours(), calorieTarget }, hidden);
  }, [data, biometrics, today, activeDate, calorieTarget, dismissed, demo]);

  const dismiss = (id: string) => {
    const next = { ...dismissed, [id]: Date.now() };
    setDismissed(next);
    try { localStorage.setItem(storeKey(userId), JSON.stringify(next)); } catch { /* stays dismissed this visit */ }
  };

  return { insights, dismiss };
}

/** A quiet card with one finding and, optionally, one thing to do about it. */
export default function InsightCard({ insight, onDismiss, onAction }: {
  insight: Insight;
  onDismiss: () => void;
  onAction: (cardId: string) => void;
}) {
  const Icon = insight.kind === "streak" ? Trophy : SECTION_ICON[insight.section];
  return (
    <aside
      aria-label={`Insight: ${insight.headline}`}
      className="relative flex gap-3 rounded-xl border border-dashed bg-muted/40 p-4 pr-10"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-primary ring-1 ring-foreground/5" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{insight.headline}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{insight.body}</p>
        {(insight.cta || insight.evidence) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {insight.cta && (
              <button
                type="button"
                onClick={() => onAction(insight.cta!.cardId)}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {insight.cta.label}
              </button>
            )}
            {insight.evidence && <span className="text-xs text-muted-foreground">{insight.evidence}</span>}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide this insight"
        className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
