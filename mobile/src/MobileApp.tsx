import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { ChartNoAxesColumn, ChefHat, ListChecks, LogOut, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import SignInScreen from "@/auth/SignInScreen";
import SetNewPassword from "@/auth/SetNewPassword";
import RestoreAccount from "@/auth/RestoreAccount";
import SetupNeeded from "@/auth/SetupNeeded";
import CoachView from "@/components/CoachView";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBiometrics } from "@/hooks/useBiometrics";
import { useHabitData } from "@/hooks/useHabitData";
import { useMedications } from "@/hooks/useMedications";
import { useProfile } from "@/hooks/useProfile";
import { completion } from "@/lib/completion";
import { todayKey } from "@/lib/dates";
import { dietsOf, tracksMacros } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase";
import { trackView } from "@/lib/track";
import { cn } from "@/lib/utils";
import { useAuthLinks } from "@mobile/lib/authLinks";
import HabitsScreen from "@mobile/screens/HabitsScreen";

const Dashboard = lazy(() => import("@/components/Dashboard"));
const OnboardingModal = lazy(() => import("@/onboarding/OnboardingModal"));
const CommunityView = lazy(() => import("@/components/CommunityView"));
const RecipesView = lazy(() => import("@/components/RecipesView"));
const ProfileView = lazy(() => import("@/components/ProfileView"));

type Tab = "habits" | "dashboard" | "recipes" | "community" | "coaches" | "profile";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "dashboard", label: "Dashboard", icon: ChartNoAxesColumn },
  { id: "recipes", label: "Recipes", icon: ChefHat },
  { id: "community", label: "Community", icon: Users },
  { id: "coaches", label: "AI Coach", icon: Sparkles },
];

const loading = (what: string) => <p className="py-10 text-center text-sm text-muted-foreground">Loading {what}…</p>;

/**
 * The iOS and Android app's shell: a top bar under the status bar, the
 * current screen, and a tab bar above the home indicator. It shares the web
 * app's data hooks and screens but owns its own layout, so phone-only changes
 * live here and in mobile/src/screens.
 */
export default function MobileApp() {
  const { session, loading: authLoading, signOut, recovering } = useAuth();
  useAuthLinks();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<Tab>("habits");
  const { data: loggedData, setData } = useHabitData(userId);
  const { profile, updateProfile, loading: profileLoading } = useProfile(userId);
  const medications = useMedications(userId);
  const data = useMemo(
    () => ({ ...loggedData, tracksMedications: medications.loading ? undefined : medications.medications.length > 0 }),
    [loggedData, medications.loading, medications.medications.length],
  );
  const { biometrics, reload: reloadBiometrics } = useBiometrics(userId);

  const signedIn = !!session;
  useEffect(() => {
    if (!authLoading) trackView(signedIn ? `/app/${tab}` : "/app/sign-in");
  }, [signedIn, authLoading, tab]);

  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (authLoading) return <div className="min-h-dvh bg-background" />;
  if (!session) return <SignInScreen />;
  if (recovering) return <SetNewPassword />;

  if (!profileLoading && profile.deletion_scheduled_for) {
    return (
      <RestoreAccount
        userId={session.user.id}
        scheduledFor={profile.deletion_scheduled_for}
        onRestored={() => updateProfile({ deletion_scheduled_for: null })}
      />
    );
  }

  const email = session.user.email ?? "";
  const initials = (profile.name || email || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const needsOnboarding = !profileLoading && !profile.onboarding_completed_at;
  const { done, total } = completion(data, todayKey(), profile.water_goal);

  const open = (next: Tab) => {
    // Tapping the current tab again returns to its top, as in native apps.
    window.scrollTo({ top: 0, behavior: next === tab ? "smooth" : "auto" });
    setTab(next);
  };

  return (
    <div data-page={tab} className="mobile-app app-wash flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 h-(--mobile-header-h) border-b bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-4">
          <button onClick={() => open("habits")} className="text-lg font-bold tracking-wide" aria-label="Fikko, go to today">
            FIKKO
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums" aria-label={`${done} of ${total} habits done today`}>
              {done}/{total} today
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Account menu">
                  <Avatar>
                    <AvatarFallback
                      className={cn("text-xs font-medium", tab === "profile" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
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
                  <DropdownMenuItem onSelect={() => open("profile")}><UserRound />Profile</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => signOut()}><LogOut />Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className={cn("w-full flex-1 px-4 pb-8", tab !== "habits" && "pt-6")}>
        {tab === "habits" && (
          <HabitsScreen
            data={data}
            onChange={setData}
            biometrics={biometrics}
            medications={medications}
            userId={userId}
            profileName={profile.name}
            goals={{ calories: profile.calorie_goal, water: profile.water_goal, sleepHours: profile.sleep_goal }}
            trackMacros={tracksMacros(profile.tracking_style)}
            onOpenCommunity={() => open("community")}
          />
        )}
        {tab === "dashboard" && (
          <Suspense fallback={loading("dashboard")}>
            <Dashboard data={data} biometrics={biometrics} profile={profile} />
          </Suspense>
        )}
        {tab === "recipes" && (
          <Suspense fallback={loading("recipes")}>
            <RecipesView userId={session.user.id} profileName={profile.name} diets={dietsOf(profile)} allergies={profile.allergies ?? []} />
          </Suspense>
        )}
        {tab === "community" && (
          <Suspense fallback={loading("community")}>
            <CommunityView userId={session.user.id} profileName={profile.name} />
          </Suspense>
        )}
        {tab === "coaches" && <CoachView profileName={profile.name} />}
        {tab === "profile" && (
          <Suspense fallback={loading("profile")}>
            <ProfileView
              email={email}
              profile={profile}
              onUpdateProfile={updateProfile}
              userId={session.user.id}
              onSignOut={signOut}
              deviceOutcome={null}
              onDevicesSynced={() => void reloadBiometrics()}
            />
          </Suspense>
        )}
      </main>

      {needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            profile={profile}
            userId={session.user.id}
            deviceOutcome={null}
            onAddMedication={(name) => medications.addMedication(name, "breakfast")}
            onComplete={async (patch) => {
              await updateProfile(patch);
              open("dashboard");
            }}
          />
        </Suspense>
      )}

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="grid h-16 grid-cols-5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <li key={id}>
                <button
                  onClick={() => open(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors outline-none",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-primary/10")} aria-hidden="true">
                    <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
