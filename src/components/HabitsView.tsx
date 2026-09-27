import { useState } from "react";
import { DB_LIMITS, clamp } from "../lib/limits";
import type { HabitData, BiometricData, HabitEntry, CustomHabit, MealKey, TimeOfDay } from "../types";
import type { useMedications } from "../hooks/useMedications";
import { useFoodLog } from "../hooks/useFoodLog";
import { useCustomFoods } from "../hooks/useCustomFoods";
import FoodLogModal from "./FoodLogModal";
import PageHeader from "./PageHeader";

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
  if (done >= total) return "You've completed everything today! 🎉";
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

const inputCls =
  "flex-1 rounded-xl border border-border px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const btnPrimary =
  "px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all";
const cardBase = "rounded-2xl p-6 border border-border bg-card h-full flex flex-col";
const ICONS = ["⭐", "📚", "🧘", "🎯", "💪", "🎨", "🌿", "🐾", "🎵", "✍️", "🧠", "🛁"];

// Short, dynamic one-liner shown under a card's title — a quick read on how
// today is going for that habit, without having to parse the numbers below.
function CommentBubble({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-muted border border-border px-3 py-2 mb-4">
      <p className="text-xs text-secondary-foreground">✨ {text}</p>
    </div>
  );
}

function ProgressBar({ value, max, color = "var(--primary)" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-secondary overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min((value / max) * 100, 100)}%`, background: color }}
      />
    </div>
  );
}

/* ─── Calorie Tracker ─── */
interface MealCalories { breakfast: number; lunch: number; dinner: number; snacks: number; }

const MEALS: { key: MealKey; label: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: "🌅" },
  { key: "lunch",     label: "Lunch",     icon: "☀️" },
  { key: "dinner",    label: "Dinner",    icon: "🌆" },
  { key: "snacks",    label: "Snacks",    icon: "🍎" },
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
  const pct = Math.min((total / target) * 100, 100);
  const overTarget = total > target;

  const foodComment = total === 0
    ? "Nothing logged yet — tap a meal below to get started."
    : overTarget
      ? `You're ${Math.round(total - target).toLocaleString()} kcal over today's target.`
      : `${Math.round(target - total).toLocaleString()} kcal left to reach your target.`;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 h-full flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: "rgba(245,166,35,0.15)" }}>🍽️</div>
          <div>
            <h3 className="font-extrabold text-foreground text-xl">Calorie Tracker</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Daily target: {target.toLocaleString()} kcal</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-extrabold text-foreground">{total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{overTarget ? `${(total - target).toLocaleString()} over` : `${(target - total).toLocaleString()} remaining`}</p>
        </div>
      </div>

      <CommentBubble text={foodComment} />

      <div className="mb-8">
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: overTarget ? "var(--coral)" : "var(--amber)" }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>0</span><span>{(target / 2).toLocaleString()}</span><span>{target.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        {MEALS.map(({ key, label, icon }) => {
          const val = meals[key] ?? 0;
          const mealPct = Math.min((val / (target / 4)) * 100, 100);
          const itemCount = foodLog.items.filter((i) => i.meal === key).length;
          return (
            <div key={key} className="rounded-xl border border-border bg-muted p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className="text-sm font-bold text-secondary-foreground">{label}</span>
                </div>
                <span className="text-lg font-extrabold text-foreground">{Math.round(val)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${mealPct}%`, background: "var(--amber)" }} />
              </div>
              <button
                onClick={() => setOpenMeal(key)}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all"
              >
                {itemCount > 0 ? `Log food · ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Log food"}
              </button>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div className="mt-5 flex gap-3 flex-wrap">
          {MEALS.map(({ key, label }) => meals[key] > 0 ? (
            <span key={key} className="text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground font-semibold">
              {label}: {Math.round(meals[key])} kcal · {Math.round((meals[key] / total) * 100)}%
            </span>
          ) : null)}
        </div>
      )}

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
    </div>
  );
}

/* ─── Exercise ─── */
function ExerciseCard({ activeDate, biometrics }: Props) {
  const steps      = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const activeCal  = biometrics?.activeCalories?.find((e) => e.date === activeDate)?.value ?? null;
  const standHours = biometrics?.standHours?.find((e) => e.date === activeDate)?.value ?? null;
  const vo2        = biometrics?.vo2max?.find((e) => e.date === activeDate)?.value ?? null;
  const stepsGoal  = 10000;
  const stepsPct   = steps !== null ? Math.min((steps / stepsGoal) * 100, 100) : 0;
  const exerciseComment = steps !== null
    ? (steps >= stepsGoal
        ? "Daily step goal reached — nice work!"
        : `${(stepsGoal - steps).toLocaleString()} steps left to hit today's goal.`)
    : null;

  return (
    <div className={cardBase}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(255,117,117,0.15)" }}>🏃</div>
        <div>
          <h3 className="font-extrabold text-foreground text-xl">Activity</h3>
          <p className="text-xs text-muted-foreground">From your wearable</p>
        </div>
      </div>

      {exerciseComment && <CommentBubble text={exerciseComment} />}

      {steps !== null ? (
        <>
          {/* Steps hero */}
          <div className="text-center mb-4">
            <p className="text-5xl font-extrabold text-foreground">{steps.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">steps today</p>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-1">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${stepsPct}%`, background: "var(--coral)" }} />
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            {steps >= stepsGoal ? "Daily goal reached!" : `${(stepsGoal - steps).toLocaleString()} to goal`}
          </p>

          {/* Supporting stats */}
          <div className="grid grid-cols-3 gap-2 mt-auto">
            {activeCal !== null && (
              <div className="rounded-xl bg-muted border border-border p-3 text-center">
                <p className="text-lg font-extrabold text-foreground">{activeCal}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active kcal</p>
              </div>
            )}
            {standHours !== null && (
              <div className="rounded-xl bg-muted border border-border p-3 text-center">
                <p className="text-lg font-extrabold text-foreground">{standHours}h</p>
                <p className="text-xs text-muted-foreground mt-0.5">Stand hrs</p>
              </div>
            )}
            {vo2 !== null && (
              <div className="rounded-xl bg-muted border border-border p-3 text-center">
                <p className="text-lg font-extrabold text-foreground">{vo2}</p>
                <p className="text-xs text-muted-foreground mt-0.5">VO₂ max</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <p className="text-3xl mb-3">⌚</p>
          <p className="text-sm text-muted-foreground">No device data for this date.</p>
          <p className="text-xs text-muted-foreground mt-1 opacity-60">Wearable sync is coming soon.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Water ─── */
function WaterCard({ data, onChange, activeDate, biometrics }: Props) {
  const glasses = getEntry(data.water, activeDate)?.value ?? 0;
  const set = (n: number) => onChange({ ...data, water: setDateValue(data.water, activeDate, n) });

  const steps = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  const nudgeTarget = steps !== null && steps > 10000 ? 10 : 8;
  const nudgeMsg = steps !== null && steps > 10000
    ? `You walked ${steps.toLocaleString()} steps today — aim for ${nudgeTarget} glasses to stay hydrated.`
    : steps !== null && steps > 7000
      ? "Good activity level — keep up your regular hydration."
      : null;

  return (
    <div className={cardBase}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(91,169,240,0.2)" }}>💧</div>
        <div>
          <h3 className="font-extrabold text-foreground text-xl">Water Intake</h3>
          <p className="text-xs text-muted-foreground">Target: {nudgeTarget} glasses/day</p>
        </div>
        <span className="ml-auto text-3xl font-extrabold text-foreground">{glasses}/{nudgeTarget}</span>
      </div>

      {nudgeMsg && <CommentBubble text={nudgeMsg} />}

      <div className="grid gap-1 mb-4" style={{ gridTemplateColumns: `repeat(${nudgeTarget}, minmax(0, 1fr))` }}>
        {Array.from({ length: nudgeTarget }).map((_, i) => (
          <button key={i} onClick={() => set(i < glasses ? i : i + 1)} className="flex items-center justify-center text-3xl aspect-square transition-all hover:scale-110 w-full">
            {i < glasses ? "💧" : "🫙"}
          </button>
        ))}
      </div>
      <ProgressBar value={glasses} max={nudgeTarget} color="var(--sky)" />
    </div>
  );
}

/* ─── Medications & Supplements ─── */
const TIME_SLOTS: { key: TimeOfDay; label: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: "🌅" },
  { key: "midday",    label: "Midday",    icon: "☀️" },
  { key: "night",     label: "Night",     icon: "🌙" },
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

  const medComment = medList.length === 0
    ? "Add your medications or supplements to build a daily schedule."
    : allTaken
      ? "All done for today — nice work staying on track!"
      : `${medList.length - checkedCount} left to take today.`;

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
    <div className={cardBase}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(126,220,206,0.2)" }}>💊</div>
        <div className="flex-1">
          <h3 className="font-extrabold text-foreground text-xl">Medications & Supplements</h3>
          <p className="text-xs text-muted-foreground">{checkedCount}/{medList.length} taken</p>
        </div>
        {allTaken && <span className="text-xs px-2 py-1 rounded-full font-bold text-accent-foreground" style={{ background: "var(--teal)" }}>All done ✓</span>}
      </div>

      <CommentBubble text={medComment} />

      <div className="space-y-4 flex-1">
        {medList.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No medications or supplements added yet.</p>
        )}
        {TIME_SLOTS.map(({ key, label, icon }) => {
          const slotMeds = medList.filter((m) => m.time_of_day === key);
          if (slotMeds.length === 0) return null;
          return (
            <div key={key}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>{icon}</span> {label}
              </p>
              <ul className="space-y-2">
                {slotMeds.map((med) => {
                  const checked = !!checkedRaw[med.id];
                  return (
                    <li key={med.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => toggleMed(med.id)}
                        className="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all"
                        style={checked ? { background: "var(--primary)", borderColor: "var(--primary)" } : { borderColor: "var(--border)" }}
                      >
                        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <span className="flex-1 text-sm text-foreground" style={checked ? { textDecoration: "line-through", color: "var(--muted-foreground)" } : {}}>{med.name}</span>
                      <select
                        value={med.time_of_day}
                        onChange={(e) => updateTimeOfDay(med.id, e.target.value as TimeOfDay)}
                        title="Move to a different time of day"
                        className="text-xs rounded-lg border border-border bg-card px-1.5 py-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                      >
                        {TIME_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <button onClick={() => removeMed(med.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground text-xs transition-all">✕</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        {adding ? (
          <div className="flex flex-col gap-2">
            <input
              value={newMed}
              onChange={(e) => setNewMed(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addMed(); if (e.key === "Escape") setAdding(false); }}
              placeholder="Medication or supplement name…"
              autoFocus
              className="flex-1 rounded-xl border border-border px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-1.5">
              {TIME_SLOTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setNewSlot(s.key)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={newSlot === s.key
                    ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                    : { background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addMed} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">Add</button>
              <button onClick={() => setAdding(false)} className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm transition-all">✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full py-2 rounded-xl border border-dashed border-border text-muted-foreground text-sm hover:border-primary hover:text-primary transition-all">
            + Add medication or supplement
          </button>
        )}
      </div>
    </div>
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

const SLEEP_FACTORS = [
  { id: "caffeine",  label: "Caffeine",       emoji: "☕" },
  { id: "screens",   label: "Late screens",   emoji: "📱" },
  { id: "stress",    label: "Stress",         emoji: "😰" },
  { id: "exercise",  label: "Exercise",       emoji: "🏃" },
  { id: "alcohol",   label: "Alcohol",        emoji: "🍷" },
  { id: "noise",     label: "Noise",          emoji: "🔊" },
  { id: "heat",      label: "Too warm",       emoji: "🌡️" },
  { id: "nap",       label: "Napped",         emoji: "💤" },
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

  const STAGE_COLORS = ["var(--primary)", "var(--teal)", "var(--lavender)"];

  const sleepComment = totalH === null
    ? "Log how rested you feel below — no wearable data for this date yet."
    : totalH >= 7
      ? "Solid night — you're in a healthy sleep range."
      : totalH >= 5
        ? "A bit short on sleep — try to wind down earlier tonight."
        : "Low sleep total — prioritize rest tonight if you can.";

  return (
    <div className="rounded-2xl p-6 border border-border bg-card flex flex-col gap-6">
      {/* Card header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(143,169,224,0.2)" }}>🌙</div>
        <div>
          <h3 className="font-extrabold text-foreground text-xl">Sleep</h3>
          <p className="text-xs text-muted-foreground">How you slept · context</p>
        </div>
        {totalH !== null && (
          <div className="ml-auto text-right">
            <p className="text-3xl font-extrabold text-foreground">{totalH}h</p>
            <p className="text-xs text-muted-foreground">total sleep</p>
          </div>
        )}
      </div>

      <CommentBubble text={sleepComment} />

      {/* Three-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 — Biometric read-out */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Wearable</p>

          {totalH !== null ? (
            <>
              {/* Stage bars */}
              <div className="space-y-3">
                {stageData.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-secondary-foreground">{s.label}</span>
                      <span className="text-muted-foreground">{s.hours}h · {s.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.pct}%`, background: STAGE_COLORS[i] }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Vitals row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {hrv !== null && (
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-base font-extrabold text-foreground">{hrv}</p>
                    <p className="text-xs text-muted-foreground">HRV ms</p>
                  </div>
                )}
                {rec !== null && (
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-base font-extrabold text-foreground">{rec}</p>
                    <p className="text-xs text-muted-foreground">Recovery</p>
                  </div>
                )}
                {hr !== null && (
                  <div className="rounded-xl bg-muted border border-border p-2.5 text-center">
                    <p className="text-base font-extrabold text-foreground">{hr}</p>
                    <p className="text-xs text-muted-foreground">Resting HR</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center flex-1 flex flex-col items-center justify-center">
              <p className="text-2xl mb-2">⌚</p>
              <p className="text-xs text-muted-foreground">No wearable data for this date</p>
            </div>
          )}
        </div>

        {/* Column 2 — Restedness */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {totalH !== null ? `After ${totalH}h — how rested do you feel?` : "How rested do you feel?"}
          </p>
          <div className="flex flex-col gap-2 flex-1">
            {REST_SCALE.map((r) => (
              <button
                key={r.value}
                onClick={() => setRest(r.value)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all flex-1"
                style={restScore === r.value
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : { background: "var(--muted)", color: "var(--foreground)" }}
              >
                <span className="text-sm font-bold w-4 text-center opacity-50">{r.value}</span>
                <div>
                  <p className="text-sm font-bold leading-tight">{r.label}</p>
                  <p className="text-xs opacity-50 leading-tight">{r.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Column 3 — Context: timing + factors */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sleep context</p>

          <div>
            <p className="text-sm font-bold text-foreground mb-2">What time did you actually sleep and wake up?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Bedtime</label>
              <input
                type="time"
                value={note.bedtime ?? ""}
                onChange={(e) => setTime("bedtime", e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Wake time</label>
              <input
                type="time"
                value={note.wake ?? ""}
                onChange={(e) => setTime("wake", e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">What affected your sleep?</p>
            <div className="grid grid-cols-2 gap-2">
              {SLEEP_FACTORS.map((f) => {
                const active = (note.factors ?? []).includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFactor(f.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all"
                    style={active
                      ? { background: "var(--lavender)", color: "var(--foreground)" }
                      : { background: "var(--muted)", color: "var(--muted-foreground)" }}
                  >
                    <span>{f.emoji}</span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mood ─── */
const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "😊", label: "Good" },
  { value: 5, emoji: "🤩", label: "Great" },
];

function MoodCard({ data, onChange, activeDate, biometrics }: Props) {
  const mood = getEntry(data.mood, activeDate)?.value ?? 0;
  const set = (v: number) => onChange({ ...data, mood: setDateValue(data.mood, activeDate, v) });
  const rec = biometrics?.recoveryScore?.find((e) => e.date === activeDate)?.value ?? null;
  const moodLabel = MOODS.find((m) => m.value === mood)?.label;
  const moodComment = moodLabel
    ? `Feeling ${moodLabel.toLowerCase()} today — thanks for checking in.`
    : "How are you feeling today? Pick a mood below.";

  return (
    <div className={cardBase}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "rgba(255,179,193,0.25)" }}>😊</div>
        <h3 className="font-extrabold text-foreground text-xl">Mood</h3>
      </div>

      <CommentBubble text={moodComment} />

      {rec !== null && (
        <div className="rounded-xl bg-muted border border-border px-3 py-2 mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Recovery</p>
            <p className="text-xs font-bold text-foreground">{rec}/100</p>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${rec}%`, background: "var(--teal)" }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 flex-1">
        {MOODS.map((m) => (
          <button key={m.value} onClick={() => set(m.value)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left flex-1"
            style={mood === m.value
              ? { background: "#0B4F42", color: "#fff" }
              : { background: "var(--muted)", color: "var(--foreground)" }}>
            <span className="text-xl">{m.emoji}</span>
            <span className="text-xs font-bold">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Custom Habits ─── */
function CustomHabitsCard({ data, onChange, activeDate }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "times", target: 1, icon: ICONS[0] });
  const [logInput, setLogInput] = useState<Record<string, string>>({});

  const saveHabit = () => {
    if (!form.name.trim()) return;
    onChange({ ...data, custom: [...data.custom, { id: crypto.randomUUID(), name: form.name.trim().slice(0, DB_LIMITS.nameLength), unit: form.unit, target: clamp(form.target, DB_LIMITS.habitValue), color: "#374151", icon: form.icon, entries: [] }] });
    setForm({ name: "", unit: "times", target: 1, icon: ICONS[0] });
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
    <div className="col-span-full rounded-2xl p-6 border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-extrabold text-foreground">Custom Habits</h3>
        <button onClick={() => setAdding(true)} className={btnPrimary}>+ New Habit</button>
      </div>

      {adding && (
        <div className="rounded-2xl p-6 mb-4 border border-border bg-muted">
          <h4 className="font-bold text-foreground mb-4">Create Custom Habit</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Habit name…" className={inputCls} />
            <div className="flex gap-2">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unit (pages, ml…)" className={inputCls} />
              <input value={form.target} onChange={(e) => setForm({ ...form, target: parseInt(e.target.value) || 1 })} type="number" min="1" placeholder="Target" className="w-24 rounded-xl border border-border px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2 font-semibold">Pick an icon</p>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((ic) => (
                <button key={ic} onClick={() => setForm({ ...form, icon: ic })} className="text-xl p-2 rounded-lg transition-all" style={form.icon === ic ? { background: "var(--secondary)", boxShadow: "0 0 0 2px var(--primary)" } : { background: "var(--card)" }}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveHabit} className={btnPrimary}>Create Habit</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {data.custom.length === 0 && !adding && (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-muted-foreground text-sm">No custom habits yet.</p>
          <p className="text-muted-foreground text-xs mt-1 opacity-70">Click "New Habit" to add your own.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.custom.map((habit) => {
          const todayVal = habit.entries.find((e) => e.date === activeDate)?.value ?? 0;
          return (
            <div key={habit.id} className="rounded-2xl p-5 border border-border bg-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl">{habit.icon}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-foreground">{habit.name}</h4>
                  <p className="text-xs text-muted-foreground">Target: {habit.target} {habit.unit}</p>
                </div>
                <span className="text-xl font-extrabold text-foreground">
                  {todayVal} <span className="text-sm font-normal text-muted-foreground">{habit.unit}</span>
                </span>
                <button onClick={() => deleteHabit(habit.id)} className="text-muted-foreground hover:text-foreground text-sm ml-1">✕</button>
              </div>
              <ProgressBar value={todayVal} max={habit.target} color="var(--peach)" />
              <div className="flex gap-2 mt-4">
                <input value={logInput[habit.id] ?? ""} onChange={(e) => setLogInput({ ...logInput, [habit.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && logCustom(habit)} placeholder={`Log ${habit.unit}…`} type="number" min="0" className={inputCls} />
                <button onClick={() => logCustom(habit)} className={btnPrimary}>Log</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Date Navigator ─── */
function DateNavigator({ activeDate, onChange }: { activeDate: string; onChange: (d: string) => void }) {
  const isToday = activeDate === TODAY;

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
    <div className="flex items-center gap-3">
      <button
        onClick={() => shift(-1)}
        className="w-9 h-9 rounded-xl bg-secondary hover:bg-border flex items-center justify-center text-secondary-foreground transition-all font-bold"
      >
        ‹
      </button>

      <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card">
        <span className="text-sm font-bold text-foreground min-w-[6rem] text-center">{label}</span>
        <input
          type="date"
          max={TODAY}
          value={activeDate}
          onChange={(e) => { if (e.target.value <= TODAY) onChange(e.target.value); }}
          className="text-xs text-muted-foreground bg-transparent border-none outline-none cursor-pointer w-4"
          title="Jump to date"
        />
      </div>

      <button
        onClick={() => shift(1)}
        disabled={isToday}
        className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-secondary-foreground transition-all font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border"
      >
        ›
      </button>

      {!isToday && (
        <button
          onClick={() => onChange(TODAY)}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all"
        >
          Back to today
        </button>
      )}
    </div>
  );
}

/* ─── Layout ─── */
export default function HabitsView({ data, onChange, biometrics, medications, userId, profileName, done, total }: Omit<Props, "activeDate">) {
  const [activeDate, setActiveDate] = useState(TODAY);
  const cardProps = { data, onChange, activeDate, biometrics, medications, userId, profileName, done, total };

  return (
    <div className="space-y-6">
      {/* Header + date navigator */}
      <PageHeader
        title={greeting(profileName)}
        subtitle={progressSubtitle(done, total)}
        action={<DateNavigator activeDate={activeDate} onChange={setActiveDate} />}
      />

      {/* Top row: Calorie (7) + Exercise (3) */}
      <div className="grid grid-cols-1 md:grid-cols-10 gap-6 items-stretch">
        <div className="md:col-span-7 flex flex-col">
          <FoodCard {...cardProps} />
        </div>
        <div className="md:col-span-3 flex flex-col">
          <ExerciseCard {...cardProps} />
        </div>
      </div>

      {/* Second row: Water + Mood stacked left, Medication right */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
        <div className="md:col-span-3 flex flex-col gap-6">
          <WaterCard {...cardProps} />
          <MoodCard {...cardProps} />
        </div>
        <div className="md:col-span-2 flex flex-col">
          <MedicationCard {...cardProps} />
        </div>
      </div>

      {/* Third row: Sleep — full width */}
      <SleepCard {...cardProps} />

      {/* Custom habits */}
      <CustomHabitsCard {...cardProps} />
    </div>
  );
}
