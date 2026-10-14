import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { aiAllowance, displayPlan, fetchMyPlan, limitsFor, previewPlan, type PlanState } from "../lib/plan";

const OPEN_STATE: PlanState = { plan: "max", enforced: false };

function build(state: PlanState, refresh: () => Promise<void>) {
  return { ...state, limits: limitsFor(state), ai: aiAllowance(state), seedPlan: displayPlan(state), refresh };
}

const PlanContext = createContext(build(OPEN_STATE, async () => {}));

/** Loads the signed-in member's plan once and shares it. Until it loads, nothing is locked. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PlanState>(OPEN_STATE);
  const [preview] = useState(previewPlan);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const s = await fetchMyPlan().catch(() => null);
    if (s) setState(s);
  }, [userId]);

  useEffect(() => {
    setState(OPEN_STATE);
    if (!userId) return;
    let alive = true;
    const load = () => { fetchMyPlan().then((s) => { if (alive) setState(s); }).catch(() => {}); };
    load();
    // A plan can change in another tab or after checkout; re-read when the tab is shown again.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);

  const value = useMemo(() => {
    // ?plan=free shows the Free plan's locks and upgrade screens (see previewPlan).
    const shown = preview ? { ...state, plan: preview, enforced: true, trialAvailable: preview === "free" && !state.trialEndsAt } : state;
    return build(shown, refresh);
  }, [state, preview, refresh]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);
