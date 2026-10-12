import { useEffect, useRef, useState } from "react";
import { completion } from "@/lib/completion";
import { todayKey } from "@/lib/dates";
import type { HabitData } from "@/types";

/**
 * Whether to show the "day complete" moment: the change from "not all done"
 * to "all done" today, not opening a page that's already complete, and at
 * most once a day, so unticking and re-ticking doesn't repeat it.
 */
export function useDayCompleteCelebration(
  data: HabitData, waterGoal: number, userId: string | null, memberActed: { current: boolean },
) {
  const today = todayKey();
  const { done, total } = completion(data, today, waterGoal);
  const allDone = total > 0 && done === total;
  const wasAllDone = useRef<boolean | null>(null);
  // Opening the app with ?celebrate plays it straight away, for testing.
  const [show, setShow] = useState(() => new URLSearchParams(window.location.search).has("celebrate"));

  useEffect(() => {
    const before = wasAllDone.current;
    wasAllDone.current = allDone;
    // Only a change the member made counts; loading their data just records where the day stands.
    if (before === null || before || !allDone || !userId || !memberActed.current) return;
    const key = `fikko-celebrated-${userId}`;
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { /* storage blocked: celebrate anyway */ }
    setShow(true);
  }, [allDone, today, userId, memberActed]);

  return { show, dismiss: () => setShow(false) };
}
