// Unit conversion + metabolic math shared by onboarding and the dashboard.

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;
// Energy stored in a kilogram of body fat. The standard planning figure used
// to turn a target rate of weight change into a daily calorie offset.
const KCAL_PER_KG = 7700;

export function ftInToCm(feet: number, inches: number) {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  // Round to the nearest inch, rolling 12" up into the next foot.
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

export function ageFromDob(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ── Validation ranges ──────────────────────────────────────────────────────
// Shared by the form inputs and the final submit guard so both agree.

export const LIMITS = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
  // 14 is Fikko's minimum age: Korea's PIPA needs a guardian's consent below it.
  age: { min: 14, max: 120 },
};

export const inRange = (v: number, { min, max }: { min: number; max: number }) =>
  Number.isFinite(v) && v >= min && v <= max;

// ── Activity ───────────────────────────────────────────────────────────────
// Labels match ProfileView's ACTIVITY_LEVELS so a profile edited in either
// place stays consistent.

export interface ActivityLevel {
  label: string;
  multiplier: number;
  description: string;
  icon: string;
}

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  { label: "Sedentary", multiplier: 1.2, description: "Desk job, little deliberate movement", icon: "🪑" },
  { label: "Lightly active", multiplier: 1.375, description: "Some walking or light exercise 1–3 days a week", icon: "🚶" },
  { label: "Moderately active", multiplier: 1.55, description: "Regular workouts 3–5 days a week", icon: "🏃" },
  { label: "Very active", multiplier: 1.725, description: "Hard training 6–7 days a week", icon: "🏋️" },
  { label: "Extra active", multiplier: 1.9, description: "Physical job plus intense daily training", icon: "🔥" },
];

export function activityMultiplier(label: string | null): number {
  return ACTIVITY_LEVELS.find((a) => a.label === label)?.multiplier ?? 1.375;
}

// ── Goals ──────────────────────────────────────────────────────────────────

export interface Goal {
  key: string;
  label: string;
  description: string;
  icon: string;
  /** Goals that change body weight get the target-weight + rate step. */
  weightManaging: "loss" | "gain" | null;
}

export const GOALS: Goal[] = [
  { key: "weight_loss", label: "Weight loss", description: "Lose fat at a steady, sustainable pace", icon: "📉", weightManaging: "loss" },
  { key: "muscle_building", label: "Muscle building", description: "Build strength and add lean mass", icon: "💪", weightManaging: "gain" },
  { key: "maintenance", label: "Maintenance", description: "Hold your current weight and stay consistent", icon: "⚖️", weightManaging: null },
  { key: "nutrition", label: "Better nutrition", description: "Eat better and support your gut health", icon: "🥗", weightManaging: null },
  { key: "chronic", label: "Condition management", description: "Track habits around an ongoing condition", icon: "🩺", weightManaging: null },
  { key: "longevity", label: "General longevity", description: "Feel good now and age well later", icon: "🌱", weightManaging: null },
];

export const goalByKey = (key: string | null) => GOALS.find((g) => g.key === key) ?? null;

/** Safe weekly rates of change, in kg/week. Signed at the point of use. */
export const LOSS_RATES = [
  { kg: 0.25, label: "Gentle", note: "0.25 kg / week" },
  { kg: 0.5, label: "Steady", note: "0.5 kg / week" },
  { kg: 0.75, label: "Brisk", note: "0.75 kg / week" },
  { kg: 1.0, label: "Aggressive", note: "1 kg / week" },
];

export const GAIN_RATES = [
  { kg: 0.125, label: "Lean", note: "0.125 kg / week" },
  { kg: 0.25, label: "Steady", note: "0.25 kg / week" },
  { kg: 0.5, label: "Fast", note: "0.5 kg / week" },
];

// ── The calculation ────────────────────────────────────────────────────────

export interface BaselineInput {
  sex: string | null;
  dob: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string | null;
  goalKey: string | null;
  /** Signed kg/week: negative to lose, positive to gain. */
  weeklyRateKg: number | null;
}

export interface Baseline {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  /** calorieTarget - tdee, i.e. the daily deficit (negative) or surplus. */
  adjustment: number;
  /** True when the goal's raw target fell below the safe floor and was raised. */
  clampedToFloor: boolean;
}

/**
 * Mifflin-St Jeor. The male and female constants differ by 166 kcal; for
 * anyone who did not specify, we split the difference rather than guessing.
 */
function bmrFor(sex: string | null, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "Male") return base + 5;
  if (sex === "Female") return base - 161;
  return base - 78;
}

/**
 * Floors below which we will not set a calorie target, regardless of the
 * requested rate of loss. These are the widely used minimums for adults.
 */
function calorieFloor(sex: string | null) {
  return sex === "Male" ? 1500 : 1200;
}

/** Returns null when the inputs needed for Mifflin-St Jeor are incomplete. */
export function computeBaseline(input: BaselineInput): Baseline | null {
  const { sex, dob, heightCm, weightKg, activityLevel, goalKey, weeklyRateKg } = input;
  if (!dob || heightCm == null || weightKg == null) return null;

  const age = ageFromDob(dob);
  if (!inRange(age, LIMITS.age)) return null;
  if (!inRange(heightCm, LIMITS.heightCm)) return null;
  if (!inRange(weightKg, LIMITS.weightKg)) return null;

  const bmr = bmrFor(sex, weightKg, heightCm, age);
  const tdee = bmr * activityMultiplier(activityLevel);

  const goal = goalByKey(goalKey);
  // Only weight-managing goals shift calories away from maintenance.
  const adjustment = goal?.weightManaging && weeklyRateKg
    ? (weeklyRateKg * KCAL_PER_KG) / 7
    : 0;

  const raw = tdee + adjustment;
  const floor = calorieFloor(sex);
  const clampedToFloor = raw < floor;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calorieTarget: Math.round(clampedToFloor ? floor : raw),
    adjustment: Math.round(adjustment),
    clampedToFloor,
  };
}
