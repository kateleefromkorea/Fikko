import type { CoreHabit } from "../../lib/completion";
import type { Period } from "../../lib/dashboardStats";
import type { DashCtx } from "./context";

const PERIOD_PHRASE: Record<Period, string> = { week: "this week", month: "this month", year: "this year" };
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

// A habit has to move by this share of days to count as a change.
const CHANGE = 0.15;

export function dashboardEyebrow(period: Period) {
  return `Dashboard · ${PERIOD_EYEBROW[period]}`;
}

/**
 * The Dashboard's headline and subtitle. The summary card below already names
 * the best and weakest habit, so this says what it doesn't: how the period
 * compares with the one before. Falls back to plain lines for new members.
 */
export function dashboardHeadline(ctx: DashCtx): { title: string; subtitle: string } {
  const { ov, prevOv, stats, period } = ctx;
  const p = PERIOD_PHRASE[period];

  if (ov.logged === 0) {
    return {
      title: `Nothing logged ${p} yet.`,
      subtitle: "Log a habit on the Habits page and your patterns start showing here.",
    };
  }

  const loggedLine = ov.logged === ov.days
    ? `You logged every one of the last ${ov.days} days.`
    : `You logged ${ov.logged} of the last ${ov.days} days.`;

  if (ov.logged < 3) {
    return { title: "A few days in.", subtitle: `${loggedLine} Patterns start showing after about a week.` };
  }

  if (!prevOv) {
    return {
      title: `Your first ${period} with Fikko.`,
      subtitle: `${loggedLine} From next ${period} you'll see how it compares.`,
    };
  }

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

  if (up && up.delta >= CHANGE) {
    return { title: say(up.s, ["is", "are"], `up on ${LAST[period]}.`), subtitle: loggedLine };
  }
  if (down && down.delta <= -CHANGE) {
    return { title: say(down.s, ["slipped", "slipped"], `a little ${p}.`), subtitle: loggedLine };
  }
  return { title: `Much the same as ${LAST[period]}.`, subtitle: loggedLine };
}
