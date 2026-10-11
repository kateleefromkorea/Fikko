import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { useAuth } from "@/auth/AuthProvider";
import SignInScreen from "@/auth/SignInScreen";
import SetNewPassword from "@/auth/SetNewPassword";
import RestoreAccount from "@/auth/RestoreAccount";
import SetupNeeded from "@/auth/SetupNeeded";
import Celebration from "@/components/Celebration";
import { MEALS, useDayCompleteCelebration, useToday, type HabitCardProps } from "@/components/HabitsView";
import { useBiometrics } from "@/hooks/useBiometrics";
import { useFoodLog, type NewFood } from "@/hooks/useFoodLog";
import { useHabitData, type HabitUpdate } from "@/hooks/useHabitData";
import { useMedications } from "@/hooks/useMedications";
import { usePlan } from "@/hooks/usePlan";
import { useProfile } from "@/hooks/useProfile";
import { useConsents } from "@/hooks/useConsents";
import { hasRequiredConsent } from "@/lib/consent";
import { completion } from "@/lib/completion";
import { shiftDateKey } from "@/lib/dates";
import { dietsOf, tracksMacros } from "@/lib/preferences";
import { isSupabaseConfigured } from "@/lib/supabase";
import { trackView } from "@/lib/track";
import type { HabitData, MealKey } from "@/types";
import CaptureSheet from "@mobile/components/CaptureSheet";
import SearchScreen, { type Place } from "@mobile/components/SearchScreen";
import TopBar from "@mobile/components/TopBar";
import MealLogger from "@mobile/components/MealLogger";
import ScreenTitle from "@mobile/components/ScreenTitle";
import TabBar, { type Tab } from "@mobile/components/TabBar";
import { useToast } from "@mobile/components/Toast";
import { useAuthLinks } from "@mobile/lib/authLinks";
import { haptics } from "@mobile/lib/haptics";
import CoachScreen, { type CoachPane } from "@mobile/screens/CoachScreen";
import TodayScreen from "@mobile/screens/TodayScreen";
import YouScreen, { type YouPage } from "@mobile/screens/YouScreen";

const Dashboard = lazy(() => import("@/components/Dashboard"));
const OnboardingModal = lazy(() => import("@/onboarding/OnboardingModal"));
const ConsentPrompt = lazy(() => import("@/components/ConsentPrompt"));

const loading = (what: string) => <p role="status" className="py-24 text-center text-sm text-muted-foreground">Loading {what}…</p>;

/**
 * The iOS and Android app's shell. Four tabs (Today, Progress, Coach, You)
 * with the capture button between them: logging is the app's main job, so it
 * is one tap from every screen. It shares the web app's data hooks, cards and
 * screens, but owns its own layout, which lives here and in mobile/src.
 */
