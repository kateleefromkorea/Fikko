import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_LABEL, SEEDS, lockedReason, owns, type Plan } from "../../lib/fikko";
import FikkoPlant from "./FikkoPlant";

/** A Premium or Max badge for plan items, or a Gardener badge for items earned by harvesting. */
export function TierBadge({ tier, earned, className }: { tier: Plan; earned?: boolean; className?: string }) {
  if (tier === "free" && !earned) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
        earned ? "bg-fikko-tint text-primary-ink" : tier === "premium" ? "bg-marine-tint text-marine" : "bg-[#FBF1D6] text-[#8A6414]",
        className,
      )}
    >
      {earned ? "Gardener" : PLAN_LABEL[tier]}
    </span>
  );
}

/**
 * The seed choices, each shown in full bloom. Seeds the member can't use yet
 * are shown but can't be picked. Seeds earned by harvesting appear only where
 * `unlocked` is given (the My Fikko page), not in onboarding.
 */
export default function SeedPicker({
  value, onChange, plan, unlocked,
}: {
  value: string | null;
  onChange: (id: string) => void;
  plan: Plan;
  /** Items unlocked by harvesting (unlockedItems in lib/fikko). */
  unlocked?: string[];
}) {
  const seeds = SEEDS.filter((s) => !s.earned || unlocked);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {seeds.map((seed) => {
        const locked = !owns(seed, plan, unlocked ?? []);
        const selected = value === seed.id;
        return (
          <button
            key={seed.id}
            type="button"
            onClick={() => !locked && onChange(seed.id)}
            aria-pressed={selected}
            aria-disabled={locked}
            aria-label={locked ? `${seed.name}, locked: ${lockedReason(seed)}` : seed.name}
            className={cn(
              "relative flex flex-col items-center rounded-xl border bg-card p-3 pt-2 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              locked ? "cursor-not-allowed" : "hover:bg-muted/60",
              selected && "border-primary bg-fikko-tint ring-1 ring-primary hover:bg-fikko-tint",
            )}
          >
            <TierBadge tier={seed.tier} earned={seed.earned} className="absolute top-2 right-2" />
            {selected && (
              <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <Check className="size-3" />
              </span>
            )}
            <FikkoPlant seedId={seed.id} stage={4} className={cn("max-w-28", locked && "opacity-45 grayscale-[40%]")} />
            <span className="mt-1 text-sm font-medium">{seed.name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {locked && <Lock className="size-3" aria-hidden="true" />}
              {locked ? lockedReason(seed) : seed.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
