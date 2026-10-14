import { useMemo, useState } from "react";
import { Lock, Watch } from "lucide-react";
import type { HabitData, BiometricData } from "../types";
import type { ProfileRow } from "../hooks/useProfile";
import { goalByKey } from "../lib/metabolics";
import { withDeviceActivity } from "../lib/completion";
import { PERIOD_DAYS, type Period } from "../lib/dashboardStats";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlan } from "../hooks/usePlan";
import { useUpgrade } from "../hooks/useUpgrade";
import WeeklyReportCard from "./dashboard/WeeklyReport";
import DashboardSummary from "./dashboard/DashboardSummary";
import HistoryNote from "./HistoryNote";
import WearableSections, { hasWearableData } from "./dashboard/WearableSections";
import useDashCtx from "./dashboard/useDashCtx";
import {
  ConsistencySection, CustomHabitsSection, MoodMedsSection, MovementSection, NutritionSection, PatternsSection,
  ScorecardSection, SleepSection,
} from "./dashboard/DashboardSections";

interface Props {
  data: HabitData;
  biometrics: BiometricData;
  /** Carries the baseline computed at the end of onboarding. */
  profile?: ProfileRow;
  /** Opens the AI coach with a question about a pattern ready to send. */
  onAskCoach?: (question: string) => void;
}

// ── Shared UI ──────────────────────────────────────────────────────────────

function PeriodToggle({ period, onChange, historyDays }: { period: Period; onChange: (p: Period) => void; historyDays: number | null }) {
  const openUpgrade = useUpgrade();
  const locked = (p: Period) => historyDays != null && PERIOD_DAYS[p] > historyDays;
  return (
    // A locked period opens the upgrade window instead of switching.
    <Tabs value={period} onValueChange={(v) => (locked(v as Period) ? openUpgrade?.("history") : onChange(v as Period))}>
      {/* Sits on the summary's gradient, so it gets a white track and a solid
          Fikko green for the chosen period to stand out from the panel. */}
      <TabsList className="h-9! bg-white/80 shadow-sm ring-1 ring-primary/15">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <TabsTrigger
            key={p}
            value={p}
            disabled={locked(p) && !openUpgrade}
            title={locked(p) ? `Your plan shows the last ${historyDays} days. See plans to look back further.` : undefined}
            // A period switch with no tab panels, so nothing for aria-controls to point at.
            aria-controls={undefined}
            className="px-4 capitalize data-active:bg-primary! data-active:text-primary-foreground! data-active:shadow-sm"
          >
            {locked(p) && <Lock className="size-3 opacity-60" aria-label="Locked" />}
            {p}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * The numbers onboarding just worked out, shown first so a user who has only
 * finished the wizard still lands on something about them.
 */
export function BaselinePlan({ profile }: { profile: ProfileRow }) {
  const goal = goalByKey(profile.primary_goal);
  const rate = profile.weekly_rate_kg;

  const tiles = [
    { label: "BMR", value: Math.round(profile.bmr!).toLocaleString(), note: "At complete rest" },
    { label: "TDEE", value: Math.round(profile.tdee!).toLocaleString(), note: "With your activity on top" },
    {
      label: "Daily target",
      value: Math.round(profile.calorie_goal).toLocaleString(),
      note: rate ? `${rate < 0 ? "Deficit" : "Surplus"} for ${Math.abs(rate)} kg / week` : "Holding steady",
      accent: true,
    },
  ];

  return (
    <Card className="gap-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Your plan</CardTitle>
        <CardDescription>
          Worked out from your height, weight, age and activity
          {profile.target_weight_kg ? ` · target ${profile.target_weight_kg} kg` : ""}
        </CardDescription>
        {goal && (
          <CardAction>
            <Badge variant="outline" className="h-6 border-teal/40 bg-teal/5 px-2.5 text-primary-ink">{goal.label}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div
              key={t.label}
              className={cn(
                "rounded-lg border p-5",
                t.accent && "border-primary/25 bg-primary/5",
              )}
            >
              <p className={cn("text-sm text-muted-foreground", t.accent && "text-primary-ink")}>{t.label}</p>
              <p className={cn("mt-1 text-3xl font-semibold tabular-nums", t.accent && "text-primary-ink")}>
                {t.value}
                <span className="ml-1 text-sm font-normal text-muted-foreground">kcal</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t.note}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function WearableComingSoon() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden="true">
          <Watch className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">No wearable connected yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Fitbit or Pixel Watch in Profile and your vitals, sleep stages and recovery trends will appear
            in this space. Apple Health and Garmin are coming next. Everything above is from what you&apos;ve logged in Fikko.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard({ data: logged, biometrics, profile, onAskCoach }: Props) {
  // Activity here is the day's total: logged workouts plus wearable minutes.
  const data = useMemo(() => withDeviceActivity(logged), [logged]);
  const [period, setPeriod] = useState<Period>("week");
  const { limits } = usePlan();
  const bio = limits.wearableBiometrics;

  const ctx = useDashCtx(data, profile, period);
  // Wearable sections only render when there is real device data, and are
  // otherwise replaced by a placeholder rather than empty or invented numbers.
  const hasWearable = hasWearableData(biometrics);

  return (
    <div className="space-y-12">

      {/* ── Summary: also the page header, like the Today card on Habits ── */}
      <DashboardSummary
        ctx={ctx}
        toggle={<PeriodToggle period={period} onChange={setPeriod} historyDays={limits.historyDays} />}
        note={hasWearable ? "Wearable data included." : undefined}
        report={<WeeklyReportCard data={data} biometrics={biometrics} profile={profile} />}
      />
      <HistoryNote data={logged} className="-mt-6" />
      {/* What Fikko noticed is the Dashboard's core feature, so it comes first. */}
      <PatternsSection ctx={ctx} onAskCoach={onAskCoach} />
      <ConsistencySection ctx={ctx} />
      <ScorecardSection ctx={ctx} />
      <NutritionSection
        ctx={ctx}
        plan={profile?.bmr != null && profile.tdee != null ? <BaselinePlan profile={profile} /> : undefined}
      />
      <MovementSection ctx={ctx} />
      <SleepSection ctx={ctx} />
      <MoodMedsSection ctx={ctx} />
      <CustomHabitsSection ctx={ctx} />

      {!hasWearable && <WearableComingSoon />}

      {hasWearable && <WearableSections data={data} biometrics={biometrics} period={period} bio={bio} />}
    </div>
  );
}
