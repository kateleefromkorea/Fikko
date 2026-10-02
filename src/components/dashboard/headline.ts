import type { CoreHabit } from "../../lib/completion";
import type { Period } from "../../lib/dashboardStats";
import type { DashCtx } from "./context";

const PERIOD_EYEBROW: Record<Period, string> = { week: "Last 7 days", month: "Last 30 days", year: "Last 12 months" };

// How each habit reads as the subject of a sentence. `plural` picks "are" over "is".
const SUBJECT: Record<CoreHabit, { subject: string; plural?: boolean }> = {
  food:       { subject: "Meal logging" },
  exercise:   { subject: "Activity" },
  water:      { subject: "Water" },
  mood:       { subject: "Mood check-ins", plural: true },
  medication: { subject: "Medications", plural: true },
  sleep:      { subject: "Sleep" },
};

const LAST: Record<Period, string> = { week: "last week", month: "last month", year: "last year" };
const THIS: Record<Period, string> = { week: "this week", month: "this month", year: "this year" };

// A habit has to move by this share of days to count as a change.
const CHANGE = 0.15;

export function dashboardEyebrow(period: Period) {
  return `Dashboard · ${PERIOD_EYEBROW[period]}`;
}

/**
 * One line on how this period compares with the one before: the habit that
 * moved most, or a note that the comparison starts next period. The summary
 * sentence above it already names the best and weakest habit.
 */
export function comparisonLine(ctx: DashCtx): string | null {
  const { ov, prevOv, stats, period } = ctx;
  if (ov.logged === 0) return null;
  if (!prevOv) return `Your first ${period} with Fikko. From next ${period} you'll see how it compares.`;

  const changes = stats
    .filter((s) => s.prevRate != null)
    .map((s) => ({ s, delta: s.rate - s.prevRate! }));
  const up = [...changes].sort((a, b) => b.delta - a.delta)[0];
  const down = [...changes].sort((a, b) => a.delta - b.delta)[0];

  const say = (stat: typeof stats[number], verb: [string, string], rest: string) => {
    const core = stat.custom ? null : SUBJECT[stat.key as CoreHabit];
    const subject = stat.custom?.name ?? core!.subject;
    return `${subject} ${core?.plural ? verb[1] : verb[0]} ${rest}`;
  };

  if (up && up.delta >= CHANGE) return say(up.s, ["is", "are"], `up on ${LAST[period]}.`);
  if (down && down.delta <= -CHANGE) return say(down.s, ["slipped", "slipped"], `a little ${THIS[period]}.`);
  return `Much the same as ${LAST[period]}.`;
}
