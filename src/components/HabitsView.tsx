import { useRef, useState } from "react";
import {
  Activity, Annoyed, Apple, BedDouble, Brain, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, Droplet, Dumbbell,
  Frown, Laugh, Meh, Moon, Pill, Plus, Smartphone, Smile, SmilePlus, Sparkles, Sun, Sunrise, Sunset, Thermometer,
  Trash2, Utensils, Volume2, Watch, Wine, X, type LucideIcon,
} from "lucide-react";
import { DB_LIMITS, clamp } from "../lib/limits";
import { completion, EXERCISE_TARGET_MIN, type CoreHabit } from "../lib/completion";
import type { HabitData, BiometricData, HabitEntry, CustomHabit, MealKey, TimeOfDay } from "../types";
import type { useMedications } from "../hooks/useMedications";
import { useFoodLog } from "../hooks/useFoodLog";
import { useCustomFoods } from "../hooks/useCustomFoods";
import FoodLogModal from "./FoodLogModal";
import ProgressRing from "./ProgressRing";
import {
  CUSTOM_ICONS, CustomHabitIcon, DoneBadge, EmptyState, Figure, GroupLabel, HabitBar, HabitCard, Hint, HueStrip,
  SectionLabel, habitCardCls, useMounted,
} from "./HabitCard";
import CommunityPreview from "./CommunityPreview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function greeting(name: string) {
  const firstName = name.trim().split(/\s+/)[0];
  return firstName ? `${timeGreeting()}, ${firstName}` : timeGreeting();
}

function progressSubtitle(done: number, total: number, isToday: boolean) {
  if (!isToday) return `${done} of ${total} habits done that day.`;
  if (total === 0 || done === 0) return "How are you doing today?";
  if (done >= total) return "You've completed everything today. Lovely work.";
  return `${done} of ${total} habits done today. Keep going.`;
}

type Medications = ReturnType<typeof useMedications>;

interface Props {
  data: HabitData;
  onChange: (data: HabitData) => void;
  activeDate: string;
  biometrics: BiometricData;
  medications: Medications;
  userId: string | null;
  profileName: string;
}

const TODAY = new Date().toISOString().split("T")[0];

function getEntry(entries: HabitEntry[], date: string): HabitEntry | undefined {
  return entries.find((e) => e.date === date);
}

function setDateValue(entries: HabitEntry[], date: string, value: number, note?: string): HabitEntry[] {
  const existing = entries.find((e) => e.date === date);
  if (existing) return entries.map((e) => e.date === date ? { ...e, value, ...(note !== undefined ? { note } : {}) } : e);
  return [...entries, { date, value, ...(note !== undefined ? { note } : {}) }];
}

/** Shared look for a selectable option: neutral at rest, Fikko green when chosen. */
const optionCls =
  "rounded-lg border bg-card text-left transition-colors hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Today summary ─── */
const CORE_META: Record<CoreHabit, { label: string; icon: LucideIcon }> = {
  food:       { label: "Calories",    icon: Utensils },
  exercise:   { label: "Activity",    icon: Activity },
  water:      { label: "Water",       icon: Droplet },
  mood:       { label: "Mood",        icon: SmilePlus },
  medication: { label: "Medications", icon: Pill },
  sleep:      { label: "Sleep",       icon: Moon },
};

function scrollToCard(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

function HabitChip({ icon: Icon, label, done, onClick }: { icon: LucideIcon; label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        done
          ? "border-primary/25 bg-white font-medium text-primary shadow-sm"
          : "border-white/80 bg-white/50 text-muted-foreground hover:bg-white/80",
      )}
    >
      {done
        ? <Check key="done" className="tick-pop size-3.5" strokeWidth={3} aria-hidden="true" />
        : <Icon className="size-3.5" aria-hidden="true" />}
      {label}
      <span className="sr-only">{done ? ", done" : ", not done yet"}</span>
    </button>
  );
}

