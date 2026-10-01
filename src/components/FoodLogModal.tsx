import { useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { searchFoods, type FoodResult } from "../lib/usdaFoodSearch";
import type { FoodLogItem, MacrosPer100g, MealKey } from "../types";
import { formatMacros, macrosFor, sumMacros } from "../lib/macros";
import { DB_LIMITS, clamp } from "../lib/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface Props {
  meal: MealKey;
  mealLabel: string;
  items: FoodLogItem[];
  savedFoods: FoodResult[];
  onAdd: (food: { name: string; grams: number; caloriesPer100g: number } & MacrosPer100g) => void;
  onUpdateGrams: (itemId: string, grams: number) => void;
  onDelete: (itemId: string) => void;
  onSaveFood: (name: string, caloriesPer100g: number, macros?: MacrosPer100g) => void;
  onClose: () => void;
  /** For members who track detailed macros: show protein, carbs and fat. */
  showMacros?: boolean;
}

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
  mealLabel, items, savedFoods, onAdd, onUpdateGrams, onDelete, onSaveFood, onClose, showMacros,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gramsByResult, setGramsByResult] = useState<Record<string, string>>({});
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ name: "", amount: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });

  const total = items.reduce((sum, i) => sum + i.calories, 0);
  const mealMacros = sumMacros(items);

  // The user's own saved foods rank above USDA results — they're already known-good.
  const savedMatches = query.trim()
    ? savedFoods.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const allMatches = [...savedMatches, ...results];
  const visibleMatches = showAll ? allMatches : allMatches.slice(0, 1);

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
    onAdd({
      name: result.name,
      grams,
      caloriesPer100g: result.caloriesPer100g,
      proteinPer100g: result.proteinPer100g,
      carbsPer100g: result.carbsPer100g,
      fatPer100g: result.fatPer100g,
    });
  }

  function addManual() {
    const amount = parseFloat(manual.amount) || 0;
    const calories = parseFloat(manual.calories) || 0;
    const unit = UNITS.find((u) => u.key === manual.unit) ?? UNITS[0];
    const grams = clamp(amount * unit.grams, DB_LIMITS.foodGrams);
    if (!manual.name.trim() || grams <= 0) return;
    const caloriesPer100g = clamp((calories / grams) * 100, DB_LIMITS.caloriesPer100g);
    const name = manual.name.trim().slice(0, DB_LIMITS.foodNameLength);
    // Macros are typed for the amount eaten; stored per 100 g like calories. Left blank, they stay unknown.
    const per100 = (v: string) => (v.trim() === "" ? null : Math.min(100, Math.max(0, ((parseFloat(v) || 0) / grams) * 100)));
    const macros: MacrosPer100g = showMacros
      ? { proteinPer100g: per100(manual.protein), carbsPer100g: per100(manual.carbs), fatPer100g: per100(manual.fat) }
      : {};
    onAdd({ name, grams, caloriesPer100g, ...macros });
    onSaveFood(name, caloriesPer100g, macros);
    setManual({ name: "", amount: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] gap-6 overflow-y-auto p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{mealLabel}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {Math.round(total)} kcal logged
            {showMacros && items.length > 0 && ` · ${formatMacros(mealMacros.total)}`}
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(item.calories)} kcal
                    {showMacros && (() => { const m = macrosFor(item); return m ? ` · ${formatMacros(m)}` : " · macros unknown"; })()}
                  </p>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={item.grams}
                  onChange={(e) => onUpdateGrams(item.id, clamp(parseFloat(e.target.value) || 0, DB_LIMITS.foodGrams))}
                  aria-label={`Grams of ${item.name}`}
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">g</span>
                <Button variant="ghost" size="icon-sm" onClick={() => onDelete(item.id)} aria-label={`Remove ${item.name}`} className="text-muted-foreground">
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a food, e.g. banana"
                aria-label="Search foods"
                className="h-9 pl-9"
              />
            </div>
            <Button type="submit" disabled={searching} className="h-9 min-w-20 px-4">
              {searching ? <Loader2 className="animate-spin" /> : "Search"}
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {allMatches.length > 0 && (
            <div className="space-y-2">
              <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                {visibleMatches.map((result) => (
                  <li key={result.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{result.name}</p>
                        {result.saved && <Badge variant="secondary">Saved</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {result.brand ? `${result.brand} · ` : ""}
                        {Math.round(result.caloriesPer100g)} kcal / 100g
                        {showMacros && (() => { const m = macrosFor({ ...result, grams: 100 }); return m ? ` · ${formatMacros(m)}` : ""; })()}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      value={gramsByResult[result.id] ?? ""}
                      onChange={(e) => setGramsByResult((p) => ({ ...p, [result.id]: e.target.value }))}
                      aria-label={`Grams of ${result.name}`}
                      className="h-8 w-16"
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                    <Button size="sm" onClick={() => addResult(result)} className="h-8 px-3">
                      <Plus />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
              {!showAll && allMatches.length > 1 && (
                <Button variant="link" onClick={() => setShowAll(true)} className="h-auto p-0">
                  Not it? Show {allMatches.length - 1} more {allMatches.length === 2 ? "option" : "options"}
                </Button>
              )}
            </div>
          )}

          {searched && !searching && allMatches.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">No matches. Try a simpler word, or add it yourself below.</p>
          )}
        </div>

        <Separator />

        {manualMode ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-name">Food name</Label>
              <Input
                id="manual-name"
                value={manual.name}
                onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="manual-amount">Amount</Label>
                <div className="flex gap-2">
                  <Input
                    id="manual-amount"
                    type="number" min="0"
                    value={manual.amount}
                    onChange={(e) => setManual((p) => ({ ...p, amount: e.target.value }))}
                    className="h-9"
                  />
                  <Select value={manual.unit} onValueChange={(unit) => setManual((p) => ({ ...p, unit }))}>
                    <SelectTrigger className="h-9 w-20" aria-label="Unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-calories">Calories</Label>
                <Input
                  id="manual-calories"
                  type="number" min="0"
                  value={manual.calories}
                  onChange={(e) => setManual((p) => ({ ...p, calories: e.target.value }))}
                  placeholder="kcal"
                  className="h-9"
                />
              </div>
            </div>
            {showMacros && (
              <div className="grid grid-cols-3 gap-3">
                {(["protein", "carbs", "fat"] as const).map((k) => (
                  <div key={k} className="space-y-2">
                    <Label htmlFor={`manual-${k}`} className="capitalize">{k} (g)</Label>
                    <Input
                      id={`manual-${k}`}
                      type="number" min="0"
                      value={manual[k]}
                      onChange={(e) => setManual((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="Optional"
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Saved to your foods so you can search for it next time.</p>
            <div className="flex gap-2">
              <Button onClick={addManual} className="h-9 px-4">Add food</Button>
              <Button variant="ghost" onClick={() => setManualMode(false)} className="h-9 px-4">Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="link" onClick={() => setManualMode(true)} className="h-auto justify-self-start p-0">
            Can't find it? Add your own food
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
