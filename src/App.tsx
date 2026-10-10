import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useAiCredits } from "./hooks/useAiCredits";
import { ChartNoAxesColumn, Loader2, ChefHat, ListChecks, LogOut, Sparkles, Sprout, UserRound, Users, type LucideIcon } from "lucide-react";
import { completion } from "./lib/completion";
import ScrollToTop from "./components/ScrollToTop";
import InstallCard from "./components/InstallCard";
import { FoundingWelcome } from "./components/FoundingMember";
import { syncReminderTimeZone } from "./lib/reminders";
import type { DeviceOutcome } from "./components/profile/DevicesCard";
import { useAuth } from "./auth/AuthProvider";
import SignInScreen from "./auth/SignInScreen";
import SetNewPassword from "./auth/SetNewPassword";
import RestoreAccount from "./auth/RestoreAccount";
import SetupNeeded from "./auth/SetupNeeded";
import { isSupabaseConfigured } from "./lib/supabase";
import { useHabitData } from "./hooks/useHabitData";
import { useProfile } from "./hooks/useProfile";
import { useConsents } from "./hooks/useConsents";
import { hasRequiredConsent } from "./lib/consent";
import { useMedications } from "./hooks/useMedications";
import { useBiometrics } from "./hooks/useBiometrics";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { todayKey } from "./lib/dates";
import { dietsOf, tracksMacros } from "./lib/preferences";
import { hasDraft } from "./onboarding/draft";
import { trackView } from "./lib/track";
import { usePlan } from "./hooks/usePlan";

