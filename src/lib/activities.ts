import {
  Activity, BicepsFlexed, Bike, Baby, CircleDot, Dog, Dumbbell, Flame, Flower2, Footprints, Gauge, Goal, Hand, HeartPulse,
  House, Leaf, Mountain, MountainSnow, Music, PersonStanding, Rows3, Ship, Shovel, Snowflake, StretchHorizontal, Swords,
  Target, Trophy, Volleyball, Waves, Wind, Zap, type LucideIcon,
} from "lucide-react";
import type { Intensity, Workout } from "./workouts";

// Every activity a member can log, with what it burns. Calories are estimated
// from MET values (Compendium of Physical Activities) and body weight:
//   kcal ≈ MET × kg × hours
// A guide only: fitness, terrain and effort change it a lot, which is why the
// member can always enter their watch's or machine's number instead.

export interface ActivityType {
  type: string;
  label: string;
  icon: LucideIcon;
  /** METs at easy, moderate and hard effort. */
  met: [number, number, number];
  /** Matches older free-text names ("evening jog") and search words. */
  match?: RegExp;
}

export const ACTIVITIES: ActivityType[] = [
  { type: "walk", label: "Walk", icon: Footprints, met: [2.8, 3.5, 5], match: /walk|stroll/i },
  { type: "run", label: "Run", icon: Wind, met: [8, 9.8, 11.5], match: /run|jog/i },
  { type: "strength", label: "Gym", icon: Dumbbell, met: [3.5, 5, 6], match: /gym|weight|lift|strength|resistance/i },
  { type: "yoga", label: "Yoga", icon: Flower2, met: [2, 2.5, 4], match: /yoga/i },
  { type: "cycling", label: "Cycling", icon: Bike, met: [4, 7.5, 10], match: /cycl|bike|biking/i },
  { type: "swim", label: "Swim", icon: Waves, met: [5, 7, 9.8], match: /swim/i },
  { type: "hiit", label: "HIIT", icon: Flame, met: [6, 8, 10], match: /hiit|interval|tabata/i },
  { type: "hike", label: "Hiking", icon: Mountain, met: [5, 6, 7.8], match: /hike|hiking|trek/i },
  { type: "pilates", label: "Pilates", icon: StretchHorizontal, met: [2.8, 3, 4], match: /pilates|barre/i },
  { type: "dance", label: "Dance", icon: Music, met: [4.5, 5.5, 7.3], match: /danc|zumba/i },
  { type: "spin", label: "Spin class", icon: Bike, met: [6.8, 8.5, 11], match: /spin|peloton/i },
  { type: "aerobics", label: "Aerobics", icon: HeartPulse, met: [5, 6.5, 7.3], match: /aerobic|cardio|step class/i },
  { type: "circuit", label: "Circuit / CrossFit", icon: BicepsFlexed, met: [4.3, 8, 8], match: /circuit|crossfit|bootcamp/i },
  { type: "elliptical", label: "Elliptical", icon: Gauge, met: [4.6, 5, 6], match: /elliptical|cross.?trainer/i },
  { type: "stairs", label: "Stair climbing", icon: Rows3, met: [4, 8, 9], match: /stair/i },
  { type: "rowing", label: "Rowing", icon: Ship, met: [4.8, 7, 8.5], match: /row(ing)?\b|erg/i },
  { type: "tennis", label: "Tennis", icon: Target, met: [5, 7, 8], match: /tennis|squash|padel/i },
  { type: "badminton", label: "Badminton", icon: Target, met: [4.5, 5.5, 7], match: /badminton/i },
  { type: "football", label: "Football", icon: Goal, met: [7, 8, 10], match: /football|soccer|futsal/i },
  { type: "basketball", label: "Basketball", icon: CircleDot, met: [6, 6.5, 8], match: /basketball/i },
  { type: "volleyball", label: "Volleyball", icon: Volleyball, met: [3, 4, 6], match: /volleyball/i },
  { type: "golf", label: "Golf", icon: Trophy, met: [3.5, 4.8, 5.3], match: /golf/i },
  { type: "climbing", label: "Climbing", icon: Mountain, met: [5.8, 7.5, 8], match: /climb|boulder/i },
  { type: "martial-arts", label: "Martial arts", icon: Swords, met: [5.3, 10.3, 10.3], match: /martial|karate|judo|taekwondo|jiu|bjj|kickbox/i },
  { type: "boxing", label: "Boxing", icon: Hand, met: [5.5, 7.8, 12], match: /box(ing)?\b|punch/i },
  { type: "jump-rope", label: "Jump rope", icon: Zap, met: [8.8, 11.8, 12.3], match: /jump.?rope|skipping/i },
  { type: "skiing", label: "Skiing", icon: MountainSnow, met: [4.3, 6, 8], match: /ski/i },
  { type: "skating", label: "Skating", icon: Snowflake, met: [5, 7, 9], match: /skat|snowboard/i },
  { type: "stretching", label: "Stretching", icon: PersonStanding, met: [2.3, 2.3, 2.8], match: /stretch|mobility/i },
  { type: "tai-chi", label: "Tai chi", icon: Leaf, met: [3, 3, 4], match: /tai.?chi|qigong/i },
  { type: "gardening", label: "Gardening", icon: Shovel, met: [2.5, 3.8, 5], match: /garden|yard/i },
  { type: "housework", label: "Housework", icon: House, met: [2.3, 3.3, 4], match: /house|clean|chores/i },
  { type: "dog-walk", label: "Dog walk", icon: Dog, met: [3, 3.5, 4], match: /dog/i },
  { type: "kids", label: "Playing with kids", icon: Baby, met: [2.8, 4, 5.8], match: /kids|children|playground/i },
];

