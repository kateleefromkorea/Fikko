// A rough estimate of the calories an activity burns, from its MET value
// (Compendium of Physical Activities, moderate effort) and body weight:
//   kcal ≈ MET × kg × hours
// It's a guide only: effort, fitness and terrain change it a lot.

const METS: [RegExp, number][] = [
  [/run|jog/i, 9.8],
  [/cycl|bike|spin/i, 7.5],
  [/swim/i, 7],
  [/hiit|circuit|crossfit/i, 8],
  [/hike/i, 6],
  [/danc|zumba/i, 5.5],
  [/gym|weight|lift|strength/i, 5],
  [/tennis|football|soccer|basketball/i, 7],
  [/pilates/i, 3],
  [/yoga|stretch/i, 2.5],
  [/walk/i, 3.5],
];
/** Unnamed or unknown workouts count as moderate effort. */
const DEFAULT_MET = 4;
/** Used when the member hasn't given their weight. */
const DEFAULT_WEIGHT_KG = 70;

export function activityCalories(name: string, minutes: number, weightKg?: number | null) {
  const met = METS.find(([re]) => re.test(name))?.[1] ?? DEFAULT_MET;
  return Math.round(met * (weightKg || DEFAULT_WEIGHT_KG) * (minutes / 60));
}
