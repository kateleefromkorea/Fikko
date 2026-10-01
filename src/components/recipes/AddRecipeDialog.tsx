import { useEffect, useRef, useState, type RefObject } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, RECIPE_TAGS, preparePhoto, type NewRecipe, type RecipeTag } from "../../lib/recipes";
import { ALLERGENS, type Allergen } from "../../lib/preferences";

const NONE = "none";

const EMPTY = { title: "", description: "", ingredients: "", steps: "", minutes: "", servings: "", calories: "" };

/** One entry per non-empty line. */
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** A whole number within range, or null when left blank. */
function wholeNumber(text: string, max: number): number | null | "invalid" {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : "invalid";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharingAs: string;
  onCreate: (input: NewRecipe, photo: Blob | null) => Promise<unknown>;
}

export default function AddRecipeDialog(props: Props) {
  // True while saving, so the dialog can't be dismissed mid-upload.
  const busyRef = useRef(false);
  return (
    <Dialog open={props.open} onOpenChange={(o) => !busyRef.current && props.onOpenChange(o)}>
      {/* The content unmounts on close, so the form starts empty every time it opens. */}
      <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <AddRecipeForm {...props} busyRef={busyRef} />
      </DialogContent>
    </Dialog>
  );
}

function AddRecipeForm({ onOpenChange, sharingAs, onCreate, busyRef }: Props & { busyRef: RefObject<boolean> }) {
  const [form, setForm] = useState(EMPTY);
  const [tags, setTags] = useState<RecipeTag[]>([]);
  // null = not said; [] = none of the listed allergens.
  const [contains, setContains] = useState<Allergen[] | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That file isn't an image.");
    try {
      const blob = await preparePhoto(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
      setError(null);
    } catch {
      setError("Couldn't read that photo. Try a JPEG or PNG.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ingredients = lines(form.ingredients);
    const steps = lines(form.steps);
    const minutes = wholeNumber(form.minutes, 1440);
    const servings = wholeNumber(form.servings, 50);
    const calories = form.calories.trim() ? wholeNumber(form.calories, 5000) : null;

    if (!form.title.trim()) return setError("Give your recipe a name.");
    if (!ingredients.length) return setError("Add at least one ingredient.");
    if (!steps.length) return setError("Add at least one step to the method.");
    if (ingredients.length > LIMITS.ingredients) return setError(`Keep it to ${LIMITS.ingredients} ingredients or fewer.`);
    if (steps.length > LIMITS.steps) return setError(`Keep it to ${LIMITS.steps} steps or fewer.`);
    if (minutes === "invalid") return setError("Time should be a whole number of minutes.");
    if (servings === "invalid") return setError("Servings should be a whole number from 1 to 50.");
    if (calories === "invalid") return setError("Calories should be a whole number per serving.");

    setBusy(true);
    busyRef.current = true;
    setError(null);
    try {
      await onCreate({ title: form.title, description: form.description, tags, contains, ingredients, steps, minutes, servings, calories }, photo);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">Share a recipe</DialogTitle>
        <DialogDescription>Sharing as {sharingAs} · visible to everyone signed in to Fikko</DialogDescription>
      </DialogHeader>

      <form id="add-recipe" onSubmit={submit} className="space-y-5">
        <div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pickPhoto} tabIndex={-1} />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl">
              <img src={preview} alt="Your recipe photo" className="max-h-64 w-full object-cover" />
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={() => { setPhoto(null); setPreview(null); }}
                aria-label="Remove photo"
              >
                <X />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ImagePlus className="size-6" aria-hidden="true" />
              Add a photo (optional)
            </button>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-title">Name</Label>
          <Input id="recipe-title" value={form.title} onChange={set("title")} maxLength={LIMITS.title} placeholder="e.g. Mum's chicken soup" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-desc">Short description</Label>
          <Textarea id="recipe-desc" value={form.description} onChange={set("description")} maxLength={LIMITS.description} rows={2} placeholder="What makes it good?" />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {RECIPE_TAGS.map((t) => {
              const on = tags.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags((prev) => (on ? prev.filter((k) => k !== t.key) : [...prev, t.key]))}
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    on ? "border-primary bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Contains</legend>
          <p className="text-xs text-muted-foreground">Helps members with allergies. Pick &ldquo;None of these&rdquo; if it&apos;s free of all of them.</p>
          <div className="flex flex-wrap gap-2">
            {[...ALLERGENS.map((a) => ({ key: a.key as string, label: a.label })), { key: NONE, label: "None of these" }].map((a) => {
              const on = a.key === NONE ? contains?.length === 0 : !!contains?.includes(a.key as Allergen);
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setContains((prev) => {
                      if (a.key === NONE) return prev?.length === 0 ? null : [];
                      const cur = prev ?? [];
                      const k = a.key as Allergen;
                      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
                      return next.length ? next : null;
                    })
                  }
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    on ? "border-primary bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recipe-min">Time (min)</Label>
            <Input id="recipe-min" inputMode="numeric" value={form.minutes} onChange={set("minutes")} placeholder="30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-serves">Serves</Label>
            <Input id="recipe-serves" inputMode="numeric" value={form.servings} onChange={set("servings")} placeholder="4" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-kcal">kcal / serving</Label>
            <Input id="recipe-kcal" inputMode="numeric" value={form.calories} onChange={set("calories")} placeholder="Optional" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-ing">Ingredients</Label>
          <Textarea id="recipe-ing" value={form.ingredients} onChange={set("ingredients")} rows={5} placeholder={"One per line, e.g.\n2 chicken breasts\n1 tbsp olive oil"} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-steps">Method</Label>
          <Textarea id="recipe-steps" value={form.steps} onChange={set("steps")} rows={5} placeholder={"One step per line, e.g.\nHeat the oven to 200°C.\nRoast for 25 minutes."} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>

      <DialogFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6">
        <DialogClose asChild><Button variant="outline" disabled={busy}>Cancel</Button></DialogClose>
        <Button type="submit" form="add-recipe" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Share recipe
        </Button>
      </DialogFooter>
    </>
  );
}
