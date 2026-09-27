import { Bell, Calculator, Camera, Hash } from "lucide-react";
import type { useOnboardingState } from "../useOnboardingState";
import { Field, SelectCard, StepHeading } from "../ui";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Api = ReturnType<typeof useOnboardingState>;

const TRACKING_STYLES = [
  { key: "Detailed macros", icon: Calculator, description: "Protein, carbs and fats broken out for every meal" },
  { key: "Simple calories", icon: Hash, description: "Just the calorie total. Quick to log, easy to keep up" },
  { key: "Visual meals", icon: Camera, description: "Log meals by photo and portion, numbers stay in the background" },
];

export default function StepPreferences({ api }: { api: Api }) {
  const { state: s, set } = api;

  return (
    <div>
      <StepHeading
        title="Last thing: how do you want to track?"
        subtitle="You can change any of this later from your profile."
      />

      <div className="flex flex-col gap-8">
        <Field label="Tracking style">
          <div className="flex flex-col gap-2">
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
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
              <Bell className="size-5" />
            </span>
            <Label htmlFor="reminders" className="block min-w-0 flex-1 cursor-pointer">
              <span className="block text-sm font-medium">Daily nudges</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">A gentle reminder to log meals and weigh in</span>
            </Label>
            <Switch
              id="reminders"
              checked={s.remindersEnabled}
              onCheckedChange={(v) => set("remindersEnabled", v)}
            />
          </div>
        </Field>
      </div>
    </div>
  );
}
