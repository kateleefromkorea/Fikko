import { useEffect, useState } from "react";
import { usePlan } from "./usePlan";
import { ADAPTIVE_SETTINGS_EVENT, fetchAdaptiveSettings } from "../lib/adaptiveData";

/** Whether training-day targets are on: the member turned them on and their plan (Max) includes them. */
export function useTrainingDays(userId: string | null) {
  const { limits, loaded } = usePlan();
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(false);
    if (!userId) return;
    let alive = true;
    const load = () => { fetchAdaptiveSettings(userId).then((s) => { if (alive) setOn(s.training_days); }); };
    load();
    window.addEventListener(ADAPTIVE_SETTINGS_EVENT, load);
    return () => { alive = false; window.removeEventListener(ADAPTIVE_SETTINGS_EVENT, load); };
  }, [userId]);

  return on && loaded && limits.trainingDays;
}
