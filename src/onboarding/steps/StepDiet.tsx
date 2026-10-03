import type { useOnboardingState } from "../useOnboardingState";
import { Chip, Field, StepHeading } from "../ui";
import { ALLERGY_CHOICES, DIET_PATTERNS, MAX_DIET_PATTERNS } from "../../lib/preferences";

type Api = ReturnType<typeof useOnboardingState>;


export default function StepDiet({ api }: { api: Api }) {
  const { state: s, toggleAllergy, toggleDiet } = api;
  const full = s.dietaryPatterns.length >= MAX_DIET_PATTERNS;

  return (
    <div>
      <StepHeading
        title="How do you eat?"
        subtitle="We use this to hide recipes that don't suit you. Skip it if nothing applies."
      />

      <div className="flex flex-col gap-8">
        <Field
          label="Dietary pattern"
          hint={full
            ? `That's the maximum of ${MAX_DIET_PATTERNS}. Tap one to remove it if you want to pick another.`
            : `Pick up to ${MAX_DIET_PATTERNS} that describe how you usually eat.`}
        >
          <div className="flex flex-wrap gap-2">
            {DIET_PATTERNS.map((p) => {
              const on = s.dietaryPatterns.includes(p);
              return <Chip key={p} label={p} selected={on} disabled={full && !on} onClick={() => toggleDiet(p)} />;
            })}
          </div>
        </Field>

        <Field label="Allergies & intolerances" hint="Choose as many as apply.">
          <div className="flex flex-wrap gap-2">
            {ALLERGY_CHOICES.map((a) => (
              <Chip key={a} label={a} selected={s.allergies.includes(a)} onClick={() => toggleAllergy(a)} />
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}
