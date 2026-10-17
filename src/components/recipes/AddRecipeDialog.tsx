import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CircleAlert, ImagePlus, Loader2, X } from "lucide-react";
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
        <RecipeForm
          heading="Share a recipe"
          subheading={<>Sharing as {props.sharingAs} · other members see it once we&apos;ve checked it</>}
          submitLabel="Share recipe"
          onSubmit={props.onCreate}
          onDone={() => props.onOpenChange(false)}
          busyRef={busyRef}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Fields the import flow can point out as missing or worth checking. */
export type FlaggedField = "title" | "description" | "photo" | "minutes" | "servings" | "calories" | "ingredients" | "steps";

export interface RecipeFormInitial {
  title?: string;
  description?: string;
  ingredients?: string[];
  steps?: string[];
  minutes?: number | null;
  servings?: number | null;
  calories?: number | null;
  tags?: RecipeTag[];
  contains?: Allergen[] | null;
}

interface FormProps {
  heading: string;
  subheading: ReactNode;
  submitLabel: string;
  onSubmit: (input: NewRecipe, photo: Blob | null) => Promise<unknown>;
  /** Called after a successful submit. */
  onDone: () => void;
  busyRef: RefObject<boolean>;
  /** Starting values, e.g. from an imported page. */
  initial?: RecipeFormInitial;
  initialPhoto?: Blob | null;
  /** Shown above the fields, e.g. where an imported recipe came from. */
  notice?: ReactNode;
  /** A short hint under each field that needs a look. */
  flags?: Partial<Record<FlaggedField, string>>;
  /** Private recipes may be longer than shared ones. */
  limits?: { ingredients: number; steps: number };
  /** Replaces Cancel, e.g. "Back" to the previous step. */
  secondary?: { label: string; onClick: () => void };
}

const text = (n: number | null | undefined) => (n == null ? "" : String(n));

/** The recipe form, shared by "Share a recipe" and the import review step. */
export function RecipeForm({
  heading, subheading, submitLabel, onSubmit, onDone, busyRef, initial, initialPhoto, notice, flags = {}, limits = LIMITS, secondary,
}: FormProps) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    ingredients: (initial?.ingredients ?? []).join("\n"),
    steps: (initial?.steps ?? []).join("\n"),
    minutes: text(initial?.minutes),
    servings: text(initial?.servings),
    calories: text(initial?.calories),
  }));
  const [tags, setTags] = useState<RecipeTag[]>(initial?.tags ?? []);
  // null = not said; [] = none of the listed allergens.
  const [contains, setContains] = useState<Allergen[] | null>(initial?.contains ?? null);
  const [photo, setPhoto] = useState<Blob | null>(initialPhoto ?? null);
  const [preview, setPreview] = useState<string | null>(() => (initialPhoto ? URL.createObjectURL(initialPhoto) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const hint = (field: FlaggedField) =>
    flags[field] ? (
      <p id={`recipe-${field}-hint`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CircleAlert className="mt-px size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />{flags[field]}
      </p>
    ) : null;
  const flagged = (field: FlaggedField) => (flags[field] ? { "aria-describedby": `recipe-${field}-hint`, className: "border-primary/50 bg-primary/[0.03]" } : {});

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
    if (ingredients.length > limits.ingredients) return setError(`Keep it to ${limits.ingredients} ingredients or fewer.`);
    if (steps.length > limits.steps) return setError(`Keep it to ${limits.steps} steps or fewer.`);
    if (minutes === "invalid") return setError("Time should be a whole number of minutes.");
    if (servings === "invalid") return setError("Servings should be a whole number from 1 to 50.");
    if (calories === "invalid") return setError("Calories should be a whole number per serving.");

    setBusy(true);
    busyRef.current = true;
    setError(null);
    try {
      await onSubmit({ title: form.title, description: form.description, tags, contains, ingredients, steps, minutes, servings, calories }, photo);
      onDone();
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
        <DialogTitle className="text-xl font-semibold">{heading}</DialogTitle>
        <DialogDescription>{subheading}</DialogDescription>
      </DialogHeader>

      <form id="add-recipe" onSubmit={submit} className="space-y-5">
        {notice}
        <div className="space-y-2">
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
          {hint("photo")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-title">Name</Label>
          <Input id="recipe-title" value={form.title} onChange={set("title")} maxLength={LIMITS.title} placeholder="e.g. Mum's chicken soup" {...flagged("title")} />
          {hint("title")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-desc">Short description</Label>
          <Textarea id="recipe-desc" value={form.description} onChange={set("description")} maxLength={LIMITS.description} rows={2} placeholder="What makes it good?" {...flagged("description")} />
          {hint("description")}
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
                    on ? "border-primary bg-primary/8 text-primary-ink" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
                    on ? "border-primary bg-primary/8 text-primary-ink" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
            <Input id="recipe-min" inputMode="numeric" value={form.minutes} onChange={set("minutes")} placeholder="30" {...flagged("minutes")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-serves">Serves</Label>
            <Input id="recipe-serves" inputMode="numeric" value={form.servings} onChange={set("servings")} placeholder="4" {...flagged("servings")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-kcal">kcal / serving</Label>
            <Input id="recipe-kcal" inputMode="numeric" value={form.calories} onChange={set("calories")} placeholder="Optional" {...flagged("calories")} />
          </div>
        </div>
        {(flags.minutes || flags.servings || flags.calories) && (
          <div className="-mt-3 space-y-1">{hint("minutes")}{hint("servings")}{hint("calories")}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="recipe-ing">Ingredients</Label>
          <Textarea id="recipe-ing" value={form.ingredients} onChange={set("ingredients")} rows={5} placeholder={"One per line, e.g.\n2 chicken breasts\n1 tbsp olive oil"} {...flagged("ingredients")} />
          {hint("ingredients")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipe-steps">Method</Label>
          <Textarea id="recipe-steps" value={form.steps} onChange={set("steps")} rows={5} placeholder={"One step per line, e.g.\nHeat the oven to 200°C.\nRoast for 25 minutes."} {...flagged("steps")} />
          {hint("steps")}
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>

      <DialogFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6">
        {secondary ? (
          <Button variant="outline" disabled={busy} onClick={secondary.onClick}>{secondary.label}</Button>
        ) : (
          <DialogClose asChild><Button variant="outline" disabled={busy}>Cancel</Button></DialogClose>
        )}
        <Button type="submit" form="add-recipe" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
