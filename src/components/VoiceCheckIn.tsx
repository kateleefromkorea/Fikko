import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, Check, Droplet, Keyboard, Loader2, Mic, Moon, Pill, SmilePlus, Square, Target, Utensils, X, type LucideIcon,
} from "lucide-react";
import type { HabitData, MealKey } from "../types";
import type { NewFood } from "../hooks/useFoodLog";
import {
  applyProposal, interpret, isEmptyProposal, speechRecognition, type SpeechRecognitionLike, type VoiceProposal,
} from "../lib/voice";
import { moodOption } from "./HabitsView";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "../lib/errors";

const REST = ["", "Exhausted", "Still tired", "Okay", "Rested", "Fully rested"];
const MEAL_LABEL: Record<MealKey, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };

type Stage = "idle" | "listening" | "typing" | "thinking" | "review" | "saved";

interface Props {
  data: HabitData;
  date: string;
  isToday: boolean;
  medications: { id: string; name: string }[];
  /** Saves the habit changes and logs the foods together. */
  onSave: (data: HabitData, foods: (NewFood & { meal: MealKey })[]) => void;
  /** Bumped by the sticky day bar's Speak button to start listening. */
  listenRequest?: number;
}

/**
 * "Tell Fikko about your day": speak (or type) what you did, check what Fikko
 * understood, and save it to your habits in one tap.
 */
