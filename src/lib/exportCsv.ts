import { sleepHours } from "./dashboardStats";

// Spreadsheet exports, built from the same rows as the JSON and PDF exports
// (see account.ts). Two shapes, because a spreadsheet holds one table:
//   • daily: one row per day, every habit, custom habit and wearable reading
//     as a column, ready to chart or pivot.
//   • food: one row per logged food, like a food diary.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snacks"];
const MOOD_WORDS = ["", "Rough", "Meh", "Okay", "Good", "Great"];

/** Wearable readings that get a column, in this order. */
const WEARABLE_COLUMNS: [metric: string, header: string][] = [
  ["steps", "Steps (wearable)"],
  ["activeMinutes", "Active minutes (wearable)"],
  ["activeCalories", "Active calories (wearable)"],
  ["heartRate", "Resting heart rate (bpm)"],
  ["hrv", "HRV (ms)"],
  ["recoveryScore", "Recovery score"],
  ["spo2", "SpO2 (%)"],
  ["weight", "Weight (kg)"],
];

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || !raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (food names
 * come from members and public databases) is prefixed with an apostrophe.
 */
function cell(v: unknown): string {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "";
  if (typeof v === "number") return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The finished file. The byte-order mark makes Excel read Korean and other non-English text correctly. */
function toCsv(header: string[], rows: unknown[][]): Blob {
  const lines = [header, ...rows].map((r) => r.map(cell).join(","));
  return new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
}

export function buildDailyCsv(tables: Tables): Blob {
  const days = new Map<string, Map<string, unknown>>();
  const day = (date: unknown) => {
    const key = String(date);
    if (!days.has(key)) days.set(key, new Map());
    return days.get(key)!;
  };

  for (const e of tables.habit_entries ?? []) {
    const d = day(e.date);
    const value = num(e.value);
    switch (e.category) {
      case "food": d.set("Calories (kcal)", round(value, 0)); break;
      case "water": d.set("Water (glasses)", value); break;
      case "exercise": d.set("Activity (minutes)", value); break;
      case "mood": {
        const note = typeof e.note === "string" && !e.note.startsWith("{") ? e.note : null;
        d.set("Mood (1-5)", value || null);
        d.set("Mood", note ? note[0].toUpperCase() + note.slice(1) : MOOD_WORDS[value] ?? "");
        break;
      }
      case "sleep": {
        const note = parse<{ bedtime?: string; wake?: string; factors?: string[] }>(e.note) ?? {};
        const hours = sleepHours(note.bedtime, note.wake);
        d.set("Rested (1-5)", value || null);
        d.set("Bedtime", note.bedtime ?? "");
        d.set("Wake time", note.wake ?? "");
        d.set("Sleep (hours)", hours == null ? null : round(hours));
        d.set("Sleep notes", (note.factors ?? []).join("; "));
        break;
      }
      case "medication": {
        // Blank, not 0, when the day has no per-item ticks saved.
        const checked = parse<Record<string, boolean>>(e.note);
        d.set("Medications ticked", checked ? Object.values(checked).filter(Boolean).length : null);
        d.set("All medications taken", value === 1 ? "Yes" : "No");
        break;
      }
    }
  }

  // Protein, carbs and fat come from the foods themselves.
  for (const f of tables.food_log_items ?? []) {
    const d = day(f.date);
    const grams = num(f.grams);
    for (const [col, key] of [["Protein (g)", "protein_per_100g"], ["Carbs (g)", "carbs_per_100g"], ["Fat (g)", "fat_per_100g"]] as const) {
      const per100 = num(f[key]);
      if (Number.isFinite(per100) && Number.isFinite(grams)) d.set(col, round(((d.get(col) as number) ?? 0) + (per100 * grams) / 100));
    }
  }

  const customHabits = (tables.custom_habits ?? []).map((h) => ({
    id: String(h.id),
    header: h.unit ? `${h.name} (${h.unit})` : String(h.name),
  }));
  for (const e of tables.custom_habit_entries ?? []) {
    const habit = customHabits.find((h) => h.id === String(e.custom_habit_id));
    if (habit) day(e.date).set(habit.header, num(e.value));
  }

  // Wearable sleep is the sum of its stages.
  for (const b of tables.biometric_entries ?? []) {
    const d = day(b.date);
    const metric = String(b.metric);
    const value = num(b.value);
    if (metric === "sleepRem" || metric === "sleepDeep" || metric === "sleepCore") {
      d.set("Sleep (wearable, hours)", round(((d.get("Sleep (wearable, hours)") as number) ?? 0) + value));
      continue;
    }
    const column = WEARABLE_COLUMNS.find(([m]) => m === metric);
    if (column) d.set(column[1], round(value));
  }

  const header = [
    "Date", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)", "Water (glasses)", "Activity (minutes)",
    "Sleep (hours)", "Bedtime", "Wake time", "Rested (1-5)", "Sleep notes", "Mood (1-5)", "Mood",
    "Medications ticked", "All medications taken",
    ...customHabits.map((h) => h.header),
    "Sleep (wearable, hours)", ...WEARABLE_COLUMNS.map(([, h]) => h),
  ];
  const rows = [...days.keys()].sort().map((date) => {
    const d = days.get(date)!;
    return header.map((h) => (h === "Date" ? date : d.get(h) ?? null));
  });
  return toCsv(header, rows);
}

export function buildFoodCsv(tables: Tables): Blob {
  const header = ["Date", "Meal", "Food", "Grams", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)"];
  const per = (f: Row, key: string) => {
    const per100 = num(f[key]);
    return Number.isFinite(per100) ? round((per100 * num(f.grams)) / 100) : null;
  };
  const rows = [...(tables.food_log_items ?? [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date))
      || MEAL_ORDER.indexOf(String(a.meal)) - MEAL_ORDER.indexOf(String(b.meal)))
    .map((f) => [
      f.date,
      String(f.meal ?? "").replace(/^./, (c) => c.toUpperCase()),
      f.name,
      round(num(f.grams)),
      round(num(f.calories), 0),
      per(f, "protein_per_100g"),
      per(f, "carbs_per_100g"),
      per(f, "fat_per_100g"),
    ]);
  return toCsv(header, rows);
}
