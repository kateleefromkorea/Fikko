import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Activity, Annoyed, Apple, BedDouble, Brain, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, Droplet, Dumbbell,
  BatteryLow, CloudRain, Frown, Laugh, Leaf, Meh, Moon, SunMedium, Zap, Pill, Plus, Smartphone, Smile, SmilePlus, Sparkles, Sun, Sunrise, Sunset, Thermometer,
  Loader2, Mic, ShieldCheck, Trash2, Utensils, Volume2, Watch, Wine, X, type LucideIcon,
} from "lucide-react";
import { DB_LIMITS, clamp } from "../lib/limits";
import { activityMinutes, completion, EXERCISE_TARGET_MIN, type CoreHabit } from "../lib/completion";
import { workoutsOf } from "../lib/workouts";
import type { HabitData, BiometricData, HabitEntry, CustomHabit, MealKey, TimeOfDay } from "../types";
import type { useMedications } from "../hooks/useMedications";
import { mealTotals, useFoodLog } from "../hooks/useFoodLog";
import type { HabitUpdate } from "../hooks/useHabitData";
import { useCustomFoods } from "../hooks/useCustomFoods";
import FoodLogModal from "./FoodLogModal";
import VoiceCheckIn from "./VoiceCheckIn";
import Celebration from "./Celebration";
import InteractionCheck from "./InteractionCheck";
import { suggestMedications } from "../lib/medicationNames";
import { useSavedMeals } from "../hooks/useSavedMeals";
import ProgressRing from "./ProgressRing";
import {
  CUSTOM_ICONS, CustomHabitIcon, DoneBadge, EmptyState, Figure, GroupLabel, HabitBar, HabitCard, Hint, panelCls, softCardCls,
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
import { shiftDateKey, todayKey } from "../lib/dates";
import { foodComment, macroComment, medsComment, momentFor, moodComment, sleepComment, waterComment } from "./habitComments";
import { dayRange, sleepHours } from "../lib/dashboardStats";
import { macroTargets, sumMacros } from "../lib/macros";
import MacroBars from "./MacroBars";
import { dayBurn } from "../lib/activities";
import ActivityCard from "./activity/ActivityCard";

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

// How each built-in habit reads in "Water and sleep to go."
const LEFT_NAMES: Record<CoreHabit, string> = {
  food: "meals", exercise: "activity", water: "water", mood: "mood", medication: "meds", sleep: "sleep",
};

function ordinal(n: number) {
  const words = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
  return words[n - 1] ?? `${n}th`;
}

function joinNames(names: string[]) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The line under the greeting: what's still left today, with the one most
 * useful number, or how this complete day fits into the week.
 */
function progressSubtitle(data: HabitData, date: string, waterGoal: number) {
  const { core, custom, done, total } = completion(data, date, waterGoal);
  const isToday = date === todayKey();

  if (!isToday) {
    return done >= total && total > 0 ? "Everything done that day." : `${done} of ${total} done that day.`;
  }
  if (done === 0) return "Nothing logged yet today.";

  if (done >= total) {
    const fullDays = dayRange(7).filter((d) => {
      const c = completion(data, d, waterGoal);
      return c.total > 0 && c.done === c.total;
    }).length;
    return `All ${total} done, your ${ordinal(fullDays)} full day this week.`;
  }

  const left = [
    ...core.filter((c) => !c.done).map((c) => c.key),
    ...custom.filter((c) => !c.done).map((c) => c.habit.name),
  ];
  const names = left.map((k) => (k in LEFT_NAMES ? LEFT_NAMES[k as CoreHabit] : k));
  const lead = left.length <= 3 ? `${joinNames(names)} to go.` : `${left.length} habits to go.`;

  // One concrete nudge, for whichever counted habit is closest to useful.
  let detail = "";
  if (left.includes("water")) {
    const off = waterGoal - (data.water.find((e) => e.date === date)?.value ?? 0);
    detail = ` You're ${off} ${off === 1 ? "glass" : "glasses"} off.`;
  } else if (left.includes("exercise")) {
    const off = EXERCISE_TARGET_MIN - activityMinutes(data, date).total;
    detail = ` ${off} active minutes would do it.`;
  }
  return lead.charAt(0).toUpperCase() + lead.slice(1) + detail;
}

type Medications = ReturnType<typeof useMedications>;
type FoodLog = ReturnType<typeof useFoodLog>;

interface Props {
  data: HabitData;
  /** A new state, or a function building one on the latest state (see useHabitData). */
  onChange: (update: HabitUpdate) => void;
  activeDate: string;
  biometrics: BiometricData;
  medications: Medications;
  userId: string | null;
  profileName: string;
  /** The member's own daily goals from onboarding and Profile. */
  goals: Goals;
  /** True for members whose tracking style is "Detailed macros". */
  trackMacros: boolean;
}

export interface Goals {
  calories: number;
  water: number;
  sleepHours: number;
  /** Body weight, for estimating the calories a workout burns and the protein target. */
  weightKg?: number | null;
  /** The goal that sets the calories (profiles.primary_goal), for the macro targets. */
  goalKey?: string | null;
}

/**
 * Today's day key, kept current: it moves on at midnight and when the member
 * comes back to a tab left open overnight, so "today" never logs to yesterday.
 */
export function useToday() {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const check = () => setToday(todayKey());
    const msToMidnight = () => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 1000;
    };
    let timer = window.setTimeout(function tick() { check(); timer = window.setTimeout(tick, msToMidnight()); }, msToMidnight());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}

