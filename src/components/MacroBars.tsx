import { Check } from "lucide-react";
import type { Macros } from "@/lib/macros";
import { cn } from "@/lib/utils";

const MACROS: { key: keyof Macros; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Carbs" },
  { key: "fat", label: "Fat" },
];

/** Within this share of the target counts as reached. */
const REACHED = 0.9;
/** Past this share of the target is flagged as over. */
const OVER = 1.15;

/** Protein, carbs and fat eaten against the day's targets, as one bar each. */
export default function MacroBars({ eaten, target, className }: { eaten: Macros; target: Macros; className?: string }) {
  return (
    <ul className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-3", className)} aria-label="Macros against today's targets">
      {MACROS.map(({ key, label }) => {
        const got = Math.round(eaten[key]);
        const goal = target[key];
        const share = goal > 0 ? got / goal : 0;
        const state = share > OVER ? "over" : share >= REACHED ? "reached" : "under";
        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                {label}
                {state === "reached" && <Check className="tick-pop size-3.5 text-primary-ink" strokeWidth={3} aria-label="target reached" />}
              </span>
              <span className="text-muted-foreground tabular-nums">
                <span className={cn("font-semibold text-foreground", state === "over" && "text-ink")}>{got}</span> / {goal} g
                {/* In a single-hue palette, "over" is said in words, not just a darker bar. */}
                {state === "over" && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-cream uppercase">over</span>}
              </span>
            </div>
            <div
              role="meter"
              aria-label={`${label}: ${got} of ${goal} grams${state === "over" ? ", over target" : ""}`}
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={got}
              className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                  state === "under" ? "bg-marine" : state === "reached" ? "bg-primary" : "bg-ink",
                )}
                style={{ width: `${Math.min(share, 1) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
