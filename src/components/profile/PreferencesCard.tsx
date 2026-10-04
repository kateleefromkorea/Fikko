import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ProfileRow } from "../../hooks/useProfile";
import { GAIN_RATES, GOALS, LIMITS, LOSS_RATES, computeBaseline, goalByKey, inRange } from "../../lib/metabolics";
import { ALLERGY_CHOICES, DIET_PATTERNS, MAX_DIET_PATTERNS, TRACKING_STYLES, dietsOf, focusLabel } from "../../lib/preferences";
import { focusGroupsFor, focusWithin, goalsOf, mainGoal, toggleGoal } from "../../lib/goals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface Draft {
  /** Every goal picked; at most one sets the calories (see lib/goals). */
  goals: string[];
  targetWeight: string;
  /** Pace as a positive kg/week; the goal's direction gives the sign. */
  rate: number | null;
  diets: string[];
  focus: string[];
  allergies: string[];
  trackingStyle: string | null;
  reminders: boolean;
}

function toDraft(p: ProfileRow): Draft {
  return {
    goals: goalsOf(p),
    targetWeight: p.target_weight_kg != null ? String(p.target_weight_kg) : "",
    rate: p.weekly_rate_kg != null ? Math.abs(p.weekly_rate_kg) : null,
    diets: dietsOf(p),
    focus: p.goal_focus ?? [],
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

  const goalKey = mainGoal(draft.goals);
  const goal = goalByKey(goalKey);
  const direction = goal?.weightManaging ?? null;
  const rates = direction === "gain" ? GAIN_RATES : LOSS_RATES;
  const focusOptions = focusGroupsFor(draft.goals).flatMap((g) => g.options);
  const targetKg = draft.targetWeight.trim() ? parseFloat(draft.targetWeight) : null;
  // Muscle building towards a weight at or below today's: build muscle while losing fat, at maintenance.
  const recomposition = direction === "gain" && profile.weight_kg != null && targetKg != null && targetKg <= profile.weight_kg;
  const signedRate = recomposition ? 0 : direction && draft.rate ? (direction === "loss" ? -draft.rate : draft.rate) : null;

  const baseline = computeBaseline({
    sex: profile.gender,
    dob: profile.date_of_birth,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    activityLevel: profile.activity_level,
    goalKey,
    weeklyRateKg: signedRate,
  });
  const goalChanged = goalKey !== profile.primary_goal || signedRate !== profile.weekly_rate_kg;

  const toggleAllergy = (a: string) =>
    setDraft((d) => {
      if (a === "None") return { ...d, allergies: d.allergies.includes("None") ? [] : ["None"] };
      const rest = d.allergies.filter((x) => x !== "None");
      return { ...d, allergies: rest.includes(a) ? rest.filter((x) => x !== a) : [...rest, a] };
    });

  const toggleDiet = (p: string) =>
    setDraft((d) => {
      if (d.diets.includes(p)) return { ...d, diets: d.diets.filter((x) => x !== p) };
      return d.diets.length >= MAX_DIET_PATTERNS ? d : { ...d, diets: [...d.diets, p] };
    });

  const toggleFocus = (k: string) =>
    setDraft((d) => ({ ...d, focus: d.focus.includes(k) ? d.focus.filter((x) => x !== k) : [...d.focus, k] }));

  const chipCls = (on: boolean) => cn(
    "h-8 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
    on ? "border-primary bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

  function save() {
    const target = targetKg;
    if (direction) {
      if (target == null || !inRange(target, LIMITS.weightKg)) {
        return setError(`Target weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`);
      }
      if (profile.weight_kg != null && direction === "loss" && target >= profile.weight_kg) {
        return setError("For weight loss, the target should be below your current weight.");
      }
      if (!draft.rate && !recomposition) return setError("Choose a pace.");
    }
    if (!draft.goals.length) return setError("Pick at least one goal.");
    setError(null);
    onUpdateProfile({
      primary_goal: goalKey,
      goals: draft.goals,
      target_weight_kg: direction ? target : null,
      weekly_rate_kg: signedRate,
      dietary_pattern: draft.diets[0] ?? null,
      dietary_patterns: draft.diets,
      goal_focus: focusWithin(draft.focus, draft.goals),
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
    if (profile.primary_goal === "muscle_building" && profile.weekly_rate_kg === 0) return "Recomposition";
    if (!profile.weekly_rate_kg) return "—";
    const kg = Math.abs(profile.weekly_rate_kg);
    return `${profile.weekly_rate_kg < 0 ? "Lose" : "Gain"} ${kg} kg / week`;
  })();
  const allergyLabel = (profile.allergies ?? []).filter((a) => a !== "None");

  const rows = [
    { label: goalsOf(profile).length > 1 ? "Goals" : "Goal", value: goalsOf(profile).map((g) => goalByKey(g)?.label ?? g).join(", ") || "—" },
    { label: "Target weight", value: profile.target_weight_kg != null ? `${profile.target_weight_kg} kg` : "—" },
    { label: "Pace", value: paceLabel },
    ...(profile.goal_focus?.length ? [{ label: "Focus", value: profile.goal_focus.map(focusLabel).join(", ") }] : []),
    { label: "Diet", value: dietsOf(profile).join(", ") || "—" },
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
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm text-muted-foreground">Goals · weight loss, muscle building and maintenance set your calories, so pick one of those</legend>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map((g) => {
                    const on = draft.goals.includes(g.key);
                    return (
                      <button
                        key={g.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDraft((d) => {
                          const goals = toggleGoal(d.goals, g.key);
                          // A pace picked for losing doesn't apply to gaining.
                          const sameDirection = goalByKey(mainGoal(goals))?.weightManaging === direction;
                          return { ...d, goals, rate: sameDirection ? d.rate : null };
                        })}
                        className={chipCls(on)}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

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
                  {recomposition ? (
                    <p className="self-end text-sm text-muted-foreground">
                      Body recomposition: build muscle while losing fat, with calories at maintenance.
                    </p>
                  ) : (
                  <Field label="Pace" htmlFor="pref-pace">
                    <Select value={draft.rate != null ? String(draft.rate) : ""} onValueChange={(v) => setDraft((d) => ({ ...d, rate: Number(v) }))}>
                      <SelectTrigger id="pref-pace" className="h-9 w-full"><SelectValue placeholder="Choose a pace" /></SelectTrigger>
                      <SelectContent>
                        {rates.map((r) => <SelectItem key={r.kg} value={String(r.kg)}>{r.label} · {r.note}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  )}
                </>
              )}

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

            {focusOptions.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm text-muted-foreground">Focus</legend>
                <div className="flex flex-wrap gap-2">
                  {focusOptions.map((f) => {
                    const on = draft.focus.includes(f.key);
                    return (
                      <button key={f.key} type="button" aria-pressed={on} onClick={() => toggleFocus(f.key)} className={chipCls(on)}>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm text-muted-foreground">Diet · up to {MAX_DIET_PATTERNS}</legend>
              <div className="flex flex-wrap gap-2">
                {DIET_PATTERNS.map((p) => {
                  const on = draft.diets.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && draft.diets.length >= MAX_DIET_PATTERNS}
                      onClick={() => toggleDiet(p)}
                      className={chipCls(on)}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </fieldset>

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
                      className={chipCls(on)}
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
