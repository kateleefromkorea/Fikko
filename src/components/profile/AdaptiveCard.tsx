import { useEffect, useState } from "react";
import type { ProfileRow } from "../../hooks/useProfile";
import { usePlan } from "../../hooks/usePlan";
import {
  DEFAULT_SETTINGS, fetchAdaptiveSettings, fetchSuggestions, saveAdaptiveSettings, type AdaptiveSettings, type Suggestion, type SuggestionStatus,
} from "../../lib/adaptiveData";
import { AUTO_APPLY_MAX_KCAL, FIRST_CHECK_DAYS, MIN_FULL_DAYS, MIN_WEIGH_INS } from "../../lib/adaptiveTdee";
import { todayKey } from "../../lib/dates";
import { friendlyError } from "../../lib/errors";
import UpgradeNote from "../UpgradeNote";
import UpgradeLink from "../UpgradeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const STATUS: Record<SuggestionStatus, string> = {
  pending: "Waiting for you", accepted: "You took it", kept: "You kept yours", auto: "Applied for you", undone: "Undone",
};
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const kcal = (n: number) => Math.round(n).toLocaleString();

/** Adaptive calorie target settings and history, in Profile. */
export default function AdaptiveCard({ userId, profile, className }: { userId: string; profile: ProfileRow; className?: string }) {
  const { limits } = usePlan();
  const [settings, setSettings] = useState<AdaptiveSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!limits.adaptiveTargets) return;
    let alive = true;
    void Promise.all([fetchAdaptiveSettings(userId), fetchSuggestions(userId, 5)]).then(([s, h]) => {
      if (alive) { setSettings(s); setHistory(h); }
    });
    return () => { alive = false; };
  }, [userId, limits.adaptiveTargets]);

  const change = (patch: Partial<AdaptiveSettings>) => {
    const before = settings;
    setSettings({ ...settings, ...patch });
    setError(null);
    saveAdaptiveSettings(userId, patch).catch((err) => { setSettings(before); setError(friendlyError(err, "We couldn't save that.")); });
  };

  const paused = settings.paused_until && settings.paused_until > todayKey() ? settings.paused_until : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Adaptive calorie target</CardTitle>
        <CardDescription>
          {settings.tdee_estimate
            ? `Fikko estimates you burn about ${kcal(settings.tdee_estimate)} kcal a day. Your target is ${kcal(profile.calorie_goal)} kcal.`
            : `Your target learns from you. After ${FIRST_CHECK_DAYS} days of weigh-ins and logging, Fikko compares what you ate with how your weight moved and suggests a target that fits your body.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!limits.adaptiveTargets ? (
          <UpgradeNote
            reason="adaptive"
            title="Adaptive targets are part of Premium"
            body="Premium checks your progress each week and suggests a calorie target that fits your body. You approve every change."
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="adaptive-on">Weekly suggestions</Label>
                <p className="mt-0.5 text-sm text-muted-foreground">Fikko suggests, you decide. Your target never changes without you.</p>
              </div>
              <Switch id="adaptive-on" checked={settings.enabled} onCheckedChange={(v) => change({ enabled: v })} />
            </div>
            {settings.enabled && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="adaptive-auto">Apply small changes automatically</Label>
                  <p className="mt-0.5 text-sm text-muted-foreground">Changes of {AUTO_APPLY_MAX_KCAL} kcal or less are made for you. You still see each one and can undo it.</p>
                </div>
                <Switch id="adaptive-auto" checked={settings.auto_apply_small} onCheckedChange={(v) => change({ auto_apply_small: v })} />
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="training-days" className="flex items-center gap-2">
                  Eat more on workout days
                  {!limits.trainingDays && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Max</span>}
                </Label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your target rises on days you log a workout, by half of what it burned, and dips a little on rest days, so your week still adds up.
                  With this on, the Calories card stops subtracting burned calories, so nothing is counted twice.
                  {!limits.trainingDays && <> <UpgradeLink reason="training-days">See Max</UpgradeLink></>}
                </p>
              </div>
              <Switch
                id="training-days"
                checked={limits.trainingDays && settings.training_days}
                disabled={!limits.trainingDays}
                onCheckedChange={(v) => change({ training_days: v })}
              />
            </div>
            {settings.enabled && paused && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                Paused until {new Date(paused + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long" })}.
                <Button variant="outline" size="sm" onClick={() => change({ paused_until: null })} className="h-8">Resume now</Button>
              </div>
            )}
            {!settings.tdee_estimate && settings.enabled && (
              <p className="text-sm text-muted-foreground">
                What it needs: at least {MIN_WEIGH_INS} weigh-ins spread over 10 days (Log → Weight) and {MIN_FULL_DAYS} fully logged days of food.
              </p>
            )}
            {history.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Recent check-ins</p>
                <ul className="divide-y text-sm">
                  {history.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                      <span className="tabular-nums">{dateLabel(s.created_at)} · {kcal(s.previous_kcal)} → {kcal(s.proposed_kcal)} kcal</span>
                      <span className="text-muted-foreground">{STATUS[s.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
