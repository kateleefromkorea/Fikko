import { Suspense, lazy, useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { BookmarkPlus, ChevronDown, History, ListChecks, Loader2, PencilLine, Plus, Repeat, ScanBarcode, Search, X, type LucideIcon } from "lucide-react";
import { cachedSearch, lookupBarcode, searchFoods, type FoodResult } from "../lib/usdaFoodSearch";
import { hideRecentFood, mealItemsOn, recentFoods, unhideRecentFood } from "../lib/foodHistory";
import { shiftDateKey } from "../lib/dates";
import { savedMealCalories, type SavedMeal, type SavedMealItem } from "../hooks/useSavedMeals";
import type { NewFood } from "../hooks/useFoodLog";
import type { FoodLogItem, MacrosPer100g, MealKey } from "../types";
import { formatMacros, macrosFor, sumMacros } from "../lib/macros";
import { DB_LIMITS, clamp } from "../lib/limits";
import { SOURCE_COUNTRY } from "../lib/foodRegion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PhotoLog from "./PhotoLog";
import FikkoAvatar from "./FikkoAvatar";
import { cn } from "@/lib/utils";
import { friendlyError } from "../lib/errors";

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
  /** Resolves to false when the food didn't save (the log shows why). */
  onAdd: (food: NewFood) => void | Promise<boolean>;
  onAddMany: (foods: NewFood[]) => void | Promise<boolean>;
  onUpdateGrams: (itemId: string, grams: number) => void;
  onDelete: (itemId: string) => void;
  onSaveFood: (name: string, caloriesPer100g: number, macros?: MacrosPer100g, barcode?: string) => void;
  onSaveMeal: (name: string, items: SavedMealItem[]) => Promise<void>;
  onDeleteMeal: (id: string) => void;
  onClose: () => void;
  /** For members who track detailed macros: show protein, carbs and fat. */
  showMacros?: boolean;
  /** Why the last change didn't save, shown at the top. */
  error?: string | null;
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

/** Characters typed before the food databases are asked; the member's own foods match from the first. */
const MIN_SEARCH = 2;
/** Pause after the last keystroke before asking the databases, so each word costs one lookup. */
const SEARCH_DELAY_MS = 300;
const LOCAL_OPTIONS = 4;
/** Recent foods shown before "Show more", and at most once expanded. */
const RECENT_SHOWN = 3;
const RECENT_MAX = 8;
/** Foods looked back over for the amount last eaten. */
const HISTORY_SIZE = 40;
/** Quick amounts, as multiples of the food's usual portion. */
const PORTIONS: [string, number][] = [["½", 0.5], ["1", 1], ["2", 2]];

/** A result's name as it's logged: with its brand, unless the name already says it. */
const loggedName = (r: FoodResult) =>
  r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.name} (${r.brand})` : r.name;

/** How well a name matches what's typed: whole-name start, then a word start, then anywhere. 0 is no match. */
function matchRank(name: string, query: string) {
  const n = name.toLowerCase(), q = query.toLowerCase();
  if (n.startsWith(q)) return 3;
  if (n.split(/[\s,(-]+/).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

/** The name with the typed part in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<strong className="font-semibold text-foreground">{text.slice(at, at + query.length)}</strong>{text.slice(at + query.length)}</>;
}

/** Title row shared by the three sections of a meal, so each reads as its own block. */
function SectionHeader({ icon: Icon, id, title, hint, aside, inverse }: {
  icon: LucideIcon; id: string; title: string; hint?: string; aside?: string;
  /** White on a green band. */
  inverse?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", inverse ? "bg-white/15 text-white" : "bg-primary/10 text-primary-ink")}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={id} className="text-base leading-8 font-semibold">{title}</h3>
        {hint && <p className={cn("-mt-1 text-sm", inverse ? "text-white" : "text-muted-foreground")}>{hint}</p>}
      </div>
      {aside && <span className={cn("pt-1.5 text-sm tabular-nums", inverse ? "text-white" : "text-muted-foreground")}>{aside}</span>}
    </div>
  );
}

/** One figure in the meal's summary: a big number over a small label. */
function Stat({ value, unit, label, big }: { value: string; unit: string; label: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("leading-none font-semibold text-foreground tabular-nums", big ? "text-2xl" : "text-lg")}>
        {value}
        {unit && <span className={cn("ml-1 font-normal text-muted-foreground", big ? "text-base" : "text-sm")}>{unit}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

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
  onSaveFood, onSaveMeal, onDeleteMeal, onClose, showMacros, error: saveError,
}: Props) {
  const [query, setQuery] = useState("");
  // Database options for the last search that came back, kept while the next one loads so the list doesn't blink.
  const [remote, setRemote] = useState<{ q: string; foods: FoodResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  // A food chosen from the options, waiting for its amount.
  const [picked, setPicked] = useState<FoodResult | null>(null);
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
  // Foods eaten in the last 30 days, at their last amounts; the first few are the Recent list.
  const [history, setHistory] = useState<FoodLogItem[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [yesterday, setYesterday] = useState<FoodLogItem[]>([]);
  const [namingMeal, setNamingMeal] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealSaved, setMealSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void Promise.all([recentFoods(userId, meal, HISTORY_SIZE), mealItemsOn(userId, shiftDateKey(date, -1), meal)]).then(([r, y]) => {
      if (!live) return;
      setHistory(r);
      setYesterday(y);
    });
    return () => { live = false; };
  }, [userId, meal, date]);

  // Off the Recent list only; the days it was logged keep it.
  function removeRecent(food: FoodLogItem) {
    if (!userId) return;
    const before = history;
    setHistory((list) => list.filter((r) => r.name.toLowerCase() !== food.name.toLowerCase()));
    hideRecentFood(userId, food.name).catch((err) => {
      // Didn't save: put it back so the list matches what's stored.
      setHistory(before);
      setError(friendlyError(err, "We couldn't remove that from Recent."));
    });
  }

  const recent = history.slice(0, RECENT_MAX);
  // The amount last eaten of each food, so picking it again starts there.
  const lastGrams = new Map(history.map((h) => [h.name.toLowerCase(), h.grams]));
  const total = items.reduce((sum, i) => sum + i.calories, 0);
  const mealMacros = sumMacros(items);
  const macrosKnown = items.length === 0 || mealMacros.missing < items.length;

  const q = query.trim();
  const loggedNames = new Set(items.map((i) => i.name.toLowerCase()));
  const recentNotLogged = recent.filter((r) => !loggedNames.has(r.name.toLowerCase()));
  // The three most recent, and the rest behind "Show more", so the window stays short.
  const recentToShow = showAllRecent ? recentNotLogged : recentNotLogged.slice(0, RECENT_SHOWN);
  const recentHidden = recentNotLogged.length - recentToShow.length;
  const yesterdayKcal = yesterday.reduce((s, i) => s + i.calories, 0);
  const browsing = !q && !scanning && !scanned && !picked && !manualMode;

  // Asks the databases once typing pauses. Earlier answers show straight away.
  useEffect(() => {
    if (q.length < MIN_SEARCH) { setSearching(false); return; }
    const known = cachedSearch(q);
    if (known) { setRemote({ q, foods: known }); setSearching(false); return; }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchFoods(q)
        .then((foods) => { if (live) { setRemote({ q, foods }); setError(null); } })
        .catch((err) => { if (live) setError(friendlyError(err, "Food search isn't working right now. Try again, or add the food yourself.")); })
        .finally(() => { if (live) setSearching(false); });
    }, SEARCH_DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  // The options, best first: the member's own foods (saved, then recently eaten), then the databases.
  const ownFoods: FoodResult[] = [
    ...savedFoods,
    ...recent.map((r) => ({
      id: `recent-${r.id}`, name: r.name, caloriesPer100g: r.caloriesPer100g, servingGrams: r.grams,
      proteinPer100g: r.proteinPer100g, carbsPer100g: r.carbsPer100g, fatPer100g: r.fatPer100g,
    })),
  ];
  const seen = new Set<string>();
  const localOptions = q
    ? ownFoods
        .map((food) => ({ food, rank: matchRank(food.name, q) }))
        .filter(({ food, rank }) => rank > 0 && !seen.has(food.name.toLowerCase()) && seen.add(food.name.toLowerCase()))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, LOCAL_OPTIONS)
        .map(({ food }) => food)
    : [];
  // While the next answer loads, the last one stays, narrowed to what still matches.
  const remoteOptions = q.length >= MIN_SEARCH && remote
    ? remote.foods.filter((f) => remote.q === q || matchRank(`${f.name} ${f.brand ?? ""}`, q) > 0)
    : [];
  const groups = [
    { label: "Your foods", foods: localOptions },
    { label: "Foods", foods: remoteOptions.filter((f) => f.source !== "branded") },
    { label: "Brands", foods: remoteOptions.filter((f) => f.source === "branded") },
  ].filter((g) => g.foods.length > 0);
  const options = groups.flatMap((g) => g.foods);
  const showList = listOpen && !!q && !picked && !scanned;
  const nothingFound = q.length >= MIN_SEARCH && !searching && remote?.q === q && options.length === 0 && !error;

  // A new set of options starts from the top one.
  useEffect(() => { setActive(0); }, [q]);

  function pick(food: FoodResult) {
    setPicked(food);
    setListOpen(false);
    setScanned(null);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setListOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && options[active]) pick(options[active]);
    }
  }

  function clearSearch() {
    setQuery("");
    setPicked(null);
    setListOpen(false);
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
      setError(friendlyError(err, "Barcode lookup failed."));
    } finally {
      setLookingUp(false);
    }
  }, [savedFoods]);

  // Where an amount starts: what the member had last time, else the product's serving, else 100 g.
  const remembered = (r: FoodResult) => lastGrams.get(loggedName(r).toLowerCase());
  const defaultGrams = (r: FoodResult) => remembered(r) ?? r.servingGrams ?? 100;
  const portionLabel = (r: FoodResult) => (remembered(r) != null ? "last time" : r.servingGrams ? "serving" : null);

  function addResult(result: FoodResult) {
    if (userId) void unhideRecentFood(userId, result.name);
    const grams = clamp(parseFloat(gramsByResult[result.id] ?? "") || defaultGrams(result), DB_LIMITS.foodGrams);
    onAdd({
      name: loggedName(result),
      grams,
      caloriesPer100g: result.caloriesPer100g,
      proteinPer100g: result.proteinPer100g,
      carbsPer100g: result.carbsPer100g,
      fatPer100g: result.fatPer100g,
    });
    if (result === scanned) setScanned(null);
    if (result === picked) clearSearch();
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
    const typed = manual;
    const barcode = pendingBarcode;
    setManual(EMPTY_MANUAL);
    setPendingBarcode(null);
    setNotFound(false);
    setManualMode(false);
    if (userId) void unhideRecentFood(userId, name);
    void Promise.resolve(onAdd({ name, grams, caloriesPer100g, ...macros })).then((ok) => {
      // Didn't save: put the entry back so it's one tap to try again.
      if (ok === false) {
        setManual(typed);
        setPendingBarcode(barcode);
        setManualMode(true);
        return;
      }
      onSaveFood(name, caloriesPer100g, macros, barcode ?? undefined);
    });
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
      setError(friendlyError(err, "We couldn't save that meal."));
    }
  }

  /**
   * One row of a food you can add, from search, a scan or the recent list. A
   * render function rather than a component, so typing grams keeps focus.
   */
  const resultRow = (result: FoodResult, onRemove?: () => void) => {
    const grams = parseFloat(gramsByResult[result.id] ?? "") || defaultGrams(result);
    const base = defaultGrams(result);
    const label = portionLabel(result);
    return (
      <li key={result.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3.5">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-medium">{result.name}</p>
            {result.saved && <Badge variant="secondary">Saved</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {result.brand ? `${result.brand} · ` : ""}
            {Math.round(result.caloriesPer100g)} kcal / 100g
            {label ? ` · ${label} ${Math.round(base)} g` : ""}
            {showMacros && (() => { const m = macrosFor({ ...result, grams: 100 }); return m ? ` · ${formatMacros(m)}` : ""; })()}
          </p>
        </div>
        {/* Wraps under the name, and onto a second line itself, on a narrow phone. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Quick amounts: half, one or two of the usual portion. */}
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label={`Portions of ${result.name}`}>
            {PORTIONS.map(([text, times]) => {
              const g = Math.round(base * times);
              return (
                <button
                  key={text}
                  type="button"
                  onClick={() => setGramsByResult((p) => ({ ...p, [result.id]: String(g) }))}
                  aria-pressed={Math.round(grams) === g}
                  aria-label={`${text} ${label ?? "portion"}, ${g} g`}
                  className="h-8 min-w-8 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-[#0A6E63] aria-pressed:shadow-sm"
                >
                  {text}
                </button>
              );
            })}
          </div>
          <Input
            type="number"
            min="1"
            placeholder={String(Math.round(base))}
            value={gramsByResult[result.id] ?? ""}
            onChange={(e) => setGramsByResult((p) => ({ ...p, [result.id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") addResult(result); }}
            // Picking from the search goes straight to the amount.
            autoFocus={result === picked}
            aria-label={`Grams of ${result.name}`}
            className="h-9 w-20"
          />
          <span className="text-sm text-muted-foreground">g</span>
          <span className="w-16 text-right text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {Math.round((result.caloriesPer100g * grams) / 100)} kcal
          </span>
          <Button onClick={() => addResult(result)} className="h-9 px-4">
            <Plus />
            Add
          </Button>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove ${result.name} from recent`}
              title="Remove from recent"
              className="size-9 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[94vh] gap-3 overflow-y-auto p-5 sm:max-w-2xl sm:p-6"
        // Escape closes the options list first, and the window only once it's gone.
        onEscapeKeyDown={(e) => { if (showList) { e.preventDefault(); setListOpen(false); } }}
      >
        {/* A very light grey band across the top, so the meal's totals read as a header. */}
        <DialogHeader className="-mx-5 -mt-5 gap-2.5 border-b bg-[#F4F5F6] px-5 pt-5 pb-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-5 sm:pb-4">
          <DialogTitle className="text-xl font-semibold">{mealLabel}</DialogTitle>
          <DialogDescription className="sr-only">
            {Math.round(total)} kcal logged
            {showMacros && items.length > 0 && ` · ${formatMacros(mealMacros.total)}`}
          </DialogDescription>
          {/* The meal at a glance: calories big, then protein, carbs and fat. */}
          <div aria-hidden="true" className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Stat big value={Math.round(total).toLocaleString()} unit="kcal" label="Logged so far" />
            {showMacros && (
              <div className="flex items-end gap-5 sm:border-l sm:pl-6">
                {([["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"]] as const).map(([k, label]) => (
                  <Stat
                    key={k}
                    // A dash, not 0 g, when none of the foods came with macros.
                    value={macrosKnown ? String(Math.round(mealMacros.total[k])) : "–"}
                    unit={macrosKnown ? "g" : ""}
                    label={label}
                  />
                ))}
              </div>
            )}
          </div>
          {showMacros && mealMacros.missing > 0 && macrosKnown && (
            <p className="text-xs text-muted-foreground">
              Protein, carbs and fat leave out {mealMacros.missing} {mealMacros.missing === 1 ? "food" : "foods"} without that information.
            </p>
          )}
        </DialogHeader>

        {saveError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</p>
        )}

        {/* 1 · What's already in this meal. */}
        <section aria-labelledby="sec-logged" className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <div className="bg-primary px-4 py-2 text-primary-foreground">
            <SectionHeader
              inverse
              icon={ListChecks}
              id="sec-logged"
              title="Logged"
              aside={`${items.length} ${items.length === 1 ? "item" : "items"}`}
            />
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-3.5 text-center text-sm text-muted-foreground">
              Nothing logged for {mealLabel.toLowerCase()} yet. Add something below.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                // On a phone the amount and calories wrap under a long name instead of squeezing it.
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="truncate text-base font-medium">{item.name}</p>
                    {showMacros && (
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {(() => { const m = macrosFor(item); return m ? formatMacros(m) : "Macros unknown"; })()}
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      value={item.grams}
                      onChange={(e) => onUpdateGrams(item.id, clamp(parseFloat(e.target.value) || 0, DB_LIMITS.foodGrams))}
                      aria-label={`Grams of ${item.name}`}
                      className="h-9 w-20 text-right"
                    />
                    <span className="text-sm text-muted-foreground">g</span>
                    {/* Calories on the right, where the eye looks for the number. */}
                    <p className="ml-2 w-20 text-right text-base font-semibold tabular-nums">
                      {Math.round(item.calories).toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
                    </p>
                    <Button variant="ghost" size="icon-sm" onClick={() => onDelete(item.id)} aria-label={`Remove ${item.name}`} className="text-muted-foreground">
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
              {namingMeal ? (
                <form onSubmit={(e) => { e.preventDefault(); void saveMeal(); }} className="flex gap-2">
                  <Input
                    value={mealName}
                    onChange={(e) => setMealName(e.target.value)}
                    placeholder={`e.g. My usual ${mealLabel.toLowerCase()}`}
                    aria-label="Name for this meal"
                    maxLength={60}
                    autoFocus
                    className="h-8 bg-background"
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
              {mealSaved && <p role="status" className="text-xs text-primary-ink">Saved “{mealSaved}”. Find it here next time to log it in one tap.</p>}
            </div>
          )}
        </section>

        {/* 2 · Finding a food: search, scan, photo, and one-tap repeats. */}
        <section aria-labelledby="sec-search" className="space-y-3 rounded-2xl border bg-card p-3.5 shadow-xs sm:p-4">
          <SectionHeader icon={Search} id="sec-search" title="Add food" hint="Snap your plate, or search by name or brand." />

          <div className="space-y-3">
            {/* A photo first: it handles whole dishes and shared plates better than a database search. */}
            <PhotoLog meal={meal} onAddMany={onAddMany} />

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPicked(null); setListOpen(true); }}
                  onFocus={() => setListOpen(true)}
                  onBlur={() => setListOpen(false)}
                  onKeyDown={onSearchKey}
                  placeholder="Search foods or brands"
                  role="combobox"
                  aria-label="Search foods"
                  aria-autocomplete="list"
                  aria-expanded={showList}
                  aria-controls="food-options"
                  aria-activedescendant={showList && options[active] ? `food-option-${active}` : undefined}
                  autoComplete="off"
                  className="h-11 rounded-xl bg-background pr-11 pl-11 text-base md:text-base"
                />
                <span className="absolute top-1/2 right-2 -translate-y-1/2">
                  {searching ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin text-muted-foreground" aria-label="Searching" />
                  ) : query && (
                    <Button variant="ghost" size="icon-sm" onMouseDown={(e) => e.preventDefault()} onClick={clearSearch} aria-label="Clear search" className="text-muted-foreground">
                      <X />
                    </Button>
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => { setScanning((s) => !s); setScanned(null); setPicked(null); setError(null); setNotFound(false); }}
                className="h-11 rounded-xl bg-background px-4"
                aria-label="Scan a barcode"
                aria-pressed={scanning}
              >
                <ScanBarcode />
                <span className="hidden sm:inline">Scan</span>
              </Button>
            </div>

            {showList && (options.length > 0 || searching || nothingFound || q.length < MIN_SEARCH) && (
              <div
                id="food-options"
                role="listbox"
                aria-label="Matching foods"
                onMouseDown={(e) => e.preventDefault()}
                className="max-h-96 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg"
              >
                {groups.map((g) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</p>
                    {g.foods.map((food) => {
                      const i = options.indexOf(food);
                      return (
                        <div
                          key={food.id}
                          id={`food-option-${i}`}
                          role="option"
                          aria-selected={i === active}
                          onClick={() => pick(food)}
                          onMouseEnter={() => setActive(i)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                            i === active && "bg-primary/8",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] text-foreground/85"><Highlight text={food.name} query={q} /></p>
                            <p className="truncate text-xs text-muted-foreground">
                              {food.origin && SOURCE_COUNTRY[food.origin] ? `${SOURCE_COUNTRY[food.origin]} · ` : ""}
                              {food.brand ? `${food.brand} · ` : ""}{Math.round(food.caloriesPer100g)} kcal / 100 g
                              {portionLabel(food) ? ` · ${portionLabel(food)} ${Math.round(defaultGrams(food))} g` : ""}
                            </p>
                          </div>
                          {food.saved && <Badge variant="secondary">Saved</Badge>}
                          <Plus className={cn("size-4 shrink-0 text-muted-foreground", i === active && "text-primary-ink")} aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                ))}
                {searching && (
                  <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> {options.length ? "Finding more…" : "Searching foods…"}
                  </p>
                )}
                {!searching && q.length < MIN_SEARCH && options.length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">Keep typing to search foods and brands.</p>
                )}
                {nothingFound && (
                  <button
                    type="button"
                    onClick={() => { setManual({ ...EMPTY_MANUAL, name: q }); setManualMode(true); setListOpen(false); }}
                    className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    No matches for “{q}”. <span className="font-medium text-primary-ink">Add it as your own food</span>
                  </button>
                )}
              </div>
            )}

            {picked && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">How much?</p>
                <ul className="rounded-xl border border-primary/30 bg-card">{resultRow(picked)}</ul>
              </div>
            )}

            {scanning && (
              <Suspense fallback={<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Starting camera…</p>}>
                <BarcodeScanner onCode={onCode} onCancel={() => setScanning(false)} />
              </Suspense>
            )}
            {lookingUp && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking up that product…</p>}
            {scanned && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Scanned product</p>
                <ul className="rounded-lg border bg-card">{resultRow(scanned)}</ul>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* One-tap repeats, while nothing is being searched or scanned. */}
          {browsing && (yesterday.length > 0 || savedMeals.length > 0 || recentToShow.length > 0) && (
            <div className="space-y-5 border-t pt-4">
              {yesterday.length > 0 && items.length === 0 && (
                <Button variant="outline" onClick={() => onAddMany(yesterday.map(asNewFood))} className="h-auto w-full justify-start gap-3 bg-card px-4 py-3 text-left">
                  <Repeat className="text-primary-ink" />
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
                  <ul className="divide-y rounded-lg border bg-card">
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
                  <ul className="divide-y rounded-lg border bg-card">
                    {recentToShow.map((r) => (
                      resultRow({ id: `recent-${r.id}`, name: r.name, caloriesPer100g: r.caloriesPer100g, proteinPer100g: r.proteinPer100g, carbsPer100g: r.carbsPer100g, fatPer100g: r.fatPer100g, servingGrams: r.grams }, () => removeRecent(r))
                    ))}
                  </ul>
                  {(recentHidden > 0 || (showAllRecent && recentNotLogged.length > RECENT_SHOWN)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllRecent((s) => !s)}
                      aria-expanded={showAllRecent}
                      className="h-8 w-full text-primary-ink hover:text-primary-ink"
                    >
                      {showAllRecent ? "Show less" : `Show ${recentHidden} more`}
                      <ChevronDown className={cn("transition-transform", showAllRecent && "rotate-180")} />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3 · Typing a food in by hand. Dashed, so it reads as separate from searching. */}
        <section aria-labelledby="sec-manual" className="rounded-2xl border-2 border-dashed p-3.5 sm:p-4">
          {manualMode ? (
            <div className="space-y-3">
              <SectionHeader icon={PencilLine} id="sec-manual" title="Enter a food manually" hint="Type in the name and nutrition from the label." />
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-56">
                <SectionHeader icon={PencilLine} id="sec-manual" title="Can&apos;t find it?" hint="Enter a food yourself and we'll remember it." />
              </div>
              <Button variant="outline" onClick={() => setManualMode(true)} className="h-9 px-4">
                <PencilLine />
                Enter manually
              </Button>
            </div>
          )}
        </section>

        <div className="-mt-2 flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground select-none" aria-hidden="true">
          <FikkoAvatar plain className="size-4 opacity-70" />
          Fikko
        </div>
      </DialogContent>
    </Dialog>
  );
}