/** A member's own activity ("Paddleboarding"): moderate effort unless they say otherwise. */
export const OTHER: ActivityType = { type: "other", label: "Other", icon: Activity, met: [3, 4, 6] };

/** The chips shown before a member has history of their own. */
export const STARTER_TYPES = ["walk", "run", "strength", "yoga", "cycling", "swim"];

const BY_TYPE = new Map(ACTIVITIES.map((a) => [a.type, a]));

export const activityOf = (type: string) => BY_TYPE.get(type) ?? OTHER;

/** The catalogue type a free-text name means, or "other". Dog walk before walk, spin before cycling. */
export function typeFromName(name: string): string {
  const n = name.trim();
  if (!n) return "other";
  const exact = ACTIVITIES.find((a) => a.label.toLowerCase() === n.toLowerCase());
  if (exact) return exact.type;
  const specific = ["dog-walk", "spin", "jump-rope", "stairs", "elliptical"].map((t) => BY_TYPE.get(t)!);
  return [...specific, ...ACTIVITIES].find((a) => a.match?.test(n))?.type ?? "other";
}

/** What a workout is called on screen: its own name, or its type's label. */
export const workoutLabel = (w: Pick<Workout, "type" | "name">) =>
  w.name || (w.type === "other" ? "Workout" : activityOf(w.type).label);

const INTENSITY_INDEX: Record<Intensity, number> = { easy: 0, moderate: 1, hard: 2 };
/** Used when the member hasn't given their weight. */
const DEFAULT_WEIGHT_KG = 70;

export function estimateKcal(type: string, intensity: Intensity | undefined, minutes: number, weightKg?: number | null) {
  const met = activityOf(type).met[INTENSITY_INDEX[intensity ?? "moderate"]];
  return Math.round(met * (weightKg || DEFAULT_WEIGHT_KG) * (minutes / 60));
}

/** A workout's calories: the number the member entered, or else the estimate. */
export function workoutKcal(w: Workout, weightKg?: number | null): { kcal: number; estimated: boolean } {
  return w.kcal != null
    ? { kcal: w.kcal, estimated: false }
    : { kcal: estimateKcal(w.type, w.intensity, w.minutes, weightKg), estimated: true };
}

/**
 * The day's burn: logged workouts plus what a wearable counted. Shared by the
 * Activity card and the Calories card's net, so the two always agree.
 */
export function dayBurn(workouts: Workout[], weightKg: number | null | undefined, deviceKcal: number | null) {
  const logged = workouts.reduce((sum, w) => sum + workoutKcal(w, weightKg).kcal, 0);
  const device = Math.round(deviceKcal ?? 0);
  return { logged, device, total: logged + device, estimated: workouts.some((w) => w.kcal == null) };
}
