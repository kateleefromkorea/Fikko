import { useEffect, useRef, useState } from "react";
import type { BiometricData, HabitData } from "../../types";
import { workoutMismatches, type WorkoutMismatch } from "../../lib/trainingDays";
import { todayKey } from "../../lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const storeKey = (userId: string) => `fikko-workout-checked-${userId}`;

function readChecked(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(storeKey(userId)) ?? "[]") as string[]; } catch { return []; }
}

function markChecked(userId: string, date: string) {
  try {
    // Only the last few weeks matter; keep the list short.
    const kept = readChecked(userId).slice(-30);
    localStorage.setItem(storeKey(userId), JSON.stringify([...kept, date]));
  } catch { /* storage blocked: may ask again next visit */ }
}

const dayName = (date: string) => {
  const today = todayKey();
  if (date === today) return "today";
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
};

/**
 * With training-day targets on, workouts change the calorie target, so when a
 * wearable and the workout log disagree a lot (Fitbit data arrives overnight,
 * so this looks at the last few days), Fikko asks the member to check that day.
 * Once per day, when the app opens.
 */
export default function WorkoutCheck({ userId, data, biometrics, weightKg, onOpenDay }: {
  userId: string;
  data: HabitData;
  biometrics: BiometricData;
  weightKg: number | null;
  onOpenDay: (date: string) => void;
}) {
  const [mismatch, setMismatch] = useState<WorkoutMismatch | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const checked = new Set(readChecked(userId));
    const found = workoutMismatches(data, biometrics, todayKey(), weightKg).find((m) => !checked.has(m.date));
    if (found) setMismatch(found);
    // Once per app open, with the data as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!mismatch) return null;
  const day = dayName(mismatch.date);
  const close = () => { markChecked(userId, mismatch.date); setMismatch(null); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {mismatch.kind === "under" ? `Did you miss a workout ${day === "today" ? "today" : `on ${day}`}?` : `Check ${day === "today" ? "today's" : `${day}'s`} workouts?`}
          </DialogTitle>
          <DialogDescription>
            {mismatch.kind === "under"
              ? `Your wearable recorded ${mismatch.deviceMinutes} active minutes, but your logged workouts add up to ${mismatch.loggedMinutes}. Workouts you log raise your calorie target that day, so it's worth adding any you missed.`
              : `Your logged workouts add up to ${mismatch.loggedKcal.toLocaleString()} kcal, but your wearable counted ${mismatch.deviceKcal.toLocaleString()} active kcal for the whole day. Workouts raise your calorie target, so check the minutes and intensity look right.`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Fikko uses the workouts you log, not your wearable's estimate, because wearables often count calories high.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} className="h-10 px-5">My log is right</Button>
          <Button onClick={() => { close(); onOpenDay(mismatch.date); }} className="h-10 px-5">
            Review {day === "today" ? "today" : day}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
