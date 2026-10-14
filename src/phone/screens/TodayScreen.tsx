import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Plus, Sparkles, type LucideIcon } from "lucide-react";
import {
  CORE_META, CustomHabitsSection, ExerciseCard, FoodCard, MedicationCard, MoodCard, SleepCard, WaterCard, moodOption, REST_SCALE,
  type HabitCardProps,
} from "@/components/HabitsView";
import { CUSTOM_ICONS, HabitIcon, type HabitHue } from "@/components/HabitCard";
import type { useFoodLog } from "@/hooks/useFoodLog";
import type { ProfileRow } from "@/hooks/useProfile";
import { activityMinutes, completion, EXERCISE_TARGET_MIN, type CoreHabit } from "@/lib/completion";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { HabitData, MealKey } from "@/types";
import MealPicker from "@/phone/MealPicker";
import PlantHero from "@/phone/PlantHero";
import Sheet from "@/phone/Sheet";
import StickyDateBar from "@/phone/StickyDateBar";
import { addGlass, bumpCustom, medsTaken, QUICK_MOODS, setMood, takeAllMeds } from "@/phone/quickLog";

type Detail = CoreHabit | "custom";

const HUE: Record<CoreHabit, HabitHue> = {
  food: "food", exercise: "exercise", water: "water", mood: "mood", medication: "meds", sleep: "sleep",
};
const TITLE: Record<Detail, string> = {
  food: "Food", exercise: "Activity", water: "Water", mood: "Mood", medication: "Medications", sleep: "Sleep", custom: "Your habits",
};

/** A one-tap log: the next data and what to say about it. */
export type QuickLog = (update: (data: HabitData) => HabitData, message: string) => void;

type Props = Omit<HabitCardProps, "onChange"> & {
  /** Saves a change from inside a habit card, as the web page does. */
  onChange: HabitCardProps["onChange"];
  onQuick: QuickLog;
  onDateChange: (date: string) => void;
  profile: ProfileRow;
  foodLog: ReturnType<typeof useFoodLog>;
  onLogMeal: (meal: MealKey) => void;
  hop: number;
  onOpenGarden: () => void;
};

/**
 * The phone's home: the plant and what's left to do today. Each habit is one
 * row with its quickest action on the right (a glass, a mood, "took them"),
 * finished habits fold away, and tapping a row opens its full card in a sheet.
 */
