import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { AI_USED_EVENT } from "../lib/aiCredits";
import { COACH_DAILY_LIMIT, fetchUsedToday } from "../lib/coach";

/** The member's AI credits left today; `left` is null until the first read comes back. */
export function useAiCredits() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [used, setUsed] = useState<number | null>(null);

  // Read for whoever is signed in, and again after signing in as someone else.
  useEffect(() => {
    setUsed(null);
    if (!userId) return;
    let alive = true;
    const load = () => { fetchUsedToday().then((n) => { if (alive) setUsed(n); }).catch(() => {}); };
    // Also on returning to the tab, which picks up use elsewhere and the midnight reset.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    load();
    window.addEventListener(AI_USED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener(AI_USED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return {
    limit: COACH_DAILY_LIMIT,
    left: used == null ? null : Math.max(0, COACH_DAILY_LIMIT - used),
  };
}
