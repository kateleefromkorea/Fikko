import { useRef } from "react";
import { Ellipsis } from "lucide-react";
import { activityOf } from "@/lib/activities";
import { groupKey, type ActivityChoice } from "@/hooks/useActivityLog";
import { cn } from "@/lib/utils";

/** Held this long, a chip logs the member's usual straight away. */
const LONG_PRESS_MS = 500;

const chipCls =
  "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium text-foreground/80 transition-colors select-none hover:border-foreground/20 hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-primary/8 aria-pressed:text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Activities to log, the member's most logged first. Tap opens the details;
 * press and hold logs the usual length in one go. "More" opens every activity.
 */
export default function ActivityChips({ chips, selected, onPick, onQuickLog, onMore }: {
  chips: ActivityChoice[];
  selected: ActivityChoice | null;
  onPick: (choice: ActivityChoice) => void;
  onQuickLog: (choice: ActivityChoice) => void;
  onMore: () => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);

  const press = (choice: ActivityChoice) => {
    held.current = false;
    timer.current = window.setTimeout(() => {
      held.current = true;
      navigator.vibrate?.(15);
      onQuickLog(choice);
    }, LONG_PRESS_MS);
  };
  const release = () => window.clearTimeout(timer.current);

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Activities">
      {chips.map((choice) => {
        const activity = activityOf(choice.type);
        const Icon = activity.icon;
        const label = choice.name || activity.label;
        return (
          <li key={groupKey(choice)}>
            <button
              type="button"
              aria-pressed={!!selected && groupKey(selected) === groupKey(choice)}
              title="Tap for details, or press and hold to log your usual"
              onPointerDown={() => press(choice)}
              onPointerUp={release}
              onPointerLeave={release}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => { if (!held.current) onPick(choice); }}
              className={chipCls}
            >
              <Icon className="size-4 text-exercise" aria-hidden="true" />
              {label}
            </button>
          </li>
        );
      })}
      <li>
        <button type="button" onClick={onMore} className={cn(chipCls, "text-muted-foreground")}>
          <Ellipsis className="size-4" aria-hidden="true" />
          More
        </button>
      </li>
    </ul>
  );
}
