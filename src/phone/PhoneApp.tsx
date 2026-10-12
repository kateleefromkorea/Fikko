import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import SignInScreen from "@/auth/SignInScreen";
import SetNewPassword from "@/auth/SetNewPassword";
import RestoreAccount from "@/auth/RestoreAccount";
import SetupNeeded from "@/auth/SetupNeeded";
import { FoundingWelcome } from "@/components/FoundingMember";
import { MEALS, useDayCompleteCelebration, useToday, type HabitCardProps } from "@/components/HabitsView";
import type { DeviceOutcome } from "@/components/profile/DevicesCard";
import { useBiometrics } from "@/hooks/useBiometrics";
import { useFoodLog, type NewFood } from "@/hooks/useFoodLog";
import { useHabitData, type HabitUpdate } from "@/hooks/useHabitData";
import { useMedications } from "@/hooks/useMedications";
import { usePlan } from "@/hooks/usePlan";
import { useProfile } from "@/hooks/useProfile";
import { useConsents } from "@/hooks/useConsents";
import { CHECKINS_READ_EVENT, fetchUnreadCheckins, syncCheckinTimeZone } from "@/lib/coach";
import { hasRequiredConsent } from "@/lib/consent";
import { completion } from "@/lib/completion";
import { shiftDateKey } from "@/lib/dates";
import { dietsOf, tracksMacros } from "@/lib/preferences";
import { syncReminderTimeZone } from "@/lib/reminders";
import { isSupabaseConfigured } from "@/lib/supabase";
import { hasDraft } from "@/onboarding/draft";
import { trackView } from "@/lib/track";
import type { HabitData, MealKey } from "@/types";
import CaptureSheet from "@/phone/CaptureSheet";
import DayComplete from "@/phone/DayComplete";
import { haptics } from "@/phone/haptics";
import MealLogger from "@/phone/MealLogger";
import SearchScreen, { type Place } from "@/phone/SearchScreen";
import { setupSwipeToDismiss } from "@/phone/swipeToDismiss";
import TabBar, { type Tab } from "@/phone/TabBar";
import { ToastProvider, useToast } from "@/phone/Toast";
import TopBar from "@/phone/TopBar";
import CoachScreen, { type CoachPane } from "@/phone/screens/CoachScreen";
import TodayScreen from "@/phone/screens/TodayScreen";
import YouScreen, { type YouPage } from "@/phone/screens/YouScreen";
import "./phone.css";

const ProgressScreen = lazy(() => import("./screens/ProgressScreen"));
const MyFikkoView = lazy(() => import("@/components/MyFikkoView"));
const OnboardingModal = lazy(() => import("@/onboarding/OnboardingModal"));
const ConsentPrompt = lazy(() => import("@/components/ConsentPrompt"));

const loading = (what: string) => <p role="status" className="py-24 text-center text-sm text-muted-foreground">Loading {what}…</p>;

export interface PhoneAppProps {
  /** Prefix for page-view stats: "/app" in the iOS and Android apps, "/phone" on the website. */
  viewPrefix: string;
  /** Where the website lives, for the Help, Privacy and Terms links ("" on the website itself). */
  siteOrigin?: string;
  /** How connecting a wearable went, when returning from its sign-in. Opens Profile & settings. */
  deviceOutcome?: DeviceOutcome | null;
  /** Start on Profile & settings (links in Fikko's emails). */
  startOnSettings?: boolean;
  /** Shown at the top of Today, e.g. the website's "Install Fikko" card. */
  todayExtra?: ReactNode;
  /** Receives the app's "step back" function (true if it stepped back), for Android's back button. */
  onBackReady?: (back: () => boolean) => void;
}

/**
 * The phone experience: the iOS and Android apps, and the website on phones.
 * Four tabs (Today, Progress, Coach, You) with the capture button between them,
 * and a top bar with search. Logging is its main job, so it's one tap from
 * every screen. It uses the same data hooks, cards and pages as the website's
 * desktop layout and only owns the arrangement.
 */
export default function PhoneApp(props: PhoneAppProps) {
  // Phone styles (phone.css) apply only while this is on screen, and every
  // dialog becomes a sheet that can be swiped down.
  useEffect(() => {
    document.documentElement.classList.add("phone-ui");
    setupSwipeToDismiss();
    return () => document.documentElement.classList.remove("phone-ui");
  }, []);

  return (
    <ToastProvider>
      <PhoneShell {...props} />
    </ToastProvider>
  );
}

