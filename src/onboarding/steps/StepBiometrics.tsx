import type { useOnboardingState } from "../useOnboardingState";
import { Input } from "@/components/ui/input";
import { Chip, ErrorText, Field, inputCls, selectCls, StepHeading, Segmented } from "../ui";

type Api = ReturnType<typeof useOnboardingState>;

const SEXES = ["Male", "Female", "Prefer not to say"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const THIS_YEAR = new Date().getFullYear();
// Matches LIMITS.age — offering years outside it would only invite an error.
const YEARS = Array.from({ length: 108 }, (_, i) => THIS_YEAR - 13 - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function StepBiometrics({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, errors, set, setHeightUnit, setWeightUnit } = api;

  return (
    <div>
      <StepHeading
        title="A bit about your body"
        subtitle="These four numbers are what the calorie maths runs on. Nothing here is shared."
      />

      <div className="flex flex-col gap-6">
        <Field label="Your name">
          <Input
            value={s.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="What should we call you?"
            className={inputCls}
          />
        </Field>

        <Field label="Sex (for calorie maths)" hint="Used only for the metabolic formula, which differs by sex.">
          <div className="flex flex-wrap gap-2">
            {SEXES.map((x) => (
              <Chip key={x} label={x} selected={s.sex === x} onClick={() => set("sex", x)} />
            ))}
          </div>
        </Field>

        <Field label="Date of birth">
          <div className="grid grid-cols-3 gap-2">
            <select value={s.dobMonth} onChange={(e) => set("dobMonth", e.target.value)} className={selectCls} aria-label="Birth month">
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={s.dobDay} onChange={(e) => set("dobDay", e.target.value)} className={selectCls} aria-label="Birth day">
              <option value="">Day</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={s.dobYear} onChange={(e) => set("dobYear", e.target.value)} className={selectCls} aria-label="Birth year">
              <option value="">Year</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </Field>

        <Field label="Height">
          <div className="flex flex-wrap items-center gap-3">
            {s.heightUnit === "cm" ? (
              <Input
                type="number" inputMode="decimal" min="100" max="250"
                value={s.heightCm}
                onChange={(e) => set("heightCm", e.target.value)}
                placeholder="170"
                className={`${inputCls} w-28`}
                aria-label="Height in centimetres"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number" inputMode="numeric" min="3" max="8"
                  value={s.heightFt}
                  onChange={(e) => set("heightFt", e.target.value)}
                  placeholder="5"
                  className={`${inputCls} w-20`}
                  aria-label="Height, feet"
                />
                <span className="text-sm text-muted-foreground">ft</span>
                <Input
                  type="number" inputMode="numeric" min="0" max="11"
                  value={s.heightIn}
                  onChange={(e) => set("heightIn", e.target.value)}
                  placeholder="7"
                  className={`${inputCls} w-20`}
                  aria-label="Height, inches"
                />
                <span className="text-sm text-muted-foreground">in</span>
              </div>
            )}
            <Segmented
              ariaLabel="Height unit"
              value={s.heightUnit}
              onChange={setHeightUnit}
              options={[{ value: "cm", label: "cm" }, { value: "ft", label: "ft / in" }]}
            />
          </div>
        </Field>

        <Field label="Current weight">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="number" inputMode="decimal" min="0" step="0.1"
              value={s.weight}
              onChange={(e) => set("weight", e.target.value)}
              placeholder={s.weightUnit === "kg" ? "68" : "150"}
              className={`${inputCls} w-28`}
              aria-label={`Weight in ${s.weightUnit === "kg" ? "kilograms" : "pounds"}`}
            />
            <Segmented
              ariaLabel="Weight unit"
              value={s.weightUnit}
              onChange={setWeightUnit}
              options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lbs" }]}
            />
          </div>
        </Field>

        {showError && errors[2] && <ErrorText>{errors[2]}</ErrorText>}
      </div>
    </div>
  );
}
