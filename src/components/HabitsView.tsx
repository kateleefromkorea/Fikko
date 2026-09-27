import { useRef, useState } from "react";
import {
  Activity, Annoyed, Apple, BedDouble, Brain, CalendarDays, ChevronLeft, ChevronRight, Coffee, Droplet, Dumbbell,
  Frown, Laugh, Meh, Moon, Pill, Plus, Smartphone, Smile, SmilePlus, Sun, Sunrise, Sunset, Thermometer, Trash2,
  Utensils, Volume2, Watch, Wine, X, type LucideIcon,
} from "lucide-react";
import { DB_LIMITS, clamp } from "../lib/limits";
import type { HabitData, BiometricData, HabitEntry, CustomHabit, MealKey, TimeOfDay } from "../types";
import type { useMedications } from "../hooks/useMedications";
import { useFoodLog } from "../hooks/useFoodLog";
import { useCustomFoods } from "../hooks/useCustomFoods";
import FoodLogModal from "./FoodLogModal";
import PageHeader from "./PageHeader";
import { CUSTOM_ICONS, CustomHabitIcon, Figure, GroupLabel, HabitCard, Hint } from "./HabitCard";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

function progressSubtitle(done: number, total: number) {
  if (total === 0 || done === 0) return "How are you doing today?";
  if (done >= total) return "You've completed everything today.";
  return `${done} of ${total} habits done today.`;
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
  done: number;
  total: number;
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

function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  return (
    <Progress
      value={Math.min((value / max) * 100, 100)}
      className={cn("h-2", over && "[&>div]:bg-food")}
    />
  );
}

