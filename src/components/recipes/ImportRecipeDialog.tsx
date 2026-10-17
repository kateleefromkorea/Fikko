import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Check, ExternalLink, Link2, Loader2, PencilLine, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecipeForm, type FlaggedField, type RecipeFormInitial } from "./AddRecipeDialog";
import { preparePhoto, RECIPE_TAGS, type NewRecipe, type RecipeTag } from "../../lib/recipes";
import type { ImportToSave } from "../../lib/aiRecipes";
import { detailsFor, imageBlob, importRecipe, ImportError, type ImportedRecipe } from "../../lib/recipeImport";

// Private recipes can be longer than shared ones (migration 044).
const LIMITS = { ingredients: 80, steps: 50 };

const FLAG_TEXT: Partial<Record<string, [FlaggedField, string]>> = {
  title: ["title", "We couldn't find the recipe's name."],
  ingredients: ["ingredients", "We couldn't find the ingredients. Add them one per line."],
  steps: ["steps", "We couldn't find the method. Add the steps one per line."],
  servings: ["servings", "The page doesn't say how many it serves."],
  time: ["minutes", "The page doesn't give a total time."],
  calories: ["calories", "No calories on the page. Add them if you know, or leave blank."],
  image: ["photo", "No photo on the page. Add your own if you like."],
};

const isTag = (t: string): t is RecipeTag => RECIPE_TAGS.some((r) => r.key === t);

function formStart(r: Partial<ImportedRecipe>): RecipeFormInitial {
  return {
    title: r.title ?? "",
    description: r.description ?? "",
    ingredients: (r.ingredients ?? []).map((i) => i.raw_text),
    steps: r.steps ?? [],
    minutes: r.total_time_min ?? null,
    servings: r.servings ?? null,
    calories: r.nutrition?.calories ?? null,
    tags: (r.tags ?? []).filter(isTag),
    // Never guessed: allergens stay "not listed" until the member says.
    contains: null,
  };
}

function flagsFor(r: Partial<ImportedRecipe>) {
  const flags: Partial<Record<FlaggedField, string>> = {};
  for (const field of r.missing_fields ?? []) {
    const flag = FLAG_TEXT[field];
    if (flag) flags[flag[0]] = flag[1];
  }
  return flags;
}

/** Where the recipe came from, shown at the top of the review form. */
function Credit({ site, author, url, note }: { site: string; author?: string | null; url: string; note?: string }) {
  return (
    <div className="rounded-xl bg-muted px-4 py-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span>From <strong className="font-semibold">{site}</strong>{author ? <> · by {author}</> : null}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-ink underline-offset-2 hover:underline">
          View original<ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </p>
      {note && <p className="mt-1 text-muted-foreground">{note}</p>}
    </div>
  );
}

const PROGRESS = ["Opening the page", "Finding the recipe", "Getting the photo"];

