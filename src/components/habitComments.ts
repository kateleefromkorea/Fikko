// The one-line commentary at the top of each habit card. It reacts to what the
// member has logged for the day they're looking at, the time of day (for
// today) and their own goals. Pure functions, so the wording is easy to tune.

/** What the card is showing: today (with the local hour), or a past day. */
export interface Moment { isToday: boolean; hour: number }

export function momentFor(activeDate: string, today: string): Moment {
  return { isToday: activeDate === today, hour: new Date().getHours() };
}

const n = (v: number) => Math.round(v).toLocaleString();
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

export function foodComment(
  { total, target, meals }: { total: number; target: number; meals: Record<"breakfast" | "lunch" | "dinner" | "snacks", number> },
  { isToday, hour }: Moment,
): string {
  if (total === 0) {
    if (!isToday) return "No meals were logged this day. You can still add them.";
    if (hour < 11) return "Morning! Log breakfast once you've eaten and watch the ring fill up.";
    if (hour < 15) return "Nothing logged yet today. Start with lunch, it only takes a moment.";
    return "Nothing logged yet today. Add what you've eaten so far to see where you stand.";
  }
  const diff = total - target;
  if (Math.abs(diff) <= target * 0.05) return isToday ? "Right on target. A nicely balanced day." : "Landed right on target that day.";
  if (diff > 0) {
    return isToday
      ? `${n(diff)} kcal over your target. A lighter next meal or a walk evens it out.`
      : `Finished ${n(diff)} kcal over target. One day doesn't define a week.`;
  }
  const left = -diff;
  if (!isToday) return `Finished ${n(left)} kcal under target that day.`;
  if (!meals.dinner && hour >= 15) return `${n(left)} kcal left, plenty of room for a good dinner.`;
  if (!meals.lunch && hour >= 11 && hour < 15) return `${n(left)} kcal left. Lunch is up next.`;
  if (total < target * 0.5 && hour >= 19) return `Only ${n(total)} kcal so far. Make sure you're eating enough today.`;
  return `${n(left)} kcal left in today's target.`;
}

export function activityComment(
  { minutes, target, steps }: { minutes: number; target: number; steps: number | null },
  { isToday, hour }: Moment,
): string {
  const stepNote = steps != null ? ` Your wearable counted ${n(steps)} steps.` : "";
  if (minutes === 0) {
    if (!isToday) return `No activity logged this day.${stepNote}`;
    return hour >= 18
      ? `Still time for a short evening walk. Even 10 minutes counts.${stepNote}`
      : `No activity yet. A brisk 10-minute walk is a great start.${stepNote}`;
  }
  if (minutes < target) {
    const left = target - minutes;
    return minutes >= target / 2
      ? `Over halfway there. ${plural(left, "more minute")} to hit your goal.${stepNote}`
      : `${plural(minutes, "minute")} in, ${n(left)} to go. Every bit adds up.${stepNote}`;
  }
  if (minutes >= target * 2) return `${n(minutes)} active minutes. A big day, well done. Remember to rest and refuel.${stepNote}`;
  return `Goal reached with ${n(minutes)} minutes. Nice work.${stepNote}`;
}

export function waterComment(
  { glasses, target, boosted, steps }: { glasses: number; target: number; boosted: boolean; steps: number | null },
  { isToday, hour }: Moment,
): string {
  const boost = boosted && steps != null ? `You walked ${n(steps)} steps, so your target is up by 2 glasses. ` : "";
  if (glasses === 0) {
    if (!isToday) return "No water logged this day.";
    return `${boost}${hour < 12 ? "Start the day with a glass of water." : "No water logged yet. Have a glass now, small sips add up."}`;
  }
  if (glasses >= target + 3) return `${boost}Plenty of water today. You're well hydrated.`;
  if (glasses >= target) return `${boost}Target reached. Nicely hydrated.`;
  const left = target - glasses;
  if (!isToday) return `Finished ${plural(left, "glass", "glasses")} short of target.`;
  if (glasses >= target / 2) return `${boost}Over halfway. ${plural(left, "more glass", "more glasses")} to reach your target.`;
  if (hour >= 17) return `${boost}${plural(left, "glass", "glasses")} to go. Try one with dinner and one after.`;
  return `${boost}${plural(glasses, "glass", "glasses")} down, ${n(left)} to go. Keep a glass within reach.`;
}

export function medsComment(
  { total, taken, pendingSlots }: { total: number; taken: number; pendingSlots: ("breakfast" | "midday" | "night")[] },
  { isToday, hour }: Moment,
): string {
  if (total === 0) return "Add what you take and tick it off each day. Fikko keeps the streak.";
  if (taken === total) return isToday ? "Everything taken. Nice work staying on track." : "Everything was taken that day.";
  const left = total - taken;
  if (!isToday) return `${plural(left, "item")} weren't ticked off that day.`;
  // Point out the doses whose time has passed first.
  const overdue = pendingSlots.find((s) => (s === "breakfast" && hour >= 11) || (s === "midday" && hour >= 16));
  if (overdue) return `Your ${overdue === "breakfast" ? "morning" : "midday"} ${left === 1 ? "dose is" : "doses are"} still unticked. Taken it? Tick it off.`;
  if (taken === 0) return `${plural(left, "item")} to take today.`;
  return `${n(taken)} of ${n(total)} taken, ${n(left)} to go.`;
}

export function sleepComment(
  { rest, hours, goal, wearableHours }: { rest: number; hours: number | null; goal: number; wearableHours: number | null },
  { isToday }: Moment,
): string {
  const slept = hours ?? wearableHours;
  if (!rest) {
    if (slept != null) return `Your wearable logged ${slept}h. How rested do you feel?`;
    return isToday ? "How did last night go? Log your bedtime and how rested you feel." : "No sleep logged for this night.";
  }
  if (slept != null && slept < goal - 1) {
    return rest >= 4
      ? `Only ${slept}h but you feel rested. Still, aim for ${goal}h tonight.`
      : `${slept}h, short of your ${goal}h goal. An earlier wind-down tonight could help.`;
  }
  if (rest >= 4) return slept != null && slept >= goal ? "A solid, restful night. Great start to the day." : "You woke up rested. Keep the same routine tonight.";
  if (rest === 3) return "An okay night. Note anything that kept you up below to spot patterns.";
  return "A rough night. Go easy today, and try to get to bed a little earlier.";
}

export function moodComment(
  { mood, rest }: { mood: number; rest: number },
  { isToday }: Moment,
): string {
  if (!mood) return isToday ? "How are you feeling today? One tap is all it takes." : "No mood logged for this day.";
  if (mood <= 2 && rest > 0 && rest <= 2) return "Tough day after a tough night. The two often go together, so be gentle with yourself and rest up.";
  if (mood <= 2) return mood === 1 ? "Rough days happen. Be gentle with yourself, and a short walk or a chat with someone can help." : "A so-so day. Fresh air, water or a short walk can lift things a little.";
  if (mood === 3) return "Steady. That counts.";
  return mood === 5 ? "Love that. Enjoy it, and notice what made today great." : "Glad it's a good one.";
}