export default function TodayScreen(props: Props) {
  const { data, onChange, onQuick, activeDate, onDateChange, profile, medications, goals, foodLog, onLogMeal, hop, onOpenGarden } = props;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [choosingMeal, setChoosingMeal] = useState(false);
  const { core, custom, done, total } = completion(data, activeDate, goals.water);
  const cardProps: HabitCardProps = { ...props, onChange };

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
    const common = { icon: CORE_META[key].icon, hue: HUE[key], title: TITLE[key], done: isDone, onOpen: () => setDetail(key) };
    switch (key) {
      case "food":
        return (
          <HabitRow key={key} {...common} sub={eaten ? `${eaten.toLocaleString()} of ${Math.round(goals.calories).toLocaleString()} kcal` : "Nothing logged yet"}
            action={<Pill onClick={() => setChoosingMeal(true)}>Log</Pill>}
          />
        );
      case "water":
        return (
          <HabitRow key={key} {...common} sub={`${water} of ${goals.water} glasses`}
            action={<RoundButton label="Add a glass of water" onClick={() => onQuick((d) => addGlass(d, activeDate), "Glass of water added")} tone="sky"><Plus /></RoundButton>}
          />
        );
      case "mood":
        return (
          <HabitRow key={key} {...common} sub={mood ? `Feeling ${mood.label.toLowerCase()}` : "How are you feeling?"}
            below={!isDone && (
              <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Mood">
                {QUICK_MOODS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => onQuick((d) => setMood(d, activeDate, m.key), `Feeling ${m.label.toLowerCase()}, saved`)}
                    className="press flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-foreground/[0.04] text-[11px] font-medium text-foreground/75"
                  >
                    <m.icon className="size-5 text-[var(--mood-fg)]" aria-hidden="true" />
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
          <HabitRow key={key} {...common}
            sub={count ? `${count} of ${medList.length} taken` : medList.map((m) => m.name).join(", ")}
            action={!isDone && (
              <Pill onClick={() => onQuick((d) => takeAllMeds(d, activeDate, medList.map((m) => m.id)), "Medications ticked off")}>
                Took all
              </Pill>
            )}
          />
        );
      }
      case "exercise":
        return (
          <HabitRow key={key} {...common}
            sub={`${activity.total} of ${EXERCISE_TARGET_MIN} min${activity.device ? " · includes your device" : ""}`}
            action={<Pill onClick={() => setDetail("exercise")}>Log</Pill>}
          />
        );
      case "sleep":
        return (
          <HabitRow key={key} {...common} sub={rest ? REST_SCALE[rest - 1].label : "How did you sleep?"}
            action={<Pill onClick={() => setDetail("sleep")}>Log</Pill>}
          />
        );
    }
  };

  // In the morning last night's sleep and how you feel come first; later, food and water lead.
  const morning = new Date().getHours() < 11;
  const order = (k: CoreHabit) => (morning && (k === "sleep" || k === "mood") ? -1 : 0);
  const coreRows = [...core].sort((a, b) => order(a.key) - order(b.key));

  const customRow = (c: (typeof custom)[number]) => {
    const value = c.habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
    return (
      <HabitRow
        key={c.habit.id}
        icon={CUSTOM_ICONS[c.habit.icon] ?? Sparkles}
        hue="custom"
        title={c.habit.name}
        sub={`${value} of ${c.habit.target} ${c.habit.unit}`}
        done={c.done}
        onOpen={() => setDetail("custom")}
        action={!c.done && (
          <RoundButton label={`Add one to ${c.habit.name}`} onClick={() => onQuick((d) => bumpCustom(d, activeDate, c.habit.id), `${c.habit.name} logged`)}>
            <Plus />
          </RoundButton>
        )}
      />
    );
  };

  const upNext = [...coreRows.filter((c) => !c.done).map((c) => row(c.key, false)), ...custom.filter((c) => !c.done).map(customRow)];
  const finished = [...coreRows.filter((c) => c.done).map((c) => row(c.key, true)), ...custom.filter((c) => c.done).map(customRow)];
  const left = total - done;

  return (
    <div className="screen-in">
      <StickyDateBar
        activeDate={activeDate}
        onChange={(d) => { onDateChange(d); window.scrollTo({ top: 0 }); }}
        progress={(date) => {
          const c = completion(data, date, goals.water);
          return c.total ? c.done / c.total : 0;
        }}
      />

      <div className="space-y-6 pt-4">
        <PlantHero data={data} profile={profile} activeDate={activeDate} hop={hop} onOpenGarden={onOpenGarden} />

        <section aria-labelledby="up-next">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 id="up-next" className="text-xl font-semibold tracking-tight">{left ? "Up next" : "All done"}</h2>
            {left > 0 && <span className="text-sm text-muted-foreground tabular-nums">{left} to go</span>}
          </div>
          {upNext.length ? (
            <ul className="space-y-2.5">{upNext}</ul>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white" aria-hidden="true"><Check className="size-5" strokeWidth={3} /></span>
              <div>
                <p className="font-semibold">That&apos;s every habit for the day</p>
                <p className="text-sm text-muted-foreground">Tap a habit below to change what you logged.</p>
              </div>
            </div>
          )}
        </section>

        {finished.length > 0 && (
          <section>
            <button
              onClick={() => setShowDone((s) => !s)}
              aria-expanded={showDone}
              className="flex h-11 w-full items-center gap-2 px-1 text-[15px] font-semibold text-muted-foreground"
            >
              Done ({finished.length})
              <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} aria-hidden="true" />
            </button>
            {(showDone || !upNext.length) && <ul className="mt-1 space-y-2.5">{finished}</ul>}
          </section>
        )}

        <button
          onClick={() => setDetail("custom")}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/15 text-[15px] font-semibold text-primary-ink"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a habit
        </button>
      </div>

      <MealPicker
        open={choosingMeal}
        onClose={() => setChoosingMeal(false)}
        onPick={onLogMeal}
        date={activeDate === todayKey() ? undefined : activeDate === shiftDateKey(todayKey(), -1) ? "yesterday" : new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}
      />

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title={detail ? TITLE[detail] : ""} className="sheet-card" hideTitle={detail !== "custom"}>
        {detail === "food" && <FoodCard {...cardProps} foodLog={foodLog} />}
        {detail === "water" && <WaterCard {...cardProps} />}
        {detail === "mood" && <MoodCard {...cardProps} />}
        {detail === "medication" && <MedicationCard {...cardProps} />}
        {detail === "exercise" && <ExerciseCard {...cardProps} />}
        {detail === "sleep" && <SleepCard {...cardProps} />}
        {detail === "custom" && <CustomHabitsSection {...cardProps} />}
      </Sheet>
    </div>
  );
}

/** One habit: its Fikko icon, name and progress; the quick action on the right; tap to open. */
function HabitRow({ icon, hue, title, sub, done, onOpen, action, below }: {
  icon: LucideIcon; hue: HabitHue; title: string; sub: string; done: boolean; onOpen: () => void;
  action?: ReactNode; below?: ReactNode;
}) {
  return (
    <li className="rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]">
      <div className="flex min-h-12 items-center gap-3">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${title}: ${sub}${done ? ", done" : ""}. Open`}>
          <span className="relative">
            <HabitIcon icon={icon} hue={hue} className={cn(done && "opacity-70")} />
            {done && (
              <span className="tick-pop absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-primary text-white ring-2 ring-white" aria-hidden="true">
                <Check className="size-3" strokeWidth={3.5} />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-base font-semibold", done && "text-foreground/70")}>{title}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
          </span>
          {(!action || done) && <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
        </button>
        {!done && action}
      </div>
      {below}
    </li>
  );
}

function Pill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press h-11 shrink-0 rounded-full bg-primary/10 px-4 text-[15px] font-semibold text-primary-ink"
    >
      {children}
    </button>
  );
}

function RoundButton({ children, onClick, label, tone = "teal" }: { children: ReactNode; onClick: () => void; label: string; tone?: "teal" | "sky" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "press grid size-11 shrink-0 place-items-center rounded-full [&_svg]:size-5 [&_svg]:stroke-[2.5]",
        tone === "sky" ? "bg-[#E6F1FC] text-[#1F73C2]" : "bg-primary/10 text-primary-ink",
      )}
    >
      {children}
    </button>
  );
}
