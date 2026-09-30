import { Suspense, lazy, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { EMPTY_BIOMETRICS } from "./types";
import { completion } from "./lib/completion";
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
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Loaded on demand. The Dashboard carries the charting library (most of the
// app's JavaScript) and onboarding only runs once per user, so neither should
// slow down the first load of the Habits page.
const Dashboard = lazy(() => import("./components/Dashboard"));
const OnboardingModal = lazy(() => import("./onboarding/OnboardingModal"));
const CommunityView = lazy(() => import("./components/CommunityView"));

type Tab = "habits" | "dashboard" | "community" | "coaches" | "profile";

const NAV: { id: Tab; label: string; beta?: boolean }[] = [
  { id: "habits", label: "Habits" },
  { id: "dashboard", label: "Dashboard" },
  { id: "community", label: "Community" },
  { id: "coaches", label: "Coach", beta: true },
];

const TODAY = new Date().toISOString().split("T")[0];

export default function App() {
  const { session, loading, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<Tab>("habits");
  const { data, setData } = useHabitData(userId);
  const { profile, updateProfile, loading: profileLoading } = useProfile(userId);
  const medications = useMedications(userId);
  const biometrics = EMPTY_BIOMETRICS;

  if (!isSupabaseConfigured) {
    return <SetupNeeded />;
  }

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  const email = session.user.email ?? "";
  const initials = (profile.name || email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The wizard is the gate: it stays up until the profile carries a
  // completion timestamp. Held back while the profile loads so a returning
  // user never sees it flash.
  const needsOnboarding = !profileLoading && !profile.onboarding_completed_at;

  const { done, total } = completion(data, TODAY);
  const pct = Math.round((done / total) * 100);

  return (
    <div className="app-wash flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <button
            onClick={() => setTab("habits")}
            className="text-lg font-bold tracking-wide"
            aria-label="Fikko, go to today"
          >
            FIKKO
          </button>

          <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1">
            {NAV.map(({ id, label, beta }) => (
              <Button
                key={id}
                variant="ghost"
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "h-9 px-2 text-muted-foreground sm:px-3",
                  tab === id && "bg-primary/8 text-primary hover:bg-primary/10 hover:text-primary",
                )}
              >
                {label}
                {beta && (
                  <Badge variant="outline" className="hidden border-teal/40 bg-teal/5 text-primary sm:inline-flex">
                    Beta
                  </Badge>
                )}
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden items-center gap-3 md:flex" aria-label={`${done} of ${total} habits done today`}>
              <Progress value={pct} className="h-1.5 w-24" />
              <span className="text-sm text-muted-foreground tabular-nums">
                {done}/{total} today
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="Account menu"
                >
                  <Avatar size="lg">
                    <AvatarFallback
                      className={cn(
                        "text-sm font-medium",
                        tab === "profile" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{profile.name || "Your account"}</p>
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => setTab("profile")}>
                    <UserRound />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => signOut()}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        {tab === "habits" && (
          <HabitsView
            data={data}
            onChange={setData}
            biometrics={biometrics}
            medications={medications}
            userId={userId}
            profileName={profile.name}
            onOpenCommunity={() => setTab("community")}
          />
        )}
        {tab === "dashboard" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading dashboard…</p>}>
            <Dashboard data={data} biometrics={biometrics} profile={profile} />
          </Suspense>
        )}
        {tab === "community" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading community…</p>}>
            <CommunityView userId={session.user.id} profileName={profile.name} />
          </Suspense>
        )}
        {tab === "coaches" && <CoachView />}
        {tab === "profile" && (
          <ProfileView
            email={email}
            profile={profile}
            onUpdateProfile={updateProfile}
            userId={session.user.id}
            onSignOut={signOut}
          />
        )}
      </main>

      {needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            profile={profile}
            onComplete={async (patch) => {
              await updateProfile(patch);
              // Instant gratification: land on the dashboard, where the numbers
              // we just worked out are waiting at the top.
              setTab("dashboard");
            }}
          />
        </Suspense>
      )}

      <footer className="border-t">
        <div className="mx-auto max-w-screen-2xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
          Fikko · {new Date().getFullYear()} · Stay consistent, stay you.
        </div>
      </footer>
    </div>
  );
}
