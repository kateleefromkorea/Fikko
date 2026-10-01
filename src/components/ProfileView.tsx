import { useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import PageHeader from "./PageHeader";
import PreferencesCard from "./profile/PreferencesCard";
import DevicesCard, { type DeviceOutcome } from "./profile/DevicesCard";
import { computeBaseline, LIMITS, inRange } from "../lib/metabolics";
import { DB_LIMITS, clamp } from "../lib/limits";
import { deleteAccount, exportAllData } from "../lib/account";
import { Activity, Download, Droplet, Loader2, LogOut, Moon, Pencil, Utensils, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface Draft {
  name: string;
  dob: string;
  gender: string;
  height: string;
  weight: string;
  activityLevel: string;
  calorieGoal: string;
  waterGoal: string;
  sleepGoal: string;
}

interface Props {
  email: string;
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => void;
  userId: string;
  onSignOut: () => void;
  /** Outcome of returning from a device's sign-in, if the member just did. */
  deviceOutcome: DeviceOutcome | null;
  /** Reload synced readings after a device sync or disconnect. */
  onDevicesSynced: () => void;
}

const ACTIVITY_LEVELS = ["Sedentary", "Lightly active", "Moderately active", "Very active", "Extra active"];
// Same options and wording as onboarding. Only used for the calorie formula.
const SEXES = ["Male", "Female", "Prefer not to say"];


function toDraft(profile: ProfileRow): Draft {
  return {
    name: profile.name,
    dob: profile.date_of_birth ?? "",
    gender: profile.gender ?? SEXES[2],
    height: profile.height_cm != null ? String(profile.height_cm) : "",
    weight: profile.weight_kg != null ? String(profile.weight_kg) : "",
    activityLevel: profile.activity_level ?? ACTIVITY_LEVELS[2],
    calorieGoal: String(profile.calorie_goal),
    waterGoal: String(profile.water_goal),
    sleepGoal: String(profile.sleep_goal),
  };
}

/**
 * Re-runs the onboarding maths over a draft. Body stats, activity level and
 * the goal all feed the calorie target, so an edit to any of them has to
 * recompute it — otherwise the dashboard keeps showing a number worked out
 * from an older version of the user. The goal and pace themselves are still
 * whatever onboarding recorded.
 */
function baselineFrom(draft: Draft, profile: ProfileRow) {
  return computeBaseline({
    sex: draft.gender,
    dob: draft.dob || null,
    heightCm: draft.height ? parseFloat(draft.height) : null,
    weightKg: draft.weight ? parseFloat(draft.weight) : null,
    activityLevel: draft.activityLevel,
    goalKey: profile.primary_goal,
    weeklyRateKg: profile.weekly_rate_kg,
  });
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Heading row shared by every section card, with an optional Edit button. */
function SectionHeader({ title, description, onEdit }: { title: string; description?: string; onEdit?: () => void }) {
  return (
    <CardHeader>
      <CardTitle className="text-base font-semibold">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
      {onEdit && (
        <CardAction>
          <Button variant="outline" size="sm" onClick={onEdit} className="h-8 px-3">
            <Pencil />
            Edit
          </Button>
        </CardAction>
      )}
    </CardHeader>
  );
}

const cardCls = "gap-6 [--card-spacing:--spacing(6)]";

export default function ProfileView({ email, profile, onUpdateProfile, userId, onSignOut, deviceOutcome, onDevicesSynced }: Props) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [infoError, setInfoError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [accountBusy, setAccountBusy] = useState<"export" | "delete" | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((p) => ({ ...p, [k]: e.target.value }));

  const saveInfo = () => {
    const height = draft.height ? parseFloat(draft.height) : null;
    const weight = draft.weight ? parseFloat(draft.weight) : null;
    if (height !== null && !inRange(height, LIMITS.heightCm)) {
      setInfoError(`Height must be between ${LIMITS.heightCm.min} and ${LIMITS.heightCm.max} cm.`);
      return;
    }
    if (weight !== null && !inRange(weight, LIMITS.weightKg)) {
      setInfoError(`Weight must be between ${LIMITS.weightKg.min} and ${LIMITS.weightKg.max} kg.`);
      return;
    }
    setInfoError(null);
    const patch: Partial<ProfileRow> = {
      name: draft.name.trim().slice(0, DB_LIMITS.nameLength),
      date_of_birth: draft.dob || null,
      gender: draft.gender,
      height_cm: height,
      weight_kg: weight,
    };
    // Weight, height, age and sex are all Mifflin-St Jeor inputs.
    const baseline = baselineFrom(draft, profile);
    if (baseline) {
      patch.bmr = baseline.bmr;
      patch.tdee = baseline.tdee;
      patch.calorie_goal = baseline.calorieTarget;
    }
    onUpdateProfile(patch);
    setEditingInfo(false);
  };
  const saveGoals = () => {
    const baseline = baselineFrom(draft, profile);
    onUpdateProfile({
      activity_level: draft.activityLevel,
      // Typed by hand in this very form, so it beats the recommendation.
      calorie_goal: clamp(parseFloat(draft.calorieGoal) || baseline?.calorieTarget || 2000, DB_LIMITS.calorieGoal),
      water_goal: clamp(parseFloat(draft.waterGoal) || 8, DB_LIMITS.waterGoal),
      sleep_goal: clamp(parseFloat(draft.sleepGoal) || 8, DB_LIMITS.sleepGoal),
      ...(baseline ? { bmr: baseline.bmr, tdee: baseline.tdee } : {}),
    });
    setEditingGoals(false);
  };

  /**
   * Activity level moves the recommendation, so the calorie field follows it
   * live — but only while it still shows the old recommendation. Once the
   * user has typed a figure of their own, we leave it alone.
   */
  const setActivityLevel = (activityLevel: string) => {
    setDraft((p) => {
      const next = { ...p, activityLevel };
      const before = baselineFrom(p, profile);
      const after = baselineFrom(next, profile);
      if (after && (!before || String(before.calorieTarget) === p.calorieGoal.trim())) {
        next.calorieGoal = String(after.calorieTarget);
      }
      return next;
    });
  };
  const cancelInfo = () => { setDraft(toDraft(profile)); setInfoError(null); setEditingInfo(false); };
  const cancelGoals = () => { setDraft(toDraft(profile)); setEditingGoals(false); };

  const exportData = async () => {
    setAccountBusy("export");
    setAccountError(null);
    try {
      await exportAllData(userId);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setAccountBusy(null);
    }
  };

  // Deletion is irreversible, so it needs the word typed out rather than a
  // second click that is easy to hit by accident.
  const confirmDelete = async () => {
    if (deleteText !== "DELETE") return;
    setAccountBusy("delete");
    setAccountError(null);
    try {
      await deleteAccount();
      // Signing out returns the app to the login screen.
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "We couldn't delete your account. Please try again.");
      setAccountBusy(null);
    }
  };

  const age = draft.dob
    ? Math.floor((Date.now() - new Date(draft.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const bmi = profile.height_cm && profile.weight_kg
    ? (profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)
    : null;

  const bmiLabel = bmi
    ? parseFloat(bmi) < 18.5 ? "Underweight" : parseFloat(bmi) < 25 ? "Normal" : parseFloat(bmi) < 30 ? "Overweight" : "Obese"
    : null;

  // What the maths says the target should be for the numbers currently in the
  // form — shown alongside the field so an override is a visible choice.
  const recommended = baselineFrom(draft, profile)?.calorieTarget ?? null;
  const overridden = recommended != null && String(recommended) !== draft.calorieGoal.trim();

  const displayName = profile.name || email;
  const initials = displayName.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const goalRows: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Calories", value: `${Math.round(profile.calorie_goal).toLocaleString()} kcal`, icon: Utensils },
    { label: "Water", value: `${profile.water_goal} glasses`, icon: Droplet },
    { label: "Sleep", value: `${profile.sleep_goal} hours`, icon: Moon },
    { label: "Activity", value: profile.activity_level ?? "Not set", icon: Activity },
  ];

  const infoRows = [
    { label: "Full name", value: profile.name || "—" },
    { label: "Email", value: email },
    { label: "Date of birth", value: profile.date_of_birth ? new Date(profile.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
    { label: "Sex (for calorie maths)", value: profile.gender ?? "—" },
    { label: "Height", value: profile.height_cm ? `${profile.height_cm} cm` : "—" },
    { label: "Weight", value: profile.weight_kg ? `${profile.weight_kg} kg` : "—" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader title="Profile" subtitle="Your details, daily goals and account." />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Left: identity + daily goals */}
        <div className="flex flex-col gap-6">
          <Card className={cardCls}>
            <CardContent className="flex flex-col items-center text-center">
              <Avatar className="size-20">
                <AvatarFallback className="bg-primary text-2xl font-medium text-primary-foreground">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <p className="mt-4 max-w-full text-lg font-semibold [overflow-wrap:anywhere]">{displayName}</p>
              {profile.name && <p className="max-w-full truncate text-sm text-muted-foreground">{email}</p>}
              {age !== null && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {age} years old{profile.gender ? ` · ${profile.gender}` : ""}
                </p>
              )}

              <Separator className="my-6" />

              <dl className="grid w-full grid-cols-3 gap-2">
                {[
                  { label: "Height", value: profile.height_cm ?? "—", unit: "cm" },
                  { label: "Weight", value: profile.weight_kg ?? "—", unit: "kg" },
                  { label: bmiLabel ?? "BMI", value: bmi ?? "—" },
                ].map((s) => (
                  <div key={s.label}>
                    <dd className="text-lg font-semibold tabular-nums">
                      {s.value}
                      {s.unit && s.value !== "—" && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{s.unit}</span>}
                    </dd>
                    <dt className="mt-0.5 text-xs text-muted-foreground">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card className={cardCls}>
            <SectionHeader
              title="Daily goals"
              onEdit={editingGoals ? undefined : () => { setDraft(toDraft(profile)); setEditingGoals(true); }}
            />
            <CardContent>
              {editingGoals ? (
                <div className="space-y-5">
                  <Field label="Calories (kcal)" htmlFor="goal-calories">
                    <Input id="goal-calories" value={draft.calorieGoal} onChange={set("calorieGoal")} type="number" min="1000" max="5000" className="h-9" />
                    {recommended != null && (
                      <p className="text-sm text-muted-foreground">
                        {overridden ? "Worked out from your details: " : "Matches your details: "}
                        <span className="font-medium text-foreground">{recommended.toLocaleString()} kcal</span>
                        {overridden && (
                          <Button
                            variant="link"
                            onClick={() => setDraft((p) => ({ ...p, calorieGoal: String(recommended) }))}
                            className="ml-2 h-auto p-0"
                          >
                            Use this
                          </Button>
                        )}
                      </p>
                    )}
                  </Field>
                  <Field label="Water (glasses)" htmlFor="goal-water">
                    <Input id="goal-water" value={draft.waterGoal} onChange={set("waterGoal")} type="number" min="1" max="20" className="h-9" />
                  </Field>
                  <Field label="Sleep (hours)" htmlFor="goal-sleep">
                    <Input id="goal-sleep" value={draft.sleepGoal} onChange={set("sleepGoal")} type="number" min="4" max="12" step="0.5" className="h-9" />
                  </Field>
                  <Field label="Activity level" htmlFor="goal-activity">
                    <Select value={draft.activityLevel} onValueChange={setActivityLevel}>
                      <SelectTrigger id="goal-activity" className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_LEVELS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={saveGoals} className="h-9 flex-1">Save</Button>
                    <Button variant="outline" onClick={cancelGoals} className="h-9 flex-1">Cancel</Button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-4">
                  {goalRows.map(({ label, value, icon: Icon }) => (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1 text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: personal info + connected devices */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className={cardCls}>
            <SectionHeader
              title="Personal information"
              onEdit={editingInfo ? undefined : () => { setDraft(toDraft(profile)); setEditingInfo(true); }}
            />
            <CardContent>
              {editingInfo ? (
                <div className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="info-name">
                      <Input id="info-name" value={draft.name} onChange={set("name")} className="h-9" />
                    </Field>
                    <Field label="Email" htmlFor="info-email">
                      <Input id="info-email" value={email} disabled className="h-9" />
                    </Field>
                    <Field label="Date of birth" htmlFor="info-dob">
                      <Input id="info-dob" value={draft.dob} onChange={set("dob")} type="date" className="h-9" />
                    </Field>
                    <Field label="Sex (for calorie maths)" htmlFor="info-gender">
                      <Select value={draft.gender} onValueChange={(gender) => setDraft((p) => ({ ...p, gender }))}>
                        <SelectTrigger id="info-gender" className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Keeps an older saved value (e.g. "Non-binary") selectable rather than blanking it. */}
                          {(SEXES.includes(draft.gender) ? SEXES : [...SEXES, draft.gender]).map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Height (cm)" htmlFor="info-height">
                      <Input id="info-height" value={draft.height} onChange={set("height")} type="number" min="100" max="250" className="h-9" />
                    </Field>
                    <Field label="Weight (kg)" htmlFor="info-weight">
                      <Input id="info-weight" value={draft.weight} onChange={set("weight")} type="number" min="30" max="300" className="h-9" />
                    </Field>
                  </div>
                  {recommended != null && (
                    <p className="text-sm text-muted-foreground">
                      Saving will set your daily calorie target to{" "}
                      <span className="font-medium text-foreground">{recommended.toLocaleString()} kcal</span>, worked
                      out from these details and your goal. You can still change it under Daily goals.
                    </p>
                  )}
                  {infoError && <p className="text-sm text-destructive">{infoError}</p>}
                  <div className="flex gap-2">
                    <Button onClick={saveInfo} className="h-9 px-4">Save changes</Button>
                    <Button variant="outline" onClick={cancelInfo} className="h-9 px-4">Cancel</Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                  {infoRows.map(({ label, value }) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          <PreferencesCard profile={profile} onUpdateProfile={onUpdateProfile} />

          <DevicesCard outcome={deviceOutcome} onSynced={onDevicesSynced} />
        </div>
      </div>

      {/* Account */}
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Account</CardTitle>
          <CardDescription>Export or delete your data, or sign out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportData} disabled={accountBusy !== null} className="h-9 px-4">
              {accountBusy === "export" ? <Loader2 className="animate-spin" /> : <Download />}
              {accountBusy === "export" ? "Preparing export…" : "Export my data"}
            </Button>
            <Button variant="outline" onClick={onSignOut} className="h-9 px-4">
              <LogOut />
              Sign out
            </Button>
            {!deleteOpen && (
              <Button
                variant="destructive"
                onClick={() => { setDeleteOpen(true); setAccountError(null); }}
                className="h-9 px-4 sm:ml-auto"
              >
                Delete account
              </Button>
            )}
          </div>

          {deleteOpen && (
            <Alert variant="destructive" className="p-5">
              <AlertTitle>Permanently delete your account?</AlertTitle>
              <AlertDescription className="space-y-4">
                <p>
                  This deletes your profile, every habit you've logged, your food log, medications and saved foods,
                  your Community posts and comments, the recipes and photos you've shared, and your points. It can't be
                  undone. Export your data first if you want a copy.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm" className="text-foreground">
                    Type <span className="font-mono">DELETE</span> to confirm
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="delete-confirm"
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      autoComplete="off"
                      className="h-9 w-40 bg-background"
                    />
                    <Button
                      onClick={confirmDelete}
                      disabled={deleteText !== "DELETE" || accountBusy !== null}
                      className="h-9 bg-destructive px-4 text-white hover:bg-destructive/90"
                    >
                      {accountBusy === "delete" ? "Deleting…" : "Delete my account"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setDeleteOpen(false); setDeleteText(""); setAccountError(null); }}
                      disabled={accountBusy === "delete"}
                      className="h-9 px-4"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {accountError && <p className="text-sm text-destructive">{accountError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