/** 7.5 → "7h 30m". */
function formatHours(h: number) {
  const mins = Math.round(h * 60);
  return mins % 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins / 60}h`;
}

/** Reads a habit entry's JSON note, or null if it's missing or damaged, so one bad entry can't break the page. */
function parseNote<T>(raw?: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

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
  "rounded-lg border border-transparent bg-foreground/[0.04] text-left transition-colors hover:bg-foreground/[0.07] aria-pressed:border-primary aria-pressed:bg-primary/8 aria-pressed:text-primary-ink";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={cn(panelCls, "p-3 text-center")}>
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
          ? "border-primary/25 bg-white font-medium text-primary-ink shadow-sm"
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

function TodaySummary({ data, activeDate, onDateChange, profileName, waterGoal, voice, sectionRef }: {
  data: HabitData; activeDate: string; onDateChange: (d: string) => void; profileName: string; waterGoal: number;
  /** The voice check-in, shown under the greeting. */
  voice?: ReactNode;
  /** Watched by the sticky day bar, which appears once this scrolls away. */
  sectionRef?: RefObject<HTMLElement | null>;
}) {
  const { core, custom, done, total } = completion(data, activeDate, waterGoal);
  const isToday = activeDate === todayKey();
  const dateLabel = new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <section ref={sectionRef} className="daily-overview overflow-hidden rounded-2xl border border-teal/20 p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs font-semibold tracking-wider text-primary-ink uppercase">
          {isToday ? `Today · ${dateLabel}` : dateLabel}
        </p>
        <DateNavigator activeDate={activeDate} onChange={onDateChange} />
      </div>

      <div className="mt-6 grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{greeting(profileName)}</h1>
          <p className="mt-3 text-lg text-foreground/70">{progressSubtitle(data, activeDate, waterGoal)}</p>
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
          {voice && <div className="mt-6">{voice}</div>}
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

/* ─── Sticky day bar ─── */
/** Height of the app header the bar sits under (App.tsx's h-16). */
const APP_HEADER_PX = 64;

/** True once the element has scrolled up under the app header. */
function useScrolledPast(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < APP_HEADER_PX),
      { rootMargin: `-${APP_HEADER_PX}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return past;
}

/**
 * A slim bar under the app header once the Today summary scrolls away: AI
 * credits left, the day being viewed, how many habits are done, and a Speak
 * button for the voice check-in.
 */