function TodaySummary({ data, activeDate, onDateChange, profileName }: {
  data: HabitData; activeDate: string; onDateChange: (d: string) => void; profileName: string;
}) {
  const { core, custom, done, total } = completion(data, activeDate);
  const isToday = activeDate === TODAY;
  const dateLabel = new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <section className="fresh-panel overflow-hidden rounded-2xl border border-teal/20 p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">
          {isToday ? `Today · ${dateLabel}` : dateLabel}
        </p>
        <DateNavigator activeDate={activeDate} onChange={onDateChange} />
      </div>

      <div className="mt-6 grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{greeting(profileName)}</h1>
          <p className="mt-3 text-lg text-foreground/70">{progressSubtitle(done, total, isToday)}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {core.map(({ key, done }) => (
              <HabitChip
                key={key}
                icon={CORE_META[key].icon}
                label={CORE_META[key].label}
                done={done}
                onClick={() => scrollToCard(`habit-${key}`)}
              />
            ))}
            {custom.map(({ habit, done }) => (
              <HabitChip
                key={habit.id}
                icon={CUSTOM_ICONS[habit.icon] ?? Sparkles}
                label={habit.name}
                done={done}
                onClick={() => scrollToCard("habit-custom")}
              />
            ))}
          </div>
        </div>

        <ProgressRing
          value={total ? done / total : 0}
          size={148}
          stroke={12}
          label={`${done} of ${total} habits done`}
          className="justify-self-center rounded-full bg-white/60 shadow-sm md:justify-self-end"
        >
          <div>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {done}
              <span className="text-xl text-muted-foreground">/{total}</span>
            </p>
            <p className="text-xs text-muted-foreground">done</p>
          </div>
        </ProgressRing>
      </div>
    </section>
  );
}

/* ─── Calorie Tracker ─── */
interface MealCalories { breakfast: number; lunch: number; dinner: number; snacks: number; }

// Amber shades, deepest first, so the ring reads breakfast → snacks.
const MEALS: { key: MealKey; label: string; icon: LucideIcon; color: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: Sunrise, color: "#E08E0B" },
  { key: "lunch",     label: "Lunch",     icon: Sun,     color: "#F5A623" },
  { key: "dinner",    label: "Dinner",    icon: Sunset,  color: "#F8C063" },
  { key: "snacks",    label: "Snacks",    icon: Apple,   color: "#FBD89C" },
];

