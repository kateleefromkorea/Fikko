import { useEffect, useState } from "react";
import { Droplet, Minus, Moon, Pill, Plus, X } from "lucide-react";
import type { useOnboardingState } from "../useOnboardingState";
import { ErrorText, Field, inputCls, StepHeading } from "../ui";
import { suggestMedications } from "../../lib/medicationNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Api = ReturnType<typeof useOnboardingState>;

/** Glasses (250 ml) a day: about 33 ml per kg, more for very active weeks. */
export function suggestedWater(weightKg: number | null, activityLevel: string | null) {
  if (weightKg == null) return 8;
  const active = activityLevel === "Very active" || activityLevel === "Extra active" ? 2 : 0;
  return Math.min(14, Math.max(6, Math.round((weightKg * 33) / 250) + active));
}

/** Hours a night: 8 for adults (the middle of the usual 7 to 9), 9 for teenagers. */
export const suggestedSleep = (age: number | null) => (age != null && age < 18 ? 9 : 8);

function Stepper({ value, onChange, step, min, max, unit, label }: {
  value: string; onChange: (v: string) => void; step: number; min: number; max: number; unit: string; label: string;
}) {
  const n = parseFloat(value) || 0;
  const move = (d: number) => onChange(String(Math.min(max, Math.max(min, Math.round((n + d) * 10) / 10))));
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="icon" onClick={() => move(-step)} disabled={n <= min} aria-label={`Less ${label}`}>
        <Minus />
      </Button>
      <p className="min-w-24 text-center" aria-live="polite">
        <span className="text-2xl font-semibold tabular-nums">{n}</span>{" "}
        <span className="text-sm text-muted-foreground">{unit}</span>
      </p>
      <Button type="button" variant="outline" size="icon" onClick={() => move(step)} disabled={n >= max} aria-label={`More ${label}`}>
        <Plus />
      </Button>
    </div>
  );
}

/**
 * Step 6: the daily targets every habit card, streak and "all done" moment is
 * measured against, suggested from the member's answers so day one starts
 * with goals that fit. Medications added here are on the card straight away.
 */
export default function StepTargets({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, derived, errors, set } = api;
  const [medName, setMedName] = useState("");

  // Fill in suggestions the first time the member arrives here.
  useEffect(() => {
    if (!s.waterGoal) set("waterGoal", String(suggestedWater(derived.weightKg, s.activityLevel)));
    if (!s.sleepGoal) set("sleepGoal", String(suggestedSleep(derived.age)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glasses = parseFloat(s.waterGoal) || 0;
  const added = new Set(s.medications.map((m) => m.toLowerCase()));
  const suggestions = suggestMedications(medName, added, [], 5);
  const tracksSupplements = s.goalFocus.includes("supplements");

  const addMed = (name = medName) => {
    const n = name.trim().slice(0, 100);
    if (n && !added.has(n.toLowerCase()) && s.medications.length < 30) set("medications", [...s.medications, n]);
    setMedName("");
  };

  return (
    <div>
      <StepHeading
        title="Last thing: your daily targets"
        subtitle="We've suggested a starting point from your answers. Your habits and streaks count towards these, and you can change them any time."
      />

      <div className="flex flex-col gap-8">
        <Field label="Water" hint={`About ${(glasses * 0.25).toFixed(1).replace(/\.0$/, "")} litres a day, suggested from your weight and activity.`}>
          <div className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-water/15 text-water" aria-hidden="true">
              <Droplet className="size-5" />
            </span>
            <Stepper value={s.waterGoal} onChange={(v) => set("waterGoal", v)} step={1} min={1} max={30} unit="glasses" label="water" />
          </div>
        </Field>

        <Field label="Sleep" hint="Most adults do best on 7 to 9 hours a night.">
          <div className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sleep/15 text-sleep" aria-hidden="true">
              <Moon className="size-5" />
            </span>
            <Stepper value={s.sleepGoal} onChange={(v) => set("sleepGoal", v)} step={0.5} min={4} max={12} unit="hours" label="sleep" />
          </div>
        </Field>

        <Field
          label={tracksSupplements ? "Your supplements and medications" : "Medications & supplements (optional)"}
          hint="Add what you take each day and it'll be on your Medications card, ready to tick off. Skip this if you don't take any."
        >
          <div className="flex gap-2">
            <Input
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMed(); } }}
              placeholder="e.g. Vitamin D3"
              aria-label="Medication or supplement name"
              className={inputCls}
            />
            <Button type="button" variant="outline" onClick={() => addMed()} disabled={!medName.trim()} className="h-9">
              <Plus />
              Add
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestions">
              {suggestions.map((n) => (
                <button key={n} type="button" onClick={() => addMed(n)} className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted">
                  {n}
                </button>
              ))}
            </div>
          )}
          {s.medications.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Added">
              {s.medications.map((m) => (
                <li key={m} className="flex h-8 items-center gap-1.5 rounded-full bg-foreground pr-1 pl-3 text-sm text-background">
                  <Pill className="size-3.5" aria-hidden="true" />
                  {m}
                  <button
                    type="button"
                    onClick={() => set("medications", s.medications.filter((x) => x !== m))}
                    aria-label={`Remove ${m}`}
                    className="grid size-6 place-items-center rounded-full hover:bg-background/20"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        {showError && errors[6] && <ErrorText>{errors[6]}</ErrorText>}
      </div>
    </div>
  );
}