// Loaded on demand. The Dashboard carries the charting library (most of the
// app's JavaScript) and onboarding only runs once per user, so neither should
// slow down the first load of the Habits page.
// Signed-in pages load after sign-in, so the sign-in screen downloads less.
// The Habits page starts loading as soon as a session exists (see below).
const loadHabitsView = () => import("./components/HabitsView");
const HabitsView = lazy(loadHabitsView);
const CoachView = lazy(() => import("./components/CoachView"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const OnboardingModal = lazy(() => import("./onboarding/OnboardingModal"));
const ConsentPrompt = lazy(() => import("./components/ConsentPrompt"));
const CommunityView = lazy(() => import("./components/CommunityView"));
const MyFikkoView = lazy(() => import("./components/MyFikkoView"));
const RecipesView = lazy(() => import("./components/RecipesView"));
const ProfileView = lazy(() => import("./components/ProfileView"));
const AdminView = lazy(() => import("./admin/AdminView"));

// The admin site lives at /admin, outside the member app.
const isAdminPage = window.location.pathname.replace(/\/+$/, "") === "/admin";

type Tab = "habits" | "dashboard" | "fikko" | "recipes" | "community" | "coaches" | "profile";

// Community isn't a tab: it opens from the Habits page's preview card and the
// account menu.
// Shown as tabs in the header on tablet and desktop, and as a bottom tab bar
// on phones, where the labels don't fit across the top.
// `ai` marks a tab powered by AI: it shows a sparkle in front of its label.
const NAV: { id: Tab; label: string; icon: LucideIcon; soon?: boolean; ai?: boolean }[] = [
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "dashboard", label: "Dashboard", icon: ChartNoAxesColumn },
  { id: "fikko", label: "My Fikko", icon: Sprout },
  { id: "recipes", label: "Recipes", icon: ChefHat },
  { id: "coaches", label: "AI Coach", icon: Sparkles, ai: true },
];


export default function App() {
  const { session, loading, signOut, recovering } = useAuth();
  const credits = useAiCredits();
  const { seedPlan } = usePlan();
  const userId = session?.user.id ?? null;
  // Returning from a device's sign-in lands on /?device=<provider>&result=<outcome>:
  // open Profile to show how it went.
  const [deviceOutcome] = useState<DeviceOutcome | null>(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("result");
    const provider = q.get("device");
    if (result !== "connected" && result !== "declined" && result !== "failed") return null;
    return { provider: provider === "oura" || provider === "google" ? provider : null, result };
  });
  // Unless the sign-in was started from onboarding, which picks up where it left off.
  // Links in Fikko's emails open Profile with /?open=profile.
  const [openProfile] = useState(() => new URLSearchParams(window.location.search).get("open") === "profile");
  const [tab, setTab] = useState<Tab>((deviceOutcome && !hasDraft()) || openProfile ? "profile" : "habits");
  // A question from a Dashboard pattern, waiting in the coach's message box. Cleared once the coach is left.
  const [coachDraft, setCoachDraft] = useState("");
  useEffect(() => { if (tab !== "coaches") setCoachDraft(""); }, [tab]);
  useEffect(() => {
    if (deviceOutcome || openProfile) window.history.replaceState(null, "", window.location.pathname);
  }, [deviceOutcome, openProfile]);
  const { data: loggedData, setData, loading: habitsLoading, loadError: habitsLoadError, reload: reloadHabits, saveState, retrySave } = useHabitData(userId);
  const { profile, updateProfile, loading: profileLoading } = useProfile(userId);
  // Start fetching the Habits page the moment someone is signed in, in parallel with their data.
  useEffect(() => { if (userId) void loadHabitsView(); }, [userId]);
  // Reminders go out at the member's local hour, so follow them if they travel.
  useEffect(() => { if (userId) void syncReminderTimeZone(userId); }, [userId]);
  const consent = useConsents(userId);
  const medications = useMedications(userId);
  const { biometrics, reload: reloadBiometrics } = useBiometrics(userId);
  // Medications only counts towards the day for members who've listed some.
  // Wearable active minutes add to the workouts the member logs.
  const data = useMemo(
    () => ({
      ...loggedData,
      tracksMedications: medications.loading || medications.loadError ? undefined : medications.medications.length > 0,
      deviceExercise: biometrics.activeMinutes,
    }),
    [loggedData, medications.loading, medications.loadError, medications.medications.length, biometrics.activeMinutes],
  );

  // Anonymous page-view stats. Sign-in and each tab count as a page.
  const signedIn = !!session;
  useEffect(() => {
    if (!isAdminPage && !loading) trackView(signedIn ? `/${tab}` : "/sign-in");
  }, [signedIn, loading, tab]);

  if (!isSupabaseConfigured) {
    return <SetupNeeded />;
  }

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (recovering) {
    return <SetNewPassword />;
  }

  if (isAdminPage) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <AdminView />
      </Suspense>
    );
  }

  // An account waiting out its deletion grace period opens on the restore
  // screen instead of the app.
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
  // Members must agree to the current privacy notice: new ones inside
  // onboarding, everyone else (joined earlier, or the policy changed) here.
  const needsConsent = !consent.loading && !hasRequiredConsent(consent.consents);

  const { done, total } = completion(data, todayKey(), profile.water_goal);
  const pct = Math.round((done / total) * 100);

  return (
    <div data-page={tab} className="app-wash flex min-h-screen flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <button
            onClick={() => setTab("habits")}
            className="text-lg font-bold tracking-wide"
            aria-label="Fikko, go to today"
          >
            FIKKO
          </button>

          <nav aria-label="Main" className="hidden min-w-0 items-center gap-1 md:flex">
            {NAV.map(({ id, label, soon, ai }) => {
              const active = tab === id;
              return (
                <Button
                  key={id}
                  variant="ghost"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "h-9 px-3 font-medium text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground",
                    active && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground",
                  )}
                >
                  {ai && <Sparkles className={cn("size-4", !active && "text-primary-ink")} aria-hidden="true" />}
                  {label}
                  {ai && credits.left != null && (
                    <span
                      title={`${credits.left} of ${credits.limit} AI credits left ${credits.period === "week" ? "this week" : "today"}`}
                      aria-label={`${credits.left} AI credits left ${credits.period === "week" ? "this week" : "today"}`}
                      className={cn(
                        "ml-0.5 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
                        credits.left === 0
                          ? "bg-destructive/15 text-destructive"
                          : active ? "bg-white text-primary-ink" : "bg-primary/10 text-primary-ink",
                      )}
                    >
                      {credits.left}
                    </span>
                  )}
                  {soon && (
                    <Badge variant="outline" className="border-teal/40 bg-teal/5 text-primary-ink">
                      Soon
                    </Badge>
                  )}
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="relative grid place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`Account menu. ${done} of ${total} habits done today`}
                  title={`${done}/${total} habits done today`}
                >
                  <svg className="pointer-events-none absolute -inset-1 size-[calc(100%+0.5rem)] -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                    <circle cx="18" cy="18" r="16.5" fill="none" strokeWidth="2.5" className="stroke-foreground/10" />
                    <circle
                      cx="18" cy="18" r="16.5" fill="none" strokeWidth="2.5" strokeLinecap="round"
                      className="stroke-primary transition-[stroke-dashoffset] duration-500"
                      strokeDasharray={2 * Math.PI * 16.5}
                      strokeDashoffset={2 * Math.PI * 16.5 * (1 - pct / 100)}
                    />
                  </svg>
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
                  <DropdownMenuItem onSelect={() => setTab("community")}>
                    <Users />
                    Community
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
        {saveState === "error" && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>Your latest changes haven&apos;t saved yet. Check your connection; we&apos;ll keep trying.</span>
            <Button variant="outline" size="sm" onClick={retrySave} className="h-8">Try again now</Button>
          </div>
        )}
        {(tab === "habits" || tab === "dashboard" || tab === "fikko") && habitsLoadError && (
          <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">{habitsLoadError}</p>
            <Button onClick={() => reloadHabits()}>Try again</Button>
          </div>
        )}
        {(tab === "habits" || tab === "dashboard" || tab === "fikko") && habitsLoading && !habitsLoadError && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your habits…
          </div>
        )}
        {tab === "habits" && !habitsLoading && !habitsLoadError && (
          <>
          <div className="mb-6 empty:hidden"><InstallCard /></div>
          <Suspense fallback={<div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your habits…</div>}>
          <HabitsView
            data={data}
            onChange={setData}
            biometrics={biometrics}
            medications={medications}
            userId={userId}
            profileName={profile.name}
            goals={{ calories: profile.calorie_goal, water: profile.water_goal, sleepHours: profile.sleep_goal, weightKg: profile.weight_kg, goalKey: profile.primary_goal }}
            trackMacros={tracksMacros(profile.tracking_style)}
            onOpenCommunity={() => setTab("community")}
          />
          </Suspense>
          </>
        )}
        {tab === "dashboard" && !habitsLoading && !habitsLoadError && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading dashboard…</p>}>
            <Dashboard
              data={data}
              biometrics={biometrics}
              profile={profile}
              onAskCoach={(question) => { setCoachDraft(question); setTab("coaches"); }}
            />
          </Suspense>
        )}
        {tab === "fikko" && !habitsLoading && !habitsLoadError && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading My Fikko…</p>}>
            <MyFikkoView
              userId={session.user.id}
              data={data}
              profile={profile}
              onUpdateProfile={updateProfile}
              plan={seedPlan}
              onOpenHabits={() => setTab("habits")}
            />
          </Suspense>
        )}
        {tab === "recipes" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading recipes…</p>}>
            <RecipesView userId={session.user.id} profileName={profile.name} diets={dietsOf(profile)} allergies={profile.allergies ?? []} />
          </Suspense>
        )}
        {tab === "community" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading community…</p>}>
            <CommunityView userId={session.user.id} profileName={profile.name} />
          </Suspense>
        )}
        {tab === "coaches" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading coach…</p>}>
            <CoachView profileName={profile.name} initialDraft={coachDraft} />
          </Suspense>
        )}
        {tab === "profile" && (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading profile…</p>}>
          <ProfileView
            email={email}
            profile={profile}
            onUpdateProfile={updateProfile}
            userId={session.user.id}
            onSignOut={signOut}
            deviceOutcome={deviceOutcome}
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
            deviceOutcome={deviceOutcome}
            onAddMedication={(name) => medications.addMedication(name, "breakfast")}
            consent={needsConsent ? { region: consent.region, save: consent.save } : undefined}
            onComplete={async (patch) => {
              await updateProfile(patch);
              // Instant gratification: land on the dashboard, where the numbers
              // we just worked out are waiting at the top.
              setTab("dashboard");
            }}
          />
        </Suspense>
      )}

      {!needsOnboarding && needsConsent && !profileLoading && (
        <Suspense fallback={null}>
          <ConsentPrompt
            region={consent.region}
            aiGranted={!!consent.consents.ai_processing?.granted}
            onSave={consent.save}
          />
        </Suspense>
      )}

      {!needsOnboarding && !needsConsent && !profileLoading && <FoundingWelcome userId={session.user.id} />}

      <footer className="border-t">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span>Fikko · {new Date().getFullYear()} · Stay consistent, stay you.</span>
          <nav aria-label="Legal" className="flex gap-4">
            <a href="/help.html" className="hover:text-foreground">Help</a>
            <a href="/privacy.html" className="hover:text-foreground">Privacy</a>
            <a href="/terms.html" className="hover:text-foreground">Terms</a>
            <a href="/food-data-sources.html" className="hover:text-foreground">Food data</a>
            <a href="mailto:hello@fikko.io" className="hover:text-foreground">Contact</a>
          </nav>
        </div>
      </footer>

      <ScrollToTop />

      {/* Phone navigation. Sits above the home indicator on notched iPhones. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {NAV.map(({ id, label, icon: Icon, soon }) => {
            const active = tab === id;
            return (
              <li key={id}>
                <button
                  onClick={() => {
                    // Tapping the current tab again returns to its top, as in native apps.
                    if (active) window.scrollTo({ top: 0, behavior: "smooth" });
                    setTab(id);
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-label={soon ? `${label} (coming soon)` : label}
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors outline-none focus-visible:bg-muted",
                    active ? "text-primary-ink" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-12 place-items-center rounded-full transition-colors",
                      active && "bg-primary/10",
                    )}
                    aria-hidden="true"
                  >
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
