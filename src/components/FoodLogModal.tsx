import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { BookmarkPlus, History, Loader2, Plus, Repeat, ScanBarcode, Search, X } from "lucide-react";
import { lookupBarcode, searchFoods, type FoodResult } from "../lib/usdaFoodSearch";
import { mealItemsOn, recentFoods } from "../lib/foodHistory";
import { shiftDateKey } from "../lib/dates";
import { savedMealCalories, type SavedMeal, type SavedMealItem } from "../hooks/useSavedMeals";
import type { NewFood } from "../hooks/useFoodLog";
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

// The camera code is only downloaded when someone taps Scan.
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));

interface Props {
  meal: MealKey;
  mealLabel: string;
  /** The day being logged, and who's logging it, for repeats and recent foods. */
  date: string;
  userId: string | null;
  items: FoodLogItem[];
  savedFoods: FoodResult[];
  savedMeals: SavedMeal[];
  onAdd: (food: NewFood) => void;
  onAddMany: (foods: NewFood[]) => void;
  onUpdateGrams: (itemId: string, grams: number) => void;
  onDelete: (itemId: string) => void;
  onSaveFood: (name: string, caloriesPer100g: number, macros?: MacrosPer100g, barcode?: string) => void;
  onSaveMeal: (name: string, items: SavedMealItem[]) => Promise<void>;
  onDeleteMeal: (id: string) => void;
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

const EMPTY_MANUAL = { name: "", amount: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" };

const asNewFood = (f: FoodLogItem | SavedMealItem): NewFood => ({
  name: f.name,
  grams: f.grams,
  caloriesPer100g: f.caloriesPer100g,
  proteinPer100g: f.proteinPer100g ?? null,
  carbsPer100g: f.carbsPer100g ?? null,
  fatPer100g: f.fatPer100g ?? null,
});

export default function FoodLogModal({
  meal, mealLabel, date, userId, items, savedFoods, savedMeals, onAdd, onAddMany, onUpdateGrams, onDelete,
  onSaveFood, onSaveMeal, onDeleteMeal, onClose, showMacros,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gramsByResult, setGramsByResult] = useState<Record<string, string>>({});
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  // Scanning: the camera is open, a code is being looked up, or a product was found.
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [scanned, setScanned] = useState<FoodResult | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Repeats.
  const [recent, setRecent] = useState<FoodLogItem[]>([]);
  const [yesterday, setYesterday] = useState<FoodLogItem[]>([]);
  const [namingMeal, setNamingMeal] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealSaved, setMealSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void Promise.all([recentFoods(userId, meal), mealItemsOn(userId, shiftDateKey(date, -1), meal)]).then(([r, y]) => {
      if (!live) return;
      setRecent(r);
      setYesterday(y);
    });
    return () => { live = false; };
  }, [userId, meal, date]);

  const total = items.reduce((sum, i) => sum + i.calories, 0);
  const mealMacros = sumMacros(items);

  // The member's own saved foods rank above database results — they're already known-good.
  const savedMatches = query.trim()
    ? savedFoods.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const allMatches = [...savedMatches, ...results];
  const visibleMatches = showAll ? allMatches : allMatches.slice(0, 1);
  const loggedNames = new Set(items.map((i) => i.name.toLowerCase()));
  const recentToShow = recent.filter((r) => !loggedNames.has(r.name.toLowerCase())).slice(0, 6);
  const yesterdayKcal = yesterday.reduce((s, i) => s + i.calories, 0);
  const browsing = !query.trim() && !scanning && !scanned && !manualMode;

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setShowAll(false);
    setScanned(null);
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

