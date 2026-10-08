import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { aiAllowance, displayPlan, fetchMyPlan, limitsFor, type PlanState } from "../lib/plan";

const OPEN_STATE: PlanState = { plan: "max", enforced: false };

function build(state: PlanState) {
  return { ...state, limits: limitsFor(state), ai: aiAllowance(state), seedPlan: displayPlan(state) };
}

const PlanContext = createContext(build(OPEN_STATE));

/** Loads the signed-in member's plan once and shares it. Until it loads, nothing is locked. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<PlanState>(OPEN_STATE);

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

  const value = useMemo(() => build(state), [state]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);