export default function VoiceCheckIn({ data, date, isToday, medications, onSave, listenRequest = 0 }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [proposal, setProposal] = useState<VoiceProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");
  const canListen = speechRecognition() != null;

  useEffect(() => () => recognizer.current?.abort(), []);

  // Starts on a new request only, not one already handled before a remount (changing day remounts this).
  const handledRequest = useRef(listenRequest);
  useEffect(() => {
    if (listenRequest === handledRequest.current) return;
    handledRequest.current = listenRequest;
    if (stage === "listening" || stage === "thinking") return;
    if (canListen) listen();
    else setStage("typing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenRequest]);

  function reset() {
    recognizer.current?.abort();
    recognizer.current = null;
    finalText.current = "";
    setTranscript("");
    setInterim("");
    setProposal(null);
    setError(null);
    setStage("idle");
  }

  function listen() {
    const Recognition = speechRecognition();
    if (!Recognition) {
      setStage("typing");
      return;
    }
    setError(null);
    finalText.current = "";
    setTranscript("");
    setInterim("");
    const r = new Recognition();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += `${text} `;
        else live += text;
      }
      setTranscript(finalText.current.trim());
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings, or type instead."
          : "Voice input stopped unexpectedly. You can type instead.",
      );
      setStage("typing");
    };
    r.onend = () => {
      recognizer.current = null;
      setInterim("");
      // Some browsers stop on their own after a pause; keep what was heard.
      setStage((s) => (s === "listening" ? "typing" : s));
      setTranscript(finalText.current.trim());
    };
    recognizer.current = r;
    r.start();
    setStage("listening");
  }

  async function send(text: string) {
    recognizer.current?.stop();
    const said = text.trim();
    if (!said) {
      setError("We didn't catch anything. Try again?");
      setStage("typing");
      return;
    }
    setTranscript(said);
    setStage("thinking");
    setError(null);
    try {
      const p = await interpret(
        said,
        medications.map((m) => ({ id: m.id, name: m.name })),
        data.custom.map((h) => ({ id: h.id, name: h.name, unit: h.unit })),
      );
      setProposal(p);
      setStage("review");
    } catch (err) {
      setError(friendlyError(err, "We couldn't read that check-in. Please try again."));
      setStage("typing");
    }
  }

  function save() {
    if (!proposal) return;
    const { data: next, foods } = applyProposal(data, proposal, date, medications.map((m) => m.id));
    onSave(next, foods);
    setStage("saved");
  }

  // Lets the member drop a line they don't want before saving.
  function drop(patch: Partial<VoiceProposal>) {
    setProposal((p) => (p ? { ...p, ...patch } : p));
  }

  if (stage === "idle" || stage === "saved") {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={canListen ? listen : () => setStage("typing")} className="h-10 gap-2 rounded-full px-5 shadow-sm">
          <Mic />
          Tell Fikko about {isToday ? "your day" : "this day"}
        </Button>
        {stage === "saved" ? (
          <p role="status" className="flex items-center gap-1.5 text-sm text-primary-ink">
            <Check className="size-4" aria-hidden="true" /> Saved. Your habits are updated.
          </p>
        ) : (
          <p className="text-sm text-foreground/60">
            Try: “Two glasses of water, a 30 minute walk and chicken rice for lunch.”
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-foreground/5">
      {stage === "listening" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="relative grid size-10 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
              <Mic className="relative size-5" />
            </span>
            <p className="text-sm font-medium">Listening… tell Fikko what you ate, drank and did.</p>
          </div>
          <p className="min-h-12 text-base" aria-live="polite">
            {transcript}{" "}<span className="text-muted-foreground">{interim}</span>
            {!transcript && !interim && <span className="text-muted-foreground">Start talking whenever you&apos;re ready.</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void send(`${finalText.current} ${interim}`)} className="h-9 gap-2 px-4">
              <Square className="size-3.5 fill-current" />
              Done
            </Button>
            <Button variant="ghost" onClick={reset} className="h-9 px-4">Cancel</Button>
          </div>
        </div>
      )}

      {stage === "typing" && (
        <form onSubmit={(e) => { e.preventDefault(); void send(transcript); }} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Keyboard className="size-4 text-primary-ink" aria-hidden="true" />
            {canListen ? "Check what we heard, or type it" : "Type what you ate, drank and did"}
          </p>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="e.g. Two glasses of water, a 30 minute walk and chicken rice for lunch"
            maxLength={1500}
            rows={3}
            autoFocus
            className="bg-background"
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!transcript.trim()} className="h-9 px-4">Continue</Button>
            {canListen && (
              <Button type="button" variant="outline" onClick={listen} className="h-9 gap-2 px-4">
                <Mic />
                Speak again
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={reset} className="h-9 px-4">Cancel</Button>
          </div>
        </form>
      )}

      {stage === "thinking" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">“{transcript}”</p>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-primary-ink" /> Working out what to log…
          </p>
        </div>
      )}

      {stage === "review" && proposal && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">Here&apos;s what I heard</p>
            <p className="mt-0.5 text-xs text-muted-foreground">“{transcript}”</p>
          </div>

          {isEmptyProposal(proposal) ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              I couldn&apos;t find anything to log in that. Try mentioning water, food, activity, sleep, mood or your meds.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-background">
              {proposal.water && (
                <Line icon={Droplet} onRemove={() => drop({ water: null })}>
                  Water {proposal.water.mode === "add" ? `+${proposal.water.glasses}` : `${proposal.water.glasses} total`} {proposal.water.glasses === 1 ? "glass" : "glasses"}
                </Line>
              )}
              {proposal.activity && (
                <Line icon={Activity} onRemove={() => drop({ activity: null })}>
                  Activity {proposal.activity.mode === "add" ? "+" : ""}{proposal.activity.minutes} min{proposal.activity.mode === "total" ? " total" : ""}
                  {proposal.activity.what && <span className="text-muted-foreground"> · {proposal.activity.what}</span>}
                </Line>
              )}
              {proposal.mood && (
                <Line icon={SmilePlus} onRemove={() => drop({ mood: null })}>Mood: {moodOption(proposal.mood.value, proposal.mood.key)?.label}</Line>
              )}
              {proposal.sleep && (
                <Line icon={Moon} onRemove={() => drop({ sleep: null })}>
                  Sleep{proposal.sleep.bedtime && proposal.sleep.wake ? ` ${proposal.sleep.bedtime}–${proposal.sleep.wake}` : proposal.sleep.bedtime ? `, bed at ${proposal.sleep.bedtime}` : proposal.sleep.wake ? `, up at ${proposal.sleep.wake}` : ""}
                  {proposal.sleep.rest && <span className="text-muted-foreground"> · {REST[proposal.sleep.rest]}</span>}
                </Line>
              )}
              {proposal.medications && (
                <Line icon={Pill} onRemove={() => drop({ medications: null })}>
                  {proposal.medications.all
                    ? "All medications taken"
                    : `Taken: ${proposal.medications.ids.map((id) => medications.find((m) => m.id === id)?.name).filter(Boolean).join(", ")}`}
                </Line>
              )}
              {proposal.customHabits.map((c, i) => {
                const habit = data.custom.find((h) => h.id === c.id);
                return habit ? (
                  <Line key={c.id} icon={Target} onRemove={() => drop({ customHabits: proposal.customHabits.filter((_, j) => j !== i) })}>
                    {habit.name} {c.mode === "add" ? "+" : ""}{c.amount} {habit.unit}{c.mode === "total" ? " total" : ""}
                  </Line>
                ) : null;
              })}
              {proposal.foods.map((f, i) => (
                <Line key={`${f.name}-${i}`} icon={Utensils} onRemove={() => drop({ foods: proposal.foods.filter((_, j) => j !== i) })}>
                  {MEAL_LABEL[f.meal]}: {f.name}
                  <span className="text-muted-foreground"> · {Math.round(f.grams)} g · {Math.round((f.caloriesPer100g * f.grams) / 100)} kcal</span>
                  {f.estimated && <Badge variant="secondary" className="ml-1.5 align-middle">estimate</Badge>}
                </Line>
              ))}
            </ul>
          )}

          {proposal.notUnderstood && (
            <p className="text-xs text-muted-foreground">Not logged: {proposal.notUnderstood}</p>
          )}
          {proposal.foods.some((f) => f.estimated) && (
            <p className="text-xs text-muted-foreground">Estimates are a best guess for the portion you described. You can adjust grams in the meal afterwards.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {!isEmptyProposal(proposal) && (
              <Button onClick={save} className="h-9 gap-2 px-4">
                <Check />
                Save to my habits
              </Button>
            )}
            <Button variant="outline" onClick={() => { setProposal(null); setStage("typing"); }} className="h-9 px-4">Edit what I said</Button>
            <Button variant="ghost" onClick={reset} className="h-9 px-4">Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ icon: Icon, onRemove, children }: { icon: LucideIcon; onRemove: () => void; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <Icon className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
      <span className={cn("min-w-0 flex-1")}>{children}</span>
      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Don't log this" className="text-muted-foreground">
        <X />
      </Button>
    </li>
  );
}
