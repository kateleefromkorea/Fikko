import { useState } from "react";
import type { ProfileRow } from "../hooks/useProfile";
import type { HabitData } from "../types";
import PageHeader from "./PageHeader";
import { computeBaseline } from "../lib/metabolics";

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
  habitData: HabitData;
  onSignOut: () => void;
}

interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  lastSync?: string;
}

const ACTIVITY_LEVELS = ["Sedentary", "Lightly active", "Moderately active", "Very active", "Extra active"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const INITIAL_CONNECTORS: Connector[] = [
  { id: "apple-watch", name: "Apple Watch", description: "Sync heart rate, steps, workouts & sleep", icon: "⌚", connected: true, lastSync: "demo data" },
  { id: "apple-health", name: "Apple Health", description: "Pull nutrition, body measurements & activity", icon: "🍎", connected: true, lastSync: "demo data" },
  { id: "google-fit", name: "Google Fit", description: "Sync activity, heart points & workouts", icon: "🏃", connected: false },
  { id: "fitbit", name: "Fitbit", description: "Import steps, sleep stages & heart rate", icon: "📊", connected: false },
  { id: "garmin", name: "Garmin Connect", description: "Import GPS workouts, VO2 max & body battery", icon: "🛰️", connected: false },
  { id: "whoop", name: "WHOOP", description: "Sync recovery score, strain & sleep performance", icon: "💪", connected: false },
  { id: "oura", name: "Oura Ring", description: "Import readiness, sleep quality & activity", icon: "💍", connected: false },
  { id: "samsung", name: "Samsung Health", description: "Sync steps, workouts & sleep from Galaxy Watch", icon: "📱", connected: false },
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

export default function ProfileView({ email, profile, onUpdateProfile, habitData, onSignOut }: Props) {
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(profile));
  const [syncing, setSyncing] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((p) => ({ ...p, [k]: e.target.value }));

  const saveInfo = () => {
    const patch: Partial<ProfileRow> = {
      name: draft.name,
      date_of_birth: draft.dob || null,
      gender: draft.gender,
      height_cm: draft.height ? parseFloat(draft.height) : null,
      weight_kg: draft.weight ? parseFloat(draft.weight) : null,
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
      calorie_goal: parseFloat(draft.calorieGoal) || baseline?.calorieTarget || 2000,
      water_goal: parseFloat(draft.waterGoal) || 8,
      sleep_goal: parseFloat(draft.sleepGoal) || 8,
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
  const cancelInfo = () => { setDraft(toDraft(profile)); setEditingInfo(false); };
  const cancelGoals = () => { setDraft(toDraft(profile)); setEditingGoals(false); };

  const toggleConnector = (id: string) => {
    setSyncing(id);
    setTimeout(() => {
      setConnectors((prev) =>
        prev.map((c) =>
          c.id === id
            ? c.connected
              ? { ...c, connected: false, lastSync: undefined }
              : { ...c, connected: true, lastSync: "demo data" }
            : c
        )
      );
      setSyncing(null);
    }, 1200);
  };

  const exportData = () => {
    const payload = { profile, habitData, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fikko-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestDeleteAccount = () => {
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }
    setDeleteConfirming(false);
    alert(
      "Account deletion isn't wired up yet — it needs a server-side step (the Vercel deploy phase) so it can run with elevated permissions safely. For now, use Sign out, and reach out if you want your data removed manually.",
    );
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

  const connectedCount = connectors.filter((c) => c.connected).length;
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
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-foreground text-sm uppercase tracking-wide">Connected Devices</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-secondary text-secondary-foreground">Demo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{connectedCount} of {connectors.length} connected · sample data, not a real sync yet</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {connectors.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border p-4 flex items-center gap-4 transition-all"
                  style={c.connected ? { borderColor: "var(--primary)", background: "var(--muted)" } : { borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: c.connected ? "rgba(30,64,175,0.12)" : "var(--secondary)" }}>
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-bold text-foreground truncate">{c.name}</h5>
                      {c.connected && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--teal)" }} />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.lastSync ? `Synced ${c.lastSync}` : c.description}</p>
                  </div>
                  <button
                    onClick={() => toggleConnector(c.id)}
                    disabled={syncing === c.id}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    style={
                      syncing === c.id
                        ? { background: "var(--secondary)", color: "var(--muted-foreground)" }
                        : c.connected
                        ? { background: "var(--secondary)", color: "var(--secondary-foreground)" }
                        : { background: "var(--primary)", color: "var(--primary-foreground)" }
                    }
                  >
                    {syncing === c.id ? "…" : c.connected ? "Disconnect" : "Connect"}
                  </button>
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
          <button onClick={exportData} className="px-4 py-2.5 rounded-xl border border-border text-sm text-secondary-foreground font-semibold hover:bg-secondary transition-all">Export my data</button>
          <button onClick={onSignOut} className="px-4 py-2.5 rounded-xl border border-border text-sm text-secondary-foreground font-semibold hover:bg-secondary transition-all">Sign out</button>
          <button
            onClick={requestDeleteAccount}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ml-auto"
            style={{ borderColor: "#FFB3C1", color: "#FF7575", background: "rgba(255,117,117,0.05)" }}
          >
            {deleteConfirming ? "Click again to confirm" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
