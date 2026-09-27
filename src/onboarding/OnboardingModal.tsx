import { useMemo, useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import { computeBaseline } from "../lib/metabolics";
import type { Baseline } from "../lib/metabolics";
import { useOnboardingState } from "./useOnboardingState";
import StepWelcome from "./steps/StepWelcome";
import StepBiometrics from "./steps/StepBiometrics";
import StepGoals from "./steps/StepGoals";
import StepDiet from "./steps/StepDiet";
import StepLifestyle from "./steps/StepLifestyle";
import StepPreferences from "./steps/StepPreferences";
import StepResult from "./steps/StepResult";

/** The six questionnaire steps; step 7 is the result, which is not counted. */
const TOTAL_STEPS = 6;
const RESULT_STEP = 7;

/** Steps the user may move past without answering anything. */
const SKIPPABLE = new Set([4, 6]);

interface Props {
  profile: ProfileRow;
  /** Persists the answers; the modal closes once this resolves. */
  onComplete: (patch: Partial<ProfileRow>, baseline: Baseline) => Promise<void>;
}

export default function OnboardingModal({ profile, onComplete }: Props) {
  const api = useOnboardingState(profile);
  const { state: s, derived, errors } = api;

  const [step, setStep] = useState(1);
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
    } finally {
      setSaving(false);
    }
  }

  const onResult = step === RESULT_STEP;
  // Counts the step you are on as progress, so the bar is never empty.
  const pct = onResult ? 100 : Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up your Fikko profile"
        className="w-full sm:max-w-xl bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[88vh] overflow-hidden"
      >
        {/* ── Progress header ── */}
        <div className="px-5 sm:px-8 pt-6 pb-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold text-primary-foreground bg-primary">
                F
              </span>
              <span className="text-sm font-extrabold text-foreground">Fikko</span>
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {onResult ? "All done" : `Step ${step} of ${TOTAL_STEPS}`}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* ── Step body ── */}
        <div className="flex-1 overflow-y-auto modal-bg">
        <div key={step} className="px-5 sm:px-8 py-6 onboarding-step">
          {step === 1 && <StepWelcome name={s.name} />}
          {step === 2 && <StepBiometrics api={api} showError={showError} />}
          {step === 3 && <StepGoals api={api} showError={showError} />}
          {step === 4 && <StepDiet api={api} />}
          {step === 5 && <StepLifestyle api={api} showError={showError} />}
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
              <div className="text-center py-8">
                <p className="text-sm text-white/80">
                  We are missing something needed for the calculation.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                >
                  Back to my details
                </button>
              </div>
            ))}
        </div>
        </div>

        {/* ── Footer controls (the result step carries its own CTA) ── */}
        {!onResult && (
          <div className="px-5 sm:px-8 py-4 border-t border-border bg-card flex items-center gap-3 flex-shrink-0">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:opacity-70 transition-all"
              >
                ← Back
              </button>
            )}

            {SKIPPABLE.has(step) && (
              <button
                type="button"
                onClick={() => setStep((n) => n + 1)}
                className="ml-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:opacity-70 transition-all"
              >
                Skip
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              className={`${SKIPPABLE.has(step) ? "" : "ml-auto"} px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all`}
            >
              {step === 1 ? "Get started" : step === TOTAL_STEPS ? "See my plan" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
