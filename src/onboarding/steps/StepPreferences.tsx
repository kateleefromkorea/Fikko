import type { useOnboardingState } from "../useOnboardingState";
import { Field, SelectCard, StepHeading } from "../ui";

type Api = ReturnType<typeof useOnboardingState>;

const TRACKING_STYLES = [
  { key: "Detailed macros", icon: "🧮", description: "Protein, carbs and fats broken out for every meal" },
  { key: "Simple calories", icon: "🔢", description: "Just the calorie total — quick to log, easy to keep up" },
  { key: "Visual meals", icon: "📷", description: "Log meals by photo and portion, numbers stay in the background" },
];

export default function StepPreferences({ api }: { api: Api }) {
  const { state: s, set } = api;

  return (
    <div>
      <StepHeading
        title="Last thing — how do you want to track?"
        subtitle="You can change any of this later from your profile."
      />

      <div className="flex flex-col gap-6">
        <Field label="Tracking style">
          <div className="flex flex-col gap-2.5">
            {TRACKING_STYLES.map((t) => (
              <SelectCard
                key={t.key}
                icon={t.icon}
                label={t.key}
                description={t.description}
                selected={s.trackingStyle === t.key}
                onClick={() => set("trackingStyle", t.key)}
              />
            ))}
          </div>
        </Field>

        <Field label="Reminders">
          <button
            type="button"
            onClick={() => set("remindersEnabled", !s.remindersEnabled)}
            aria-pressed={s.remindersEnabled}
            className="w-full rounded-2xl border-2 p-4 flex items-center gap-3.5 text-left transition-all hover:opacity-90"
            style={s.remindersEnabled
              ? { borderColor: "var(--primary)", background: "var(--muted)", boxShadow: "0 0 0 3px #FFFFFF" }
              : { borderColor: "var(--border)", background: "var(--card)" }}
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: s.remindersEnabled ? "rgba(21,121,84,0.12)" : "var(--secondary)" }}>
              🔔
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-foreground">Daily nudges</span>
              <span className="block text-xs text-muted-foreground mt-0.5">A gentle reminder to log meals and weigh in</span>
            </span>
            {/* Switch */}
            <span
              className="w-11 h-6 rounded-full flex-shrink-0 p-0.5 transition-all"
              style={{ background: s.remindersEnabled ? "var(--primary)" : "var(--border)" }}
            >
              <span
                className="block w-5 h-5 rounded-full bg-white transition-all"
                style={{ transform: s.remindersEnabled ? "translateX(20px)" : "translateX(0)" }}
              />
            </span>
          </button>
        </Field>
      </div>
    </div>
  );
}
