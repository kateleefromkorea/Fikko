import { useMemo, useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import type { OnboardingDraft } from "./draft";
import {
  cmToFtIn, ftInToCm, kgToLb, lbToKg,
  LIMITS, inRange, ageFromDob, goalByKey,
} from "../lib/metabolics";

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
  dietaryPattern: string | null;
  allergies: string[];
  activityLevel: string | null;
  wearable: string | null;
  trackingStyle: string | null;
  remindersEnabled: boolean;
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
    dietaryPattern: null,
    allergies: [],
    activityLevel: profile.activity_level ?? null,
    wearable: null,
    trackingStyle: null,
    remindersEnabled: false,
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
  const weeklyRateKg = s.weeklyRate == null || !direction
    ? null
    : direction === "loss" ? -s.weeklyRate : s.weeklyRate;

  return {
    heightCm,
    weightKg: toKg(num(s.weight)),
    targetWeightKg: toKg(num(s.targetWeight)),
    dob,
    age: dob ? ageFromDob(dob) : null,
    weeklyRateKg,
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
    } else if (s.weeklyRate == null) {
      goals = "Choose how quickly you want to get there.";
    } else if (goal.weightManaging === "loss" && d.weightKg != null && d.targetWeightKg >= d.weightKg) {
      goals = "For weight loss, the target should be below your current weight.";
    } else if (goal.weightManaging === "gain" && d.weightKg != null && d.targetWeightKg <= d.weightKg) {
      goals = "For muscle building, the target should be above your current weight.";
    }
  }

  return {
    2: biometrics,
    3: goals,
    5: s.activityLevel ? null : "Pick the activity level closest to your week.",
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

  return { state, derived, errors, set, setHeightUnit, setWeightUnit, toggleAllergy };
}
