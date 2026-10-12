// HabitsView first: quickLog reads its mood options as it loads.
import { CORE_META, REST_SCALE, moodOption, scrollToCard, type HabitCardProps } from "@/components/HabitsView";
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Plus, Sparkles, type LucideIcon } from "lucide-react";
import { CUSTOM_ICONS, HabitIcon, SectionLabel, softCardCls, type HabitHue } from "@/components/HabitCard";
import type { useFoodLog } from "@/hooks/useFoodLog";
import { activityMinutes, completion, EXERCISE_TARGET_MIN, type CoreHabit } from "@/lib/completion";
import { cn } from "@/lib/utils";
import type { HabitData, MealKey } from "@/types";
import { addGlass, bumpCustom, mealForNow, medsTaken, QUICK_MOODS, setMood, takeAllMeds } from "@/phone/quickLog";

const HUE: Record<CoreHabit, HabitHue> = {
  food: "food", exercise: "exercise", water: "water", mood: "mood", medication: "meds", sleep: "sleep",
};
const TITLE: Record<CoreHabit, string> = {
  food: "Food", exercise: "Activity", water: "Water", mood: "Mood", medication: "Medications", sleep: "Sleep",
};

/** A one-tap log: the next data and what to say about it. */
export type QuickLog = (update: (data: HabitData) => HabitData, message: string) => void;

/**
 * The desktop Habits page's "Up next": what's left today as compact rows, each
 * with its quickest action (a glass, a mood, "Took all"), the same one-tap
 * logs as the phone's Today screen. Finished habits fold into "Done". A row's
 * name jumps to its full card further down the page.
 */
