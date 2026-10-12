import React, { Suspense, lazy, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { MEALS, type HabitCardProps } from "@/components/HabitsView";
import { AuthProvider } from "@/auth/AuthProvider";
import { PlanProvider, usePlan } from "@/hooks/usePlan";
import { useFoodLog } from "@/hooks/useFoodLog";
import type { HabitUpdate } from "@/hooks/useHabitData";
import { useProfile, type ProfileRow } from "@/hooks/useProfile";
import { completion } from "@/lib/completion";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { EMPTY_BIOMETRICS, type HabitData, type MealKey } from "@/types";
import CaptureSheet from "@/phone/CaptureSheet";
import SearchScreen from "@/phone/SearchScreen";
import TopBar from "@/phone/TopBar";
import MealLogger from "@/phone/MealLogger";
import ScreenTitle from "@/phone/ScreenTitle";
import TabBar, { type Tab } from "@/phone/TabBar";
import { ToastProvider, useToast } from "@/phone/Toast";
import CoachScreen, { type CoachPane } from "@/phone/screens/CoachScreen";
import TodayScreen from "@/phone/screens/TodayScreen";
import YouScreen, { type YouPage } from "@/phone/screens/YouScreen";
import { setupSwipeToDismiss } from "@/phone/swipeToDismiss";
import "../mobile.css";
import "@/phone/phone.css";

setupSwipeToDismiss();
document.documentElement.classList.add("phone-ui");

const Dashboard = lazy(() => import("@/components/Dashboard"));
const MyFikkoView = lazy(() => import("@/components/MyFikkoView"));

/**
 * Dev-only preview of the mobile app's screens with sample data and no
 * sign-in, for checking layouts at phone size (http://localhost:5188/preview.html).
 * Changes stay in memory. Add ?empty for a fresh day with nothing logged.
 */
const today = todayKey();
const empty = new URLSearchParams(location.search).has("empty");
const past = (n: number) => shiftDateKey(today, -n);

function sampleData(): HabitData {
  const days = Array.from({ length: 14 }, (_, i) => past(i + 1));
  return {
    water: [...days.map((date) => ({ date, value: 8 })), ...(empty ? [] : [{ date: today, value: 3 }])],
    food: days.map((date) => ({ date, value: 1800 })),
    exercise: days.map((date) => ({ date, value: 35 })),
    sleep: [...days.map((date) => ({ date, value: 4 })), ...(empty ? [] : [{ date: today, value: 4 }])],
    mood: days.map((date) => ({ date, value: 4, note: "good" })),
    medication: days.map((date) => ({ date, value: 1, note: JSON.stringify({ m1: true, m2: true }) })),
    custom: [{ id: "c1", name: "Read", unit: "pages", target: 10, color: "", icon: "book", entries: days.map((date) => ({ date, value: 10 })) }],
  };
}

const MEDS = [
  { id: "m1", name: "Vitamin D", time_of_day: "breakfast" as const },
  { id: "m2", name: "Omega-3", time_of_day: "breakfast" as const },
];

function Preview() {
  const toast = useToast();
  const { seedPlan } = usePlan();
  const base = useProfile(null).profile;
  const [profile, setProfile] = useState<ProfileRow>(() => ({
    ...base, name: "Kate Lee", calorie_goal: 1900, water_goal: 8, sleep_goal: 8,
    fikko_seed: "sprout", fikko_planted_on: past(14), onboarding_completed_at: past(14),
  }));
  const [logged, setLogged] = useState(sampleData);
  const [tab, setTab] = useState<Tab>("today");
  const [youPage, setYouPage] = useState<YouPage | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [meal, setMeal] = useState<MealKey | null>(null);
  const [activeDate, setActiveDate] = useState(today);
  const [hop, setHop] = useState(0);
  const [coachPane, setCoachPane] = useState<CoachPane>("coach");
  const [coachDraft, setCoachDraft] = useState("");
  const [searching, setSearching] = useState(false);

  const data = useMemo(() => ({ ...logged, tracksMedications: true, deviceExercise: [] }), [logged]);
  const onChange = (u: HabitUpdate) => setLogged((prev) => (typeof u === "function" ? u(prev) : u));
  const foodLog = useFoodLog(null, activeDate, data, onChange);
  const medications = {
    medications: MEDS, past: [], addMedication: () => null, removeMedication: () => {}, updateTimeOfDay: () => {},
    loading: false, loadError: null, error: null, clearError: () => {},
  } as unknown as HabitCardProps["medications"];
  const goals = { calories: profile.calorie_goal, water: profile.water_goal, sleepHours: profile.sleep_goal, weightKg: 62, goalKey: null };
  const cardProps: HabitCardProps = {
    data, onChange, activeDate, biometrics: EMPTY_BIOMETRICS, medications, userId: null, profileName: profile.name, goals, trackMacros: false,
  };
  const quickLog = (update: (d: HabitData) => HabitData, message: string) => {
    const before = completion(data, activeDate, goals.water).done;
    const next = update(data);
    const grew = completion(next, activeDate, goals.water).done > before;
    onChange(next);
    toast(message, { grew });
    if (grew) setHop((h) => h + 1);
  };

  return (
    <div className="phone-app app-wash flex min-h-dvh flex-col">
      <main className="w-full flex-1 px-4 pb-[calc(var(--mobile-tabbar-h)+2rem)]">
        {!(tab === "you" && youPage) && (
          <TopBar initials="KL" profileActive={tab === "you"} onHome={() => setTab("today")} onSearch={() => setSearching(true)}
            onProfile={() => { setYouPage(null); setTab("you"); }} />
        )}
        {tab === "today" && (
          <TodayScreen {...cardProps} onQuick={quickLog} onDateChange={setActiveDate} profile={profile} foodLog={foodLog}
            onLogMeal={setMeal} hop={hop} onOpenGarden={() => setTab("garden")} />
        )}
        {tab === "progress" && (
          <div className="screen-in">
            <ScreenTitle>Progress</ScreenTitle>
            <Suspense fallback={null}><Dashboard data={data} biometrics={EMPTY_BIOMETRICS} profile={profile} /></Suspense>
          </div>
        )}
        {tab === "coach" && <CoachScreen view={coachPane} onView={setCoachPane} profileName={profile.name} draft={coachDraft} userId="preview" diets={[]} allergies={[]} />}
        {tab === "garden" && (
          <div className="screen-in pt-4">
            <Suspense fallback={null}>
              <MyFikkoView userId="preview" data={data} profile={profile} plan={seedPlan}
                onUpdateProfile={async (p) => setProfile((x) => ({ ...x, ...p }))} onOpenHabits={() => setTab("today")} />
            </Suspense>
          </div>
        )}
        {tab === "you" && (
          <YouScreen page={youPage} onPage={setYouPage} userId="preview" email="kate@example.com" profile={profile}
            onUpdateProfile={async (p) => setProfile((x) => ({ ...x, ...p }))} onSignOut={() => {}} onDevicesSynced={() => {}} />
        )}
      </main>
      <CaptureSheet open={capturing} onClose={() => setCapturing(false)} cardProps={cardProps} onQuick={quickLog} onLogMeal={setMeal}
        onVoiceSave={(next) => { onChange(next); toast("Check-in saved"); }} />
      <SearchScreen open={searching} onClose={() => setSearching(false)}
        onAddFood={(m, food) => { void foodLog.addItem(m, food); toast(`${food.name} added to ${m}`); }}
        onAsk={(q) => { setCoachDraft(q); setCoachPane("coach"); setTab("coach"); }}
        onGo={(p) => {
          if (p === "today" || p === "progress") setTab(p);
          else if (p === "coach" || p === "recipes") { setCoachPane(p); setTab("coach"); }
          else if (p === "garden") setTab("garden");
          else { setTab("you"); setYouPage(p); }
        }}
        mealLabelFor={(m) => MEALS.find((x) => x.key === m)!.label} />
      <MealLogger meal={meal} onClose={() => setMeal(null)} date={activeDate} userId={null} foodLog={foodLog} showMacros={false} />
      <TabBar tab={tab} onTab={(t) => { if (t === tab && t === "you") setYouPage(null); setTab(t); window.scrollTo({ top: 0 }); }} onCapture={() => setCapturing(true)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <PlanProvider>
        <ToastProvider>
          <Preview />
        </ToastProvider>
      </PlanProvider>
    </AuthProvider>
  </React.StrictMode>,
);
