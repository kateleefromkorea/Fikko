import { useEffect, useState } from "react";
import {
  ChartNoAxesColumn, ChefHat, ChevronRight, Loader2, Plus, Search, Settings, Sparkles, Sprout, Users, X, type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MEALS } from "@/components/HabitsView";
import type { NewFood } from "@/hooks/useFoodLog";
import { friendlyError } from "@/lib/errors";
import { cachedSearch, searchFoods, type FoodResult } from "@/lib/usdaFoodSearch";
import { cn } from "@/lib/utils";
import type { MealKey } from "@/types";
import { mealForNow } from "@mobile/lib/quickLog";

/** Somewhere search can take you, found by its name or by the things it holds. */
export type Place = "today" | "progress" | "coach" | "recipes" | "garden" | "settings" | "community";

const PLACES: { id: Place; label: string; hint: string; icon: LucideIcon; words: string }[] = [
  { id: "today", label: "Today", hint: "Your habits for the day", icon: Sprout, words: "home habits log water mood sleep activity medications food calories" },
  { id: "progress", label: "Progress", hint: "Trends, reports and your week", icon: ChartNoAxesColumn, words: "dashboard stats statistics report trends week month year consistency chart" },
  { id: "coach", label: "Ask Fikko", hint: "Your AI habit coach", icon: Sparkles, words: "coach ai chat question advice help check-in" },
  { id: "recipes", label: "Recipes", hint: "Meal ideas for your goals", icon: ChefHat, words: "recipe cook cooking meal ideas dinner lunch breakfast" },
  { id: "garden", label: "My Fikko", hint: "Your plant, garden and rewards", icon: Sprout, words: "plant garden seed pot companion scene booster rain cloud harvest streak" },
  { id: "settings", label: "Profile & settings", hint: "Goals, devices, reminders, privacy", icon: Settings, words: "profile account goals calories weight height units devices fitbit apple health garmin wearable medications reminders notifications email privacy consent export data delete plan premium founding" },
  { id: "community", label: "Community", hint: "Challenges and friends", icon: Users, words: "friends challenges social group" },
];

const MIN_SEARCH = 2;
const SEARCH_DELAY_MS = 300;
const FOOD_RESULTS = 8;
const PORTIONS: [string, number][] = [["½", 0.5], ["1", 1], ["2", 2]];

