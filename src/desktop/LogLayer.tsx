// HabitsView first: quickLog (via CaptureSheet) reads its mood options as it loads.
import "@/components/HabitsView";
import type { HabitCardProps } from "@/components/HabitsView";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { useFoodLog, NewFood } from "@/hooks/useFoodLog";
import type { ProfileRow } from "@/hooks/useProfile";
import { computeGrowth } from "@/lib/fikko";
import { todayKey } from "@/lib/dates";
import type { HabitData, MealKey } from "@/types";
import CaptureSheet from "@/phone/CaptureSheet";
import DayComplete from "@/phone/DayComplete";
import MealLogger from "@/phone/MealLogger";
import SearchScreen, { type Place } from "@/phone/SearchScreen";
import StreakSheet from "@/phone/StreakSheet";
import type { QuickLog } from "@/desktop/UpNext";
import { MOD_KEY } from "@/desktop/keys";
// DayComplete's animation lives with the phone styles; every rule there is
// scoped to .phone-ui, so it only reaches the wrapper below.
import "@/phone/phone.css";

export type Panel = "capture" | "search" | "streak" | "shortcuts" | null;

/** The keyboard shortcuts, as listed by "?". */
export const SHORTCUTS: [keys: string[], what: string][] = [
  [["L"], "Log something"],
  [[MOD_KEY, "K"], "Search foods, ask Fikko, find a page"],
  [["/"], "Search"],
  [["←"], "Previous day (on Today)"],
  [["→"], "Next day (on Today)"],
  [["T"], "Back to today"],
  [["1"], "Today"],
  [["2"], "Progress"],
  [["3"], "Garden"],
  [["4"], "Recipes"],
  [["5"], "Coach"],
  [["?"], "Show these shortcuts"],
];

/**
 * Everything the desktop header opens, loaded once the habits are in: the
 * capture panel (Log), search (⌘K), the meal window, the streak explainer,
 * the shortcut list and the "day complete" moment. These are the phone's own
 * pieces, shown as centred panels here (desktop.css).
 */
export default function LogLayer({
  panel, onPanel, cardProps, profile, foodLog, meal, onMeal, onQuick, onVoiceSave, onAddFood, onAsk, onGo, mealLabelFor, celebrating, onCelebrated,
}: {
  panel: Panel;
  onPanel: (panel: Panel) => void;
  cardProps: HabitCardProps;
  profile: ProfileRow;
  foodLog: ReturnType<typeof useFoodLog>;
  meal: MealKey | null;
  onMeal: (meal: MealKey | null) => void;
  onQuick: QuickLog;
  onVoiceSave: (next: HabitData, foods: (NewFood & { meal: MealKey })[]) => void;
  onAddFood: (meal: MealKey, food: NewFood) => void;
  onAsk: (question: string) => void;
  onGo: (place: Place) => void;
  mealLabelFor: (meal: MealKey) => string;
  celebrating: boolean;
  onCelebrated: () => void;
}) {
  const { data } = cardProps;
  const today = todayKey();
  const growth = useMemo(
    () => computeGrowth(data, profile.fikko_planted_on ?? today, profile.water_goal),
    [data, profile.fikko_planted_on, profile.water_goal, today],
  );
  const close = () => onPanel(null);

  return (
    <>
      <CaptureSheet
        open={panel === "capture"}
        onClose={close}
        cardProps={cardProps}
        onQuick={onQuick}
        onLogMeal={onMeal}
        onVoiceSave={onVoiceSave}
      />
      <SearchScreen
        open={panel === "search"}
        onClose={close}
        onAddFood={onAddFood}
        onAsk={onAsk}
        onGo={onGo}
        mealLabelFor={mealLabelFor}
      />
      <StreakSheet open={panel === "streak"} onClose={close} growth={growth} />
      <MealLogger meal={meal} onClose={() => onMeal(null)} date={cardProps.activeDate} userId={cardProps.userId} foodLog={foodLog} showMacros={cardProps.trackMacros} />

      <Dialog open={panel === "shortcuts"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>They work anywhere in Fikko, except while you&apos;re typing.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={what} className="contents">
                <dt className="flex gap-1">{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</dt>
                <dd className="text-sm">{what}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      {celebrating && (
        <div className="phone-ui desktop-day-complete">
          <DayComplete data={data} profile={profile} onDone={onCelebrated} />
        </div>
      )}
    </>
  );
}
