import { useRef, useState, type PointerEvent } from "react";
import { ChevronDown, RotateCcw, Watch, X } from "lucide-react";
import { workoutKcal } from "@/lib/activities";
import type { Workout } from "@/lib/workouts";
import type { WorkoutGroup } from "@/hooks/useActivityLog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ActivityIcon from "./ActivityIcon";

/** Swiped this far left (px), a row is removed. */
const SWIPE_REMOVE = 90;

const EFFORT_LABEL = { easy: "Easy", moderate: "", hard: "Hard" } as const;

/** "≈ 114 kcal" for an estimate; "114 kcal" with a watch for a number the member entered. */
export function Kcal({ kcal, estimated }: { kcal: number; estimated: boolean }) {
  return estimated ? (
    <span className="text-muted-foreground" title="Estimated from the activity, time, effort and your weight">≈ {kcal.toLocaleString()} kcal</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-foreground/80" title="Your own number">
      <Watch className="size-3 text-muted-foreground" aria-label="entered by you" />
      {kcal.toLocaleString()} kcal
    </span>
  );
}

/**
 * One activity on the day: icon, name, minutes and calories. Same-type entries
 * share a row; tapping one with several opens them up to edit each. Swipe left
 * (or ×) removes, ↻ logs it again.
 */
export default function ActivityRow({ group, weightKg, onEdit, onRepeat, onRemove }: {
  group: WorkoutGroup;
  weightKg?: number | null;
  onEdit: (w: Workout) => void;
  onRepeat: () => void;
  onRemove: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const many = group.items.length > 1;
  const effort = !many && group.items[0].intensity ? EFFORT_LABEL[group.items[0].intensity] : "";

  const onDown = (e: PointerEvent) => { if (e.pointerType === "touch") start.current = e.clientX; };
  const onMove = (e: PointerEvent) => { if (start.current !== null) setDx(Math.min(0, e.clientX - start.current)); };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (dx < -SWIPE_REMOVE) onRemove(group.items.map((w) => w.id));
    setDx(0);
  };

  return (
    // The red shows only behind a row being swiped away.
    <li className={cn("overflow-hidden rounded-xl", dx < 0 && "bg-destructive/90")}>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={cn("touch-pan-y bg-muted", !dx && "transition-transform")}
      >
        <div className="flex items-center gap-3 py-2 pr-1.5 pl-2.5">
          <button
            type="button"
            onClick={() => (many ? setOpen((o) => !o) : onEdit(group.items[0]))}
            aria-expanded={many ? open : undefined}
            aria-label={many ? `${group.label}, ${group.items.length} entries. Show them` : `Edit ${group.label}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ActivityIcon type={group.type} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-medium">
                <span className="truncate">{group.label}</span>
                {many && <span className="text-xs font-normal text-muted-foreground">×{group.items.length}</span>}
                {many && <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />}
              </span>
              {effort && <span className="block text-xs text-muted-foreground">{effort}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end text-sm tabular-nums">
              <span className="font-medium">{group.minutes} min</span>
              <span className="text-xs"><Kcal kcal={group.kcal} estimated={group.estimated} /></span>
            </span>
          </button>
          <Button variant="ghost" size="icon-sm" onClick={onRepeat} aria-label={`Log ${group.label} again`} title="Log again" className="text-muted-foreground">
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(group.items.map((w) => w.id))}
            aria-label={`Remove ${group.label}${many ? ` (all ${group.items.length})` : ""}`}
            className="text-muted-foreground"
          >
            <X />
          </Button>
        </div>

        {many && open && (
          <ul className="space-y-0.5 border-t border-background/80 px-2.5 py-1.5" aria-label={`${group.label} entries`}>
            {group.items.map((w) => {
              const { kcal, estimated } = workoutKcal(w, weightKg);
              return (
                <li key={w.id} className="flex items-center gap-2 pl-12 text-sm">
                  <button
                    type="button"
                    onClick={() => onEdit(w)}
                    className="flex flex-1 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left tabular-nums hover:bg-background/70"
                    aria-label={`Edit ${group.label}, ${w.minutes} minutes`}
                  >
                    <span>{w.minutes} min{w.intensity && w.intensity !== "moderate" ? ` · ${EFFORT_LABEL[w.intensity]}` : ""}</span>
                    <span className="text-xs"><Kcal kcal={kcal} estimated={estimated} /></span>
                  </button>
                  <Button variant="ghost" size="icon-xs" onClick={() => onRemove([w.id])} aria-label={`Remove this ${w.minutes} minute entry`} className="text-muted-foreground">
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