export default function UpNext({ data, activeDate, goals, medications, foodLog, onQuick, onLogMeal }: Pick<HabitCardProps, "data" | "activeDate" | "goals" | "medications"> & {
  foodLog: ReturnType<typeof useFoodLog>;
  onQuick: QuickLog;
  onLogMeal: (meal: MealKey) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const { core, custom, done, total } = completion(data, activeDate, goals.water);

  const medList = medications.medications;
  const taken = medsTaken(data, activeDate);
  const eaten = Math.round(
    foodLog.ready && foodLog.items.length
      ? foodLog.items.reduce((s, i) => s + i.calories, 0)
      : data.food.find((e) => e.date === activeDate)?.value ?? 0,
  );
  const water = data.water.find((e) => e.date === activeDate)?.value ?? 0;
  const moodEntry = data.mood.find((e) => e.date === activeDate);
  const mood = moodOption(moodEntry?.value ?? 0, moodEntry?.note);
  const rest = data.sleep.find((e) => e.date === activeDate)?.value ?? 0;
  const activity = activityMinutes(data, activeDate);

  const row = (key: CoreHabit, isDone: boolean): ReactNode => {
    const common = { icon: CORE_META[key].icon, hue: HUE[key], title: TITLE[key], done: isDone, onOpen: () => scrollToCard(`habit-${key}`) };
    switch (key) {
      case "food":
        return (
          <Row key={key} {...common} sub={eaten ? `${eaten.toLocaleString()} of ${Math.round(goals.calories).toLocaleString()} kcal` : "Nothing logged yet"}
            action={<Action onClick={() => onLogMeal(mealForNow())}>Log meal</Action>}
          />
        );
      case "water":
        return (
          <Row key={key} {...common} sub={`${water} of ${goals.water} glasses`}
            action={(
              <Action onClick={() => onQuick((d) => addGlass(d, activeDate), "Glass of water added")} tone="sky" label="Add a glass of water">
                <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" /> Glass
              </Action>
            )}
          />
        );
      case "mood":
        return (
          <Row key={key} {...common} sub={mood ? `Feeling ${mood.label.toLowerCase()}` : "How are you feeling?"}
            below={!isDone && (
              <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Mood">
                {QUICK_MOODS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => onQuick((d) => setMood(d, activeDate, m.key), `Feeling ${m.label.toLowerCase()}, saved`)}
                    className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg bg-foreground/[0.04] text-[11px] font-medium text-foreground/75 transition-colors hover:bg-[var(--mood)] hover:text-[var(--mood-fg)]"
                  >
                    <m.icon className="size-4 text-[var(--mood-fg)]" aria-hidden="true" />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          />
        );
      case "medication": {
        const count = medList.filter((m) => taken[m.id]).length;
        return (
          <Row key={key} {...common}
            sub={count ? `${count} of ${medList.length} taken` : medList.map((m) => m.name).join(", ")}
            action={(
              <Action onClick={() => onQuick((d) => takeAllMeds(d, activeDate, medList.map((m) => m.id)), "Medications ticked off")}>
                Took all
              </Action>
            )}
          />
        );
      }
      case "exercise":
        return (
          <Row key={key} {...common}
            sub={`${activity.total} of ${EXERCISE_TARGET_MIN} min${activity.device ? " · includes your device" : ""}`}
            action={<Action onClick={common.onOpen}>Log</Action>}
          />
        );
      case "sleep":
        return (
          <Row key={key} {...common} sub={rest ? REST_SCALE[rest - 1].label : "How did you sleep?"}
            action={<Action onClick={common.onOpen}>Log</Action>}
          />
        );
    }
  };

  const customRow = (c: (typeof custom)[number]) => {
    const value = c.habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
    return (
      <Row
        key={c.habit.id}
        icon={CUSTOM_ICONS[c.habit.icon] ?? Sparkles}
        hue="custom"
        title={c.habit.name}
        sub={`${value} of ${c.habit.target} ${c.habit.unit}`}
        done={c.done}
        onOpen={() => scrollToCard("habit-custom")}
        action={(
          <Action onClick={() => onQuick((d) => bumpCustom(d, activeDate, c.habit.id), `${c.habit.name} logged`)} label={`Add one to ${c.habit.name}`}>
            <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" /> 1
          </Action>
        )}
      />
    );
  };

  const upNext = [...core.filter((c) => !c.done).map((c) => row(c.key, false)), ...custom.filter((c) => !c.done).map(customRow)];
  const finished = [...core.filter((c) => c.done).map((c) => row(c.key, true)), ...custom.filter((c) => c.done).map(customRow)];
  const left = total - done;

  return (
    <section aria-labelledby="up-next" className="space-y-4">
      <SectionLabel aside={left > 0 && <span className="text-sm text-muted-foreground tabular-nums">{left} to go</span>}>
        <span id="up-next">{left ? "Up next" : "All done"}</span>
      </SectionLabel>

      {upNext.length > 0 ? (
        <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{upNext}</ul>
      ) : (
        <div className={cn("flex items-center gap-3 rounded-2xl bg-white p-4", softCardCls)}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-button text-white" aria-hidden="true"><Check className="size-5" strokeWidth={3} /></span>
          <div>
            <p className="font-semibold">That&apos;s every habit for the day</p>
            <p className="text-sm text-muted-foreground">Change anything you logged in the cards below.</p>
          </div>
        </div>
      )}

      {finished.length > 0 && upNext.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={showDone}
            className="flex h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Done ({finished.length})
            <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} aria-hidden="true" />
          </button>
          {showDone && <ul className="mt-2 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{finished}</ul>}
        </div>
      )}
    </section>
  );
}

/** One habit: its icon, name and progress (click to jump to its card), and the quick action on the right. */
function Row({ icon, hue, title, sub, done, onOpen, action, below }: {
  icon: LucideIcon; hue: HabitHue; title: string; sub: string; done: boolean; onOpen: () => void;
  action?: ReactNode; below?: ReactNode;
}) {
  return (
    <li className={cn("rounded-2xl bg-white px-4 py-3", softCardCls)}>
      <div className="flex min-h-11 items-center gap-3">
        <button onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${title}: ${sub}${done ? ", done" : ""}. Go to the ${title} card`}>
          <span className="relative">
            <HabitIcon icon={icon} hue={hue} className={cn(done && "opacity-70")} />
            {done && (
              <span className="tick-pop absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-button text-white ring-2 ring-white" aria-hidden="true">
                <Check className="size-3" strokeWidth={3.5} />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate font-semibold group-hover:underline", done && "text-foreground/70")}>{title}</span>
            <span className="block truncate text-sm text-muted-foreground">{sub}</span>
          </span>
          {(done || (!action && !below)) && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
        </button>
        {!done && action}
      </div>
      {below}
    </li>
  );
}

function Action({ children, onClick, label, tone = "teal" }: { children: ReactNode; onClick: () => void; label?: string; tone?: "teal" | "sky" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-semibold transition-colors",
        tone === "sky" ? "bg-[#E2EFFC] text-[#1F6AB0] hover:bg-[#D2E5FA]" : "bg-[#DDF5F1] text-[#0A6E63] hover:bg-[#CDEFE9]",
      )}
    >
      {children}
    </button>
  );
}
