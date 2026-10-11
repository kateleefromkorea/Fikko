import { useState, type ReactNode } from "react";
import { Activity, ChevronLeft, Droplet, Moon, Pill, SmilePlus, Sparkles, type LucideIcon } from "lucide-react";
import { ExerciseCard, MEALS, MOOD_OPTIONS, SleepCard, type HabitCardProps } from "@/components/HabitsView";
import { CUSTOM_ICONS, HabitIcon, type HabitHue } from "@/components/HabitCard";
import VoiceCheckIn from "@/components/VoiceCheckIn";
import type { NewFood } from "@/hooks/useFoodLog";
import { completion } from "@/lib/completion";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { HabitData, MealKey } from "@/types";
import Sheet from "@/phone/Sheet";
import { addGlass, bumpCustom, mealForNow, setMood, takeAllMeds } from "@/phone/quickLog";
import type { QuickLog } from "@/phone/screens/TodayScreen";

type Step = "home" | "mood" | "exercise" | "sleep";
const STEP_TITLE: Record<Step, string> = { home: "Log", mood: "How are you feeling?", exercise: "Activity", sleep: "Sleep" };

/**
 * Everything that can be logged, one tap from anywhere: tell Fikko in your
 * own words, pick a meal (describe, photo, barcode or search inside), or tap
 * a habit. It's built for logging the moment something happens, in seconds.
 */
export default function CaptureSheet({ open, onClose, cardProps, onQuick, onLogMeal, onVoiceSave }: {
  open: boolean;
  onClose: () => void;
  cardProps: HabitCardProps;
  onQuick: QuickLog;
  onLogMeal: (meal: MealKey) => void;
  onVoiceSave: (next: HabitData, foods: (NewFood & { meal: MealKey })[]) => void;
}) {
  const [step, setStep] = useState<Step>("home");
  const { data, activeDate, medications, goals } = cardProps;
  const today = todayKey();
  const when = activeDate === today ? null : activeDate === shiftDateKey(today, -1) ? "yesterday" : new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const now = mealForNow();
  const { core, custom } = completion(data, activeDate, goals.water);
  const isDone = (k: string) => core.find((c) => c.key === k)?.done ?? false;
  const medIds = medications.medications.map((m) => m.id);

  const close = () => { onClose(); setStep("home"); };
  const quick = (update: (d: HabitData) => HabitData, message: string) => { onQuick(update, message); close(); };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={step === "home" && when ? `Log for ${when}` : STEP_TITLE[step]}
      className={step === "exercise" || step === "sleep" ? "sheet-card" : undefined}
    >
      {step !== "home" && (
        <button onClick={() => setStep("home")} className="press -mt-2 mb-3 -ml-1 flex h-9 items-center gap-1 text-[15px] font-medium text-primary-ink">
          <ChevronLeft className="size-5" aria-hidden="true" /> Back
        </button>
      )}

      {step === "home" && (
        <div className="space-y-6">
          <div className="voice-capture">
            <VoiceCheckIn
              data={data}
              date={activeDate}
              isToday={!when}
              medications={medications.medications}
              onSave={(next, foods) => { onVoiceSave(next, foods); close(); }}
            />
          </div>

          <section aria-labelledby="cap-food">
            <Heading id="cap-food" hint="Describe it, snap a photo, scan or search">Food</Heading>
            <div className="grid grid-cols-4 gap-2">
              {MEALS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { close(); onLogMeal(m.key); }}
                  className={cn(
                    "press relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold",
                    m.key === now && !when ? "bg-primary/10 text-primary-ink ring-2 ring-primary/40" : "bg-foreground/[0.04]",
                  )}
                >
                  <m.icon className="size-6" style={{ color: m.key === now && !when ? undefined : m.color }} aria-hidden="true" />
                  {m.label}
                  {m.key === now && !when && <span className="sr-only">(now)</span>}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="cap-quick">
            <Heading id="cap-quick">One tap</Heading>
            <div className="grid grid-cols-2 gap-2">
              <QuickTile icon={Droplet} hue="water" label="Water" hint="+1 glass"
                onClick={() => quick((d) => addGlass(d, activeDate), "Glass of water added")} />
              <QuickTile icon={SmilePlus} hue="mood" label="Mood" hint="Pick a feeling" done={isDone("mood")} onClick={() => setStep("mood")} />
              {medIds.length > 0 && (
                <QuickTile icon={Pill} hue="meds" label="Meds" hint="Took them all" done={isDone("medication")}
                  onClick={() => quick((d) => takeAllMeds(d, activeDate, medIds), "Medications ticked off")} />
              )}
              <QuickTile icon={Activity} hue="exercise" label="Activity" hint="Add a workout" done={isDone("exercise")} onClick={() => setStep("exercise")} />
              <QuickTile icon={Moon} hue="sleep" label="Sleep" hint="Rate your rest" done={isDone("sleep")} onClick={() => setStep("sleep")} />
              {custom.map(({ habit, done }) => (
                <QuickTile key={habit.id} icon={CUSTOM_ICONS[habit.icon] ?? Sparkles} hue="custom" label={habit.name} hint={`+1 ${habit.unit}`} done={done}
                  onClick={() => quick((d) => bumpCustom(d, activeDate, habit.id), `${habit.name} logged`)} />
              ))}
            </div>
          </section>
        </div>
      )}

      {step === "mood" && (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Mood">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => quick((d) => setMood(d, activeDate, m.key), `Feeling ${m.label.toLowerCase()}, saved`)}
              className="press flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-foreground/[0.04] text-xs font-medium"
            >
              <m.icon className="size-6 text-[var(--mood-fg)]" aria-hidden="true" />
              {m.label}
            </button>
          ))}
        </div>
      )}
      {step === "exercise" && <ExerciseCard {...cardProps} />}
      {step === "sleep" && <SleepCard {...cardProps} />}
    </Sheet>
  );
}

function Heading({ id, hint, children }: { id: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
      <h3 id={id} className="text-[15px] font-semibold">{children}</h3>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function QuickTile({ icon, hue, label, hint, done, onClick }: {
  icon: LucideIcon; hue: HabitHue; label: string; hint: string; done?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="press flex h-16 items-center gap-3 rounded-2xl bg-foreground/[0.04] px-3 text-left">
      <HabitIcon icon={icon} hue={hue} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{label}</span>
        <span className={cn("block truncate text-xs", done ? "font-medium text-primary-ink" : "text-muted-foreground")}>{done ? "Done today" : hint}</span>
      </span>
    </button>
  );
}
