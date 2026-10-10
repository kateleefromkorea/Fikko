// Patterns in a member's last four weeks, for the coach's weekly check-in
// (api/coach-checkin.ts). Worked out here with plain arithmetic, so the coach
// is handed real findings with real numbers instead of hunting for them, and
// a finding needs enough days on both sides to be worth mentioning. Calories
// are left out on purpose: an unprompted note is no place for diet numbers.

export interface HabitRow { category: string; date: string; value: number | string; note: string | null }

export interface Pattern {
  /** One sentence the coach can build on, with the figures. */
  text: string;
  /** Rough size of the effect, for picking the most useful one. */
  strength: number;
}

/** Days needed on each side of a comparison. */
const MIN_DAYS = 3;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;
const weekday = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();
const isWeekend = (date: string) => weekday(date) === 0 || weekday(date) === 6;

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function minutesOf(t?: string) {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function sleepHours(bed?: string, wake?: string) {
  const b = minutesOf(bed), w = minutesOf(wake);
  if (b == null || w == null) return null;
  const mins = (w - b + 1440) % 1440;
  return mins >= 60 && mins <= 960 ? mins / 60 : null;
}

/** Bedtime as minutes after 6pm, so 11pm (300) sorts before 1am (420). */
const bedtimeLateness = (bed?: string) => {
  const m = minutesOf(bed);
  return m == null ? null : (m - 18 * 60 + 1440) % 1440;
};

/** Mean of `pick` on days in `a` against days in `b`, when both have enough. */
function compare(days: Map<string, number>, a: (d: string) => boolean, b: (d: string) => boolean) {
  const xs = [...days].filter(([d]) => a(d)).map(([, v]) => v);
  const ys = [...days].filter(([d]) => b(d)).map(([, v]) => v);
  if (xs.length < MIN_DAYS || ys.length < MIN_DAYS) return null;
  return { a: avg(xs), b: avg(ys), na: xs.length, nb: ys.length };
}

export function findPatterns(rows: HabitRow[], goals: { water?: number | null; sleep?: number | null }, today: string): Pattern[] {
  const by = (cat: string) => {
    const m = new Map<string, { value: number; note: string | null }>();
    for (const r of rows) if (r.category === cat && Number(r.value) > 0) m.set(r.date, { value: Number(r.value), note: r.note });
    return m;
  };
  const mood = new Map([...by("mood")].map(([d, e]) => [d, e.value]));
  const sleepRows = by("sleep");
  const rest = new Map([...sleepRows].map(([d, e]) => [d, e.value]));
  const hours = new Map<string, number>();
  const lateness = new Map<string, number>();
  for (const [d, e] of sleepRows) {
    const n = parse<{ bedtime?: string; wake?: string }>(e.note);
    const h = sleepHours(n?.bedtime, n?.wake);
    if (h != null) hours.set(d, h);
    const l = bedtimeLateness(n?.bedtime);
    if (l != null) lateness.set(d, l);
  }
  const activity = new Map<string, number>();
  for (const r of rows) if (r.category === "exercise") activity.set(r.date, Number(r.value) || 0);
  const water = new Map<string, number>();
  for (const r of rows) if (r.category === "water") water.set(r.date, Number(r.value) || 0);
  const meds = new Map<string, number>();
  for (const r of rows) if (r.category === "medication") meds.set(r.date, Number(r.value) === 1 ? 1 : 0);

  const out: Pattern[] = [];
  const sleepTarget = goals.sleep ?? 7;
  const waterGoal = goals.water ?? 8;

  // Sleep length and mood the same day (sleep is logged against the morning it ended).
  const moodBySleep = new Map([...mood].filter(([d]) => hours.has(d)));
  const s = compare(moodBySleep, (d) => hours.get(d)! >= sleepTarget, (d) => hours.get(d)! < sleepTarget);
  if (s && Math.abs(s.a - s.b) >= 0.5) {
    out.push({
      text: `Mood averaged ${r1(s.a)}/5 on days after ${sleepTarget}+ hours of sleep (${s.na} days) and ${r1(s.b)}/5 after shorter nights (${s.nb} days).`,
      strength: Math.abs(s.a - s.b) / 4,
    });
  }

  // Late bedtimes and how rested they felt.
  const restByBed = new Map([...rest].filter(([d]) => lateness.has(d)));
  const late = 5.5 * 60; // 11:30pm
  const b = compare(restByBed, (d) => lateness.get(d)! < late, (d) => lateness.get(d)! >= late);
  if (b && Math.abs(b.a - b.b) >= 0.5) {
    out.push({
      text: `They woke feeling ${r1(b.a)}/5 rested after going to bed before 11:30pm (${b.na} nights) and ${r1(b.b)}/5 after later bedtimes (${b.nb} nights).`,
      strength: Math.abs(b.a - b.b) / 4,
    });
  }

  // Activity and mood.
  const moodByActivity = new Map([...mood].filter(([d]) => activity.has(d)));
  const a = compare(moodByActivity, (d) => activity.get(d)! >= 30, (d) => activity.get(d)! < 30);
  if (a && Math.abs(a.a - a.b) >= 0.5) {
    out.push({
      text: `Mood averaged ${r1(a.a)}/5 on days with 30+ minutes of logged activity (${a.na} days) and ${r1(a.b)}/5 on other days (${a.nb} days).`,
      strength: Math.abs(a.a - a.b) / 4,
    });
  }

  // Water goal on weekdays and weekends.
  const hit = new Map([...water].map(([d, v]) => [d, v >= waterGoal ? 1 : 0]));
  const w = compare(hit, (d) => !isWeekend(d), isWeekend);
  if (w && Math.abs(w.a - w.b) >= 0.3) {
    out.push({
      text: `They reached their water goal of ${waterGoal} glasses on ${Math.round(w.a * 100)}% of weekdays but ${Math.round(w.b * 100)}% of weekend days.`,
      strength: Math.abs(w.a - w.b),
    });
  }

  // Medications on weekdays and weekends.
  const m = compare(meds, (d) => !isWeekend(d), isWeekend);
  if (m && Math.abs(m.a - m.b) >= 0.3) {
    out.push({
      text: `All medications were ticked on ${Math.round(m.a * 100)}% of weekdays and ${Math.round(m.b * 100)}% of weekend days.`,
      strength: Math.abs(m.a - m.b),
    });
  }

  // Logging this week against the week before.
  const shift = (days: number) => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const logged = new Set(rows.filter((r) => Number(r.value) > 0).map((r) => r.date));
  const count = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => shift(from + i)).filter((d) => logged.has(d)).length;
  const thisWeek = count(1, 8), lastWeek = count(8, 15);
  if (lastWeek - thisWeek >= 3) {
    out.push({ text: `They logged on ${thisWeek} of the last 7 days, down from ${lastWeek} the week before.`, strength: (lastWeek - thisWeek) / 7 });
  } else if (thisWeek - lastWeek >= 2 && thisWeek >= 5) {
    out.push({ text: `They logged on ${thisWeek} of the last 7 days, up from ${lastWeek} the week before.`, strength: (thisWeek - lastWeek) / 7 });
  }

  // The longest current run of days at the water goal.
  let streak = 0;
  for (let i = 1; i <= 28 && (water.get(shift(i)) ?? 0) >= waterGoal; i++) streak++;
  if (streak >= 5) out.push({ text: `They've reached their water goal ${streak} days in a row.`, strength: Math.min(1, streak / 14) });

  return out.sort((x, y) => y.strength - x.strength);
}
