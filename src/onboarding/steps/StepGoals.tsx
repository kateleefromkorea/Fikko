import { useEffect, useRef } from "react";
import type { useOnboardingState } from "../useOnboardingState";
import { GAIN_RATES, GOALS, LOSS_RATES, goalByKey } from "../../lib/metabolics";
import { GOAL_FOCUS } from "../../lib/preferences";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Chip, ErrorText, FALLBACK_ICON, Field, GOAL_ICONS, inputCls, SelectCard, selectedCls, StepHeading } from "../ui";

type Api = ReturnType<typeof useOnboardingState>;

export default function StepGoals({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, derived, errors, set, toggleFocus } = api;
  const goal = goalByKey(s.goalKey);
  const direction = goal?.weightManaging ?? null;
  const rates = direction === "gain" ? GAIN_RATES : LOSS_RATES;
  const focusOptions = goal ? GOAL_FOCUS[goal.key] ?? null : null;
  // What the follow-up block below the goals is about, if there is one.
  const detailsFor = direction ?? (focusOptions ? goal!.key : null);

  // Picking a weight-managing goal reveals the target-weight block below the
  // fold, where it is easy to miss. Bring it into view so the step does not
  // look finished when it isn't.
  const detailsRef = useRef<HTMLDivElement>(null);
  const previousDetails = useRef<string | null | "initial">("initial");

  useEffect(() => {
    const previous = previousDetails.current;
    previousDetails.current = detailsFor;
    // Only follow a change the user just made — not arriving on the step with
    // a goal already chosen, which is what happens on Back from step 4.
    if (previous === "initial" || previous === detailsFor || !detailsFor) return;

    detailsRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [detailsFor]);

  return (
    <div>
      <StepHeading
        title="What are you here for?"
        subtitle="This shapes your calorie target and what the dashboard puts front and centre."
      />

      <div className="flex flex-col gap-2">
        {GOALS.map((g) => (
          <SelectCard
            key={g.key}
            icon={GOAL_ICONS[g.key] ?? FALLBACK_ICON}
            label={g.label}
            description={g.description}
            selected={s.goalKey === g.key}
            onClick={() => {
              set("goalKey", g.key);
              // Focus areas belong to one goal.
              if (g.key !== s.goalKey) set("goalFocus", []);
              // Switching between a loss and a gain goal invalidates a rate
              // picked for the other direction.
              if (goalByKey(g.key)?.weightManaging !== direction) set("weeklyRate", null);
            }}
          />
        ))}
      </div>

      {direction && (
        <div ref={detailsRef} className="mt-8 flex flex-col gap-6 border-t pt-8">
          <Field
            label={`Target weight (${s.weightUnit})`}
            hint={direction === "loss"
              ? "Where you would like to get to — no rush."
              : "The weight you're building towards. It can be below your current weight if you want to lose fat while building muscle."}
          >
            <Input
              type="number" inputMode="decimal" min="0" step="0.1"
              value={s.targetWeight}
              onChange={(e) => set("targetWeight", e.target.value)}
              placeholder={s.weightUnit === "kg" ? "62" : "137"}
              className={`${inputCls} w-32`}
              aria-label={`Target weight in ${s.weightUnit === "kg" ? "kilograms" : "pounds"}`}
            />
          </Field>

          {derived.recomposition ? (
            <p className="flex gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                That&apos;s body recomposition: building muscle while losing fat. We&apos;ll keep your calories at
                maintenance, so strength training and plenty of protein do the work. No pace to pick.
              </span>
            </p>
          ) : (
          <Field
            label="How fast?"
            hint="Slower rates are easier to hold on to, and keep more muscle along the way."
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {rates.map((r) => (
                <button
                  key={r.kg}
                  type="button"
                  onClick={() => set("weeklyRate", r.kg)}
                  aria-pressed={s.weeklyRate === r.kg}
                  className={cn(
                    "rounded-lg border bg-card px-3 py-3 text-center transition-colors hover:bg-muted/60",
                    s.weeklyRate === r.kg && selectedCls,
                  )}
                >
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className={cn("mt-0.5 block text-xs text-muted-foreground", s.weeklyRate === r.kg && "text-background/70")}>{r.note}</span>
                </button>
              ))}
            </div>
          </Field>
          )}

          {direction === "loss" && s.weeklyRate != null && s.weeklyRate >= 0.75 && (
            <p className="flex gap-2 rounded-lg border border-food/30 bg-food/10 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-food" aria-hidden="true" />
              That is a fast pace. It is safe for many people short-term, but it is harder to
              sustain — you can ease off any time from your profile.
            </p>
          )}

          {showError && errors[3] && <ErrorText>{errors[3]}</ErrorText>}
        </div>
      )}

      {focusOptions && (
        <div ref={detailsRef} className="mt-8 border-t pt-8">
          <Field
            label="What would you like to focus on?"
            hint="Choose as many as you like. We use this to tailor your tracking and insights."
          >
            <div className="flex flex-wrap gap-2">
              {focusOptions.map((f) => (
                <Chip key={f.key} label={f.label} selected={s.goalFocus.includes(f.key)} onClick={() => toggleFocus(f.key)} />
              ))}
            </div>
          </Field>
          {showError && errors[3] && <div className="mt-4"><ErrorText>{errors[3]}</ErrorText></div>}
        </div>
      )}

      {showError && errors[3] && !direction && !focusOptions && <div className="mt-4"><ErrorText>{errors[3]}</ErrorText></div>}
    </div>
  );
}
