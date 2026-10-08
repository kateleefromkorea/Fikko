import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Camera, Check, Loader2, Mic, Minus, Plus, ScanBarcode, Sparkles, Square, Undo2, X } from "lucide-react";
import type { MealKey } from "../types";
import type { NewFood } from "../hooks/useFoodLog";
import { describeMeal, gramsEaten, portionText, type DescribedFood } from "../lib/describeMeal";
import { speechRecognition, type SpeechRecognitionLike } from "../lib/voice";
import { formatMacros, sumMacros } from "../lib/macros";
import { DB_LIMITS, clamp } from "../lib/limits";
import { friendlyError } from "../lib/errors";
import { useAiCredits } from "../hooks/useAiCredits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_TEXT = 500;
const SHARE_OPTIONS = [1, 2, 3, 4];
const STEP = 0.5;
const EXAMPLES = ["chicken rice and an iced kopi", "2 eggs on toast", "a bowl of ramen, shared the gyoza"];

type Stage = "describing" | "listening" | "thinking" | "review";

/**
 * The top of the food window: say, type or snap the meal, then check Fikko's
 * list (portions in plates and bowls, and who shared what) and add it in one go.
 * Snap and Scan hand over to the photo log and barcode scanner below it.
 */
export default function DescribeMeal({ meal, mealLabel, onAddMany, onUndo, onSnap, onScan, scanning, showMacros }: {
  meal: MealKey;
  mealLabel: string;
  onAddMany: (foods: NewFood[]) => void;
  /** Removes foods just added, by id. */
  onUndo: (ids: string[]) => void | Promise<boolean>;
  onSnap: () => void;
  onScan: () => void;
  scanning: boolean;
  showMacros?: boolean;
}) {
  const [stage, setStage] = useState<Stage>("describing");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [foods, setFoods] = useState<DescribedFood[]>([]);
  const [notUnderstood, setNotUnderstood] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; kcal: number }[] | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const canListen = speechRecognition() != null;
  const { left, limit, period } = useAiCredits();
  const when = period === "week" ? "this week" : "today";
  const outOfCredits = left === 0;

  useEffect(() => () => recognizer.current?.abort(), []);

  function listen() {
    const Recognition = speechRecognition();
    if (!Recognition) return;
    setError(null);
    setAdded(null);
    const before = text.trim();
    let heard = "";
    const r = new Recognition();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const said = e.results[i][0].transcript;
        if (e.results[i].isFinal) heard += `${said} `;
        else live += said;
      }
      setText(`${before ? `${before} ` : ""}${heard}`.slice(0, MAX_TEXT));
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked. Allow it in your browser settings, or type instead."
        : "Voice input stopped. You can type instead.");
    };
    r.onend = () => {
      recognizer.current = null;
      setInterim("");
      setStage((s) => (s === "listening" ? "describing" : s));
    };
    recognizer.current = r;
    r.start();
    setStage("listening");
  }

  function stopListening() {
    recognizer.current?.stop();
  }

  async function workOut() {
    recognizer.current?.stop();
    const said = `${text} ${interim}`.trim();
    if (!said) {
      setError("Describe your meal first, for example “chicken rice and an iced kopi”.");
      return;
    }
    setError(null);
    setAdded(null);
    setStage("thinking");
    try {
      const out = await describeMeal(said, meal);
      setFoods(out.foods);
      setNotUnderstood(out.notUnderstood);
      setStage(out.foods.length ? "review" : "describing");
      if (!out.foods.length) setError(out.notUnderstood ?? "We couldn't find any food in that. Try naming what you ate.");
    } catch (err) {
      setError(friendlyError(err, "We couldn't work that meal out. Please try again."));
      setStage("describing");
    }
  }

  function undo() {
    void onUndo(addedIds);
    setAdded(null);
    setAddedIds([]);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void workOut();
    }
  }

  const change = (i: number, patch: Partial<DescribedFood["portion"]>) =>
    setFoods((list) => list.map((f, j) => (j === i ? { ...f, portion: { ...f.portion, ...patch } } : f)));
  const remove = (i: number) => setFoods((list) => list.filter((_, j) => j !== i));
  const grams = (f: DescribedFood) => clamp(Math.round(gramsEaten(f.portion)), DB_LIMITS.foodGrams);
  const kcal = (f: DescribedFood) => Math.round((f.caloriesPer100g * grams(f)) / 100);
  const total = foods.reduce((s, f) => s + kcal(f), 0);
  const macros = sumMacros(foods.map((f) => ({ ...f, grams: grams(f) })));

  function add() {
    const items = foods
      .map((f): NewFood => ({
        id: crypto.randomUUID(),
        name: f.name.slice(0, DB_LIMITS.foodNameLength),
        grams: grams(f),
        caloriesPer100g: f.caloriesPer100g,
        proteinPer100g: f.proteinPer100g,
        carbsPer100g: f.carbsPer100g,
        fatPer100g: f.fatPer100g,
      }))
      .filter((f) => f.grams > 0);
    if (!items.length) return;
    onAddMany(items);
    setAddedIds(items.map((i) => i.id!));
    setAdded(foods.filter((f) => grams(f) > 0).map((f) => ({ name: f.name, kcal: kcal(f) })));
    setFoods([]);
    setText("");
    setNotUnderstood(null);
    setStage("describing");
  }

  if (stage === "review") {
    return (
      <div className="space-y-3 rounded-2xl border border-[#1A9C8C]/40 bg-[#F4FBFA] p-3 shadow-sm sm:p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#0A6E63]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Here&apos;s what I got</p>
            <p className="text-xs text-muted-foreground">Change the portions, or say who you shared with (&ldquo;With 1&rdquo; is you and one other).</p>
          </div>
        </div>

        <ul className="divide-y rounded-lg border bg-card">
          {foods.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-40">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{f.name}</span>
                  {f.estimated && <Badge variant="secondary" className="shrink-0">estimate</Badge>}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {portionText(f.portion)}
                  {f.portion.sharedBy > 1 && `, your share ${Math.round(100 / f.portion.sharedBy)}%`} · {kcal(f)} kcal
                </p>
              </div>
              <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
                <div className="flex shrink-0 items-center rounded-lg border" role="group" aria-label={`How many ${f.portion.unit}s of ${f.name}`}>
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => change(i, { count: Math.max(STEP, f.portion.count - STEP) })}
                    disabled={f.portion.count <= STEP}
                    aria-label={`Less ${f.name}`}
                  >
                    <Minus />
                  </Button>
                  <span className="w-9 text-center text-sm font-medium tabular-nums" aria-live="polite">{f.portion.count}</span>
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => change(i, { count: Math.min(20, f.portion.count + STEP) })}
                    aria-label={`More ${f.name}`}
                  >
                    <Plus />
                  </Button>
                </div>
                <select
                  value={f.portion.sharedBy}
                  onChange={(e) => change(i, { sharedBy: Number(e.target.value) })}
                  aria-label={`Who shared ${f.name}`}
                  className="h-8 shrink-0 rounded-lg border bg-card px-2 text-sm"
                >
                  {SHARE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n === 1 ? "Just me" : `With ${n - 1}`}</option>
                  ))}
                </select>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label={`Don't log ${f.name}`} className="ml-auto text-muted-foreground sm:ml-0">
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {notUnderstood && <p className="text-xs text-muted-foreground">Not logged: {notUnderstood}</p>}
        {showMacros && macros.missing < foods.length && (
          <p className="text-xs text-muted-foreground tabular-nums">About {formatMacros(macros.total)}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={add} disabled={!foods.length} className="h-10 px-5">
            Add to {mealLabel.toLowerCase()} · {total.toLocaleString()} kcal
          </Button>
          <Button variant="ghost" onClick={() => { setStage("describing"); setFoods([]); }} className="h-10">
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const listening = stage === "listening";
  const thinking = stage === "thinking";
  const shown = listening && interim ? `${text}${text ? " " : ""}${interim}` : text;
  const canSend = !!shown.trim() && !thinking && !listening && !outOfCredits;

  if (thinking) {
    return (
      <div role="status" aria-live="polite" className="space-y-3 rounded-2xl border border-[#1A9C8C]/30 bg-gradient-to-br from-[#E9F7F5] to-[#EAF4FB] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0A6E63]">
          <Sparkles className="size-4 animate-pulse" aria-hidden="true" />
          Fikko is working out the foods and portions…
        </p>
        <p className="text-sm text-muted-foreground">“{shown.trim()}”</p>
        <div className="space-y-2" aria-hidden="true">
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-[#1A9C8C]/15" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#1A9C8C]/15" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#1A9C8C]/30 bg-gradient-to-br from-[#E9F7F5] to-[#EAF4FB] p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#1A9C8C] px-2 py-0.5 text-xs font-semibold text-white">
          <Sparkles className="size-3" aria-hidden="true" />
          AI
        </span>
        <p className="text-sm font-semibold text-[#0A5A51]">Tell Fikko what you ate</p>
      </div>

      <div className={cn("rounded-xl border border-[#1A9C8C]/40 bg-white shadow-xs transition-shadow focus-within:border-[#1A9C8C] focus-within:ring-4 focus-within:ring-[#1A9C8C]/20", listening && "border-[#1A9C8C] ring-4 ring-[#1A9C8C]/20")}>
        <label htmlFor="describe-meal" className="sr-only">Describe your {mealLabel.toLowerCase()}</label>
        <textarea
          id="describe-meal"
          rows={2}
          value={shown}
          onChange={(e) => { setText(e.target.value.slice(0, MAX_TEXT)); setAdded(null); setError(null); }}
          onKeyDown={onKey}
          readOnly={listening}
          placeholder={listening ? "Listening…" : "Tell Fikko what you ate…"}
          className="block w-full resize-none rounded-xl bg-transparent px-3.5 pt-3 pb-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          {canListen && (
            listening ? (
              <Button type="button" size="icon" onClick={stopListening} aria-label="Stop listening" className="size-9 animate-pulse rounded-full">
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="button" size="icon" variant="outline" onClick={listen} aria-label="Say it" className="size-9 rounded-full border-[#1A9C8C]/40 text-[#0A6E63]">
                <Mic />
              </Button>
            )
          )}
          <Button type="button" size="icon" onClick={() => void workOut()} disabled={!canSend} aria-label="Log it" className="size-9 rounded-full">
            <ArrowUp />
          </Button>
        </div>
      </div>

      {!shown.trim() && !listening && (
        <div className="flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setText(ex); setError(null); setAdded(null); document.getElementById("describe-meal")?.focus(); }}
              className="rounded-full border border-[#1A9C8C]/30 bg-white/70 px-3 py-1 text-xs text-[#0A5A51] transition-colors hover:bg-white"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">or</span>
        <Button variant="outline" onClick={onSnap} disabled={listening} className="h-9 flex-1 gap-2 bg-white sm:flex-none">
          <Camera />
          Snap it
        </Button>
        <Button variant="outline" onClick={onScan} aria-pressed={scanning} disabled={listening} className="h-9 flex-1 gap-2 bg-white sm:flex-none">
          <ScanBarcode />
          Scan
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {added && (
        <div role="status" className="rounded-xl border border-[#1A9C8C]/40 bg-white/80 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[#0A6E63]">
            <Check className="size-4" aria-hidden="true" />
            Added to {mealLabel.toLowerCase()}
            <Button type="button" variant="ghost" size="sm" onClick={undo} className="ml-auto h-7 gap-1 px-2 text-[#0A6E63]">
              <Undo2 />
              Undo
            </Button>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {added.map((a, i) => (
              <li key={`${a.name}-${i}`} className="rounded-full bg-[#E9F7F5] px-2.5 py-0.5 text-xs tabular-nums text-[#0A5A51]">
                {a.name} · {a.kcal} kcal
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">Not right? Undo, or edit it in your meal above.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
          {outOfCredits
            ? "You've used all of today's AI credits. They reset at midnight; you can still search foods below."
            : "Fikko works out the foods and portions. Uses one AI credit."}
        </p>
        {left != null && (
          <span
            className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium tabular-nums", outOfCredits ? "text-destructive" : "text-[#0A6E63]")}
            aria-label={`${left} of ${limit} AI credits left ${when}`}
          >
            <Sparkles className="size-3" aria-hidden="true" />
            {left} of {limit} left {when}
          </span>
        )}
      </div>
    </div>
  );
}