function FoodCard({ data, onChange, activeDate, userId }: Props) {
  const entry = getEntry(data.food, activeDate);
  const meals: MealCalories = entry?.note
    ? (JSON.parse(entry.note) as MealCalories)
    : { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };

  const foodLog = useFoodLog(userId, activeDate, data, onChange);
  const customFoods = useCustomFoods(userId);
  const [openMeal, setOpenMeal] = useState<MealKey | null>(null);

  const target = 2000;
  const total = meals.breakfast + meals.lunch + meals.dinner + meals.snacks;
  const overTarget = total > target;
  // Past the target the ring is scaled to the total, so it stays full and
  // still shows each meal's share.
  const scale = Math.max(total, target);

  const foodComment = total === 0
    ? "Nothing logged yet. Pick a meal to get started."
    : overTarget
      ? `${Math.round(total - target).toLocaleString()} kcal over today's target.`
      : `${Math.round(target - total).toLocaleString()} kcal left to reach your target.`;

  return (
    <HabitCard
      id="habit-food"
      icon={Utensils}
      hue="food"
      title="Calories"
      description={`Daily target ${target.toLocaleString()} kcal`}
      done={total > 0}
    >
      <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <ProgressRing
            size={168}
            stroke={14}
            segments={MEALS.map((m) => ({ value: (meals[m.key] ?? 0) / scale, color: m.color }))}
            label={`${Math.round(total)} of ${target} kcal`}
          >
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{Math.round(total).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">of {target.toLocaleString()} kcal</p>
            </div>
          </ProgressRing>
          <p className={cn("max-w-48 text-center text-sm text-muted-foreground", overTarget && "text-amber-700")}>{foodComment}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MEALS.map(({ key, label, icon: Icon, color }) => {
            const val = meals[key] ?? 0;
            const itemCount = foodLog.items.filter((i) => i.meal === key).length;
            return (
              <div key={key} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {Math.round(val)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
                </p>
                <Button variant="outline" className="mt-auto h-9" onClick={() => setOpenMeal(key)}>
                  <Plus />
                  {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Log food"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {openMeal && (
        <FoodLogModal
          meal={openMeal}
          mealLabel={MEALS.find((m) => m.key === openMeal)!.label}
          items={foodLog.items.filter((i) => i.meal === openMeal)}
          savedFoods={customFoods.foods}
          onAdd={(food) => foodLog.addItem(openMeal, food)}
          onUpdateGrams={foodLog.updateGrams}
          onDelete={foodLog.deleteItem}
          onSaveFood={customFoods.saveFood}
          onClose={() => setOpenMeal(null)}
        />
      )}
    </HabitCard>
  );
}

/* ─── Exercise ─── */
const QUICK_MINUTES = [10, 20, 30];

function ExerciseCard({ data, onChange, activeDate, biometrics }: Props) {
  const minutes    = getEntry(data.exercise, activeDate)?.value ?? 0;
  const steps      = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const activeCal  = biometrics?.activeCalories?.find((e) => e.date === activeDate)?.value ?? null;
  const standHours = biometrics?.standHours?.find((e) => e.date === activeDate)?.value ?? null;
  const vo2        = biometrics?.vo2max?.find((e) => e.date === activeDate)?.value ?? null;

  const setMinutes = (n: number) =>
    onChange({ ...data, exercise: setDateValue(data.exercise, activeDate, clamp(n, DB_LIMITS.habitValue)) });

  const done = minutes >= EXERCISE_TARGET_MIN;

  return (
    <HabitCard
      id="habit-exercise"
      icon={Activity}
      hue="exercise"
      title="Activity"
      description={`Goal ${EXERCISE_TARGET_MIN} active minutes`}
      action={<Figure value={minutes} unit="min" />}
      done={done}
    >
      <div className="space-y-2">
        <HabitBar value={minutes} max={EXERCISE_TARGET_MIN} hue="exercise" />
        <Hint>{done ? "Movement goal reached." : `${EXERCISE_TARGET_MIN - minutes} minutes to go.`}</Hint>
      </div>

      <div className="mt-6 space-y-3">
        <GroupLabel>Log a workout</GroupLabel>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_MINUTES.map((m) => (
            <Button key={m} variant="outline" onClick={() => setMinutes(minutes + m)} className="h-9">
              +{m} min
            </Button>
          ))}
        </div>
        {minutes > 0 && (
          <Button variant="link" onClick={() => setMinutes(0)} className="h-auto p-0 text-muted-foreground">
            Clear today's minutes
          </Button>
        )}
      </div>

      {steps !== null ? (
        <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
          <Stat value={steps.toLocaleString()} label="Steps" />
          {activeCal !== null && <Stat value={activeCal} label="Active kcal" />}
          {standHours !== null && <Stat value={`${standHours}h`} label="Stand hrs" />}
          {vo2 !== null && <Stat value={vo2} label="VO₂ max" />}
        </div>
      ) : (
        <p className="mt-auto flex items-center gap-2 pt-6 text-xs text-muted-foreground">
          <Watch className="size-3.5 shrink-0" aria-hidden="true" />
          Steps and heart rate will show here once wearable sync arrives.
        </p>
      )}
    </HabitCard>
  );
}

/* ─── Water ─── */
function WaterCard({ data, onChange, activeDate, biometrics }: Props) {
  const mounted = useMounted();
  const glasses = getEntry(data.water, activeDate)?.value ?? 0;
  const set = (n: number) => onChange({ ...data, water: setDateValue(data.water, activeDate, n) });

  const steps = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const nudgeTarget = steps !== null && steps > 10000 ? 10 : 8;
  const nudgeMsg = steps !== null && steps > 10000
    ? `You walked ${steps.toLocaleString()} steps today, so aim for ${nudgeTarget} glasses.`
    : glasses >= nudgeTarget
      ? "Target reached. Nicely hydrated."
      : `${nudgeTarget - glasses} more to reach your target. Tap a glass to fill it.`;

  return (
    <HabitCard
      id="habit-water"
      icon={Droplet}
      hue="water"
      title="Water"
      description={`Target ${nudgeTarget} glasses`}
      action={<Figure value={glasses} unit={`/ ${nudgeTarget}`} />}
      done={glasses >= nudgeTarget}
    >
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${nudgeTarget}, minmax(0, 1fr))` }}>
        {Array.from({ length: nudgeTarget }).map((_, i) => {
          const filled = i < glasses;
          return (
            <button
              key={i}
              onClick={() => set(filled ? i : i + 1)}
              aria-label={filled ? `Remove glass ${i + 1}` : `Log glass ${i + 1}`}
              aria-pressed={filled}
              className={cn(
                "relative h-16 overflow-hidden rounded-t-sm rounded-b-xl border-2 transition-colors",
                filled ? "border-water/50" : "border-border hover:border-water/40 hover:bg-water/5",
              )}
            >
              <span
                className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  height: filled && mounted ? "100%" : "0%",
                  transitionDelay: filled ? `${i * 40}ms` : "0ms",
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--water) 35%, white), var(--water))",
                }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <div className="mt-auto pt-6">
        <Hint>{nudgeMsg}</Hint>
      </div>
    </HabitCard>
  );
}

/* ─── Medications & Supplements ─── */
const TIME_SLOTS: { key: TimeOfDay; label: string; icon: LucideIcon }[] = [
  { key: "breakfast", label: "Morning", icon: Sunrise },
  { key: "midday",    label: "Midday",  icon: Sun },
  { key: "night",     label: "Night",   icon: Moon },
];

function MedicationCard({ data, onChange, activeDate, medications }: Props) {
  const { medications: medList, addMedication, removeMedication, updateTimeOfDay } = medications;
  const [newMed, setNewMed] = useState("");
  const [newSlot, setNewSlot] = useState<TimeOfDay>("breakfast");
  const [adding, setAdding] = useState(false);

  const entry = getEntry(data.medication, activeDate);
  const checkedRaw: Record<string, boolean> = entry?.note ? JSON.parse(entry.note) : {};
  const checkedCount = medList.filter((m) => checkedRaw[m.id]).length;
  const allTaken = medList.length > 0 && checkedCount === medList.length;

  // The day's value is 1 only once everything scheduled is ticked, so the
  // habit (and the dashboard's adherence figure) means "took it all".
  const save = (checked: Record<string, boolean>, list: typeof medList) => {
    const count = list.filter((m) => checked[m.id]).length;
    const value = list.length > 0 && count === list.length ? 1 : 0;
    onChange({ ...data, medication: setDateValue(data.medication, activeDate, value, JSON.stringify(checked)) });
  };

  const toggleMed = (id: string) => save({ ...checkedRaw, [id]: !checkedRaw[id] }, medList);

  const addMed = () => {
    const name = newMed.trim();
    if (!name || medList.some((m) => m.name === name)) return;
    addMedication(name, newSlot);
    setNewMed("");
    setNewSlot("breakfast");
    setAdding(false);
  };

  const removeMed = (id: string) => {
    removeMedication(id);
    const updated = { ...checkedRaw };
    delete updated[id];
    save(updated, medList.filter((m) => m.id !== id));
  };

  const addForm = (
    <div className="space-y-3">
      <Input
        value={newMed}
        onChange={(e) => setNewMed(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addMed(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Medication or supplement"
        aria-label="Medication or supplement name"
        autoFocus
        className="h-9"
      />
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Time of day">
        {TIME_SLOTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setNewSlot(s.key)}
            aria-pressed={newSlot === s.key}
            className={cn(optionCls, "flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium")}
          >
            <s.icon className="size-3.5" aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={addMed} className="h-9 px-4">Add</Button>
        <Button variant="ghost" onClick={() => setAdding(false)} className="h-9 px-4">Cancel</Button>
      </div>
    </div>
  );

  return (
    <HabitCard
      id="habit-medication"
      icon={Pill}
      hue="meds"
      title="Medications"
      description={medList.length ? `${checkedCount} of ${medList.length} taken` : "Build a daily schedule"}
      action={medList.length ? <Figure value={checkedCount} unit={`/ ${medList.length}`} /> : undefined}
      done={allTaken}
    >
      {medList.length === 0 && !adding ? (
        <EmptyState icon={Pill} title="Nothing scheduled yet" body="Add what you take and tick it off each day.">
          <Button variant="outline" onClick={() => setAdding(true)} className="h-9">
            <Plus />
            Add medication
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex-1 space-y-5">
            {TIME_SLOTS.map(({ key, label, icon: Icon }) => {
              const slotMeds = medList.filter((m) => m.time_of_day === key);
              if (slotMeds.length === 0) return null;
              return (
                <div key={key} className="space-y-2">
                  <GroupLabel className="flex items-center gap-1.5">
                    <Icon className="size-3.5" aria-hidden="true" /> {label}
                  </GroupLabel>
                  <ul className="space-y-1">
                    {slotMeds.map((med) => {
                      const checked = !!checkedRaw[med.id];
                      const id = `med-${med.id}`;
                      return (
                        <li key={med.id} className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
                          <Checkbox id={id} checked={checked} onCheckedChange={() => toggleMed(med.id)} />
                          <Label
                            htmlFor={id}
                            className={cn("flex-1 cursor-pointer font-normal", checked && "text-muted-foreground line-through")}
                          >
                            {med.name}
                          </Label>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                            <Select value={med.time_of_day} onValueChange={(v) => updateTimeOfDay(med.id, v as TimeOfDay)}>
                              <SelectTrigger size="sm" className="h-7 text-xs" aria-label={`Time of day for ${med.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeMed(med.id)}
                              aria-label={`Remove ${med.name}`}
                              className="text-muted-foreground"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <Separator className="my-5" />
          {adding ? addForm : (
            <Button variant="outline" onClick={() => setAdding(true)} className="h-9 w-full border-dashed text-muted-foreground">
              <Plus />
              Add medication or supplement
            </Button>
          )}
        </>
      )}
    </HabitCard>
  );
}