export default function MobileApp() {
  const { session, loading: authLoading, signOut, recovering } = useAuth();
  useAuthLinks();
  const toast = useToast();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<Tab>("today");
  const [youPage, setYouPage] = useState<YouPage | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [meal, setMeal] = useState<MealKey | null>(null);
  const [coachDraft, setCoachDraft] = useState("");
  const [coachPane, setCoachPane] = useState<CoachPane>("coach");
  const [searching, setSearching] = useState(false);
  // Bumped when a log finishes a habit, so the plant hops.
  const [hop, setHop] = useState(0);

  const { data: loggedData, setData, loading: habitsLoading, loadError: habitsLoadError, reload: reloadHabits, saveState, retrySave } = useHabitData(userId);
  const { profile, updateProfile, loading: profileLoading } = useProfile(userId);
  const { seedPlan } = usePlan();
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

  // The day being logged, shared by Today and the capture sheet. When the day
  // rolls over, someone looking at "today" moves to the new today.
  const today = useToday();
  const [activeDate, setActiveDate] = useState(today);
  const shownToday = useRef(today);
  useEffect(() => {
    if (shownToday.current === today) return;
    setActiveDate((d) => (d === shownToday.current ? today : d));
    shownToday.current = today;
  }, [today]);

  const memberActed = useRef(false);
  const onChange = (next: HabitUpdate) => { memberActed.current = true; setData(next); };
  const foodLog = useFoodLog(userId, activeDate, data, onChange);
  const celebrating = useDayCompleteCelebration(data, profile.water_goal, userId, memberActed);

  /** A one-tap log, answered with a toast; finishing a habit makes the plant hop. */
  const quickLog = (update: (d: HabitData) => HabitData, message: string) => {
    const before = completion(data, activeDate, profile.water_goal).done;
    const next = update(data);
    const after = completion(next, activeDate, profile.water_goal).done;
    onChange(next);
    toast(message, { grew: after > before });
    if (after > before) { setHop((h) => h + 1); haptics.success(); }
    else haptics.logged();
  };

  /** Food added from search: same answer as a one-tap log. */
  const addFood = (meal: MealKey, food: NewFood) => {
    const foodDone = completion(data, activeDate, profile.water_goal).core.find((c) => c.key === "food")?.done ?? true;
    void foodLog.addItem(meal, food);
    const label = MEALS.find((m) => m.key === meal)!.label.toLowerCase();
    toast(`${food.name} added to ${label}`, { grew: !foodDone });
    if (!foodDone) { setHop((h) => h + 1); haptics.success(); } else haptics.logged();
  };

  const signedIn = !!session;
  const page = tab === "you" && youPage ? `/app/you/${youPage}` : `/app/${tab}`;
  useEffect(() => {
    if (!authLoading) trackView(signedIn ? page : "/app/sign-in");
  }, [signedIn, authLoading, page]);

  const open = (next: Tab) => {
    // Tapping the current tab again returns to its top (and You to its first page), as in native apps.
    if (next === tab) {
      if (next === "you") setYouPage(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0 });
    }
    setTab(next);
  };

  // Android's back button steps back inside the app before leaving it.
  const back = useRef<() => boolean>(() => false);
  back.current = () => {
    if (tab === "you" && youPage) { setYouPage(null); return true; }
    if (tab !== "today") { setTab("today"); return true; }
    return false;
  };
  useEffect(() => {
    const listener = NativeApp.addListener("backButton", () => { if (!back.current()) void NativeApp.minimizeApp(); });
    return () => { void listener.then((l) => l.remove()); };
  }, []);

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
  const needsOnboarding = !profileLoading && !profile.onboarding_completed_at;
  // Same privacy consent gate as the website (see src/App.tsx).
  const needsConsent = !consent.loading && !hasRequiredConsent(consent.consents);
  const habitsReady = !habitsLoading && !habitsLoadError;
  const goals = { calories: profile.calorie_goal, water: profile.water_goal, sleepHours: profile.sleep_goal, weightKg: profile.weight_kg, goalKey: profile.primary_goal };
  const cardProps: HabitCardProps = {
    data, onChange, activeDate, biometrics, medications, userId, profileName: profile.name, goals, trackMacros: tracksMacros(profile.tracking_style),
  };
  // A page inside You brings its own top bar (with Back) in place of the app's.
  const ownTopBar = tab === "you" && youPage;
  const initials = (profile.name || email || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const go = (place: Place) => {
    if (place === "today" || place === "progress") return open(place);
    if (place === "coach" || place === "recipes") { setCoachPane(place); return open("coach"); }
    setTab("you");
    setYouPage(place);
    window.scrollTo({ top: 0 });
  };
  const mealLabelFor = (meal: MealKey) => {
    const label = MEALS.find((m) => m.key === meal)!.label;
    if (activeDate === today) return label;
    if (activeDate === shiftDateKey(today, -1)) return `${label} yesterday`;
    return `${label} on ${new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}`;
  };

  return (
    <div data-page={tab} className="mobile-app app-wash flex min-h-dvh flex-col">
      <main className="w-full flex-1 px-4 pb-[calc(var(--mobile-tabbar-h)+2rem)]">
        {!ownTopBar && (
          <TopBar
            initials={initials}
            profileActive={tab === "you"}
            onHome={() => open("today")}
            onSearch={() => {
              // Food found from another screen is logged for today.
              if (tab !== "today") setActiveDate(today);
              setSearching(true);
            }}
            onProfile={() => { setYouPage(null); open("you"); }}
          />
        )}
        {saveState === "error" && (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>Your latest changes haven&apos;t saved yet. We&apos;ll keep trying.</span>
            <button onClick={retrySave} className="h-9 font-semibold underline underline-offset-2">Try again</button>
          </div>
        )}
        {(tab === "today" || tab === "progress") && habitsLoadError && (
          <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">{habitsLoadError}</p>
            <button onClick={() => reloadHabits()} className="h-11 rounded-full bg-button px-5 text-sm font-semibold text-white">Try again</button>
          </div>
        )}
        {(tab === "today" || tab === "progress") && habitsLoading && !habitsLoadError && loading("your habits")}

        {tab === "today" && habitsReady && (
          <TodayScreen
            {...cardProps}
            onQuick={quickLog}
            onDateChange={setActiveDate}
            profile={profile}
            foodLog={foodLog}
            onLogMeal={setMeal}
            hop={hop}
            onOpenGarden={() => { setTab("you"); setYouPage("garden"); window.scrollTo({ top: 0 }); }}
          />
        )}
        {tab === "progress" && habitsReady && (
          <div className="screen-in">
            <ScreenTitle>Progress</ScreenTitle>
            <Suspense fallback={loading("your progress")}>
              <Dashboard
                data={data}
                biometrics={biometrics}
                profile={profile}
                onAskCoach={(question) => { setCoachDraft(question); setCoachPane("coach"); open("coach"); }}
              />
            </Suspense>
          </div>
        )}
        {tab === "coach" && (
          <CoachScreen
            view={coachPane}
            onView={setCoachPane}
            profileName={profile.name}
            draft={coachDraft}
            userId={session.user.id}
            diets={dietsOf(profile)}
            allergies={profile.allergies ?? []}
          />
        )}
        {tab === "you" && (
          <YouScreen
            page={youPage}
            onPage={(p) => { setYouPage(p); window.scrollTo({ top: 0 }); }}
            userId={session.user.id}
            email={email}
            data={data}
            profile={profile}
            plan={seedPlan}
            onUpdateProfile={updateProfile}
            onSignOut={signOut}
            onDevicesSynced={() => void reloadBiometrics()}
            onOpenToday={() => open("today")}
          />
        )}
      </main>

      {habitsReady && (
        <>
          <CaptureSheet
            open={capturing}
            onClose={() => setCapturing(false)}
            cardProps={cardProps}
            onQuick={quickLog}
            onLogMeal={setMeal}
            onVoiceSave={(next, foods) => {
              const before = completion(data, activeDate, profile.water_goal).done;
              if (foods.length) void foodLog.addEntries(foods, next);
              else onChange(next);
              const grew = completion(next, activeDate, profile.water_goal).done > before;
              toast("Check-in saved", { grew });
              if (grew) setHop((h) => h + 1);
              haptics.success();
            }}
          />
          <SearchScreen
            open={searching}
            onClose={() => setSearching(false)}
            onAddFood={addFood}
            onAsk={(question) => { setCoachDraft(question); setCoachPane("coach"); open("coach"); }}
            onGo={go}
            mealLabelFor={mealLabelFor}
          />
          <MealLogger meal={meal} onClose={() => setMeal(null)} date={activeDate} userId={userId} foodLog={foodLog} showMacros={cardProps.trackMacros} />
        </>
      )}

      {celebrating.show && <Celebration onDone={celebrating.dismiss} />}

      {needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            profile={profile}
            userId={session.user.id}
            deviceOutcome={null}
            onAddMedication={(name) => medications.addMedication(name, "breakfast")}
            onComplete={async (patch) => {
              await updateProfile(patch);
              open("today");
            }}
            consent={needsConsent ? { region: consent.region, save: consent.save } : undefined}
          />
        </Suspense>
      )}

      {!needsOnboarding && needsConsent && !profileLoading && (
        <Suspense fallback={null}>
          <ConsentPrompt region={consent.region} aiGranted={!!consent.consents.ai_processing?.granted} onSave={consent.save} />
        </Suspense>
      )}

      <TabBar
        tab={tab}
        onTab={open}
        onCapture={() => {
          // Logging from another screen logs for today.
          if (tab !== "today") setActiveDate(today);
          haptics.tap();
          setCapturing(true);
        }}
      />
    </div>
  );
}
