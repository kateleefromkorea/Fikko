import { useState, type FormEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { activityOf, estimateKcal } from "@/lib/activities";
import { WORKOUT_NAME_MAX, type Intensity } from "@/lib/workouts";
import type { ActivityChoice, WorkoutDraft } from "@/hooks/useActivityLog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ActivityIcon from "./ActivityIcon";

const PRESETS = [15, 30, 45, 60];
const STEP = 5;
const MAX_MINUTES = 600;
const EFFORT: { key: Intensity; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "moderate", label: "Moderate" },
  { key: "hard", label: "Hard" },
];

/** The one place a workout's details are set: how long, how hard, and calories if the member knows them. */
export default function ActivityComposer({
  choice, start, weightKg, editing, onSubmit, onCancel, onDelete, onChangeActivity,
}: {
  choice: ActivityChoice;
  /** Where the fields start: the member's usual for this activity, or the entry being edited. */
  start: Pick<WorkoutDraft, "minutes" | "intensity"> & { kcal?: number | null };
  weightKg?: number | null;
  editing?: boolean;
  onSubmit: (draft: WorkoutDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onChangeActivity: () => void;
}) {
  const activity = activityOf(choice.type);
  const [name, setName] = useState(choice.name);
  const [minutes, setMinutes] = useState(String(start.minutes));
  const [intensity, setIntensity] = useState<Intensity>(start.intensity);
  const [kcal, setKcal] = useState(start.kcal != null ? String(start.kcal) : "");

  const mins = Math.min(MAX_MINUTES, Math.max(0, Math.round(Number(minutes) || 0)));
  const estimate = estimateKcal(choice.type, intensity, mins, weightKg);
  const entered = kcal.trim() !== "" && Number(kcal) >= 0 ? Math.round(Number(kcal)) : null;
  const needsName = choice.type === "other" && !name.trim();
  const valid = mins > 0 && !needsName;

  const step = (by: number) => setMinutes(String(Math.min(MAX_MINUTES, Math.max(STEP, mins + by))));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ type: choice.type, name: choice.type === "other" ? name : "", minutes: mins, intensity, kcal: entered });
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-label={`${editing ? "Edit" : "Log"} ${activity.label}`}>
      <div className="flex items-center gap-3">
        <ActivityIcon type={choice.type} />
        {choice.type === "other" ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={WORKOUT_NAME_MAX}
            placeholder="Name your activity"
            aria-label="Activity name"
            autoFocus={!name}
            className="h-9 flex-1"
          />
        ) : (
          <p className="flex-1 font-semibold">{activity.label}</p>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onChangeActivity} className="h-8 text-muted-foreground">
          Change
        </Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Duration</legend>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => step(-STEP)} aria-label={`${STEP} minutes less`} className="size-10 shrink-0">
            <Minus />
          </Button>
          <div className="relative w-24">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-label="Minutes"
              className="h-10 pr-10 text-center text-base font-semibold tabular-nums md:text-base"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">min</span>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => step(STEP)} aria-label={`${STEP} minutes more`} className="size-10 shrink-0">
            <Plus />
          </Button>
        </div>
        {/* Presets sit on their own row so they never spill out of a narrow card. */}
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMinutes(String(p))}
              aria-pressed={mins === p}
              className="h-8 min-w-0 rounded-full border text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-exercise-strong aria-pressed:bg-exercise aria-pressed:font-medium aria-pressed:text-exercise-fg"
            >
              {p} min
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Effort</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {EFFORT.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => setIntensity(e.key)}
              aria-pressed={intensity === e.key}
              className={cn(
                "h-8 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground",
                intensity === e.key && "bg-card font-medium text-foreground shadow-sm",
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="activity-kcal" className="text-sm font-medium">Calories</label>
        <div className="relative">
          <Input
            id="activity-kcal"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder={`≈ ${estimate}`}
            className="h-10 pr-12 tabular-nums"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">kcal</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {entered != null
            ? "Using your number. Clear it to go back to our estimate."
            : "Estimated from the activity, time, effort and your weight. Got a number from your watch or machine? Enter it instead."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!valid} className="h-10 px-5">{editing ? "Save" : "Log activity"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="h-10">Cancel</Button>
        {onDelete && (
          <Button type="button" variant="ghost" onClick={onDelete} className="ml-auto h-10 text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
