import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { aiAllowance, displayPlan, fetchMyPlan, limitsFor, previewPlan, type PlanState } from "../lib/plan";

const OPEN_STATE: PlanState = { plan: "max", enforced: false };

function build(state: PlanState, refresh: () => Promise<void>, loaded: boolean) {
  return { ...state, limits: limitsFor(state), ai: aiAllowance(state), seedPlan: displayPlan(state), refresh, loaded };
}

const PlanContext = createContext(build(OPEN_STATE, async () => {}, false));

/** Loads the signed-in member's plan once and shares it. Until it loads, nothing is locked. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PlanState>(OPEN_STATE);
  // True once the member's real plan has come back (until then everything is open).
  const [loaded, setLoaded] = useState(false);
  const [preview] = useState(previewPlan);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const s = await fetchMyPlan().catch(() => null);
    if (s) setState(s);
  }, [userId]);

  useEffect(() => {
    setState(OPEN_STATE);
    setLoaded(false);
    if (!userId) return;
    let alive = true;
    const load = () => { fetchMyPlan().then((s) => { if (alive) { setState(s); setLoaded(true); } }).catch(() => {}); };
    load();
    // A plan can change in another tab or after checkout; re-read when the tab is shown again.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);

  const value = useMemo(() => {
    // ?plan=free shows the Free plan's locks and upgrade screens (see previewPlan).
    const shown = preview ? { ...state, plan: preview, enforced: true, trialAvailable: preview === "free" && !state.trialEndsAt } : state;
    return build(shown, refresh, loaded);
  }, [state, preview, refresh, loaded]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);