/* ─── Sleep ─── */
const REST_SCALE = [
  { value: 1, label: "Exhausted",    sub: "Felt no benefit" },
  { value: 2, label: "Still tired",  sub: "Needed more rest" },
  { value: 3, label: "Okay",         sub: "Somewhat refreshed" },
  { value: 4, label: "Rested",       sub: "Woke up feeling good" },
  { value: 5, label: "Fully rested", sub: "Ready to go" },
];

const SLEEP_FACTORS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "caffeine",  label: "Caffeine",     icon: Coffee },
  { id: "screens",   label: "Late screens", icon: Smartphone },
  { id: "stress",    label: "Stress",       icon: Brain },
  { id: "exercise",  label: "Exercise",     icon: Dumbbell },
  { id: "alcohol",   label: "Alcohol",      icon: Wine },
  { id: "noise",     label: "Noise",        icon: Volume2 },
  { id: "heat",      label: "Too warm",     icon: Thermometer },
  { id: "nap",       label: "Napped",       icon: BedDouble },
];

interface SleepNote { bedtime?: string; wake?: string; factors?: string[]; }

function parseSleepNote(raw?: string): SleepNote {
  if (!raw) return {};
  try { return JSON.parse(raw) as SleepNote; } catch { return {}; }
}

function SleepCard({ data, onChange, activeDate, biometrics }: Props) {
  const entry     = getEntry(data.sleep, activeDate);
  const restScore = entry?.value ?? 0;
  const note      = parseSleepNote(entry?.note);

  const saveNote = (patch: Partial<SleepNote>, newRestScore?: number) => {
    const merged = { ...note, ...patch };
    onChange({ ...data, sleep: setDateValue(data.sleep, activeDate, newRestScore ?? restScore, JSON.stringify(merged)) });
  };

  const setRest  = (v: number) => saveNote({}, v);
  const setTime  = (field: "bedtime" | "wake", val: string) => saveNote({ [field]: val });
  const toggleFactor = (id: string) => {
    const cur = note.factors ?? [];
    saveNote({ factors: cur.includes(id) ? cur.filter((f) => f !== id) : [...cur, id] });
  };

  const remH   = biometrics?.sleepRem?.find((e) => e.date === activeDate)?.value ?? null;
  const deepH  = biometrics?.sleepDeep?.find((e) => e.date === activeDate)?.value ?? null;
  const coreH  = biometrics?.sleepCore?.find((e) => e.date === activeDate)?.value ?? null;
  const totalH = remH !== null && deepH !== null && coreH !== null
    ? parseFloat((remH + deepH + coreH).toFixed(1)) : null;
  const hrv    = biometrics?.hrv?.find((e) => e.date === activeDate)?.value ?? null;
  const rec    = biometrics?.recoveryScore?.find((e) => e.date === activeDate)?.value ?? null;
  const hr     = biometrics?.heartRate?.find((e) => e.date === activeDate)?.value ?? null;

  const stageData = totalH !== null
    ? [
        { label: "REM",  hours: remH!,  pct: Math.round((remH! / totalH) * 100) },
        { label: "Deep", hours: deepH!, pct: Math.round((deepH! / totalH) * 100) },
        { label: "Core", hours: coreH!, pct: Math.round((coreH! / totalH) * 100) },
      ]
    : [];

  const sleepComment = totalH === null
    ? "How did last night go?"
    : totalH >= 7
      ? "Solid night, in a healthy sleep range."
      : totalH >= 5
        ? "A bit short. Try to wind down earlier tonight."
        : "Low sleep total. Prioritise rest tonight if you can.";

  return (
    <HabitCard
      id="habit-sleep"
      icon={Moon}
      hue="sleep"
      title="Sleep"
      description={sleepComment}
      action={totalH !== null ? <Figure value={totalH} unit="h" /> : undefined}
      done={restScore >= 3}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Wearable read-out */}
        <div className="flex flex-col gap-4">
          <GroupLabel>Wearable</GroupLabel>
          {totalH !== null ? (
            <>
              <div className="space-y-3">
                {stageData.map((s) => (
                  <div key={s.label} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">{s.hours}h · {s.pct}%</span>
                    </div>
                    <HabitBar value={s.pct} max={100} hue="sleep" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {hrv !== null && <Stat value={hrv} label="HRV ms" />}
                {rec !== null && <Stat value={rec} label="Recovery" />}
                {hr !== null && <Stat value={hr} label="Resting HR" />}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Watch}
              title="No wearable data yet"
              body="Sleep stages, HRV and recovery will show here once sync arrives."
            />
          )}
        </div>

        {/* Restedness */}
        <div className="flex flex-col gap-4">
          <GroupLabel>{totalH !== null ? `After ${totalH}h, how rested do you feel?` : "How rested do you feel?"}</GroupLabel>
          <div className="flex flex-col gap-2" role="group" aria-label="How rested you feel">
            {REST_SCALE.map((r) => (
              <button
                key={r.value}
                onClick={() => setRest(r.value)}
                aria-pressed={restScore === r.value}
                className={cn(optionCls, "group flex items-center gap-3 px-4 py-2.5")}
              >
                <span className="w-4 text-center text-sm text-muted-foreground tabular-nums group-aria-pressed:text-primary">
                  {r.value}
                </span>
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Context: timing + factors */}
        <div className="flex flex-col gap-4">
          <GroupLabel>Sleep context</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bedtime" className="text-muted-foreground">Bedtime</Label>
              <Input id="bedtime" type="time" value={note.bedtime ?? ""} onChange={(e) => setTime("bedtime", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wake" className="text-muted-foreground">Wake time</Label>
              <Input id="wake" type="time" value={note.wake ?? ""} onChange={(e) => setTime("wake", e.target.value)} className="h-9" />
            </div>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">What affected your sleep?</p>
          <div className="grid grid-cols-2 gap-2">
            {SLEEP_FACTORS.map((f) => (
              <button
                key={f.id}
                onClick={() => toggleFactor(f.id)}
                aria-pressed={(note.factors ?? []).includes(f.id)}
                className={cn(optionCls, "flex items-center gap-2 px-3 py-2 text-sm")}
              >
                <f.icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </HabitCard>
  );
}

/* ─── Mood ─── */
const MOODS: { value: number; icon: LucideIcon; label: string; note: string }[] = [
  { value: 1, icon: Frown,   label: "Rough", note: "Rough days happen. Be gentle with yourself." },
  { value: 2, icon: Annoyed, label: "Meh",   note: "A so-so day. A short walk can help." },
  { value: 3, icon: Meh,     label: "Okay",  note: "Steady. That counts." },
  { value: 4, icon: Smile,   label: "Good",  note: "Glad it's a good one." },
  { value: 5, icon: Laugh,   label: "Great", note: "Love that. Enjoy it." },
];

function MoodCard({ data, onChange, activeDate, biometrics }: Props) {
  const mood = getEntry(data.mood, activeDate)?.value ?? 0;
  const set = (v: number) => onChange({ ...data, mood: setDateValue(data.mood, activeDate, v) });
  const rec = biometrics?.recoveryScore?.find((e) => e.date === activeDate)?.value ?? null;
  const current = MOODS.find((m) => m.value === mood);

  return (
    <HabitCard
      id="habit-mood"
      icon={SmilePlus}
      hue="mood"
      title="Mood"
      description={current ? `Feeling ${current.label.toLowerCase()}` : "How are you feeling today?"}
      done={mood > 0}
    >
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Mood">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => set(m.value)}
            aria-pressed={mood === m.value}
            className={cn(optionCls, "flex flex-col items-center gap-2 px-1 py-4 text-center")}
          >
            <m.icon className="size-6" aria-hidden="true" />
            <span className="text-xs font-medium">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto space-y-4 pt-6">
        {rec !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recovery</span>
              <span className="font-medium tabular-nums">{rec}/100</span>
            </div>
            <HabitBar value={rec} max={100} hue="mood" />
          </div>
        )}
        <Hint>{current ? current.note : "One tap is all it takes."}</Hint>
      </div>
    </HabitCard>
  );
}

/* ─── Custom Habits ─── */
const ICON_KEYS = Object.keys(CUSTOM_ICONS);
const EMPTY_FORM = { name: "", unit: "times", target: 1, icon: ICON_KEYS[0] };

const SUGGESTIONS = [
  { name: "Read", unit: "pages", target: 10, icon: "book" },
  { name: "Stretch", unit: "minutes", target: 10, icon: "strength" },
  { name: "Time outside", unit: "minutes", target: 30, icon: "nature" },
];

function CustomHabitTile({ habit, activeDate, logValue, onLogValue, onLog, onDelete }: {
  habit: CustomHabit;
  activeDate: string;
  logValue: string;
  onLogValue: (v: string) => void;
  onLog: () => void;
  onDelete: () => void;
}) {
  const todayVal = habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
  const done = todayVal >= habit.target;
  return (
    <Card className={cn(habitCardCls(done), "[--card-spacing:--spacing(5)]")}>
      <HueStrip hue="custom" />
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-3">
          <CustomHabitIcon icon={habit.icon} className="size-9" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{habit.name}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${habit.name}`}
            className="-mr-1 text-muted-foreground"
          >
            <X />
          </Button>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {todayVal}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">/ {habit.target} {habit.unit}</span>
          </p>
          {done && <DoneBadge className="mb-1.5" />}
        </div>
        <HabitBar value={todayVal} max={habit.target} hue="custom" />
        <div className="mt-auto flex gap-2">
          <Input
            value={logValue}
            onChange={(e) => onLogValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLog()}
            placeholder={`Add ${habit.unit}`}
            aria-label={`Amount of ${habit.unit} to add to ${habit.name}`}
            type="number"
            min="0"
            className="h-8"
          />
          <Button variant="outline" onClick={onLog} className="h-8 px-3">Log</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomHabitsSection({ data, onChange, activeDate }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logInput, setLogInput] = useState<Record<string, string>>({});

  const openWith = (preset?: typeof EMPTY_FORM) => {
    setForm(preset ?? EMPTY_FORM);
    setAdding(true);
  };

  const saveHabit = () => {
    if (!form.name.trim()) return;
    onChange({ ...data, custom: [...data.custom, { id: crypto.randomUUID(), name: form.name.trim().slice(0, DB_LIMITS.nameLength), unit: form.unit, target: clamp(form.target, DB_LIMITS.habitValue), color: "#374151", icon: form.icon, entries: [] }] });
    setForm(EMPTY_FORM);
    setAdding(false);
  };

  const logCustom = (habit: CustomHabit) => {
    const n = parseFloat(logInput[habit.id] ?? "");
    if (isNaN(n)) return;
    const cur = habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
    const next = clamp(cur + n, DB_LIMITS.habitValue);
    onChange({ ...data, custom: data.custom.map((h) => h.id === habit.id ? { ...h, entries: setDateValue(h.entries, activeDate, next) } : h) });
    setLogInput((prev) => ({ ...prev, [habit.id]: "" }));
  };

  const deleteHabit = (id: string) => onChange({ ...data, custom: data.custom.filter((h) => h.id !== id) });

  return (
    <section id="habit-custom" className="scroll-mt-24 space-y-4">
      <SectionLabel>Your own habits</SectionLabel>

      {data.custom.length === 0 ? (
        <Card className="[--card-spacing:--spacing(6)]">
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Track anything you can count"
              body="Pages read, minutes stretched, time outside. Start from an idea or make your own."
              className="border-0 py-6"
            >
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => {
                  const Icon = CUSTOM_ICONS[s.icon];
                  return (
                    <Button key={s.name} variant="outline" onClick={() => openWith(s)} className="h-9 rounded-full px-4">
                      <Icon className="text-muted-foreground" />
                      {s.name}
                    </Button>
                  );
                })}
                <Button onClick={() => openWith()} className="h-9 rounded-full px-4">
                  <Plus />
                  New habit
                </Button>
              </div>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data.custom.map((habit) => (
            <CustomHabitTile
              key={habit.id}
              habit={habit}
              activeDate={activeDate}
              logValue={logInput[habit.id] ?? ""}
              onLogValue={(v) => setLogInput({ ...logInput, [habit.id]: v })}
              onLog={() => logCustom(habit)}
              onDelete={() => deleteHabit(habit.id)}
            />
          ))}
          <button
            onClick={() => openWith()}
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-white/60 hover:text-primary"
          >
            <Plus className="size-5" aria-hidden="true" />
            New habit
          </button>
        </div>
      )}

      <Dialog open={adding} onOpenChange={(open) => { setAdding(open); if (!open) setForm(EMPTY_FORM); }}>
        <DialogContent className="gap-6 p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">New habit</DialogTitle>
            <DialogDescription>Give it a name, the unit you count it in, and a daily target.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="habit-name">Name</Label>
              <Input
                id="habit-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveHabit()}
                placeholder="Read"
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor="habit-unit">Unit</Label>
                <Input id="habit-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pages" className="h-9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="habit-target">Daily target</Label>
                <Input
                  id="habit-target"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: parseInt(e.target.value) || 1 })}
                  type="number"
                  min="1"
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Icon">
                {ICON_KEYS.map((key) => {
                  const Icon = CUSTOM_ICONS[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setForm({ ...form, icon: key })}
                      aria-pressed={form.icon === key}
                      aria-label={key}
                      className={cn(optionCls, "grid size-9 place-items-center text-muted-foreground")}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="-mx-6 -mb-6 p-6 py-4">
            <Button variant="outline" onClick={() => setAdding(false)} className="h-9 px-4">Cancel</Button>
            <Button onClick={saveHabit} disabled={!form.name.trim()} className="h-9 px-4">Create habit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ─── Date Navigator ─── */
function DateNavigator({ activeDate, onChange }: { activeDate: string; onChange: (d: string) => void }) {
  const isToday = activeDate === TODAY;
  const pickerRef = useRef<HTMLInputElement>(null);

  const shift = (days: number) => {
    const d = new Date(activeDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    const next = d.toISOString().split("T")[0];
    if (next <= TODAY) onChange(next);
  };

  const label = (() => {
    if (activeDate === TODAY) return "Today";
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (activeDate === yesterday.toISOString().split("T")[0]) return "Yesterday";
    return new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  })();

  return (
    <div className="flex items-center gap-2">
      {!isToday && (
        <Button variant="ghost" onClick={() => onChange(TODAY)} className="h-9 px-3 text-primary hover:bg-white/60 hover:text-primary">
          Back to today
        </Button>
      )}
      <Button variant="outline" size="icon-lg" onClick={() => shift(-1)} aria-label="Previous day" className="bg-white/80">
        <ChevronLeft />
      </Button>
      <div className="relative">
        <Button
          variant="outline"
          className="h-9 min-w-36 bg-white/80 px-3"
          onClick={() => pickerRef.current?.showPicker?.()}
          aria-label={`${label}. Choose a date`}
        >
          <CalendarDays className="text-muted-foreground" />
          {label}
        </Button>
        <input
          ref={pickerRef}
          type="date"
          max={TODAY}
          value={activeDate}
          onChange={(e) => { if (e.target.value && e.target.value <= TODAY) onChange(e.target.value); }}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </div>
      <Button variant="outline" size="icon-lg" onClick={() => shift(1)} disabled={isToday} aria-label="Next day" className="bg-white/80">
        <ChevronRight />
      </Button>
    </div>
  );
}

/* ─── Layout ─── */
export default function HabitsView({ data, onChange, biometrics, medications, userId, profileName, onOpenCommunity }: Omit<Props, "activeDate"> & { onOpenCommunity?: () => void }) {
  const [activeDate, setActiveDate] = useState(TODAY);
  const cardProps = { data, onChange, activeDate, biometrics, medications, userId, profileName };

  return (
    <div className="space-y-12">
      <TodaySummary data={data} activeDate={activeDate} onDateChange={setActiveDate} profileName={profileName} />

      <section className="space-y-4">
        <SectionLabel>Nutrition & movement</SectionLabel>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><FoodCard {...cardProps} /></div>
          <ExerciseCard {...cardProps} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel>Daily check-in</SectionLabel>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <WaterCard {...cardProps} />
          <MoodCard {...cardProps} />
          <div className="md:col-span-2 lg:col-span-1"><MedicationCard {...cardProps} /></div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel>Rest</SectionLabel>
        <SleepCard {...cardProps} />
      </section>

      <CustomHabitsSection {...cardProps} />

      {userId && onOpenCommunity && <CommunityPreview userId={userId} onOpen={onOpenCommunity} />}
    </div>
  );
}