/** Step by step while the server works; just a sense of progress, timed to typical pages. */
function Progress({ site }: { site: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [900, 2200].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className="space-y-5 py-2" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">Reading {site || "the page"}. This usually takes a few seconds.</p>
      <ol className="space-y-3">
        {PROGRESS.map((label, i) => (
          <li key={label} className={cn("flex items-center gap-3 text-sm", i > step && "text-muted-foreground")}>
            <span className={cn("grid size-6 place-items-center rounded-full", i < step ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {i < step ? <Check className="size-3.5" aria-hidden="true" /> : i === step ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

type Stage =
  | { kind: "paste"; error?: string }
  | { kind: "loading"; site: string }
  | { kind: "duplicate"; id: string; title: string }
  | { kind: "failed"; error: ImportError }
  | { kind: "review"; recipe: Partial<ImportedRecipe>; photo: Blob | null; source: { url: string; key: string }; manual: boolean };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ImportToSave, photo: Blob | null) => Promise<{ key: string }>;
  /** Opens a recipe already in the library (duplicates, and the one just saved). */
  onOpenRecipe: (key: string) => void;
}

export default function ImportRecipeDialog(props: Props) {
  const busyRef = useRef(false);
  return (
    <Dialog open={props.open} onOpenChange={(o) => !busyRef.current && props.onOpenChange(o)}>
      {/* The content unmounts on close, so every import starts from the paste step. */}
      <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <ImportFlow {...props} busyRef={busyRef} />
      </DialogContent>
    </Dialog>
  );
}

function ImportFlow({ onOpenChange, onSave, onOpenRecipe, busyRef }: Props & { busyRef: React.RefObject<boolean> }) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "paste" });
  // Ignores a reply that arrives after the member moved on.
  const attempt = useRef(0);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return setStage({ kind: "paste", error: "Paste the link to a recipe page." });
    const mine = ++attempt.current;
    let site = "";
    try { site = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.replace(/^www\./, ""); } catch { /* shown as "the page" */ }
    setStage({ kind: "loading", site });
    try {
      const result = await importRecipe(url);
      if (mine !== attempt.current) return;
      if (result.kind === "duplicate") return setStage({ kind: "duplicate", id: result.id, title: result.title });
      // Resized and re-encoded like a member's own upload; a photo that won't decode is simply left out.
      const raw = imageBlob(result.imageData);
      const photo = raw ? await preparePhoto(raw).catch(() => null) : null;
      if (mine !== attempt.current) return;
      setStage({
        kind: "review",
        recipe: result.recipe,
        photo,
        source: { url: result.recipe.source_url, key: result.sourceKey },
        manual: false,
      });
    } catch (err) {
      if (mine !== attempt.current) return;
      const error = err instanceof ImportError ? err : new ImportError("Something went wrong. Please try again.", "unknown", null);
      if (error.code === "invalid_url") return setStage({ kind: "paste", error: error.message });
      setStage({ kind: "failed", error });
    }
  }

  function typeItIn(error: ImportError) {
    if (!error.source) return;
    const partial = error.partial ?? {};
    const missing = ["ingredients", "steps"].filter((f) => !(partial as Record<string, unknown[] | undefined>)[f]?.length);
    setStage({ kind: "review", recipe: { ...partial, missing_fields: [...new Set([...(partial.missing_fields ?? []), ...missing])] }, photo: null, source: error.source, manual: true });
  }

  async function save(stageNow: Extract<Stage, { kind: "review" }>, input: NewRecipe, photo: Blob | null) {
    const r = stageNow.recipe;
    const n = r.nutrition;
    const saved = await onSave(
      {
        recipe: input,
        sourceUrl: stageNow.source.url,
        sourceKey: stageNow.source.key,
        sourceSite: r.source_site || new URL(stageNow.source.url).hostname.replace(/^www\./, ""),
        sourceAuthor: r.author ?? null,
        // Kept only if the member didn't change the total time they were based on.
        prepMinutes: input.minutes === (r.total_time_min ?? null) ? r.prep_time_min ?? null : null,
        cookMinutes: input.minutes === (r.total_time_min ?? null) ? r.cook_time_min ?? null : null,
        language: r.language ?? null,
        macros: n && n.protein != null && n.carbs != null && n.fat != null && input.calories === n.calories ? { protein: n.protein, carbs: n.carbs, fat: n.fat } : null,
        ingredientDetails: detailsFor(input.ingredients, r.ingredients ?? []),
      },
      photo,
    );
    onOpenRecipe(saved.key);
  }

  if (stage.kind === "review") {
    const r = stage.recipe;
    const site = r.source_site || new URL(stage.source.url).hostname.replace(/^www\./, "");
    const lowConfidence = !stage.manual && (r.confidence ?? 1) < 0.7;
    return (
      <RecipeForm
        heading={stage.manual ? "Add it yourself" : "Check and save"}
        subheading={stage.manual ? "Fill in what we couldn't find. Only you will see this recipe." : "Change anything you like. Only you will see this recipe."}
        submitLabel="Save to my recipes"
        initial={formStart(r)}
        initialPhoto={stage.photo}
        flags={flagsFor(r)}
        limits={LIMITS}
        notice={
          <Credit
            site={site}
            author={r.author}
            url={stage.source.url}
            note={lowConfidence ? "Some parts of this page were hard to read. Check the ingredients and steps against the original." : undefined}
          />
        }
        onSubmit={(input, photo) => save(stage, input, photo)}
        onDone={() => onOpenChange(false)}
        busyRef={busyRef}
        secondary={{ label: "Back", onClick: () => setStage({ kind: "paste" }) }}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">Import a recipe</DialogTitle>
        <DialogDescription>Paste a link from a recipe website or blog. We&apos;ll keep it in your recipes, with credit to the original.</DialogDescription>
      </DialogHeader>

      {stage.kind === "paste" && (
        <form id="import-recipe" onSubmit={start} className="space-y-2">
          <Label htmlFor="import-url">Recipe link</Label>
          <div className="relative">
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="import-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (stage.error) setStage({ kind: "paste" }); }}
              placeholder="https://"
              aria-invalid={!!stage.error}
              aria-describedby="import-url-hint"
              className="h-11 pl-9"
            />
          </div>
          {stage.error ? (
            <p id="import-url-hint" role="alert" className="text-sm text-destructive">{stage.error}</p>
          ) : (
            <p id="import-url-hint" className="text-xs text-muted-foreground">Works with most recipe sites. Instagram and TikTok links aren&apos;t supported yet.</p>
          )}
        </form>
      )}

      {stage.kind === "loading" && <Progress site={stage.site} />}

      {stage.kind === "duplicate" && (
        <div className="flex gap-3 rounded-xl bg-muted px-4 py-4 text-sm">
          <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
          <div>
            <p className="font-medium">You already have this one</p>
            <p className="mt-1 text-muted-foreground">&ldquo;{stage.title}&rdquo; is in your recipes, under Saved.</p>
          </div>
        </div>
      )}

      {stage.kind === "failed" && (
        <div className="flex gap-3 rounded-xl bg-muted px-4 py-4 text-sm">
          <SearchX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p role="alert" className="font-medium">{stage.error.message}</p>
            <p className="mt-1 text-muted-foreground">
              {stage.error.source
                ? "You can type the recipe in yourself and we'll keep the link to the original, or try a different page."
                : "Check the link, or try a different page."}
            </p>
          </div>
        </div>
      )}

      <DialogFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6">
        {stage.kind === "paste" && (
          <>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" form="import-recipe">Get recipe</Button>
          </>
        )}
        {stage.kind === "loading" && (
          <Button variant="outline" onClick={() => { attempt.current++; setStage({ kind: "paste" }); }}>Cancel</Button>
        )}
        {stage.kind === "duplicate" && (
          <>
            <Button variant="outline" onClick={() => { setUrl(""); setStage({ kind: "paste" }); }}>Import another</Button>
            <Button onClick={() => { onOpenChange(false); onOpenRecipe(stage.id); }}>Open it</Button>
          </>
        )}
        {stage.kind === "failed" && (
          <>
            <Button variant="outline" onClick={() => setStage({ kind: "paste" })}>Try another link</Button>
            {stage.error.source && (
              <Button onClick={() => typeItIn(stage.error)}><PencilLine />Type it in</Button>
            )}
          </>
        )}
      </DialogFooter>
    </>
  );
}