function StickyDayBar({ show, data, activeDate, onDateChange, waterGoal, onSpeak, onDateClick }: {
  show: boolean; data: HabitData; activeDate: string; onDateChange: (d: string) => void; waterGoal: number;
  /** Missing when voice check-ins aren't available (signed out). */
  onSpeak?: () => void;
  /** Takes the member back to the full summary, with its date picker. */
  onDateClick: () => void;
}) {
  const { core, custom, done, total } = completion(data, activeDate, waterGoal);
  const isToday = activeDate === todayKey();
  const dateLabel = new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const shift = (days: number) => {
    const next = shiftDateKey(activeDate, days);
    if (next <= todayKey()) onDateChange(next);
  };
  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className={cn(
        "fixed inset-x-0 top-16 z-30 bg-[#0E3B2B] text-white shadow-md transition-[translate,opacity] duration-200 motion-reduce:transition-none",
        show ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
      )}
    >
      <div className="mx-auto flex h-12 max-w-screen-2xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => shift(-1)} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <button
            onClick={onDateClick}
            className="min-w-0 rounded-md px-1 text-sm font-semibold whitespace-nowrap text-emerald-300 hover:underline"
            aria-label={`${isToday ? "Today" : dateLabel}. Back to the summary`}
          >
            {isToday ? <>Today<span className="hidden font-normal text-white/60 sm:inline"> · {dateLabel}</span></> : dateLabel}
          </button>
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white disabled:text-white/30" onClick={() => shift(1)} disabled={isToday} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3" aria-label={`${done} of ${total} habits done`}>
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {done}<span className="text-white/60">/{total}</span>
            <span className="ml-1 hidden font-normal text-white/60 sm:inline">done</span>
          </span>
          <ul className="hidden min-w-0 items-center gap-1 overflow-hidden md:flex">
            {core.map(({ key, done }) => {
              const Icon = CORE_META[key].icon;
              return (
                <li key={key}>
                  <button
                    onClick={() => scrollToCard(`habit-${key}`)}
                    title={`${CORE_META[key].label}${done ? ", done" : ""}`}
                    aria-label={`${CORE_META[key].label}, ${done ? "done" : "not done yet"}`}
                    className={cn(
                      "grid size-7 place-items-center rounded-full transition-colors",
                      done ? "bg-emerald-400 text-[#0E3B2B]" : "bg-white/10 text-white/80 hover:bg-white/20",
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : <Icon className="size-3.5" />}
                  </button>
                </li>
              );
            })}
            {custom.length > 0 && (
              <li className="pl-1 text-xs whitespace-nowrap text-white/60">
                +{custom.filter((c) => c.done).length}/{custom.length} custom
              </li>
            )}
          </ul>
        </div>

        {onSpeak && (
          <Button onClick={onSpeak} size="sm" className="h-8 shrink-0 gap-1.5 rounded-full bg-white px-4 font-semibold text-[#0E3B2B] shadow-sm hover:bg-emerald-100">
            <Mic />
            Speak
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Calorie Tracker ─── */
interface MealCalories { breakfast: number; lunch: number; dinner: number; snacks: number; }

// Amber shades, deepest first, so the ring reads breakfast → snacks.
export const MEALS: { key: MealKey; label: string; icon: LucideIcon; color: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: Sunrise, color: "#157954" },
  { key: "lunch",     label: "Lunch",     icon: Sun,     color: "#1F73C2" },
  { key: "dinner",    label: "Dinner",    icon: Sunset,  color: "#003A35" },
  { key: "snacks",    label: "Snacks",    icon: Apple,   color: "#A9CBEB" },
];

function FoodCard({ data, activeDate, userId, goals, trackMacros, foodLog, biometrics }: Props & { foodLog: FoodLog }) {
  const entry = getEntry(data.food, activeDate);
  const saved: MealCalories = parseNote<MealCalories>(entry?.note) ?? { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  // The foods logged are the record. The saved per-meal totals only stand in while
  // they load, or for days from before each food was logged separately.
  const meals: MealCalories = foodLog.ready && foodLog.items.length ? mealTotals(foodLog.items) : saved;

  const customFoods = useCustomFoods(userId);
  const savedMeals = useSavedMeals(userId);
  const [openMeal, setOpenMeal] = useState<MealKey | null>(null);

  const target = Math.round(goals.calories);
  const eaten = meals.breakfast + meals.lunch + meals.dinner + meals.snacks;
  // Net calories: what was eaten, less the estimated burn of the workouts logged on the Activity card.
  // The same burn the Activity card shows: logged workouts plus a wearable's active calories.
  const burned = dayBurn(
    workoutsOf(getEntry(data.exercise, activeDate)),
    goals.weightKg,
    biometrics?.activeCalories?.find((e) => e.date === activeDate)?.value ?? null,
  ).total;
  const total = Math.max(0, eaten - burned);
  const overTarget = total > target;
  // The ring shows what was eaten, one slice per meal, against the target (scaled to
  // the day's total once past it). The middle shows the net after workouts. Drawing the
  // slices at their net size used to empty the ring whenever workouts burned more than was eaten.
  const scale = Math.max(eaten, target);

  const { total: macrosEaten, missing } = sumMacros(foodLog.items);
  const macroTarget = macroTargets({ calories: target, goalKey: goals.goalKey, weightKg: goals.weightKg });
  const moment = momentFor(activeDate, todayKey());
  const comment =
    macroComment({
      net: total, target, eaten, meals, macros: macrosEaten, macroTarget,
      macrosKnown: foodLog.items.length > missing,
    }, moment)
    ?? foodComment({ total, target, meals, eaten }, moment);

  return (
    <HabitCard
      id="habit-food"
      icon={Utensils}
      hue="food"
      title="Calories"
      description={`Done once you log a meal · target ${target.toLocaleString()} kcal`}
      done={eaten > 0}
      comment={comment}
    >
      <div className="grid flex-1 items-stretch gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center gap-3">
          <ProgressRing
            size={168}
            stroke={14}
            segments={MEALS.map((m) => ({ value: (meals[m.key] ?? 0) / scale, color: m.color }))}
            label={`${Math.round(total)} net of ${target} kcal`}
          >
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{Math.round(total).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{burned > 0 ? "net" : "of"} {burned > 0 ? `of ${target.toLocaleString()}` : target.toLocaleString()} kcal</p>
            </div>
          </ProgressRing>
          {burned > 0 && (
            <p className="text-center text-xs text-muted-foreground tabular-nums">
              {Math.round(eaten).toLocaleString()} eaten − <span className="text-exercise-strong">{burned.toLocaleString()} burned</span>
            </p>
          )}
          {/* The plain answer to "how much more can I eat?", after workouts. */}
          {eaten > 0 && !overTarget && (
            <p className="max-w-56 text-center text-sm font-medium text-primary-ink tabular-nums">
              {Math.round(target - total) === 0
                ? "You've reached your target"
                : activeDate === todayKey()
                  ? `You can eat ${Math.round(target - total).toLocaleString()} kcal more today`
                  : `${Math.round(target - total).toLocaleString()} kcal under your target`}
            </p>
          )}
          {overTarget && <p className="max-w-56 text-center text-sm font-semibold text-ink tabular-nums">{Math.round(total - target).toLocaleString()} kcal over your target</p>}
        </div>

        <div className="grid auto-rows-fr grid-cols-2 gap-3">
          {MEALS.map(({ key, label, icon: Icon, color }) => {
            const val = meals[key] ?? 0;
            const mealItems = foodLog.items.filter((i) => i.meal === key);
            const itemCount = mealItems.length;
            return (
              <div key={key} className={cn(panelCls, "flex h-full min-h-0 flex-col gap-2.5 p-4")}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {Math.round(val)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
                </p>
                {itemCount > 0 && (
                  <ul className="-mt-1 space-y-0.5 text-xs text-muted-foreground" aria-label={`${label} items`}>
                    {mealItems.slice(0, 4).map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <span className="shrink-0 tabular-nums">{Math.round(item.calories)}</span>
                      </li>
                    ))}
                    {itemCount > 4 && <li>+{itemCount - 4} more</li>}
                  </ul>
                )}
                <Button variant="outline" className="mt-auto h-9" onClick={() => setOpenMeal(key)} disabled={!foodLog.ready}>
                  {foodLog.loading ? <Loader2 className="animate-spin" /> : <Plus />}
                  {foodLog.loading ? "Loading…" : itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Log food"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shown for every member, whatever their goal or tracking style; 0 g until something's logged. */}
      <div className="mt-6 border-t pt-5">
        <MacroBars eaten={macrosEaten} target={macroTarget} />
        {missing > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {missing} item{missing === 1 ? "" : "s"} without macro data {missing === 1 ? "isn't" : "aren't"} counted in these bars.
          </p>
        )}
      </div>

      {foodLog.loadError && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {foodLog.loadError}
          <Button variant="outline" size="sm" onClick={foodLog.reload} className="h-8">Try again</Button>
        </div>
      )}
      {foodLog.error && !openMeal && (
        <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{foodLog.error}</p>
      )}

      {openMeal && (
        <FoodLogModal
          meal={openMeal}
          mealLabel={MEALS.find((m) => m.key === openMeal)!.label}
          date={activeDate}
          userId={userId}
          items={foodLog.items.filter((i) => i.meal === openMeal)}
          savedFoods={customFoods.foods}
          savedMeals={savedMeals.meals}
          onAdd={(food) => foodLog.addItem(openMeal, food)}
          onAddMany={(foods) => foodLog.addItems(openMeal, foods)}
          onUpdateGrams={foodLog.updateGrams}
          onDelete={foodLog.deleteItem}
          onSaveFood={customFoods.saveFood}
          onSaveMeal={savedMeals.saveMeal}
          onDeleteMeal={savedMeals.deleteMeal}
          onClose={() => { setOpenMeal(null); foodLog.clearError(); }}
          showMacros={trackMacros}
          error={foodLog.error}
        />
      )}
    </HabitCard>
  );
}

/* ─── Exercise ─── */
// The Activity card lives in ./activity/ActivityCard.

/* ─── Water ─── */
function WaterCard({ data, onChange, activeDate, biometrics, goals }: Props) {
  const mounted = useMounted();
  const glasses = getEntry(data.water, activeDate)?.value ?? 0;
  const set = (n: number) => onChange({ ...data, water: setDateValue(data.water, activeDate, n) });

  const steps = biometrics?.steps?.find((e) => e.date === activeDate)?.value ?? null;
  // A big step day (from a wearable, once sync exists) adds two glasses to the member's own goal.
  const nudgeTarget = Math.round(goals.water) + (steps !== null && steps > 10000 ? 2 : 0);
  // Glasses shown: the target, plus one spare once it's reached (up to 30 in a day).
  const slots = Math.min(30, Math.max(nudgeTarget, glasses >= nudgeTarget ? glasses + 1 : nudgeTarget));
  // How to use the glasses rides along in the comment bubble, so the card has
  // one line of guidance rather than a second one at the bottom.
  const tip = glasses >= nudgeTarget ? "Had more? Tap the dashed glass." : "Tap a glass to fill it.";
  const comment = `${waterComment(
    { glasses, target: nudgeTarget, boosted: steps !== null && steps > 10000, steps },
    momentFor(activeDate, todayKey()),
  )} ${tip}`;
  // Two rows of taller glasses fill the card; bigger goals add columns, then rows.
  const cols = Math.min(Math.ceil(slots / 2), 6);

  return (
    <HabitCard
      id="habit-water"
      icon={Droplet}
      hue="water"
      title="Water"
      description={`Target ${nudgeTarget} glasses`}
      action={<Figure value={glasses} unit={`/ ${nudgeTarget}`} />}
      done={glasses >= nudgeTarget}
      comment={comment}
    >
      {/* Glasses stretch to fill the card's height, so the row of check-in
          cards lines up without a blank band at the bottom. Once the target is
          met there's always one more empty glass (dashed) for extras. */}
      <div className="grid flex-1 auto-rows-fr gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: slots }).map((_, i) => {
          const filled = i < glasses;
          const extra = i >= nudgeTarget;
          return (
            <button
              key={i}
              onClick={() => set(filled ? i : i + 1)}
              aria-label={filled ? `Remove glass ${i + 1}` : `Log glass ${i + 1}`}
              aria-pressed={filled}
              className={cn(
                "relative h-full min-h-20 overflow-hidden rounded-t-md rounded-b-2xl border-2 transition-colors",
                filled ? "border-water/50" : "border-border hover:border-water/40 hover:bg-water/5",
                extra && !filled && "border-dashed",
              )}
            >
              <span
                className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  height: filled && mounted ? "100%" : "0%",
                  transitionDelay: filled ? `${i * 40}ms` : "0ms",
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--water) 14%, white), color-mix(in srgb, var(--water) 48%, white))",
                }}
                aria-hidden="true"
              />
            </button>
          );
        })}
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
  const { medications: medList, past, addMedication, removeMedication, updateTimeOfDay } = medications;
  const [newMed, setNewMed] = useState("");
  const [newSlot, setNewSlot] = useState<TimeOfDay>("breakfast");
  const [adding, setAdding] = useState(false);
  // The names being checked, fixed when the check opens.
  const [checking, setChecking] = useState<string[] | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const entry = getEntry(data.medication, activeDate);
  const checkedRaw: Record<string, boolean> = parseNote<Record<string, boolean>>(entry?.note) ?? {};
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

  const addMed = (typed = newMed, slot = newSlot) => {
    const name = typed.trim();
    if (!name || medList.some((m) => m.name.toLowerCase() === name.toLowerCase())) return;
    const med = addMedication(name, slot);
    // A new, unticked medication means today is no longer "everything taken".
    if (med && entry) save(checkedRaw, [...medList, med]);
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

  // Names to suggest as they type, including ones they've taken before.
  const current = new Set(medList.map((m) => m.name.toLowerCase()));
  const suggestions = suggestMedications(newMed, current, past.map((m) => m.name));
  const takenBefore = past.filter((m) => !current.has(m.name.toLowerCase())).slice(-6).reverse();
  const chip = "rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted";

  const addForm = (
    <div className="space-y-3">
      <Input
        value={newMed}
        onChange={(e) => setNewMed(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addMed(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Medication or supplement"
        aria-label="Medication or supplement name"
        ref={nameInput}
        autoFocus
        className="h-9"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestions">
          {suggestions.map((name) => (
            <button key={name} type="button" onClick={() => { setNewMed(name); nameInput.current?.focus(); }} className={chip}>{name}</button>
          ))}
        </div>
      )}
      {!newMed.trim() && takenBefore.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Taken before · tap to add back</p>
          <div className="flex flex-wrap gap-1.5">
            {takenBefore.map((m) => (
              <button key={m.id} type="button" onClick={() => addMed(m.name, m.time_of_day)} className={chip}>
                <Plus className="mr-1 inline size-3" aria-hidden="true" />{m.name}
              </button>
            ))}
          </div>
        </div>
      )}
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
        <Button onClick={() => addMed()} className="h-9 px-4">Add</Button>
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
      description={medList.length ? `${checkedCount} of ${medList.length} taken` : "Optional · counts towards your day once you add one"}
      action={medList.length ? <Figure value={checkedCount} unit={`/ ${medList.length}`} /> : undefined}
      done={allTaken}
      comment={medsComment(
        { total: medList.length, taken: checkedCount, pendingSlots: medList.filter((m) => !checkedRaw[m.id]).map((m) => m.time_of_day) },
        momentFor(activeDate, todayKey()),
      )}
    >
      {(medications.loadError || medications.error) && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {medications.loadError ?? medications.error}
        </p>
      )}
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
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => setAdding(true)} className="h-9 w-full border-dashed text-muted-foreground">
                <Plus />
                Add medication or supplement
              </Button>
              {medList.length >= 2 && (
                <>
                  <Button variant="outline" onClick={() => setChecking(medList.map((m) => m.name))} className="h-9">
                    <ShieldCheck />
                    Check interactions
                  </Button>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-primary-ink" aria-hidden="true" />
                    <span>
                      Uses 1 AI credit if anything isn&apos;t on Fikko&apos;s built-in list, so our AI can review it.
                      Common medications are checked free.
                    </span>
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
      {checking && <InteractionCheck names={checking} onClose={() => setChecking(null)} />}
    </HabitCard>
  );
}

/* ─── Sleep ─── */
export const REST_SCALE = [
  { value: 1, label: "Exhausted",    sub: "Felt no benefit" },
  { value: 2, label: "Still tired",  sub: "Needed more rest" },
  { value: 3, label: "Okay",         sub: "Somewhat refreshed" },
  { value: 4, label: "Rested",       sub: "Woke up feeling good" },
  { value: 5, label: "Fully rested", sub: "Ready to go" },
];

export const SLEEP_FACTORS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "caffeine",  label: "Caffeine",     icon: Coffee },
  { id: "screens",   label: "Late screens", icon: Smartphone },
  { id: "stress",    label: "Stress",       icon: Brain },
  { id: "exercise",  label: "Exercise",     icon: Dumbbell },
  { id: "alcohol",   label: "Alcohol",      icon: Wine },
  { id: "noise",     label: "Noise",        icon: Volume2 },
  { id: "heat",      label: "Too warm",     icon: Thermometer },
  { id: "nap",       label: "Napped",       icon: BedDouble },
];

