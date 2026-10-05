import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_LABEL, SEEDS, planIncludes, type Plan } from "../../lib/fikko";
import FikkoPlant from "./FikkoPlant";

/** A Premium or Max badge for items the member's plan doesn't include. */
export function TierBadge({ tier, className }: { tier: Plan; className?: string }) {
  if (tier === "free") return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
        tier === "premium" ? "bg-marine-tint text-marine" : "bg-[#FBF1D6] text-[#8A6414]",
        className,
      )}
    >
      {PLAN_LABEL[tier]}
    </span>
  );
}

/**
 * The seed choices, each shown in full bloom. Seeds outside the member's plan
 * are shown but can't be picked. Used in onboarding and on the My Fikko page.
 */
export default function SeedPicker({ value, onChange, plan }: { value: string | null; onChange: (id: string) => void; plan: Plan }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SEEDS.map((seed) => {
        const locked = !planIncludes(plan, seed.tier);
        const selected = value === seed.id;
        return (
          <button
            key={seed.id}
            type="button"
            onClick={() => !locked && onChange(seed.id)}
            aria-pressed={selected}
            aria-disabled={locked}
            aria-label={locked ? `${seed.name}, included with ${PLAN_LABEL[seed.tier]}` : seed.name}
            className={cn(
              "relative flex flex-col items-center rounded-xl border bg-card p-3 pt-2 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              locked ? "cursor-not-allowed" : "hover:bg-muted/60",
              selected && "border-primary bg-fikko-tint ring-1 ring-primary hover:bg-fikko-tint",
            )}
          >
            <TierBadge tier={seed.tier} className="absolute top-2 right-2" />
            {selected && (
              <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <Check className="size-3" />
              </span>
            )}
            <FikkoPlant seedId={seed.id} stage={4} className={cn("max-w-28", locked && "opacity-45 grayscale-[40%]")} />
            <span className="mt-1 text-sm font-medium">{seed.name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {locked && <Lock className="size-3" aria-hidden="true" />}
              {locked ? `With ${PLAN_LABEL[seed.tier]}` : seed.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
