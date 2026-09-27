// Mirrors the value limits enforced by the database (migration 006), so the
// app clamps or rejects out-of-range input up front instead of sending a
// write the database would refuse (which would otherwise fail silently).

export const DB_LIMITS = {
  calorieGoal: { min: 500, max: 10000 },
  waterGoal: { min: 1, max: 50 },
  sleepGoal: { min: 1, max: 24 },
  foodGrams: { min: 0, max: 10000 },
  caloriesPer100g: { min: 0, max: 10000 },
  habitValue: { min: 0, max: 100000 },
  nameLength: 100,
  foodNameLength: 200,
};

export function clamp(value: number, { min, max }: { min: number; max: number }) {
  return Math.min(max, Math.max(min, value));
}