  const onCode = useCallback(async (code: string) => {
    setScanning(false);
    setError(null);
    setNotFound(false);
    // The member's own foods first: a product they added after an earlier scan.
    const own = savedFoods.find((f) => f.barcode === code);
    if (own) {
      setScanned(own);
      return;
    }
    setLookingUp(true);
    try {
      const food = await lookupBarcode(code);
      if (food) setScanned(food);
      else {
        // Unknown product: add it once, with its barcode, so it's found next time.
        setNotFound(true);
        setPendingBarcode(code);
        setManual(EMPTY_MANUAL);
        setManualMode(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Barcode lookup failed.");
    } finally {
      setLookingUp(false);
    }
  }, [savedFoods]);

  const defaultGrams = (r: FoodResult) => r.servingGrams ?? 100;

  function addResult(result: FoodResult) {
    const grams = clamp(parseFloat(gramsByResult[result.id] ?? "") || defaultGrams(result), DB_LIMITS.foodGrams);
    onAdd({
      name: result.brand && !result.name.toLowerCase().includes(result.brand.toLowerCase()) ? `${result.name} (${result.brand})` : result.name,
      grams,
      caloriesPer100g: result.caloriesPer100g,
      proteinPer100g: result.proteinPer100g,
      carbsPer100g: result.carbsPer100g,
      fatPer100g: result.fatPer100g,
    });
    if (result === scanned) setScanned(null);
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
    onSaveFood(name, caloriesPer100g, macros, pendingBarcode ?? undefined);
    setManual(EMPTY_MANUAL);
    setPendingBarcode(null);
    setNotFound(false);
    setManualMode(false);
  }

  async function saveMeal() {
    const name = mealName.trim();
    if (!name) return;
    try {
      await onSaveMeal(name, items.map(asNewFood) as SavedMealItem[]);
      setMealSaved(name);
      setNamingMeal(false);
      setMealName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that meal.");
    }
  }

  /**
   * One row of a food you can add, from search, a scan or the recent list. A
   * render function rather than a component, so typing grams keeps focus.
   */
  const resultRow = (result: FoodResult) => (
      <li key={result.id} className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{result.name}</p>
            {result.saved && <Badge variant="secondary">Saved</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {result.brand ? `${result.brand} · ` : ""}
            {Math.round(result.caloriesPer100g)} kcal / 100g
            {result.servingGrams ? ` · serving ${result.servingGrams} g` : ""}
            {showMacros && (() => { const m = macrosFor({ ...result, grams: 100 }); return m ? ` · ${formatMacros(m)}` : ""; })()}
          </p>
        </div>
        <Input
          type="number"
          min="1"
          placeholder={String(defaultGrams(result))}
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
  );

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
          <div className="space-y-2">
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
            {namingMeal ? (
              <form onSubmit={(e) => { e.preventDefault(); void saveMeal(); }} className="flex gap-2">
                <Input
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder={`e.g. My usual ${mealLabel.toLowerCase()}`}
                  aria-label="Name for this meal"
                  maxLength={60}
                  autoFocus
                  className="h-8"
                />
                <Button type="submit" size="sm" disabled={!mealName.trim()} className="h-8 px-3">Save</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setNamingMeal(false)} className="h-8 px-3">Cancel</Button>
              </form>
            ) : (
              <Button variant="link" onClick={() => { setNamingMeal(true); setMealSaved(null); }} className="h-auto p-0 text-sm">
                <BookmarkPlus />
                Save these foods as a meal
              </Button>
            )}
            {mealSaved && <p role="status" className="text-xs text-primary">Saved “{mealSaved}”. Find it here next time to log it in one tap.</p>}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <form onSubmit={runSearch} className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) { setResults([]); setSearched(false); } }}
                  placeholder="Search foods or brands"
                  aria-label="Search foods"
                  className="h-9 pl-9"
                />
              </div>
              <Button type="submit" disabled={searching} className="h-9 min-w-20 px-4">
                {searching ? <Loader2 className="animate-spin" /> : "Search"}
              </Button>
            </form>
            <Button
              variant="outline"
              onClick={() => { setScanning((s) => !s); setScanned(null); setError(null); setNotFound(false); }}
              className="h-9 px-3"
              aria-label="Scan a barcode"
              aria-pressed={scanning}
            >
              <ScanBarcode />
              <span className="hidden sm:inline">Scan</span>
            </Button>
          </div>

          {scanning && (
            <Suspense fallback={<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Starting camera…</p>}>
              <BarcodeScanner onCode={onCode} onCancel={() => setScanning(false)} />
            </Suspense>
          )}
          {lookingUp && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking up that product…</p>}
          {scanned && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Scanned product</p>
              <ul className="rounded-lg border">{resultRow(scanned)}</ul>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!scanned && allMatches.length > 0 && (
            <div className="space-y-2">
              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {visibleMatches.map(resultRow)}
              </ul>
              {!showAll && allMatches.length > 1 && (
                <Button variant="link" onClick={() => setShowAll(true)} className="h-auto p-0">
                  Not it? Show {allMatches.length - 1} more {allMatches.length === 2 ? "option" : "options"}
                </Button>
              )}
            </div>
          )}

          {searched && !searching && !scanned && allMatches.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">No matches. Try a simpler word, scan the pack, or add it yourself below.</p>
          )}
        </div>

        {/* One-tap repeats, while nothing is being searched or scanned. */}
        {browsing && (yesterday.length > 0 || savedMeals.length > 0 || recentToShow.length > 0) && (
          <div className="space-y-5">
            {yesterday.length > 0 && items.length === 0 && (
              <Button variant="outline" onClick={() => onAddMany(yesterday.map(asNewFood))} className="h-auto w-full justify-start gap-3 px-4 py-3 text-left">
                <Repeat className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Same as yesterday</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {yesterday.map((i) => i.name).join(", ")} · {Math.round(yesterdayKcal)} kcal
                  </span>
                </span>
              </Button>
            )}

            {savedMeals.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your meals</p>
                <ul className="divide-y rounded-lg border">
                  {savedMeals.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.items.map((i) => i.name).join(", ")} · {Math.round(savedMealCalories(m))} kcal
                        </p>
                      </div>
                      <Button size="sm" onClick={() => onAddMany(m.items.map(asNewFood))} className="h-8 px-3">
                        <Plus />
                        Add
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => onDeleteMeal(m.id)} aria-label={`Delete saved meal ${m.name}`} className="text-muted-foreground">
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recentToShow.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <History className="size-3.5" aria-hidden="true" /> Recent
                </p>
                <ul className="divide-y rounded-lg border">
                  {recentToShow.map((r) => (
                    resultRow({ id: `recent-${r.id}`, name: r.name, caloriesPer100g: r.caloriesPer100g, proteinPer100g: r.proteinPer100g, carbsPer100g: r.carbsPer100g, fatPer100g: r.fatPer100g, servingGrams: r.grams })
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Separator />

        {manualMode ? (
          <div className="space-y-4">
            {notFound && (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                We couldn&apos;t find that product. Add it once from the label and it&apos;ll be found next time you scan it.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="manual-name">Food name</Label>
              <Input
                id="manual-name"
                value={manual.name}
                onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))}
                autoFocus={notFound}
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
            <p className="text-sm text-muted-foreground">
              Saved to your foods so you can {pendingBarcode ? "scan or search" : "search"} for it next time.
            </p>
            <div className="flex gap-2">
              <Button onClick={addManual} className="h-9 px-4">Add food</Button>
              <Button variant="ghost" onClick={() => { setManualMode(false); setNotFound(false); setPendingBarcode(null); }} className="h-9 px-4">Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="link" onClick={() => setManualMode(true)} className="h-auto justify-self-start p-0">
            Can&apos;t find it? Add your own food
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
