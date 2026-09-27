import { useState } from "react";
import { defaultBiometrics } from "./data";
import type { HabitData } from "./types";
import Dashboard from "./components/Dashboard";
import HabitsView from "./components/HabitsView";
import ProfileView from "./components/ProfileView";
import CoachView from "./components/CoachView";
import { useAuth } from "./auth/AuthProvider";
import SignInScreen from "./auth/SignInScreen";
import SetupNeeded from "./auth/SetupNeeded";
import { isSupabaseConfigured } from "./lib/supabase";
import { useHabitData } from "./hooks/useHabitData";
import { useProfile } from "./hooks/useProfile";
import { useMedications } from "./hooks/useMedications";
import OnboardingModal from "./onboarding/OnboardingModal";

type Tab = "habits" | "dashboard" | "coaches" | "profile";

const TODAY = new Date().toISOString().split("T")[0];

function completedToday(data: HabitData): number {
  let count = 0;
  if ((data.water.find((e) => e.date === TODAY)?.value ?? 0) >= 8) count++;
  if (data.medication.find((e) => e.date === TODAY)?.value === 1) count++;
  if ((data.food.find((e) => e.date === TODAY)?.value ?? 0) > 0) count++;
  if ((data.exercise.find((e) => e.date === TODAY)?.value ?? 0) >= 30) count++;
  if ((data.sleep.find((e) => e.date === TODAY)?.value ?? 0) >= 3) count++;
  if ((data.mood.find((e) => e.date === TODAY)?.value ?? 0) > 0) count++;
  return count;
}

export default function App() {
  const { session, loading, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<Tab>("habits");
  const { data, setData } = useHabitData(userId);
  const { profile, updateProfile, loading: profileLoading } = useProfile(userId);
  const medications = useMedications(userId);
  const biometrics = defaultBiometrics;

  if (!isSupabaseConfigured) {
    return <SetupNeeded />;
  }

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  const initials = (profile.name || session.user.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The wizard is the gate: it stays up until the profile carries a
  // completion timestamp. Held back while the profile loads so a returning
  // user never sees it flash.
  const needsOnboarding = !profileLoading && !profile.onboarding_completed_at;

  const done = completedToday(data);
  const total = 6 + data.custom.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="min-h-screen app-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="w-full px-3 sm:px-6 flex items-center gap-2 sm:gap-3 h-16">

          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <span className="text-xl font-bold tracking-wide text-foreground" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              FIKKO
            </span>
          </div>

          {/* Progress pill */}
          <div className="hidden md:flex items-center gap-2 ml-3 px-3 py-1.5 rounded-full bg-muted border border-border flex-shrink-0">
            <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-semibold">{done}/{total} today</span>
          </div>

          {/* Nav + profile */}
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto min-w-0">
            {([
              { id: "habits", label: "Habits" },
              { id: "dashboard", label: "Dashboard" },
              { id: "coaches", label: "Coach" },
            ] as { id: Tab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 whitespace-nowrap"
                style={tab === id ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}
              >
                {label}
                {id === "coaches" && (
                  <span className="hidden sm:inline text-xs font-bold px-1.5 py-0.5 rounded-md" style={tab === id ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                    Beta
                  </span>
                )}
              </button>
            ))}

            {/* Profile avatar — far right */}
            <button
              onClick={() => setTab("profile")}
              className="ml-1 sm:ml-2 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all flex-shrink-0"
              style={tab === "profile"
                ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }
                : { background: "var(--secondary)", color: "var(--secondary-foreground)", borderColor: "transparent" }}
              title="Profile"
            >
              {initials}
            </button>

            <button
              onClick={() => signOut()}
              className="ml-1 px-2 sm:px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground flex-shrink-0 whitespace-nowrap"
              title="Sign out"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 py-8">
        {tab === "habits" && (
          <HabitsView
            data={data}
            onChange={setData}
            biometrics={biometrics}
            medications={medications}
            userId={userId}
            profileName={profile.name}
            done={done}
            total={total}
          />
        )}
        {tab === "dashboard" && <Dashboard data={data} biometrics={biometrics} profile={profile} />}
        {tab === "coaches" && <CoachView />}
        {tab === "profile" && (
          <ProfileView
            email={session.user.email ?? ""}
            profile={profile}
            onUpdateProfile={updateProfile}
            habitData={data}
            onSignOut={signOut}
          />
        )}
      </main>

      {needsOnboarding && (
        <OnboardingModal
          profile={profile}
          onComplete={async (patch) => {
            await updateProfile(patch);
            // Instant gratification: land on the dashboard, where the numbers
            // we just worked out are waiting at the top.
            setTab("dashboard");
          }}
        />
      )}

      <footer className="border-t border-white/20 text-center py-6 text-xs text-white/70 px-4 sm:px-6">
        Fikko · {new Date().getFullYear()} · Stay consistent, stay you.
      </footer>
    </div>
  );
}
