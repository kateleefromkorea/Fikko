import { useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import PageHeader from "./PageHeader";
import { computeBaseline, LIMITS, inRange } from "../lib/metabolics";
import { DB_LIMITS, clamp } from "../lib/limits";
import { deleteAccount, exportAllData } from "../lib/account";

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
}

// Integrations Fikko plans to support. None can connect yet, so they are
// listed as "coming soon" rather than pretending to sync.
interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const ACTIVITY_LEVELS = ["Sedentary", "Lightly active", "Moderately active", "Very active", "Extra active"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const CONNECTORS: Connector[] = [
  { id: "apple-watch", name: "Apple Watch", description: "Sync heart rate, steps, workouts & sleep", icon: "⌚" },
  { id: "apple-health", name: "Apple Health", description: "Pull nutrition, body measurements & activity", icon: "🍎" },
  { id: "google-fit", name: "Google Fit", description: "Sync activity, heart points & workouts", icon: "🏃" },
  { id: "fitbit", name: "Fitbit", description: "Import steps, sleep stages & heart rate", icon: "📊" },
  { id: "garmin", name: "Garmin Connect", description: "Import GPS workouts, VO2 max & body battery", icon: "🛰️" },
  { id: "whoop", name: "WHOOP", description: "Sync recovery score, strain & sleep performance", icon: "💪" },
  { id: "oura", name: "Oura Ring", description: "Import readiness, sleep quality & activity", icon: "💍" },
  { id: "samsung", name: "Samsung Health", description: "Sync steps, workouts & sleep from Galaxy Watch", icon: "📱" },
];

function toDraft(profile: ProfileRow): Draft {
  return {
    name: profile.name,
    dob: profile.date_of_birth ?? "",
    gender: profile.gender ?? GENDERS[3],
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "rounded-xl border border-border px-4 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring transition-all";
const selectCls = `${inputCls} appearance-none cursor-pointer`;

export default function ProfileView({ email, profile, onUpdateProfile, userId, onSignOut }: Props) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [infoError, setInfoError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [accountBusy, setAccountBusy] = useState<"export" | "delete" | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
  const setActivityLevel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const activityLevel = e.target.value;
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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <PageHeader title="Profile" subtitle="Manage your personal details and connected devices" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: avatar card + daily goals */}
        <div className="flex flex-col gap-4">
          {/* Avatar */}
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-extrabold text-primary-foreground mb-4" style={{ background: "var(--primary)" }}>
              {initials || "?"}
            </div>
            <h3 className="text-xl font-extrabold text-foreground">{displayName}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
            {age !== null && <p className="text-xs text-muted-foreground mt-1">{age} years old{profile.gender ? ` · ${profile.gender}` : ""}</p>}

            <div className="w-full mt-5 pt-5 border-t border-border grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-extrabold text-foreground">{profile.height_cm ?? "—"}<span className="text-xs font-normal text-muted-foreground">cm</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Height</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-foreground">{profile.weight_kg ?? "—"}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Weight</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-foreground">{bmi ?? "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{bmiLabel ?? "BMI"}</p>
              </div>
            </div>
          </div>

          {/* Daily goals */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide">Daily Goals</h4>
              {!editingGoals && (
                <button
                  onClick={() => { setDraft(toDraft(profile)); setEditingGoals(true); }}
                  className="text-xs text-primary font-bold transition-all hover:opacity-70"
                >
                  Edit
                </button>
              )}
            </div>

            {editingGoals ? (
              <div className="space-y-3">
                <Field label="Calories (kcal)">
                  <input value={draft.calorieGoal} onChange={set("calorieGoal")} type="number" min="1000" max="5000" className={inputCls} />
                  {recommended != null && (
                    <p className="text-xs text-muted-foreground">
                      {overridden ? "Worked out from your details: " : "Matches your details: "}
                      <span className="font-bold text-foreground">{recommended.toLocaleString()} kcal</span>
                      {overridden && (
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, calorieGoal: String(recommended) }))}
                          className="ml-2 text-primary font-bold hover:opacity-70 transition-all"
                        >
                          Use this
                        </button>
                      )}
                    </p>
                  )}
                </Field>
                <Field label="Water (glasses)">
                  <input value={draft.waterGoal} onChange={set("waterGoal")} type="number" min="1" max="20" className={inputCls} />
                </Field>
                <Field label="Sleep (hours)">
                  <input value={draft.sleepGoal} onChange={set("sleepGoal")} type="number" min="4" max="12" step="0.5" className={inputCls} />
                </Field>
                <Field label="Activity level">
                  <select value={draft.activityLevel} onChange={setActivityLevel} className={selectCls}>
                    {ACTIVITY_LEVELS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </Field>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveGoals} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">Save</button>
                  <button onClick={cancelGoals} className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-80 transition-all">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Calories", value: `${Math.round(profile.calorie_goal).toLocaleString()} kcal`, icon: "🍽️" },
                  { label: "Water", value: `${profile.water_goal} glasses`, icon: "💧" },
                  { label: "Sleep", value: `${profile.sleep_goal} hours`, icon: "🌙" },
                  { label: "Activity", value: profile.activity_level ?? "Not set", icon: "🏃" },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-base">{icon}</span>
                    <span className="text-sm text-muted-foreground flex-1">{label}</span>
                    <span className="text-sm font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: personal info + connected devices */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          {/* Personal info */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h4 className="font-bold text-foreground text-sm uppercase tracking-wide">Personal Information</h4>
              {!editingInfo && (
                <button
                  onClick={() => { setDraft(toDraft(profile)); setEditingInfo(true); }}
                  className="text-xs text-primary font-bold transition-all hover:opacity-70"
                >
                  Edit
                </button>
              )}
            </div>

            {editingInfo ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full name">
                    <input value={draft.name} onChange={set("name")} className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input value={email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
                  </Field>
                  <Field label="Date of birth">
                    <input value={draft.dob} onChange={set("dob")} type="date" className={inputCls} />
                  </Field>
                  <Field label="Gender">
                    <select value={draft.gender} onChange={set("gender")} className={selectCls}>
                      {GENDERS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Height (cm)">
                    <input value={draft.height} onChange={set("height")} type="number" min="100" max="250" className={inputCls} />
                  </Field>
                  <Field label="Weight (kg)">
                    <input value={draft.weight} onChange={set("weight")} type="number" min="30" max="300" className={inputCls} />
                  </Field>
                </div>
                {recommended != null && (
                  <p className="text-xs text-muted-foreground mt-4">
                    Saving will set your daily calorie target to{" "}
                    <span className="font-bold text-foreground">{recommended.toLocaleString()} kcal</span>, worked
                    out from these details and your goal. You can still change it under Daily Goals.
                  </p>
                )}
                {infoError && <p className="text-xs font-semibold mt-4" style={{ color: "#D93636" }}>{infoError}</p>}
                <div className="flex gap-3 mt-5 pt-5 border-t border-border">
                  <button onClick={saveInfo} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">Save changes</button>
                  <button onClick={cancelInfo} className="px-6 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-80 transition-all">Cancel</button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-6">
                {[
                  { label: "Full name", value: profile.name || "—" },
                  { label: "Email", value: email },
                  { label: "Date of birth", value: profile.date_of_birth ? new Date(profile.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
                  { label: "Gender", value: profile.gender ?? "—" },
                  { label: "Height", value: profile.height_cm ? `${profile.height_cm} cm` : "—" },
                  { label: "Weight", value: profile.weight_kg ? `${profile.weight_kg} kg` : "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-sm font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connected devices */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-foreground text-sm uppercase tracking-wide">Connected Devices</h4>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-secondary text-secondary-foreground">Coming soon</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Wearable sync isn't available yet. These are the integrations we're planning.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CONNECTORS.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-secondary">
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-bold text-foreground truncate">{c.name}</h5>
                    <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                  </div>
                  <span className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-muted-foreground">Soon</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h4 className="font-bold text-foreground mb-1 text-sm uppercase tracking-wide">Account</h4>
        <p className="text-xs text-muted-foreground mb-4">Manage your account data and preferences</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportData}
            disabled={accountBusy !== null}
            className="px-4 py-2.5 rounded-xl border border-border text-sm text-secondary-foreground font-semibold hover:bg-secondary transition-all disabled:opacity-60"
          >
            {accountBusy === "export" ? "Preparing export…" : "Export my data"}
          </button>
          <button onClick={onSignOut} className="px-4 py-2.5 rounded-xl border border-border text-sm text-secondary-foreground font-semibold hover:bg-secondary transition-all">Sign out</button>
          {!deleteOpen && (
            <button
              onClick={() => { setDeleteOpen(true); setAccountError(null); }}
              className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ml-auto"
              style={{ borderColor: "#FFB3C1", color: "#D93636", background: "rgba(255,117,117,0.05)" }}
            >
              Delete account
            </button>
          )}
        </div>

        {deleteOpen && (
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "#FFB3C1", background: "rgba(255,117,117,0.05)" }}>
            <p className="text-sm font-bold" style={{ color: "#B42323" }}>Permanently delete your account?</p>
            <p className="text-xs text-muted-foreground mt-1">
              This deletes your profile, every habit you've logged, your food log, medications and saved foods. It can't be
              undone. Export your data first if you want a copy.
            </p>
            <label className="block text-xs font-semibold text-foreground mt-3 mb-1.5" htmlFor="delete-confirm">
              Type <span className="font-mono">DELETE</span> to confirm
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="delete-confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                autoComplete="off"
                className={`${inputCls} w-40`}
              />
              <button
                onClick={confirmDelete}
                disabled={deleteText !== "DELETE" || accountBusy !== null}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{ background: "#D93636" }}
              >
                {accountBusy === "delete" ? "Deleting…" : "Delete my account"}
              </button>
              <button
                onClick={() => { setDeleteOpen(false); setDeleteText(""); setAccountError(null); }}
                disabled={accountBusy === "delete"}
                className="px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-80 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {accountError && <p className="text-xs font-semibold mt-3" style={{ color: "#D93636" }}>{accountError}</p>}
      </div>
    </div>
  );
}