const loggedName = (r: FoodResult) =>
  r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.name} (${r.brand})` : r.name;

/**
 * Search, from the top bar: one field for everything. Foods can be added to a
 * meal right from the results, a question goes to the coach, and screens and
 * settings are found by what's in them ("reminders" finds Profile & settings).
 */
export default function SearchScreen({ open, onClose, onAddFood, onAsk, onGo, mealLabelFor }: {
  open: boolean;
  onClose: () => void;
  onAddFood: (meal: MealKey, food: NewFood) => void;
  onAsk: (question: string) => void;
  onGo: (place: Place) => void;
  /** "Lunch", or "Lunch yesterday" when Today is showing another day. */
  mealLabelFor: (meal: MealKey) => string;
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const q = query.trim();

  // A fresh search each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery(""); setFoods([]); setPicked(null); setError(null);
  }, [open]);

  // Asks the food databases once typing pauses; earlier answers show straight away.
  useEffect(() => {
    setPicked(null);
    if (q.length < MIN_SEARCH) { setFoods([]); setSearching(false); return; }
    const known = cachedSearch(q);
    if (known) { setFoods(known); setSearching(false); return; }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchFoods(q)
        .then((f) => { if (live) { setFoods(f); setError(null); } })
        .catch((err) => { if (live) setError(friendlyError(err, "Food search isn't working right now. Try again in a moment.")); })
        .finally(() => { if (live) setSearching(false); });
    }, SEARCH_DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const lower = q.toLowerCase();
  const places = q ? PLACES.filter((p) => `${p.label} ${p.hint} ${p.words}`.toLowerCase().includes(lower)) : PLACES;
  const shownFoods = foods.slice(0, FOOD_RESULTS);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} data-no-swipe="" className="search-screen block gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search foods to log, ask Fikko, or find a screen or setting.</DialogDescription>

        <form
          onSubmit={(e) => { e.preventDefault(); if (q) { onAsk(q); onClose(); } }}
          className="tabbar-glass sticky top-0 z-10 flex items-center gap-2 border-b border-ink/8 px-4 pt-[calc(var(--mobile-top)+0.5rem)] pb-2.5"
        >
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-ink/[0.06] px-3.5">
            <Search className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods, ask Fikko…"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="-mr-1 grid size-7 place-items-center rounded-full bg-ink/15 text-white">
                <X className="size-3.5" strokeWidth={3} />
              </button>
            )}
          </label>
          <button type="button" onClick={onClose} className="h-10 px-1 text-[15px] font-medium text-primary-ink">Cancel</button>
        </form>

        <div className="space-y-6 px-4 pt-4 pb-8">
          {q && (
            <button
              onClick={() => { onAsk(q); onClose(); }}
              className="press flex w-full items-center gap-3 rounded-2xl bg-primary/[0.07] px-3.5 py-3 text-left"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary-ink shadow-sm" aria-hidden="true">
                <Sparkles className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-muted-foreground">Ask Fikko</span>
                <span className="block truncate text-[15px] font-semibold">“{q}”</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            </button>
          )}

          {q.length >= MIN_SEARCH && (
            <section aria-labelledby="search-foods">
              <h2 id="search-foods" className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-muted-foreground">
                Foods
                {searching && <Loader2 className="size-3.5 animate-spin" aria-label="Searching" />}
              </h2>
              {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{error}</p>}
              {!error && !searching && shownFoods.length === 0 && (
                <p className="px-1 text-sm text-muted-foreground">No foods match “{q}”. Try a simpler word, like “rice” or “apple”.</p>
              )}
              {shownFoods.length > 0 && (
                <ul className="divide-y divide-ink/8 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]">
                  {shownFoods.map((f) => (
                    <FoodRow
                      key={f.id}
                      food={f}
                      open={picked === f.id}
                      onToggle={() => setPicked((p) => (p === f.id ? null : f.id))}
                      mealLabelFor={mealLabelFor}
                      onAdd={(meal, grams) => {
                        onAddFood(meal, {
                          name: loggedName(f), grams, caloriesPer100g: f.caloriesPer100g,
                          proteinPer100g: f.proteinPer100g, carbsPer100g: f.carbsPer100g, fatPer100g: f.fatPer100g,
                        });
                        onClose();
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {places.length > 0 && (
            <section aria-labelledby="search-places">
              <h2 id="search-places" className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">Go to</h2>
              <ul className="divide-y divide-ink/8 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]">
                {places.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => { onGo(p.id); onClose(); }} className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-ink/[0.04]">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink" aria-hidden="true">
                        <p.icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{p.label}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">{p.hint}</span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A food result: tap to choose the meal and amount, then add it in one more tap. */
function FoodRow({ food, open, onToggle, onAdd, mealLabelFor }: {
  food: FoodResult;
  open: boolean;
  onToggle: () => void;
  onAdd: (meal: MealKey, grams: number) => void;
  mealLabelFor: (meal: MealKey) => string;
}) {
  const [meal, setMeal] = useState<MealKey>(mealForNow);
  const base = food.servingGrams ?? 100;
  const [times, setTimes] = useState(1);
  const grams = Math.round(base * times);
  const kcal = Math.round((food.caloriesPer100g * grams) / 100);

  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-ink/[0.04]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{food.name}</span>
          <span className="block truncate text-[13px] text-muted-foreground tabular-nums">
            {food.brand ? `${food.brand} · ` : ""}{Math.round(food.caloriesPer100g)} kcal per 100 g
          </span>
        </span>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full transition-transform", open ? "rotate-45 bg-ink/10 text-foreground" : "bg-primary/10 text-primary-ink")} aria-hidden="true">
          <Plus className="size-4" strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <div className="space-y-3 bg-ink/[0.025] px-3.5 pt-1 pb-3.5">
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMeal(m.key)}
                aria-pressed={meal === m.key}
                className="h-9 rounded-lg bg-white text-[13px] font-medium text-muted-foreground shadow-xs aria-pressed:bg-primary aria-pressed:text-white"
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white p-0.5 shadow-xs" role="group" aria-label="Portion">
              {PORTIONS.map(([label, t]) => (
                <button
                  key={label}
                  onClick={() => setTimes(t)}
                  aria-pressed={times === t}
                  aria-label={`${label} ${food.servingGrams ? "serving" : "× 100 g"}, ${Math.round(base * t)} g`}
                  className="h-8 min-w-9 rounded-md px-2 text-sm text-muted-foreground aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-primary-ink"
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{grams} g</span>
          </div>
          <button onClick={() => onAdd(meal, grams)} className="press h-11 w-full rounded-full bg-button text-[15px] font-semibold text-white tabular-nums">
            Add to {mealLabelFor(meal).toLowerCase()} · {kcal} kcal
          </button>
        </div>
      )}
    </li>
  );
}
