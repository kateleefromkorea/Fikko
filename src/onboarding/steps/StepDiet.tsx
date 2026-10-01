import type { useOnboardingState } from "../useOnboardingState";
import { Chip, Field, StepHeading } from "../ui";
import { ALLERGY_CHOICES, DIET_PATTERNS } from "../../lib/preferences";

type Api = ReturnType<typeof useOnboardingState>;


export default function StepDiet({ api }: { api: Api }) {
  const { state: s, set, toggleAllergy } = api;

  return (
    <div>
      <StepHeading
        title="How do you eat?"
        subtitle="We use this to hide recipes that don't suit you. Skip it if nothing applies."
      />

      <div className="flex flex-col gap-8">
        <Field label="Dietary pattern" hint="Pick the one closest to how you usually eat.">
          <div className="flex flex-wrap gap-2">
            {DIET_PATTERNS.map((p) => (
              <Chip
                key={p}
                label={p}
                selected={s.dietaryPattern === p}
                // Tapping the selected pattern again clears it.
                onClick={() => set("dietaryPattern", s.dietaryPattern === p ? null : p)}
              />
            ))}
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
