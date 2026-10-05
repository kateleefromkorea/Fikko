import { Check } from "lucide-react";
import type { Macros } from "@/lib/macros";
import { cn } from "@/lib/utils";

// Each macro takes a colour from the meal ring above it, so the card reads as one set.
const MACROS: { key: keyof Macros; label: string; color: string }[] = [
  { key: "protein", label: "Protein", color: "#1A9C8C" },
  { key: "carbs", label: "Carbs", color: "#3D8FDB" },
  { key: "fat", label: "Fat", color: "#0A6E63" },
];

/** Within this share of the target counts as reached. */
const REACHED = 0.9;
/** Past this share of the target is flagged as over. */
const OVER = 1.15;

/** Protein, carbs and fat eaten against the day's targets, as one bar each. */
export default function MacroBars({ eaten, target, className }: { eaten: Macros; target: Macros; className?: string }) {
  return (
    <ul className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-3", className)} aria-label="Macros against today's targets">
      {MACROS.map(({ key, label, color }) => {
        const got = Math.round(eaten[key]);
        const goal = target[key];
        const share = goal > 0 ? got / goal : 0;
        const state = share > OVER ? "over" : share >= REACHED ? "reached" : "under";
        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
                {label}
                {state === "reached" && <Check className="tick-pop size-3.5 text-primary-ink" strokeWidth={3} aria-label="target reached" />}
              </span>
              <span className="text-muted-foreground tabular-nums">
                <span className={cn("font-semibold text-foreground", state === "over" && "text-ink")}>{got}</span> / {goal} g
                {/* Bars are coloured by macro, so "over" is said in words. */}
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
                )}
                style={{ width: `${Math.min(share, 1) * 100}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
