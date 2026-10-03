import { useMemo, useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import type { OnboardingDraft } from "./draft";
import {
  cmToFtIn, ftInToCm, kgToLb, lbToKg,
  LIMITS, inRange, ageFromDob, goalByKey,
} from "../lib/metabolics";
import { DB_LIMITS } from "../lib/limits";
import { GOAL_FOCUS, MAX_DIET_PATTERNS, dietsOf } from "../lib/preferences";

export type HeightUnit = "cm" | "ft";
export type WeightUnit = "kg" | "lb";

/**
 * Every answer the wizard collects, held as one object so steps can be
 * navigated back and forth without losing input. Numeric fields stay strings
 * while being typed (so a half-typed "1" isn't coerced to a value) and are
 * parsed through the derived getters below.
 */
export interface OnboardingState {
  name: string;
  sex: string | null;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  heightUnit: HeightUnit;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weightUnit: WeightUnit;
  weight: string;
  goalKey: string | null;
  targetWeight: string;
  /** Magnitude in kg/week; the goal decides whether it is a loss or a gain. */
  weeklyRate: number | null;
  /** Specific aims under the goal (GOAL_FOCUS keys), when the goal has them. */
  goalFocus: string[];
  /** Up to MAX_DIET_PATTERNS. */
  dietaryPatterns: string[];
  allergies: string[];
  activityLevel: string | null;
  wearable: string | null;
  /** Daily targets (step 6); blank until suggested from the member's answers. */
  waterGoal: string;
  sleepGoal: string;
  /** Medications and supplements to add to the Medications card. */
  medications: string[];
}

function initialState(profile: ProfileRow): OnboardingState {
  // Pre-fill from anything the profile already knows, so a user who set
  // details on the Profile page first does not retype them.
  const dob = profile.date_of_birth ? new Date(profile.date_of_birth + "T00:00:00") : null;
  const ftIn = profile.height_cm != null ? cmToFtIn(profile.height_cm) : null;

  return {
    name: profile.name ?? "",
    sex: profile.gender ?? null,
    dobDay: dob ? String(dob.getDate()) : "",
    dobMonth: dob ? String(dob.getMonth() + 1) : "",
    dobYear: dob ? String(dob.getFullYear()) : "",
    heightUnit: "cm",
    heightCm: profile.height_cm != null ? String(profile.height_cm) : "",
    heightFt: ftIn ? String(ftIn.feet) : "",
    heightIn: ftIn ? String(ftIn.inches) : "",
    weightUnit: "kg",
    weight: profile.weight_kg != null ? String(profile.weight_kg) : "",
    goalKey: null,
    targetWeight: "",
    weeklyRate: null,
    goalFocus: profile.goal_focus ?? [],
    dietaryPatterns: dietsOf(profile),
    allergies: [],
    activityLevel: profile.activity_level ?? null,
    wearable: null,
    waterGoal: "",
    sleepGoal: "",
    medications: [],
  };
}

export interface OnboardingDerived {
  /** Height in cm, or null when the entry is blank/unparseable. */
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  /** YYYY-MM-DD, or null when the date is incomplete or not a real date. */
  dob: string | null;
  age: number | null;
  /** Signed kg/week, ready for computeBaseline. */
  weeklyRateKg: number | null;
  /**
   * Muscle building with a target at or below today's weight: body
   * recomposition (build muscle, lose fat), so calories stay at maintenance.
   */
  recomposition: boolean;
}

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function derive(s: OnboardingState): OnboardingDerived {
  let heightCm: number | null = null;
  if (s.heightUnit === "cm") {
    heightCm = num(s.heightCm);
  } else {
    const ft = num(s.heightFt);
    const inch = num(s.heightIn) ?? 0;
    heightCm = ft != null ? ftInToCm(ft, inch) : null;
  }

  const toKg = (v: number | null) => (v == null ? null : s.weightUnit === "kg" ? v : lbToKg(v));

  const day = num(s.dobDay), month = num(s.dobMonth), year = num(s.dobYear);
  let dob: string | null = null;
  if (day != null && month != null && year != null) {
    const d = new Date(year, month - 1, day);
    // Rejects impossible dates like 31 February, which JS would roll over.
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      dob = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const direction = goalByKey(s.goalKey)?.weightManaging;
  const weightKg = toKg(num(s.weight));
  const targetWeightKg = toKg(num(s.targetWeight));
  const recomposition = direction === "gain" && weightKg != null && targetWeightKg != null && targetWeightKg <= weightKg;
  const weeklyRateKg = recomposition
    ? 0
    : s.weeklyRate == null || !direction
      ? null
      : direction === "loss" ? -s.weeklyRate : s.weeklyRate;

  return {
    heightCm,
    weightKg,
    targetWeightKg,
    dob,
    age: dob ? ageFromDob(dob) : null,
    weeklyRateKg,
    recomposition,
  };
}

/** Per-step gating. Steps not listed here are always passable (skippable). */
function stepErrors(s: OnboardingState, d: OnboardingDerived): Record<number, string | null> {
  let biometrics: string | null = null;
  if (!d.dob) biometrics = "Pick a full, valid date of birth.";
  else if (d.age == null || !inRange(d.age, LIMITS.age)) biometrics = `Age must be between ${LIMITS.age.min} and ${LIMITS.age.max}.`;
  else if (d.heightCm == null || !inRange(d.heightCm, LIMITS.heightCm)) biometrics = `Height must be between ${LIMITS.heightCm.min} and ${LIMITS.heightCm.max} cm.`;
  else if (d.weightKg == null || !inRange(d.weightKg, LIMITS.weightKg)) biometrics = `Weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`;

  let goals: string | null = null;
  const goal = goalByKey(s.goalKey);
  if (!goal) goals = "Pick the goal that fits you best.";
  else if (goal.weightManaging) {
    if (d.targetWeightKg == null || !inRange(d.targetWeightKg, LIMITS.weightKg)) {
      goals = `Target weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`;
    } else if (goal.weightManaging === "loss" && d.weightKg != null && d.targetWeightKg >= d.weightKg) {
      goals = "For weight loss, the target should be below your current weight.";
    } else if (s.weeklyRate == null && !d.recomposition) {
      // A muscle-building target at or below today's weight is recomposition, which needs no pace.
      goals = "Choose how quickly you want to get there.";
    }
  } else if (GOAL_FOCUS[goal.key] && s.goalFocus.length === 0) {
    goals = "Pick at least one thing to focus on.";
  }

  const water = num(s.waterGoal), sleep = num(s.sleepGoal);
  let targets: string | null = null;
  if (water == null || water < DB_LIMITS.waterGoal.min || water > DB_LIMITS.waterGoal.max) {
    targets = `Water must be between ${DB_LIMITS.waterGoal.min} and ${DB_LIMITS.waterGoal.max} glasses.`;
  } else if (sleep == null || sleep < 4 || sleep > 12) {
    targets = "Sleep must be between 4 and 12 hours.";
  }

  return {
    2: biometrics,
    3: goals,
    5: s.activityLevel ? null : "Pick the activity level closest to your week.",
    6: targets,
  };
}

export function useOnboardingState(profile: ProfileRow, draft: OnboardingDraft | null = null) {
  const [state, setState] = useState<OnboardingState>(() => (draft ? { ...initialState(profile), ...draft.state } : initialState(profile)));

  const derived = useMemo(() => derive(state), [state]);
  const errors = useMemo(() => stepErrors(state, derived), [state, derived]);

  function set<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((p) => ({ ...p, [key]: value }));
  }

  /** Switching units rewrites the entered number so the value is preserved. */
  function setHeightUnit(unit: HeightUnit) {
    setState((p) => {
      if (p.heightUnit === unit) return p;
      if (unit === "ft") {
        const cm = num(p.heightCm);
        if (cm == null) return { ...p, heightUnit: unit };
        const { feet, inches } = cmToFtIn(cm);
        return { ...p, heightUnit: unit, heightFt: String(feet), heightIn: String(inches) };
      }
      const ft = num(p.heightFt);
      if (ft == null) return { ...p, heightUnit: unit };
      return { ...p, heightUnit: unit, heightCm: String(Math.round(ftInToCm(ft, num(p.heightIn) ?? 0))) };
    });
  }

  function setWeightUnit(unit: WeightUnit) {
    setState((p) => {
      if (p.weightUnit === unit) return p;
      const convert = (v: string) => {
        const n = num(v);
        if (n == null) return v;
        return String(Math.round((unit === "lb" ? kgToLb(n) : lbToKg(n)) * 10) / 10);
      };
      return { ...p, weightUnit: unit, weight: convert(p.weight), targetWeight: convert(p.targetWeight) };
    });
  }

  function toggleAllergy(tag: string) {
    setState((p) => {
      // "None" is exclusive with the real allergens.
      if (tag === "None") return { ...p, allergies: p.allergies.includes("None") ? [] : ["None"] };
      const without = p.allergies.filter((a) => a !== "None");
      return {
        ...p,
        allergies: without.includes(tag) ? without.filter((a) => a !== tag) : [...without, tag],
      };
    });
  }

  /** Adds or removes a dietary pattern; at most MAX_DIET_PATTERNS can be on. */
  function toggleDiet(pattern: string) {
    setState((p) => {
      if (p.dietaryPatterns.includes(pattern)) return { ...p, dietaryPatterns: p.dietaryPatterns.filter((x) => x !== pattern) };
      if (p.dietaryPatterns.length >= MAX_DIET_PATTERNS) return p;
      return { ...p, dietaryPatterns: [...p.dietaryPatterns, pattern] };
    });
  }

  function toggleFocus(key: string) {
    setState((p) => ({
      ...p,
      goalFocus: p.goalFocus.includes(key) ? p.goalFocus.filter((x) => x !== key) : [...p.goalFocus, key],
    }));
  }

  return { state, derived, errors, set, setHeightUnit, setWeightUnit, toggleAllergy, toggleDiet, toggleFocus };
}
