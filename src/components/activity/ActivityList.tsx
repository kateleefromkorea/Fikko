import { Watch } from "lucide-react";
import type { Workout } from "@/lib/workouts";
import type { WorkoutGroup } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import ActivityRow, { Kcal } from "./ActivityRow";

/** The day's activities: the wearable's share first, then each logged activity, with undo after a removal. */
export default function ActivityList({ groups, device, weightKg, removed, onEdit, onRepeat, onRemove, onUndo }: {
  groups: WorkoutGroup[];
  device: { minutes: number; kcal: number };
  weightKg?: number | null;
  removed: { label: string } | null;
  onEdit: (w: Workout) => void;
  onRepeat: (g: WorkoutGroup) => void;
  onRemove: (ids: string[]) => void;
  onUndo: () => void;
}) {
  if (!groups.length && !device.minutes && !device.kcal && !removed) return null;
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5" aria-label="Activities on this day">
        {(device.minutes > 0 || device.kcal > 0) && (
          <li className="flex items-center gap-3 rounded-xl bg-muted py-2 pr-3 pl-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full pair-d ring-1 ring-ink/10" aria-hidden="true">
              <Watch className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">Your wearable</span>
              <span className="block text-xs text-muted-foreground">Synced automatically</span>
            </span>
            <span className="flex flex-col items-end text-sm tabular-nums">
              {device.minutes > 0 && <span className="font-medium">{device.minutes} min</span>}
              {device.kcal > 0 && <span className="text-xs"><Kcal kcal={device.kcal} estimated={false} /></span>}
            </span>
          </li>
        )}
        {groups.map((g) => (
          <ActivityRow
            key={g.key}
            group={g}
            weightKg={weightKg}
            onEdit={onEdit}
            onRepeat={() => onRepeat(g)}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {removed && (
        <p role="status" className="flex items-center justify-between rounded-lg bg-foreground px-3 py-1.5 text-sm text-background">
          Removed {removed.label}.
          <Button variant="ghost" size="sm" onClick={onUndo} className="h-7 text-background hover:bg-background/15 hover:text-background">Undo</Button>
        </p>
      )}
    </div>
  );
}
