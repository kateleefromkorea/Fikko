import { useState } from "react";
import { Activity, Watch } from "lucide-react";
import { EXERCISE_TARGET_MIN, activityMinutes } from "@/lib/completion";
import { todayKey } from "@/lib/dates";
import type { Workout } from "@/lib/workouts";
import { useActivityLog, type ActivityChoice } from "@/hooks/useActivityLog";
import { GroupLabel, HabitCard } from "../HabitCard";
import { activityComment, momentFor } from "../habitComments";
import type { HabitCardProps } from "../HabitsView";
import ActivityChips from "./ActivityChips";
import ActivityComposer from "./ActivityComposer";
import ActivityList from "./ActivityList";
import ActivityPicker from "./ActivityPicker";
import ActivityProgress from "./ActivityProgress";
import ActivityTotals from "./ActivityTotals";

type Composer = { choice: ActivityChoice; editing?: Workout } | null;

/**
 * The Activity habit. Pick an activity (your most logged come first), adjust
 * the minutes, effort or calories, and log it: one tap and a confirm, or press
 * and hold a chip to log your usual. A wearable's minutes and calories count too.
 */
export default function ActivityCard({ data, onChange, activeDate, biometrics, goals }: HabitCardProps) {
  const at = <T,>(list: { date: string; value: T }[] | undefined) => list?.find((e) => e.date === activeDate)?.value ?? null;
  const steps = at(biometrics?.steps);
  const deviceKcal = at(biometrics?.activeCalories);
  const standHours = at(biometrics?.standHours);
  const vo2 = at(biometrics?.vo2max);
  const hasDevice = (biometrics?.activeMinutes?.length ?? 0) > 0 || steps !== null;

  const { device, logged, total } = activityMinutes(data, activeDate);
  const log = useActivityLog({ data, onChange, date: activeDate, weightKg: goals.weightKg, deviceKcal });

  const [composer, setComposer] = useState<Composer>(null);
  const [picking, setPicking] = useState(false);

  const openComposer = (choice: ActivityChoice) => { setComposer((c) => ({ choice, editing: c?.editing })); setPicking(false); };
  const edit = (w: Workout) => setComposer({ choice: { type: w.type, name: w.name }, editing: w });

  return (
    <HabitCard
      id="habit-exercise"
      icon={Activity}
      hue="exercise"
      title="Activity"
      description={`Goal ${EXERCISE_TARGET_MIN} active minutes`}
      action={<ActivityTotals minutes={total} kcal={log.burn.total} estimated={log.burn.estimated} />}
      done={total >= EXERCISE_TARGET_MIN}
      comment={activityComment({ minutes: total, target: EXERCISE_TARGET_MIN, steps }, momentFor(activeDate, todayKey()))}
    >
      <div className="space-y-5">
        <ActivityProgress logged={logged} device={device} goal={EXERCISE_TARGET_MIN} />

        <ActivityList
          groups={log.groups}
          device={{ minutes: device, kcal: log.burn.device }}
          weightKg={goals.weightKg}
          removed={log.removed}
          onEdit={edit}
          onRepeat={log.repeat}
          onRemove={(ids) => { log.remove(ids); if (composer?.editing && ids.includes(composer.editing.id)) setComposer(null); }}
          onUndo={log.undo}
        />

        <div className="space-y-3">
          <GroupLabel>{hasDevice ? "Add what your wearable missed" : "Add activity"}</GroupLabel>
          {composer ? (
            <ActivityComposer
              key={`${composer.editing?.id ?? "new"}:${composer.choice.type}:${composer.choice.name}`}
              choice={composer.choice}
              start={composer.editing
                ? { minutes: composer.editing.minutes, intensity: composer.editing.intensity ?? "moderate", kcal: composer.editing.kcal }
                : log.usualFor(composer.choice)}
              weightKg={goals.weightKg}
              editing={!!composer.editing}
              onSubmit={(d) => {
                if (composer.editing) log.update(composer.editing.id, d);
                else log.add(d);
                setComposer(null);
              }}
              onCancel={() => setComposer(null)}
              onDelete={composer.editing ? () => { log.remove([composer.editing!.id]); setComposer(null); } : undefined}
              onChangeActivity={() => setPicking(true)}
            />
          ) : log.full ? (
            <p className="text-sm text-muted-foreground">That's the most activities one day can hold. Edit one above to add more time.</p>
          ) : (
            <>
              <ActivityChips
                chips={log.chips}
                selected={null}
                onPick={(choice) => setComposer({ choice })}
                onQuickLog={(choice) => log.add({ ...choice, ...log.usualFor(choice), kcal: null })}
                onMore={() => setPicking(true)}
              />
              <p className="text-xs text-muted-foreground">Tip: press and hold an activity to log your usual in one go.</p>
            </>
          )}
        </div>
      </div>

      {picking && <ActivityPicker onPick={openComposer} onClose={() => setPicking(false)} />}

      {steps !== null ? (
        <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-6 text-sm">
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Steps</dt><dd className="font-medium tabular-nums">{steps.toLocaleString()}</dd></div>
          {standHours !== null && <div className="flex gap-1.5"><dt className="text-muted-foreground">Stand</dt><dd className="font-medium tabular-nums">{standHours}h</dd></div>}
          {vo2 !== null && <div className="flex gap-1.5"><dt className="text-muted-foreground">VO₂ max</dt><dd className="font-medium tabular-nums">{vo2}</dd></div>}
        </dl>
      ) : (
        <p className="mt-auto flex items-center gap-1.5 pt-6 text-xs text-muted-foreground">
          <Watch className="size-3.5 shrink-0" aria-hidden="true" />
          Connect a wearable in Profile and its minutes and calories show up here.
        </p>
      )}
    </HabitCard>
  );
}