export interface SleepNote { bedtime?: string; wake?: string; factors?: string[]; }

export function parseSleepNote(raw?: string): SleepNote {
  if (!raw) return {};
  try { return JSON.parse(raw) as SleepNote; } catch { return {}; }
}

function SleepCard({ data, onChange, activeDate, biometrics, goals }: Props) {
  const entry     = getEntry(data.sleep, activeDate);
  const restScore = entry?.value ?? 0;
  const note      = parseSleepNote(entry?.note);

  const saveNote = (patch: Partial<SleepNote>, newRestScore?: number) => {
    const merged = { ...note, ...patch };
    onChange({ ...data, sleep: setDateValue(data.sleep, activeDate, newRestScore ?? restScore, JSON.stringify(merged)) });
  };

  const sleptHours = sleepHours(note.bedtime, note.wake);
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

  const comment = sleepComment(
    { rest: restScore, hours: sleptHours, goal: goals.sleepHours, wearableHours: totalH },
    momentFor(activeDate, todayKey()),
  );

  return (
    <HabitCard
      id="habit-sleep"
      icon={Moon}
      hue="sleep"
      title="Sleep"
      description={`Goal ${formatHours(goals.sleepHours)} a night · done once you log how rested you feel`}
      action={totalH !== null ? <Figure value={totalH} unit="h" /> : undefined}
      done={restScore > 0}
      comment={comment}
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
              body="Connect a wearable in Profile to see sleep stages and HRV here."
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
                <span className="w-4 text-center text-sm text-muted-foreground tabular-nums group-aria-pressed:text-primary-ink">
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
          {sleptHours != null && (
            <p className="text-sm text-muted-foreground">
              {formatHours(sleptHours)} asleep · goal {formatHours(goals.sleepHours)}
            </p>
          )}

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
/** The 1–5 mood scale behind charts, averages and the coach. */
export const MOODS: { value: number; icon: LucideIcon; label: string; note: string }[] = [
  { value: 1, icon: Frown,   label: "Rough", note: "Rough days happen. Be gentle with yourself." },
  { value: 2, icon: Annoyed, label: "Meh",   note: "A so-so day. A short walk can help." },
  { value: 3, icon: Meh,     label: "Okay",  note: "Steady. That counts." },
  { value: 4, icon: Smile,   label: "Good",  note: "Glad it's a good one." },
  { value: 5, icon: Laugh,   label: "Great", note: "Love that. Enjoy it." },
];

/**
 * What members pick from: ten moods, each sitting on the 1–5 scale above so
 * stats keep working. The chosen key is saved in the entry's note.
 */
export const MOOD_OPTIONS: { key: string; value: number; icon: LucideIcon; label: string }[] = [
  { key: "rough",    value: 1, icon: Frown,      label: "Rough" },
  { key: "sad",      value: 1, icon: CloudRain,  label: "Sad" },
  { key: "stressed", value: 2, icon: Zap,        label: "Stressed" },
  { key: "tired",    value: 2, icon: BatteryLow, label: "Tired" },
  { key: "meh",      value: 2, icon: Annoyed,    label: "Meh" },
  { key: "okay",     value: 3, icon: Meh,        label: "Okay" },
  { key: "calm",     value: 4, icon: Leaf,       label: "Calm" },
  { key: "good",     value: 4, icon: Smile,      label: "Good" },
  { key: "happy",    value: 5, icon: SunMedium,  label: "Happy" },
  { key: "great",    value: 5, icon: Laugh,      label: "Great" },
];

/** The option picked for a day: the saved one, or for older entries the scale's own word. */
export function moodOption(value: number, note?: string) {
  if (!value) return undefined;
  return MOOD_OPTIONS.find((o) => o.key === note && o.value === value)
    ?? MOOD_OPTIONS.find((o) => o.key === MOODS[value - 1]?.label.toLowerCase());
}

/** The seven days ending on the viewed day, each with the mood logged that day. */
/** The day being viewed in the middle, three days either side: what was logged before, and the days still to come. */
function MoodWeek({ data, endDate: centerDate }: { data: HabitData; endDate: string }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(centerDate, i - 3));
  return (
    <div className="space-y-2">
      <GroupLabel>Your week</GroupLabel>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((date) => {
          const future = date > todayKey();
          const entry = future ? undefined : getEntry(data.mood, date);
          const option = entry ? moodOption(entry.value, entry.note) : undefined;
          const day = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
          const isCenter = date === centerDate;
          return (
            <li
              key={date}
              className="flex flex-col items-center gap-1"
              aria-current={isCenter ? "date" : undefined}
              aria-label={`${new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}: ${future ? "still to come" : option?.label ?? "no mood logged"}`}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  option ? "pair-soft ring-1 ring-ink/10" : "border border-dashed text-muted-foreground/40",
                  future && "border-muted-foreground/15 bg-muted/40",
                  isCenter && "ring-2 ring-primary ring-offset-2",
                )}
                aria-hidden="true"
              >
                {option ? <option.icon className="size-4" /> : null}
              </span>
              <span className={cn("text-[11px] text-muted-foreground", future && "text-muted-foreground/50", isCenter && "font-semibold text-foreground")} aria-hidden="true">
                {isCenter && date === todayKey() ? "Today" : day}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MoodCard({ data, onChange, activeDate, biometrics }: Props) {
  const mood = getEntry(data.mood, activeDate)?.value ?? 0;
  const rest = getEntry(data.sleep, activeDate)?.value ?? 0;
  const set = (o: (typeof MOOD_OPTIONS)[number]) => onChange({ ...data, mood: setDateValue(data.mood, activeDate, o.value, o.key) });
  const rec = biometrics?.recoveryScore?.find((e) => e.date === activeDate)?.value ?? null;
  const current = moodOption(mood, getEntry(data.mood, activeDate)?.note);

  return (
    <HabitCard
      id="habit-mood"
      icon={SmilePlus}
      hue="mood"
      title="Mood"
      description={current ? `Feeling ${current.label.toLowerCase()}` : "How are you feeling today?"}
      done={mood > 0}
      comment={moodComment({ mood, rest, feeling: current?.key }, momentFor(activeDate, todayKey()))}
    >
      <div className="grid flex-1 auto-rows-fr grid-cols-5 gap-2" role="group" aria-label="Mood">
        {MOOD_OPTIONS.map((m) => (
          <button
            key={m.key}
            onClick={() => set(m)}
            aria-pressed={current?.key === m.key}
            className={cn(optionCls, "flex h-full flex-col items-center justify-center gap-2 px-1 py-3.5 text-center")}
          >
            <m.icon className="size-6" aria-hidden="true" />
            <span className="text-xs font-medium">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        <MoodWeek data={data} endDate={activeDate} />
        {rec !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recovery</span>
              <span className="font-medium tabular-nums">{rec}/100</span>
            </div>
            <HabitBar value={rec} max={100} hue="mood" />
          </div>
        )}
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
        <Card className={cn(softCardCls, "[--card-spacing:--spacing(6)]")}>
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
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-white/60 hover:text-primary-ink"
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
  const isToday = activeDate === todayKey();
  const pickerRef = useRef<HTMLInputElement>(null);

  const shift = (days: number) => {
    const next = shiftDateKey(activeDate, days);
    if (next <= todayKey()) onChange(next);
  };

  const label = (() => {
    if (activeDate === todayKey()) return "Today";
    if (activeDate === shiftDateKey(todayKey(), -1)) return "Yesterday";
    return new Date(activeDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  })();

  return (
    <div className="flex items-center gap-2">
      {!isToday && (
        <Button variant="ghost" onClick={() => onChange(todayKey())} className="h-9 px-3 text-primary-ink hover:bg-white/60 hover:text-primary-ink">
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
          max={todayKey()}
          value={activeDate}
          onChange={(e) => { if (e.target.value && e.target.value <= todayKey()) onChange(e.target.value); }}
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
export default function HabitsView({ data, onChange: saveData, biometrics, medications, userId, profileName, goals, trackMacros, onOpenCommunity }: Omit<Props, "activeDate"> & { onOpenCommunity?: () => void }) {
  const today = useToday();
  const [activeDate, setActiveDate] = useState(today);
  // When the day rolls over, someone looking at "today" moves to the new today.
  const shownToday = useRef(today);
  useEffect(() => {
    if (shownToday.current === today) return;
    setActiveDate((d) => (d === shownToday.current ? today : d));
    shownToday.current = today;
  }, [today]);
  // Set once the member logs something, so data arriving from the server
  // (or a sync) never counts as them finishing the day.
  const memberActed = useRef(false);
  const onChange = (next: HabitUpdate) => { memberActed.current = true; saveData(next); };
  const cardProps = { data, onChange, activeDate, biometrics, medications, userId, profileName, goals, trackMacros };
  // Shared by the Calories card and voice check-ins, so both see the same meals.
  const foodLog = useFoodLog(userId, activeDate, data, onChange);
  const celebrating = useDayCompleteCelebration(data, goals.water, userId, memberActed);
  const summaryRef = useRef<HTMLElement>(null);
  const summaryGone = useScrolledPast(summaryRef);
  const [listenRequest, setListenRequest] = useState(0);
  const backToSummary = () => scrollToCard("today-summary");

  return (
    <div className="space-y-12">
      <StickyDayBar
        show={summaryGone}
        data={data}
        activeDate={activeDate}
        onDateChange={setActiveDate}
        waterGoal={goals.water}
        onDateClick={backToSummary}
        onSpeak={userId ? () => { backToSummary(); setListenRequest((n) => n + 1); } : undefined}
      />
      <div id="today-summary" className="scroll-mt-20">
      <TodaySummary
        data={data}
        activeDate={activeDate}
        onDateChange={setActiveDate}
        profileName={profileName}
        waterGoal={goals.water}
        sectionRef={summaryRef}
        voice={userId && (
          <VoiceCheckIn
            key={activeDate}
            listenRequest={listenRequest}
            data={data}
            date={activeDate}
            isToday={activeDate === todayKey()}
            medications={medications.medications}
            onSave={(next, foods) => (foods.length ? void foodLog.addEntries(foods, next) : onChange(next))}
          />
        )}
      />
      </div>

      <section className="space-y-4">
        <SectionLabel>Nutrition & movement</SectionLabel>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><FoodCard {...cardProps} foodLog={foodLog} /></div>
          <ActivityCard {...cardProps} />
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

      {celebrating.show && <Celebration onDone={celebrating.dismiss} />}
    </div>
  );
}

/**
 * Confetti the moment today's last habit is completed. It plays on the change
 * from "not all done" to "all done", not when opening a page that's already
 * complete, and at most once a day, so unticking and re-ticking doesn't repeat it.
 */
function useDayCompleteCelebration(
  data: HabitData, waterGoal: number, userId: string | null, memberActed: { current: boolean },
) {
  const today = todayKey();
  const { done, total } = completion(data, today, waterGoal);
  const allDone = total > 0 && done === total;
  const wasAllDone = useRef<boolean | null>(null);
  // Opening the app with ?celebrate plays it straight away, for testing.
  const [show, setShow] = useState(() => new URLSearchParams(window.location.search).has("celebrate"));

  useEffect(() => {
    const before = wasAllDone.current;
    wasAllDone.current = allDone;
    // Only a change the member made counts; loading their data just records where the day stands.
    if (before === null || before || !allDone || !userId || !memberActed.current) return;
    const key = `fikko-celebrated-${userId}`;
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { /* storage blocked: celebrate anyway */ }
    setShow(true);
  }, [allDone, today, userId, memberActed]);

  return { show, dismiss: () => setShow(false) };
}

// Building blocks for the mobile app's own Habits page (mobile/src/screens/HabitsScreen.tsx),
// which arranges the same cards under a sticky date bar. The web page above doesn't use these exports.
export {
  CORE_META, CustomHabitsSection, ActivityCard as ExerciseCard, FoodCard, HabitChip, MedicationCard, MoodCard, SleepCard, WaterCard,
  greeting, progressSubtitle, scrollToCard, useDayCompleteCelebration,
};
export type { Props as HabitCardProps };