/** Placeholder shown where wearable data would go. */
function NoDeviceData({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center", className)}>
      <Watch className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm text-muted-foreground">No device data for this date.</p>
      <p className="mt-1 text-xs text-muted-foreground/70">Wearable sync is coming soon.</p>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Calorie Tracker ─── */
interface MealCalories { breakfast: number; lunch: number; dinner: number; snacks: number; }

const MEALS: { key: MealKey; label: string; icon: LucideIcon }[] = [
  { key: "breakfast", label: "Breakfast", icon: Sunrise },
  { key: "lunch",     label: "Lunch",     icon: Sun },
  { key: "dinner",    label: "Dinner",    icon: Sunset },
  { key: "snacks",    label: "Snacks",    icon: Apple },
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

  const foodComment = total === 0
    ? "Nothing logged yet. Pick a meal below to get started."
    : overTarget
      ? `${Math.round(total - target).toLocaleString()} kcal over today's target.`
      : `${Math.round(target - total).toLocaleString()} kcal left to reach your target.`;

  return (
    <HabitCard
      icon={Utensils}
      hue="food"
      title="Calories"
      description={`Daily target ${target.toLocaleString()} kcal`}
      action={<Figure value={Math.round(total).toLocaleString()} unit="kcal" />}
    >
      <div className="space-y-2">
        <Bar value={total} max={target} over={overTarget} />
        <Hint>{foodComment}</Hint>
      </div>

      <div className="mt-6 grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
        {MEALS.map(({ key, label, icon: Icon }) => {
          const val = meals[key] ?? 0;
          const itemCount = foodLog.items.filter((i) => i.meal === key).length;
          return (
            <div key={key} className="flex flex-col gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </div>
              <p className="text-xl font-semibold tabular-nums">
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
function ExerciseCard({ activeDate, biometrics }: Props) {
  const steps      = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const activeCal  = biometrics?.activeCalories?.find((e) => e.date === activeDate)?.value ?? null;
  const standHours = biometrics?.standHours?.find((e) => e.date === activeDate)?.value ?? null;
  const vo2        = biometrics?.vo2max?.find((e) => e.date === activeDate)?.value ?? null;
  const stepsGoal  = 10000;

  return (
    <HabitCard icon={Activity} hue="exercise" title="Activity" description="From your wearable">
      {steps !== null ? (
        <>
          <p className="text-4xl font-semibold tabular-nums">{steps.toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted-foreground">steps today</p>
          <div className="mt-4 space-y-2">
            <Bar value={steps} max={stepsGoal} />
            <Hint>
              {steps >= stepsGoal ? "Daily step goal reached." : `${(stepsGoal - steps).toLocaleString()} steps to goal.`}
            </Hint>
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
            {activeCal !== null && <Stat value={activeCal} label="Active kcal" />}
            {standHours !== null && <Stat value={`${standHours}h`} label="Stand hrs" />}
            {vo2 !== null && <Stat value={vo2} label="VO₂ max" />}
          </div>
        </>
      ) : (
        <NoDeviceData />
      )}
    </HabitCard>
  );
}

/* ─── Water ─── */
function WaterCard({ data, onChange, activeDate, biometrics }: Props) {
  const glasses = getEntry(data.water, activeDate)?.value ?? 0;
  const set = (n: number) => onChange({ ...data, water: setDateValue(data.water, activeDate, n) });

  const steps = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const nudgeTarget = steps !== null && steps > 10000 ? 10 : 8;
  const nudgeMsg = steps !== null && steps > 10000
    ? `You walked ${steps.toLocaleString()} steps today, so aim for ${nudgeTarget} glasses.`
    : glasses >= nudgeTarget
      ? "Target reached for today."
      : `${nudgeTarget - glasses} more to reach your target.`;

  return (
    <HabitCard
      icon={Droplet}
      hue="water"
      title="Water"
      description={`Target ${nudgeTarget} glasses`}
      action={<Figure value={`${glasses}/${nudgeTarget}`} />}
    >
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: nudgeTarget }).map((_, i) => {
          const filled = i < glasses;
          return (
            <button
              key={i}
              onClick={() => set(filled ? i : i + 1)}
              aria-label={filled ? `Remove glass ${i + 1}` : `Log glass ${i + 1}`}
              aria-pressed={filled}
              className={cn(
                "grid aspect-square place-items-center rounded-lg border transition-colors",
                filled ? "border-water/40 bg-water/10" : "border-dashed hover:bg-muted/60",
              )}
            >
              <Droplet
                className={cn("size-5", filled ? "fill-water text-water" : "text-muted-foreground/50")}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <div className="mt-auto space-y-2 pt-6">
        <Bar value={glasses} max={nudgeTarget} />
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

  const toggleMed = (id: string) => {
    const updated = { ...checkedRaw, [id]: !checkedRaw[id] };
    const count = medList.filter((m) => updated[m.id]).length;
    onChange({ ...data, medication: setDateValue(data.medication, activeDate, count > 0 ? 1 : 0, JSON.stringify(updated)) });
  };

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
    const count = medList.filter((m) => m.id !== id && updated[m.id]).length;
    onChange({ ...data, medication: setDateValue(data.medication, activeDate, count > 0 ? 1 : 0, JSON.stringify(updated)) });
  };

  return (
    <HabitCard
      icon={Pill}
      hue="meds"
      title="Medications"
      description={medList.length ? `${checkedCount} of ${medList.length} taken` : "Build a daily schedule"}
      action={allTaken ? <Badge className="bg-primary/10 text-primary">All taken</Badge> : undefined}
    >
      <div className="flex-1 space-y-5">
        {medList.length === 0 && !adding && (
          <Hint>Add your medications or supplements and tick them off each day.</Hint>
        )}
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
      {adding ? (
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
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="h-9 w-full border-dashed text-muted-foreground">
          <Plus />
          Add medication or supplement
        </Button>
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
      icon={Moon}
      hue="sleep"
      title="Sleep"
      description={sleepComment}
      action={totalH !== null ? <Figure value={totalH} unit="h" /> : undefined}
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
                    <Progress value={s.pct} className="h-2" />
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
            <NoDeviceData />
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
const MOODS: { value: number; icon: LucideIcon; label: string }[] = [
  { value: 1, icon: Frown,   label: "Rough" },
  { value: 2, icon: Annoyed, label: "Meh" },
  { value: 3, icon: Meh,     label: "Okay" },
  { value: 4, icon: Smile,   label: "Good" },
  { value: 5, icon: Laugh,   label: "Great" },
];

function MoodCard({ data, onChange, activeDate, biometrics }: Props) {
  const mood = getEntry(data.mood, activeDate)?.value ?? 0;
  const set = (v: number) => onChange({ ...data, mood: setDateValue(data.mood, activeDate, v) });
  const rec = biometrics?.recoveryScore?.find((e) => e.date === activeDate)?.value ?? null;
  const moodLabel = MOODS.find((m) => m.value === mood)?.label;

  return (
    <HabitCard
      icon={SmilePlus}
      hue="mood"
      title="Mood"
      description={moodLabel ? `Feeling ${moodLabel.toLowerCase()} today` : "How are you feeling today?"}
    >
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Mood">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => set(m.value)}
            aria-pressed={mood === m.value}
            className={cn(optionCls, "flex flex-col items-center gap-2 px-1 py-3 text-center")}
          >
            <m.icon className="size-5" aria-hidden="true" />
            <span className="text-xs font-medium">{m.label}</span>
          </button>
        ))}
      </div>

      {rec !== null && (
        <div className="mt-auto space-y-2 pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Recovery</span>
            <span className="font-medium tabular-nums">{rec}/100</span>
          </div>
          <Progress value={rec} className="h-2" />
        </div>
      )}
    </HabitCard>
  );
}

/* ─── Custom Habits ─── */
const ICON_KEYS = Object.keys(CUSTOM_ICONS);
const EMPTY_FORM = { name: "", unit: "times", target: 1, icon: ICON_KEYS[0] };

function CustomHabitsCard({ data, onChange, activeDate }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logInput, setLogInput] = useState<Record<string, string>>({});

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
    <Card className="gap-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Your own habits</CardTitle>
        <CardDescription>Anything else you want to keep an eye on, with your own unit and target.</CardDescription>
        <CardAction>
          <Button onClick={() => setAdding(true)} className="h-9 px-4">
            <Plus />
            New habit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.custom.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No habits of your own yet.</p>
            <p className="mt-1 text-sm text-muted-foreground/70">Reading, stretching, time outside: anything you can count.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.custom.map((habit) => {
              const todayVal = habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
              return (
                <div key={habit.id} className="space-y-4 rounded-lg border p-5">
                  <div className="flex items-center gap-3">
                    <CustomHabitIcon icon={habit.icon} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{habit.name}</p>
                      <p className="text-sm text-muted-foreground">Target {habit.target} {habit.unit}</p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums">
                      {todayVal}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">{habit.unit}</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteHabit(habit.id)}
                      aria-label={`Delete ${habit.name}`}
                      className="text-muted-foreground"
                    >
                      <X />
                    </Button>
                  </div>
                  <Bar value={todayVal} max={habit.target} />
                  <div className="flex gap-2">
                    <Input
                      value={logInput[habit.id] ?? ""}
                      onChange={(e) => setLogInput({ ...logInput, [habit.id]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && logCustom(habit)}
                      placeholder={`Add ${habit.unit}`}
                      aria-label={`Amount of ${habit.unit} to add`}
                      type="number"
                      min="0"
                      className="h-9"
                    />
                    <Button variant="outline" onClick={() => logCustom(habit)} className="h-9 px-4">Log</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

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
    </Card>
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
        <Button variant="ghost" onClick={() => onChange(TODAY)} className="h-9 px-3 text-primary hover:text-primary">
          Back to today
        </Button>
      )}
      <Button variant="outline" size="icon-lg" onClick={() => shift(-1)} aria-label="Previous day">
        <ChevronLeft />
      </Button>
      <div className="relative">
        <Button
          variant="outline"
          className="h-9 min-w-36 px-3"
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
      <Button variant="outline" size="icon-lg" onClick={() => shift(1)} disabled={isToday} aria-label="Next day">
        <ChevronRight />
      </Button>
    </div>
  );
}

/* ─── Layout ─── */
export default function HabitsView({ data, onChange, biometrics, medications, userId, profileName, done, total }: Omit<Props, "activeDate">) {
  const [activeDate, setActiveDate] = useState(TODAY);
  const cardProps = { data, onChange, activeDate, biometrics, medications, userId, profileName, done, total };

  return (
    <div className="space-y-10">
      <PageHeader
        title={greeting(profileName)}
        subtitle={progressSubtitle(done, total)}
        action={<DateNavigator activeDate={activeDate} onChange={setActiveDate} />}
      />

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><FoodCard {...cardProps} /></div>
          <ExerciseCard {...cardProps} />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <WaterCard {...cardProps} />
          <MoodCard {...cardProps} />
          <div className="md:col-span-2 lg:col-span-1"><MedicationCard {...cardProps} /></div>
        </div>

        <SleepCard {...cardProps} />

        <CustomHabitsCard {...cardProps} />
      </div>
    </div>
  );
}
