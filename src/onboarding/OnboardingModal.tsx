import { useMemo, useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import { computeBaseline } from "../lib/metabolics";
import type { Baseline } from "../lib/metabolics";
import { useOnboardingState } from "./useOnboardingState";
import { clearDraft, readDraft } from "./draft";
import type { DeviceOutcome } from "../components/profile/DevicesCard";
import StepWelcome from "./steps/StepWelcome";
import StepBiometrics from "./steps/StepBiometrics";
import StepGoals from "./steps/StepGoals";
import StepDiet from "./steps/StepDiet";
import StepLifestyle from "./steps/StepLifestyle";
import StepPreferences from "./steps/StepPreferences";
import StepResult from "./steps/StepResult";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** The six questionnaire steps; step 7 is the result, which is not counted. */
const TOTAL_STEPS = 6;
const RESULT_STEP = 7;

/** Steps the user may move past without answering anything. */
const SKIPPABLE = new Set([4, 6]);

interface Props {
  profile: ProfileRow;
  userId: string;
  /** Set when the member is back from a device's sign-in started on step 5. */
  deviceOutcome: DeviceOutcome | null;
  /** Persists the answers; the modal closes once this resolves. */
  onComplete: (patch: Partial<ProfileRow>, baseline: Baseline) => Promise<void>;
}

export default function OnboardingModal({ profile, userId, deviceOutcome, onComplete }: Props) {
  // Answers parked before leaving for a device's sign-in, if this is the way back.
  const [draft] = useState(() => readDraft(userId));
  const api = useOnboardingState(profile, draft);
  const { state: s, derived, errors } = api;

  const [step, setStep] = useState(draft?.step ?? 1);
  // Errors stay hidden until the user actually tries to move on, so a
  // half-filled step is never scolded mid-typing.
  const [showError, setShowError] = useState(false);
  const [saving, setSaving] = useState(false);

  const baseline = useMemo(
    () =>
      computeBaseline({
        sex: s.sex,
        dob: derived.dob,
        heightCm: derived.heightCm,
        weightKg: derived.weightKg,
        activityLevel: s.activityLevel,
        goalKey: s.goalKey,
        weeklyRateKg: derived.weeklyRateKg,
      }),
    [s.sex, s.activityLevel, s.goalKey, derived],
  );

  function goNext() {
    if (errors[step]) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setStep((n) => Math.min(n + 1, RESULT_STEP));
  }

  function goBack() {
    setShowError(false);
    setStep((n) => Math.max(n - 1, 1));
  }

  async function finish() {
    if (!baseline || saving) return;
    setSaving(true);
    try {
      await onComplete(
        {
          name: s.name.trim(),
          gender: s.sex,
          date_of_birth: derived.dob,
          height_cm: derived.heightCm == null ? null : Math.round(derived.heightCm * 10) / 10,
          weight_kg: derived.weightKg == null ? null : Math.round(derived.weightKg * 10) / 10,
          activity_level: s.activityLevel,
          primary_goal: s.goalKey,
          target_weight_kg:
            derived.targetWeightKg == null ? null : Math.round(derived.targetWeightKg * 10) / 10,
          weekly_rate_kg: derived.weeklyRateKg,
          dietary_pattern: s.dietaryPattern,
          allergies: s.allergies,
          wearable: s.wearable,
          tracking_style: s.trackingStyle,
          reminders_enabled: s.remindersEnabled,
          height_unit: s.heightUnit,
          weight_unit: s.weightUnit,
          bmr: baseline.bmr,
          tdee: baseline.tdee,
          calorie_goal: baseline.calorieTarget,
          onboarding_completed_at: new Date().toISOString(),
        },
        baseline,
      );
      clearDraft();
    } finally {
      setSaving(false);
    }
  }

  const onResult = step === RESULT_STEP;
  // Counts the step you are on as progress, so the bar is never empty.
  const pct = onResult ? 100 : Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up your Fikko profile"
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl ring-1 ring-foreground/10 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl"
      >
        {/* ── Progress header ── */}
        <div className="shrink-0 space-y-3 border-b px-6 pt-6 pb-5 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-wide">FIKKO</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {onResult ? "All done" : `Step ${step} of ${TOTAL_STEPS}`}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" aria-label="Onboarding progress" />
        </div>

        {/* ── Step body ── */}
        <div className="flex-1 overflow-y-auto">
          <div key={step} className="onboarding-step px-6 py-8 sm:px-8">
            {step === 1 && <StepWelcome name={s.name} />}
            {step === 2 && <StepBiometrics api={api} showError={showError} />}
            {step === 3 && <StepGoals api={api} showError={showError} />}
            {step === 4 && <StepDiet api={api} />}
            {step === 5 && (
              <StepLifestyle api={api} showError={showError} userId={userId} outcome={draft ? deviceOutcome : null} />
            )}
            {step === 6 && <StepPreferences api={api} />}
            {onResult &&
              (baseline ? (
                <StepResult
                  baseline={baseline}
                  goalKey={s.goalKey}
                  name={s.name}
                  onDone={finish}
                  saving={saving}
                />
              ) : (
                // Only reachable if an answer was cleared after passing step 2.
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    We are missing something needed for the calculation.
                  </p>
                  <Button onClick={() => setStep(2)} className="mt-4 h-9 px-4">
                    Back to my details
                  </Button>
                </div>
              ))}
          </div>
        </div>

        {/* ── Footer controls (the result step carries its own CTA) ── */}
        {!onResult && (
          <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-6 py-4 sm:px-8">
            {step > 1 && (
              <Button variant="ghost" onClick={goBack} className="h-9 px-3 text-muted-foreground">
                <ArrowLeft />
                Back
              </Button>
            )}

            {SKIPPABLE.has(step) && (
              <Button variant="ghost" onClick={() => setStep((n) => n + 1)} className="ml-auto h-9 px-3 text-muted-foreground">
                Skip
              </Button>
            )}

            <Button onClick={goNext} className={`${SKIPPABLE.has(step) ? "" : "ml-auto"} h-9 px-5`}>
              {step === 1 ? "Get started" : step === TOTAL_STEPS ? "See my plan" : "Continue"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
