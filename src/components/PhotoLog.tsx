import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import type { MealKey } from "../types";
import type { NewFood } from "../hooks/useFoodLog";
import type { ProposedFood } from "../lib/voice";
import { preparePhoto, recognizePhoto } from "../lib/photoLog";
import { DB_LIMITS, clamp } from "../lib/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Stage = "idle" | "thinking" | "review";

interface Props {
  meal: MealKey;
  onAddMany: (foods: NewFood[]) => void;
}

/**
 * "Log from a photo": snap or pick a picture of the meal, check what Fikko saw
 * (and fix any grams), then add it. The photo is shrunk here and never stored.
 */
export default function PhotoLog({ meal, onAddMany }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [foods, setFoods] = useState<ProposedFood[]>([]);
  const [grams, setGrams] = useState<string[]>([]);
  const [notUnderstood, setNotUnderstood] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Free the preview image when it's replaced or the modal closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function reset() {
    setStage("idle");
    setPreview(null);
    setFoods([]);
    setGrams([]);
    setNotUnderstood(null);
    setError(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same photo again still fires
    if (!file) return;
    reset();
    setAdded(false);
    setStage("thinking");
    try {
      const { base64, previewUrl } = await preparePhoto(file);
      setPreview(previewUrl);
      const out = await recognizePhoto(base64, meal);
      setFoods(out.foods);
      setGrams(out.foods.map((f) => String(Math.round(f.grams))));
      setNotUnderstood(out.notUnderstood);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStage("idle");
    }
  }

  const gramsOf = (i: number) => clamp(parseFloat(grams[i]) || 0, DB_LIMITS.foodGrams);
  const kcalOf = (i: number) => Math.round((foods[i].caloriesPer100g * gramsOf(i)) / 100);
  const total = foods.reduce((sum, _, i) => sum + kcalOf(i), 0);

  function remove(i: number) {
    setFoods((f) => f.filter((_, j) => j !== i));
    setGrams((g) => g.filter((_, j) => j !== i));
  }

  function add() {
    const items = foods
      .map((f, i): NewFood => ({
        name: f.name.slice(0, DB_LIMITS.foodNameLength),
        grams: gramsOf(i),
        caloriesPer100g: f.caloriesPer100g,
        proteinPer100g: f.proteinPer100g,
        carbsPer100g: f.carbsPer100g,
        fatPer100g: f.fatPer100g,
      }))
      .filter((f) => f.grams > 0);
    if (!items.length) return;
    onAddMany(items);
    reset();
    setAdded(true);
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="image/*" onChange={onFile} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {stage === "idle" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="outline" onClick={() => input.current?.click()} className="h-9 gap-2 px-4">
            <Camera />
            Log from a photo
          </Button>
          {added
            ? <p role="status" className="flex items-center gap-1.5 text-sm text-primary-ink"><Check className="size-4" aria-hidden="true" /> Added to your meal.</p>
            : <p className="text-xs text-muted-foreground">Snap your plate and Fikko estimates what&apos;s on it.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {stage === "thinking" && (
        <div className="flex items-center gap-3">
          {preview && <img src={preview} alt="Your meal" className="size-14 rounded-lg object-cover" />}
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-primary-ink" /> Looking at your meal…
          </p>
        </div>
      )}

      {stage === "review" && (
        <div className="space-y-3 rounded-xl border bg-white/60 p-4">
          <div className="flex items-start gap-3">
            {preview && <img src={preview} alt="Your meal" className="size-16 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">Here&apos;s what I see</p>
              <p className="text-xs text-muted-foreground">
                Portions are estimated from the photo. Adjust the grams if they look off.
              </p>
            </div>
          </div>

          {foods.length > 0 ? (
            <ul className="divide-y rounded-lg border bg-background">
              {foods.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {f.name}
                      {f.estimated && <Badge variant="secondary" className="ml-1.5 align-middle">estimate</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{kcalOf(i)} kcal</p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={grams[i]}
                    onChange={(e) => setGrams((g) => g.map((v, j) => (j === i ? e.target.value : v)))}
                    aria-label={`Grams of ${f.name}`}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">g</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label={`Don't log ${f.name}`} className="text-muted-foreground">
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              {notUnderstood ?? "I couldn't spot any food in that photo."} Try a clearer, closer shot, or search for it instead.
            </p>
          )}

          {foods.length > 0 && notUnderstood && <p className="text-xs text-muted-foreground">{notUnderstood}</p>}

          <div className="flex flex-wrap gap-2">
            {foods.length > 0 && (
              <Button onClick={add} className="h-9 gap-2 px-4">
                <Check />
                Add {foods.length === 1 ? "food" : `${foods.length} foods`} · {total} kcal
              </Button>
            )}
            <Button variant="outline" onClick={() => input.current?.click()} className="h-9 px-4">Try another photo</Button>
            <Button variant="ghost" onClick={reset} className="h-9 px-4">Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
