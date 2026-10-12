import { useEffect, useState } from "react";
import { todayKey } from "@/lib/dates";

/**
 * Today's day key, kept current: it moves on at midnight and when the member
 * comes back to a tab left open overnight, so "today" never logs to yesterday.
 */
export function useToday() {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const check = () => setToday(todayKey());
    const msToMidnight = () => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 1000;
    };
    let timer = window.setTimeout(function tick() { check(); timer = window.setTimeout(tick, msToMidnight()); }, msToMidnight());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}
