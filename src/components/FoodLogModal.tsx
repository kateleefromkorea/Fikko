import { useEffect, useState } from "react";
import { searchFoods, type FoodResult } from "../lib/usdaFoodSearch";
import type { FoodLogItem, MealKey } from "../types";
import { DB_LIMITS, clamp } from "../lib/limits";

interface Props {
  meal: MealKey;
  mealLabel: string;
  items: FoodLogItem[];
  savedFoods: FoodResult[];
  onAdd: (food: { name: string; grams: number; caloriesPer100g: number }) => void;
  onUpdateGrams: (itemId: string, grams: number) => void;
  onDelete: (itemId: string) => void;
  onSaveFood: (name: string, caloriesPer100g: number) => void;
  onClose: () => void;
}

const inputCls =
  "flex-1 rounded-xl border border-border px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const btnPrimary =
  "px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50";

// Everything is stored in grams internally; these let people enter an amount
// in whatever unit is natural and have it converted. Volume conversions assume
// water-like density, which is the usual approximation for food logging.
const UNITS: { key: string; label: string; grams: number }[] = [
  { key: "g",    label: "g",    grams: 1 },
  { key: "oz",   label: "oz",   grams: 28.35 },
  { key: "ml",   label: "ml",   grams: 1 },
  { key: "cup",  label: "cup",  grams: 240 },
  { key: "tbsp", label: "tbsp", grams: 15 },
  { key: "tsp",  label: "tsp",  grams: 5 },
];

export default function FoodLogModal({
  meal, mealLabel, items, savedFoods, onAdd, onUpdateGrams, onDelete, onSaveFood, onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gramsByResult, setGramsByResult] = useState<Record<string, string>>({});
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ name: "", amount: "100", unit: "g", calories: "" });

  const total = items.reduce((sum, i) => sum + i.calories, 0);

  // The user's own saved foods rank above USDA results — they're already known-good.
  const savedMatches = query.trim()
    ? savedFoods.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const allMatches = [...savedMatches, ...results];
  const visibleMatches = showAll ? allMatches : allMatches.slice(0, 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setShowAll(false);
    try {
      const found = await searchFoods(query);
      setResults(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearched(true);
      setSearching(false);
    }
  }

  function addResult(result: FoodResult) {
    const grams = clamp(parseFloat(gramsByResult[result.id] ?? "100") || 100, DB_LIMITS.foodGrams);
    onAdd({ name: result.name, grams, caloriesPer100g: result.caloriesPer100g });
  }

  function addManual() {
    const amount = parseFloat(manual.amount) || 0;
    const calories = parseFloat(manual.calories) || 0;
    const unit = UNITS.find((u) => u.key === manual.unit) ?? UNITS[0];
    const grams = clamp(amount * unit.grams, DB_LIMITS.foodGrams);
    if (!manual.name.trim() || grams <= 0) return;
    const caloriesPer100g = clamp((calories / grams) * 100, DB_LIMITS.caloriesPer100g);
    const name = manual.name.trim().slice(0, DB_LIMITS.foodNameLength);
    onAdd({ name, grams, caloriesPer100g });
    onSaveFood(name, caloriesPer100g);
    setManual({ name: "", amount: "100", unit: "g", calories: "" });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card-solid rounded-2xl p-6 max-h-[85vh] overflow-y-auto flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-foreground text-xl">{mealLabel}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{Math.round(total)} kcal logged</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(item.calories)} kcal</p>
                </div>
                <input
                  type="number"
                  min="0"
                  value={item.grams}
                  onChange={(e) => onUpdateGrams(item.id, clamp(parseFloat(e.target.value) || 0, DB_LIMITS.foodGrams))}
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">g</span>
                <button onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={runSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a food, e.g. banana"
            className={inputCls}
          />
          <button type="submit" disabled={searching} className={btnPrimary}>
            {searching ? "…" : "Search"}
          </button>
        </form>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {allMatches.length > 0 && (
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {visibleMatches.map((result) => (
              <div key={result.id} className="flex items-center gap-2 rounded-xl border border-border p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground truncate">{result.name}</p>
                    {result.saved && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-bold bg-secondary text-secondary-foreground flex-shrink-0">
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {result.brand ? `${result.brand} · ` : ""}
                    {Math.round(result.caloriesPer100g)} kcal / 100g
                  </p>
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="100"
                  value={gramsByResult[result.id] ?? ""}
                  onChange={(e) => setGramsByResult((p) => ({ ...p, [result.id]: e.target.value }))}
                  className="w-16 rounded-lg border border-border px-2 py-1.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">g</span>
                <button onClick={() => addResult(result)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
                  Add
                </button>
              </div>
            ))}
            {!showAll && allMatches.length > 1 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-primary font-bold hover:opacity-70 transition-all self-start px-1"
              >
                Not it? Show {allMatches.length - 1} more {allMatches.length === 2 ? "option" : "options"}
              </button>
            )}
          </div>
        )}

        {searched && !searching && allMatches.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">
            No matches — try a simpler word, or add it manually below.
          </p>
        )}

        <div className="pt-2 border-t border-border">
          {manualMode ? (
            <div className="flex flex-col gap-2">
              <input
                value={manual.name}
                onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))}
                placeholder="Food name"
                className={`${inputCls} w-full`}
              />
              <div className="flex gap-2">
                <div className="flex flex-1 gap-1">
                  <input
                    type="number" min="0"
                    value={manual.amount}
                    onChange={(e) => setManual((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="Amount"
                    className={inputCls}
                  />
                  <select
                    value={manual.unit}
                    onChange={(e) => setManual((p) => ({ ...p, unit: e.target.value }))}
                    className="rounded-xl border border-border bg-card px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>
                </div>
                <input
                  type="number" min="0"
                  value={manual.calories}
                  onChange={(e) => setManual((p) => ({ ...p, calories: e.target.value }))}
                  placeholder="Calories"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={addManual} className={btnPrimary}>Add manually</button>
                <button onClick={() => setManualMode(false)} className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold">Cancel</button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved to your foods so you can search for it next time.
              </p>
            </div>
          ) : (
            <button onClick={() => setManualMode(true)} className="text-sm text-primary font-bold hover:opacity-70 transition-all">
              Can't find it? Add manually
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
