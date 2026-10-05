import { ArrowRight, TriangleAlert } from "lucide-react";
import type { Baseline } from "../../lib/metabolics";
import { goalByKey } from "../../lib/metabolics";
import { Button } from "@/components/ui/button";

interface Props {
  baseline: Baseline;
  goalKey: string | null;
  name: string;
  onDone: () => void;
}

export default function StepResult({ baseline, goalKey, name, onDone }: Props) {
  const goal = goalByKey(goalKey);
  const { bmr, tdee, calorieTarget, adjustment, clampedToFloor } = baseline;

  return (
    <div>
      <h2 className="text-2xl font-semibold">
        {name ? `${name.split(/\s+/)[0]}, your plan is ready.` : "Your plan is ready."}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Worked out from your own body and goal, not a generic default.
      </p>

      {/* The headline number */}
      <div className="mt-8 rounded-lg border border-primary/25 bg-primary/5 p-6 text-center">
        <p className="text-sm font-medium text-primary-ink">Your daily target</p>
        <p className="mt-1 text-5xl font-semibold text-primary-ink tabular-nums">{calorieTarget.toLocaleString()}</p>
        <p className="mt-1 text-sm text-muted-foreground">kcal per day</p>
        {adjustment !== 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {adjustment < 0
              ? `A ${Math.abs(adjustment).toLocaleString()} kcal daily deficit`
              : `A ${adjustment.toLocaleString()} kcal daily surplus`}
            {goal ? ` for ${goal.label.toLowerCase()}` : ""}
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">BMR</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{bmr.toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted-foreground">What you burn at complete rest</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">TDEE</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{tdee.toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted-foreground">With your activity level on top</p>
        </div>
      </div>

      {clampedToFloor && (
        <p className="mt-3 flex gap-2 rounded-lg pair-d p-3 pl-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marine" aria-hidden="true" />
          <span>
            Your chosen pace worked out below a safe daily minimum, so we raised your target to{" "}
            {calorieTarget.toLocaleString()} kcal. Pick a gentler rate in your profile if you would like the maths to
            match your original pace.
          </span>
        </p>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        These are estimates from the Mifflin-St Jeor equation, not medical advice. Check with a clinician before making
        big changes.
      </p>

      <Button onClick={onDone} className="mt-6 h-10 w-full">
        Continue
        <ArrowRight />
      </Button>
    </div>
  );
}