function PhoneShell({ viewPrefix, siteOrigin = "", deviceOutcome = null, startOnSettings = false, todayExtra, onBackReady }: PhoneAppProps) {
  const { session, loading: authLoading, signOut, recovering } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? null;
  // Unless the wearable sign-in was started from onboarding, which picks up where it left off.
  const [openSettings] = useState(() => (!!deviceOutcome && !hasDraft()) || startOnSettings);
  const [tab, setTab] = useState<Tab>(openSettings ? "you" : "today");
  const [youPage, setYouPage] = useState<YouPage | null>(openSettings ? "settings" : null);
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

  // Reminders and the coach's Monday check-ins go out at the member's local
  // hour, so follow them if they travel. A dot on Coach while a check-in is unread.
  useEffect(() => {
    if (!userId) return;
    void syncReminderTimeZone(userId);
    void syncCheckinTimeZone(userId);
  }, [userId]);
  const [unreadCheckins, setUnreadCheckins] = useState(0);
  useEffect(() => { if (userId && tab !== "coach") void fetchUnreadCheckins().then(setUnreadCheckins); }, [userId, tab]);
  useEffect(() => {
    const clear = () => setUnreadCheckins(0);
    window.addEventListener(CHECKINS_READ_EVENT, clear);
    return () => window.removeEventListener(CHECKINS_READ_EVENT, clear);
  }, []);

  // The day being logged, shared by Today, the capture sheet and search. When
  // the day rolls over, someone looking at "today" moves to the new today.
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
  const page = tab === "you" && youPage ? `${viewPrefix}/you/${youPage}` : `${viewPrefix}/${tab}`;
  useEffect(() => {
    if (!authLoading) trackView(signedIn ? page : `${viewPrefix}/sign-in`);
  }, [signedIn, authLoading, page, viewPrefix]);

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

  // Steps back inside the app (a page inside You, then to Today), for Android's back button.
  const back = useRef<() => boolean>(() => false);
  useEffect(() => {
    back.current = () => {
      if (tab === "you" && youPage) { setYouPage(null); return true; }
      if (tab !== "today") { setTab("today"); return true; }
      return false;
    };
  });
  useEffect(() => { onBackReady?.(() => back.current()); }, [onBackReady]);

  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (authLoading) return <div className="min-h-dvh bg-background" />;
  if (!session) return <SignInScreen />;
  if (recovering) return <SetNewPassword />;

  // An account waiting out its deletion grace period opens on the restore screen.
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
  // Same privacy consent gate as the desktop layout (see src/App.tsx).
  const needsConsent = !consent.loading && !hasRequiredConsent(consent.consents);
  const habitsReady = !habitsLoading && !habitsLoadError;
  const needsHabits = tab === "today" || tab === "progress" || tab === "garden";
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
    if (place === "garden") return open("garden");
    setTab("you");
    setYouPage(place);
    window.scrollTo({ top: 0 });
  };
  const askCoach = (question: string) => { setCoachDraft(question); setCoachPane("coach"); open("coach"); };
  const mealLabelFor = (meal: MealKey) => {
    const label = MEALS.find((m) => m.key === meal)!.label;
    if (activeDate === today) return label;
    if (activeDate === shiftDateKey(today, -1)) return `${label} yesterday`;
    return `${label} on ${new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}`;
  };

  return (
    <div data-page={tab} className="phone-app app-wash flex min-h-dvh flex-col">
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
        {needsHabits && habitsLoadError && (
          <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">{habitsLoadError}</p>
            <button onClick={() => reloadHabits()} className="h-11 rounded-full bg-button px-5 text-sm font-semibold text-white">Try again</button>
          </div>
        )}
        {needsHabits && habitsLoading && !habitsLoadError && loading("your habits")}

        {tab === "today" && habitsReady && (
          <>
            {todayExtra && <div className="mt-4 empty:hidden">{todayExtra}</div>}
            <TodayScreen
              {...cardProps}
              onQuick={quickLog}
              onDateChange={setActiveDate}
              profile={profile}
              foodLog={foodLog}
              onLogMeal={setMeal}
              hop={hop}
              onOpenGarden={() => open("garden")}
            />
          </>
        )}
        {tab === "progress" && habitsReady && (
          <Suspense fallback={loading("your progress")}>
            <ProgressScreen
              data={data}
              biometrics={biometrics}
              profile={profile}
              onAskCoach={askCoach}
              onOpenDevices={() => { setTab("you"); setYouPage("settings"); window.scrollTo({ top: 0 }); }}
            />
          </Suspense>
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
        {tab === "garden" && habitsReady && (
          <div className="screen-in pt-4">
            <Suspense fallback={loading("your garden")}>
              <MyFikkoView layout="garden" userId={session.user.id} data={data} profile={profile} onUpdateProfile={updateProfile} plan={seedPlan} onOpenHabits={() => open("today")} />
            </Suspense>
          </div>
        )}
        {tab === "you" && (
          <YouScreen
            page={youPage}
            onPage={(p) => { setYouPage(p); window.scrollTo({ top: 0 }); }}
            userId={session.user.id}
            email={email}
            profile={profile}
            onUpdateProfile={updateProfile}
            onSignOut={signOut}
            deviceOutcome={deviceOutcome}
            onDevicesSynced={() => void reloadBiometrics()}
            siteOrigin={siteOrigin}
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
            onAsk={askCoach}
            onGo={go}
            mealLabelFor={mealLabelFor}
          />
          <MealLogger meal={meal} onClose={() => setMeal(null)} date={activeDate} userId={userId} foodLog={foodLog} showMacros={cardProps.trackMacros} />
        </>
      )}

      {celebrating.show && <DayComplete data={data} profile={profile} onDone={celebrating.dismiss} />}

      {needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            profile={profile}
            userId={session.user.id}
            deviceOutcome={deviceOutcome}
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

      {!needsOnboarding && !needsConsent && !profileLoading && <FoundingWelcome userId={session.user.id} />}

      <TabBar
        tab={tab}
        onTab={open}
        coachDot={unreadCheckins > 0}
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
