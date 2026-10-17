import { useEffect, useRef, useState } from "react";
import type { BiometricData, HabitData } from "../../types";
import type { ProfileRow } from "../../hooks/useProfile";
import { usePlan } from "../../hooks/usePlan";
import { AUTO_APPLY_MAX_KCAL, adaptiveCheck, askAutoDue, checkDue, type Evidence } from "../../lib/adaptiveTdee";
import {
  answerSuggestion, createSuggestion, fetchAdaptiveSettings, fetchCompleteDays, saveAdaptiveSettings, type AdaptiveSettings,
} from "../../lib/adaptiveData";
import { macroTargets } from "../../lib/macros";
import { dietsOf } from "../../lib/preferences";
import { shiftDateKey, todayKey } from "../../lib/dates";
import SuggestionDialog, { type ShownSuggestion } from "./SuggestionDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** An example suggestion for reviewing the design: open the app with ?adaptive=demo. */
const DEMO_EVIDENCE: Evidence = {
  windowDays: 21, trendStart: 82.0, trendEnd: 81.2, paceKgWeek: -0.27, planKgWeek: -0.5, avgEaten: 1560, fullDays: 17,
  weighIns: 9, measuredTdee: 1853, previousTdee: 2116, tdee: 2011, bmr: 1531, floorKcal: 1531, capped: ["deficit"], young: false,
};

/**
 * Runs the weekly adaptive-target check (Premium) when the app opens, and asks
 * the member about any suggestion. Nothing shows when there's nothing to say.
 * Rendered once by each layout, after the habits have loaded.
 */
export default function AdaptiveCheck({ userId, data, biometrics, profile, onUpdateProfile }: {
  userId: string;
  data: HabitData;
  biometrics: BiometricData;
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void> | void;
}) {
  const { limits, loaded } = usePlan();
  const [settings, setSettings] = useState<AdaptiveSettings | null>(null);
  const [shown, setShown] = useState<(ShownSuggestion & { id: string | null }) | null>(null);
  const [askAuto, setAskAuto] = useState(false);
  const ran = useRef(false);
  const demo = new URLSearchParams(window.location.search).get("adaptive") === "demo";

  const macros = (calories: number, weightKg: number) => macroTargets({
    calories, goalKey: profile.primary_goal, weightKg, targetWeightKg: profile.target_weight_kg, heightCm: profile.height_cm, diets: dietsOf(profile),
  });

  useEffect(() => {
    // Wait for the plan, so a Free member never sees a Premium suggestion while it loads.
    if (ran.current || !loaded || !limits.adaptiveTargets || !profile.onboarding_completed_at) return;
    ran.current = true;
    void (async () => {
      const s = await fetchAdaptiveSettings(userId);
      setSettings(s);
      const today = todayKey();

      if (demo) {
        const weight = DEMO_EVIDENCE.trendEnd;
        setShown({
          id: null, reason: "lower", previous: 1566, proposed: 1508, tdee: 2011, evidence: DEMO_EVIDENCE, applied: false,
          macrosBefore: macros(1566, weight), macrosAfter: macros(1508, weight),
        });
        return;
      }
      if (!checkDue(s, today)) return;

      const result = adaptiveCheck({
        today,
        weighIns: biometrics.weight.map((e) => ({ date: e.date, kg: e.value })),
        dailyKcal: data.food,
        completeDays: await fetchCompleteDays(userId, shiftDateKey(today, -35)),
        currentTarget: profile.calorie_goal,
        previousTdee: s.tdee_estimate,
        profile: {
          sex: profile.gender, dob: profile.date_of_birth, heightCm: profile.height_cm, activityLevel: profile.activity_level,
          goalKey: profile.primary_goal, weeklyRateKg: profile.weekly_rate_kg, targetWeightKg: profile.target_weight_kg, startTdee: profile.tdee,
        },
      });
      // Not enough data yet: check again next time the app opens (Profile shows what's missing).
      if (result.kind !== "steady" && result.kind !== "suggest") return;

      const next = { ...s, last_checked_on: today, tdee_estimate: result.tdee };
      setSettings(next);
      await saveAdaptiveSettings(userId, { last_checked_on: today, tdee_estimate: result.tdee }).catch(() => {});
      if (result.kind === "steady") return;

      const small = Math.abs(result.proposed - result.previous) <= AUTO_APPLY_MAX_KCAL;
      const applied = s.auto_apply_small && small;
      const id = await createSuggestion(userId, {
        status: applied ? "auto" : "pending", previous: result.previous, proposed: result.proposed, tdee: result.tdee, evidence: result.evidence,
      });
      if (applied) await onUpdateProfile({ calorie_goal: result.proposed, tdee: result.tdee });
      setShown({
        id, reason: result.reason, previous: result.previous, proposed: result.proposed, tdee: result.tdee, evidence: result.evidence, applied,
        macrosBefore: macros(result.previous, result.evidence.trendEnd), macrosAfter: macros(result.proposed, result.evidence.trendEnd),
      });
    })();
    // Runs once per app open, with the data as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, limits.adaptiveTargets, profile.onboarding_completed_at, userId]);

  if (!shown && !askAuto) return null;

  /** After an answer, once a month, offer to apply small changes without asking. */
  const finish = () => {
    setShown(null);
    if (settings && !demo && askAutoDue(settings)) {
      setAskAuto(true);
      const askedAt = new Date().toISOString();
      setSettings({ ...settings, auto_apply_asked_at: askedAt });
      void saveAdaptiveSettings(userId, { auto_apply_asked_at: askedAt }).catch(() => {});
    } else if (demo) {
      setAskAuto(true);
    }
  };

  const accept = () => {
    if (!shown) return;
    if (!demo) {
      void onUpdateProfile({ calorie_goal: shown.proposed, tdee: shown.tdee });
      if (shown.id) void answerSuggestion(shown.id, "accepted");
    }
    finish();
  };
  const keep = () => {
    if (!shown) return;
    if (!demo && shown.id) void answerSuggestion(shown.id, "kept");
    finish();
  };
  const undo = () => {
    if (!shown) return;
    if (!demo) {
      void onUpdateProfile({ calorie_goal: shown.previous });
      if (shown.id) void answerSuggestion(shown.id, "undone");
    }
    setShown(null);
  };
  const pause = () => {
    if (!shown) return;
    if (!demo) {
      void saveAdaptiveSettings(userId, { paused_until: shiftDateKey(todayKey(), 14) }).catch(() => {});
      if (shown.id && !shown.applied) void answerSuggestion(shown.id, "kept");
    }
    setShown(null);
  };

  return (
    <>
      {shown && (
        <SuggestionDialog
          suggestion={shown}
          weightUnit={profile.weight_unit}
          open
          onAccept={accept}
          onKeep={keep}
          onUndo={undo}
          onDone={() => setShown(null)}
          onPause={pause}
        />
      )}
      <Dialog open={askAuto} onOpenChange={setAskAuto}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Apply small changes automatically?</DialogTitle>
            <DialogDescription>
              When a weekly change is {AUTO_APPLY_MAX_KCAL} kcal or less, Fikko could make it for you. You'd still see each one, and you can undo it.
              Bigger changes always wait for you. We'll ask again in a month if you'd rather not now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAskAuto(false)} className="h-10 px-5">Keep asking me</Button>
            <Button
              onClick={() => {
                setAskAuto(false);
                if (!demo) void saveAdaptiveSettings(userId, { auto_apply_small: true }).catch(() => {});
              }}
              className="h-10 px-5"
            >
              Apply small changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
