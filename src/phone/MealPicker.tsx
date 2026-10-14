import { MEALS } from "@/components/HabitsView";
import { cn } from "@/lib/utils";
import type { MealKey } from "@/types";
import Sheet from "@/phone/Sheet";
import { mealForNow } from "@/phone/quickLog";

/**
 * "Which meal?": the four meals to choose from, so a forgotten breakfast can
 * still be logged in the evening. The one that fits the time of day is marked
 * but never chosen for you.
 */
export default function MealPicker({ open, onClose, onPick, date }: {
  open: boolean;
  onClose: () => void;
  onPick: (meal: MealKey) => void;
  /** Shown when logging for another day, e.g. "yesterday". */
  date?: string;
}) {
  const now = mealForNow();
  return (
    <Sheet open={open} onClose={onClose} title={date ? `Log a meal for ${date}` : "Which meal?"} description="Choose the meal to add food to.">
      <div className="grid grid-cols-2 gap-2.5 pb-2">
        {MEALS.map((m) => (
          <button
            key={m.key}
            onClick={() => { onClose(); onPick(m.key); }}
            className="press flex h-16 items-center gap-3 rounded-2xl bg-foreground/[0.04] px-4 text-left"
          >
            <m.icon className="size-6 shrink-0" style={{ color: m.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{m.label}</span>
              <span className={cn("block text-xs text-muted-foreground", !date && m.key !== now && "sr-only")}>
                {!date && m.key === now ? "Around now" : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
