import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ProfileRow } from "../../hooks/useProfile";
import { GAIN_RATES, GOALS, LIMITS, LOSS_RATES, computeBaseline, goalByKey, inRange } from "../../lib/metabolics";
import { ALLERGY_CHOICES, DIET_PATTERNS, TRACKING_STYLES } from "../../lib/preferences";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const NO_DIET = "No particular diet";

interface Draft {
  goalKey: string | null;
  targetWeight: string;
  /** Pace as a positive kg/week; the goal's direction gives the sign. */
  rate: number | null;
  diet: string | null;
  allergies: string[];
  trackingStyle: string | null;
  reminders: boolean;
}

function toDraft(p: ProfileRow): Draft {
  return {
    goalKey: p.primary_goal,
    targetWeight: p.target_weight_kg != null ? String(p.target_weight_kg) : "",
    rate: p.weekly_rate_kg != null ? Math.abs(p.weekly_rate_kg) : null,
    diet: p.dietary_pattern,
    allergies: p.allergies ?? [],
    trackingStyle: p.tracking_style,
    reminders: p.reminders_enabled,
  };
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/**
 * The onboarding answers, editable: goal, target weight and pace (which move
 * the calorie target), diet and allergies (which filter Recipes), how food is
 * tracked, and reminders.
 */
export default function PreferencesCard({ profile, onUpdateProfile, className }: {
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [error, setError] = useState<string | null>(null);

  const goal = goalByKey(draft.goalKey);
  const direction = goal?.weightManaging ?? null;
  const rates = direction === "gain" ? GAIN_RATES : LOSS_RATES;
  const signedRate = direction && draft.rate ? (direction === "loss" ? -draft.rate : draft.rate) : null;

  const baseline = computeBaseline({
    sex: profile.gender,
    dob: profile.date_of_birth,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    activityLevel: profile.activity_level,
    goalKey: draft.goalKey,
    weeklyRateKg: signedRate,
  });
  const goalChanged = draft.goalKey !== profile.primary_goal || signedRate !== profile.weekly_rate_kg;

  const toggleAllergy = (a: string) =>
    setDraft((d) => {
      if (a === "None") return { ...d, allergies: d.allergies.includes("None") ? [] : ["None"] };
      const rest = d.allergies.filter((x) => x !== "None");
      return { ...d, allergies: rest.includes(a) ? rest.filter((x) => x !== a) : [...rest, a] };
    });

  function save() {
    const target = draft.targetWeight.trim() ? parseFloat(draft.targetWeight) : null;
    if (direction) {
      if (target == null || !inRange(target, LIMITS.weightKg)) {
        return setError(`Target weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`);
      }
      if (profile.weight_kg != null && direction === "loss" && target >= profile.weight_kg) {
        return setError("For weight loss, the target should be below your current weight.");
      }
      if (profile.weight_kg != null && direction === "gain" && target <= profile.weight_kg) {
        return setError("For muscle building, the target should be above your current weight.");
      }
      if (!draft.rate) return setError("Choose a pace.");
    }
    setError(null);
    onUpdateProfile({
      primary_goal: draft.goalKey,
      target_weight_kg: direction ? target : null,
      weekly_rate_kg: signedRate,
      dietary_pattern: draft.diet,
      allergies: draft.allergies,
      tracking_style: draft.trackingStyle,
      reminders_enabled: draft.reminders,
      // A new goal or pace moves the calorie target, as it did in onboarding.
      ...(goalChanged && baseline
        ? { bmr: baseline.bmr, tdee: baseline.tdee, calorie_goal: baseline.calorieTarget }
        : {}),
    });
    setEditing(false);
  }

  const paceLabel = (() => {
    if (!profile.weekly_rate_kg) return "—";
    const kg = Math.abs(profile.weekly_rate_kg);
    return `${profile.weekly_rate_kg < 0 ? "Lose" : "Gain"} ${kg} kg / week`;
  })();
  const allergyLabel = (profile.allergies ?? []).filter((a) => a !== "None");

  const rows = [
    { label: "Goal", value: goalByKey(profile.primary_goal)?.label ?? "—" },
    { label: "Target weight", value: profile.target_weight_kg != null ? `${profile.target_weight_kg} kg` : "—" },
    { label: "Pace", value: paceLabel },
    { label: "Diet", value: profile.dietary_pattern ?? "—" },
    { label: "Allergies", value: allergyLabel.length ? allergyLabel.join(", ") : profile.allergies?.includes("None") ? "None" : "—" },
    { label: "Tracking style", value: profile.tracking_style ?? "Simple calories" },
    { label: "Reminders", value: profile.reminders_enabled ? "On (starting soon)" : "Off" },
  ];

  return (
    <Card className={cn("gap-6 [--card-spacing:--spacing(6)]", className)}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Preferences</CardTitle>
        <CardDescription>Your goal, diet and how you like to track. Diet and allergies filter Recipes.</CardDescription>
        {!editing && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => { setDraft(toDraft(profile)); setError(null); setEditing(true); }} className="h-8 px-3">
              <Pencil />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Goal" htmlFor="pref-goal">
                <Select
                  value={draft.goalKey ?? ""}
                  onValueChange={(v) => setDraft((d) => {
                    const sameDirection = goalByKey(v)?.weightManaging === direction;
                    return { ...d, goalKey: v, rate: sameDirection ? d.rate : null };
                  })}
                >
                  <SelectTrigger id="pref-goal" className="h-9 w-full"><SelectValue placeholder="Choose a goal" /></SelectTrigger>
                  <SelectContent>
                    {GOALS.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              {direction && (
                <>
                  <Field label="Target weight (kg)" htmlFor="pref-target">
                    <Input
                      id="pref-target"
                      type="number"
                      value={draft.targetWeight}
                      onChange={(e) => setDraft((d) => ({ ...d, targetWeight: e.target.value }))}
                      className="h-9"
                    />
                  </Field>
                  <Field label="Pace" htmlFor="pref-pace">
                    <Select value={draft.rate != null ? String(draft.rate) : ""} onValueChange={(v) => setDraft((d) => ({ ...d, rate: Number(v) }))}>
                      <SelectTrigger id="pref-pace" className="h-9 w-full"><SelectValue placeholder="Choose a pace" /></SelectTrigger>
                      <SelectContent>
                        {rates.map((r) => <SelectItem key={r.kg} value={String(r.kg)}>{r.label} · {r.note}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              <Field label="Diet" htmlFor="pref-diet">
                <Select value={draft.diet ?? NO_DIET} onValueChange={(v) => setDraft((d) => ({ ...d, diet: v === NO_DIET ? null : v }))}>
                  <SelectTrigger id="pref-diet" className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[NO_DIET, ...DIET_PATTERNS].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tracking style" htmlFor="pref-tracking">
                <Select value={draft.trackingStyle ?? "Simple calories"} onValueChange={(v) => setDraft((d) => ({ ...d, trackingStyle: v }))}>
                  <SelectTrigger id="pref-tracking" className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRACKING_STYLES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.key}{t.soon ? " (coming soon)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm text-muted-foreground">Allergies & intolerances</legend>
              <div className="flex flex-wrap gap-2">
                {ALLERGY_CHOICES.map((a) => {
                  const on = draft.allergies.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAllergy(a)}
                      className={cn(
                        "h-8 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        on ? "border-primary bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Label htmlFor="pref-reminders" className="block min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-medium">Daily reminders</span>
                <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                  Coming soon. Turn this on and we&apos;ll start reminding you once they launch.
                </span>
              </Label>
              <Switch id="pref-reminders" checked={draft.reminders} onCheckedChange={(v) => setDraft((d) => ({ ...d, reminders: v }))} />
            </div>

            {goalChanged && baseline && (
              <p className="text-sm text-muted-foreground">
                Saving will set your daily calorie target to{" "}
                <span className="font-medium text-foreground">{baseline.calorieTarget.toLocaleString()} kcal</span>, worked out
                from your new goal. You can still change it under Daily goals.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={save} className="h-9 px-4">Save changes</Button>
              <Button variant="outline" onClick={() => { setEditing(false); setError(null); }} className="h-9 px-4">Cancel</Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
            {rows.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
