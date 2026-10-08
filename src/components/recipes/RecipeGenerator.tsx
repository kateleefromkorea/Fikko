import { useState } from "react";
import { Check, ChefHat, Clock, Flame, Heart, Loader2, RotateCcw, ShoppingBasket, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAiCredits } from "../../hooks/useAiCredits";
import { generateIdeas } from "../../lib/aiRecipes";
import { tagLabel, type Recipe, type RecipeTag } from "../../lib/recipes";

const MAX_INGREDIENTS = 25;
const MAX_CHARS = 40;
/** The preferences worth asking for here; the rest are ingredients or diets. */
const WANTS: RecipeTag[] = ["quick", "high-protein", "low-carb", "vegetarian", "breakfast"];

/**
 * "Cook with what you have": the member lists their ingredients and gets three
 * recipe ideas for one AI credit, each showing what to buy and what to swap.
 * Ideas open in the usual recipe dialog and can be saved to the member's
 * private AI recipes.
 */
export default function RecipeGenerator({
  diets, allergies, ideas, onIdeas, savedIdeas, onOpen, onSave, className,
}: {
  diets: string[];
  allergies: string[];
  ideas: Recipe[];
  onIdeas: (ideas: Recipe[]) => void;
  /** Idea key → the saved recipe's key, for ideas already kept. */
  savedIdeas: Map<string, string>;
  onOpen: (key: string) => void;
  onSave: (idea: Recipe) => Promise<void>;
  className?: string;
}) {
  const { left, period } = useAiCredits();
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pantry, setPantry] = useState(true);
  const [wants, setWants] = useState<RecipeTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avoiding = [...diets.filter((d) => d !== "Omnivore"), ...allergies.filter((a) => a !== "None").map((a) => `no ${a.toLowerCase()}`)];
  const outOfCredits = left === 0;

  /** Adds what's typed; commas split it into several ingredients. */
  function add(text: string) {
    const fresh = text.split(/[,\n]/).map((s) => s.trim().slice(0, MAX_CHARS)).filter(Boolean);
    if (!fresh.length) return;
    setItems((prev) => {
      const next = [...prev];
      for (const f of fresh) if (!next.some((n) => n.toLowerCase() === f.toLowerCase())) next.push(f);
      return next.slice(0, MAX_INGREDIENTS);
    });
    setDraft("");
  }

  async function generate() {
    const all = draft.trim() ? [...items, ...draft.split(",").map((s) => s.trim()).filter(Boolean)] : items;
    if (draft.trim()) add(draft);
    if (!all.length) return;
    setBusy(true);
    setError(null);
    try {
      onIdeas(await generateIdeas({ ingredients: all.slice(0, MAX_INGREDIENTS), pantry, tags: wants, diets, allergies }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(idea: Recipe) {
    setSaving(idea.key);
    setError(null);
    try {
      await onSave(idea);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section aria-labelledby="generator-title" className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="generator-title" className="text-lg font-semibold tracking-tight">Cook with what you have</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            List what&apos;s in your kitchen and get {ideas.length ? "more" : "three"} recipe ideas, with anything you&apos;d need to buy or swap.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8" aria-hidden="true">
          <Sparkles className="size-5 text-primary-ink" />
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* What the member has */}
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void generate(); }}
        >
          <div>
            <label htmlFor="generator-input" className="text-sm font-medium">Ingredients you have</label>
            <div
              className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              onClick={() => document.getElementById("generator-input")?.focus()}
            >
              {items.map((it) => (
                <span key={it} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-sm text-primary-ink">
                  {it}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setItems((prev) => prev.filter((p) => p !== it)); }}
                    aria-label={`Remove ${it}`}
                    className="grid size-5 place-items-center rounded-full hover:bg-primary/15"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <Input
                id="generator-input"
                value={draft}
                onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) { e.preventDefault(); add(draft); }
                  else if (e.key === "Backspace" && !draft && items.length) setItems((prev) => prev.slice(0, -1));
                }}
                onBlur={() => add(draft)}
                placeholder={items.length ? "Add another…" : "e.g. chicken, rice, spinach"}
                disabled={items.length >= MAX_INGREDIENTS}
                maxLength={MAX_CHARS * 4}
                className="h-8 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Press Enter or use commas between ingredients.</p>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={pantry} onCheckedChange={(c) => setPantry(c === true)} />
            I have the basics (salt, pepper, oil, flour, sugar)
          </label>

          <div>
            <p className="text-sm font-medium">Anything in particular? <span className="font-normal text-muted-foreground">Optional</span></p>
            <div role="group" aria-label="Recipe preferences" className="mt-2 flex flex-wrap gap-2">
              {WANTS.map((t) => {
                const on = wants.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWants((prev) => (on ? prev.filter((w) => w !== t) : [...prev, t]))}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/80 hover:bg-muted",
                    )}
                  >
                    {tagLabel(t)}
                  </button>
                );
              })}
            </div>
            {avoiding.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Following your preferences: {avoiding.join(", ")}.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="submit" disabled={busy || outOfCredits || (!items.length && !draft.trim())}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {busy ? "Thinking up recipes…" : ideas.length ? "Try again" : "Get recipe ideas"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Uses 1 AI credit{left != null && ` · ${left} left ${period === "week" ? "this week" : "today"}`}
            </p>
          </div>
          {outOfCredits && <p className="text-sm text-muted-foreground">You&apos;ve used today&apos;s AI credits. They reset at midnight.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>

        {/* The ideas */}
        <div aria-live="polite" className="min-w-0">
          {ideas.length ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Ideas for you</p>
                <button
                  type="button"
                  onClick={() => { onIdeas([]); setItems([]); setWants([]); setError(null); }}
                  className="inline-flex items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />Start over
                </button>
              </div>
              <ul className="space-y-2.5">
                {ideas.map((idea) => {
                  const kept = savedIdeas.has(idea.key);
                  const toBuy = idea.buy?.length ?? 0;
                  return (
                    <li key={idea.key} className="flex items-stretch gap-2 rounded-xl border bg-background transition-colors hover:bg-muted/40">
                      <button
                        type="button"
                        onClick={() => onOpen(savedIdeas.get(idea.key) ?? idea.key)}
                        className="min-w-0 flex-1 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <p className="font-semibold leading-snug">{idea.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {idea.minutes != null && <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />{idea.minutes} min</span>}
                          {idea.calories != null && <span className="inline-flex items-center gap-1"><Flame className="size-3" aria-hidden="true" />{idea.calories} kcal</span>}
                          <span className="inline-flex items-center gap-1">
                            <ShoppingBasket className="size-3" aria-hidden="true" />
                            {toBuy ? `${toBuy} to buy` : "Nothing to buy"}
                          </span>
                        </p>
                      </button>
                      <div className="flex items-center pr-3">
                        {kept ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink">
                            <Check className="size-4" aria-hidden="true" />Saved
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void save(idea)} disabled={saving === idea.key} aria-label={`Save ${idea.title}`}>
                            {saving === idea.key ? <Loader2 className="animate-spin" /> : <Heart />}Save
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Saved ideas go to your Saved tab and only you can see them. Nutrition is an AI estimate.
              </p>
            </div>
          ) : (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center">
              <div className="max-w-xs">
                {busy ? (
                  <Loader2 className="mx-auto size-8 animate-spin text-primary-ink" aria-hidden="true" />
                ) : (
                  <ChefHat className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
                )}
                <p className="mt-3 text-sm font-medium">{busy ? "Cooking up some ideas…" : "Your recipe ideas will show up here"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {busy ? "This takes a few seconds." : "Each one shows what you have, what to buy, and easy swaps."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
