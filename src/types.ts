export type HabitCategory = "water" | "medication" | "food" | "exercise" | "sleep" | "mood" | "custom";

export interface HabitEntry {
  date: string; // YYYY-MM-DD
  value: number;
  note?: string;
}

export interface CustomHabit {
  id: string;
  name: string;
  unit: string;
  target: number;
  color: string;
  icon: string;
  entries: HabitEntry[];
}

export interface HabitData {
  water: HabitEntry[];
  medication: HabitEntry[];
  food: HabitEntry[];
  exercise: HabitEntry[];
  sleep: HabitEntry[];
  mood: HabitEntry[];
  custom: CustomHabit[];
  /**
   * False when the member has no medications listed, so Medications doesn't
   * count towards their day. Set by the app from the medication list; missing
   * means it counts.
   */
  tracksMedications?: boolean;
}

export type MealKey = "breakfast" | "lunch" | "dinner" | "snacks";

export type TimeOfDay = "breakfast" | "midday" | "night";

/** Protein, carbs and fat in grams per 100 g. Null or missing when unknown. */
export interface MacrosPer100g {
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
}

export interface FoodLogItem extends MacrosPer100g {
  id: string;
  meal: MealKey;
  name: string;
  grams: number;
  caloriesPer100g: number;
  calories: number;
}

export interface BiometricEntry {
  date: string;
  value: number;
}

export interface BiometricData {
  heartRate: BiometricEntry[];       // resting bpm
  hrv: BiometricEntry[];             // ms — higher = better recovery
  spo2: BiometricEntry[];            // % blood oxygen
  respiratoryRate: BiometricEntry[]; // breaths/min
  bodyTemp: BiometricEntry[];        // °C deviation from personal baseline
  steps: BiometricEntry[];           // daily step count
  activeCalories: BiometricEntry[];  // kcal burned (active)
  vo2max: BiometricEntry[];          // ml/kg/min
  standHours: BiometricEntry[];      // hours with at least 1 min standing
  sleepRem: BiometricEntry[];        // hours of REM sleep
  sleepDeep: BiometricEntry[];       // hours of deep sleep
  sleepCore: BiometricEntry[];       // hours of core/light sleep
  recoveryScore: BiometricEntry[];   // 0–100
  stressScore: BiometricEntry[];     // 0–100 (lower = less stress)
  weight: BiometricEntry[];          // kg
}

/**
 * No wearable sync exists yet, so every user's device data is empty. The
 * Habits cards and Dashboard read this and show "no device data" states
 * instead of numbers. Replace with real synced data once an integration ships.
 */
export const EMPTY_BIOMETRICS: BiometricData = {
  heartRate: [], hrv: [], spo2: [], respiratoryRate: [], bodyTemp: [],
  steps: [], activeCalories: [], vo2max: [], standHours: [],
  sleepRem: [], sleepDeep: [], sleepCore: [],
  recoveryScore: [], stressScore: [], weight: [],
};
