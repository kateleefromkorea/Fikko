import { useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import {
  CORE_META, CustomHabitsSection, ExerciseCard, FoodCard, HabitChip, MedicationCard, MoodCard, SleepCard, WaterCard,
  greeting, progressSubtitle, scrollToCard, useDayCompleteCelebration, type HabitCardProps,
} from "@/components/HabitsView";
import { CUSTOM_ICONS, SectionLabel } from "@/components/HabitCard";
import Celebration from "@/components/Celebration";
import CommunityPreview from "@/components/CommunityPreview";
import ProgressRing from "@/components/ProgressRing";
import VoiceCheckIn from "@/components/VoiceCheckIn";
import { useFoodLog } from "@/hooks/useFoodLog";
import { completion } from "@/lib/completion";
import { todayKey } from "@/lib/dates";
import type { HabitData } from "@/types";
import StickyDateBar from "@mobile/components/StickyDateBar";

type Props = Omit<HabitCardProps, "activeDate"> & { onOpenCommunity?: () => void };

/** Greeting, what's left, the habit chips and the day's ring, sized for a phone. */
function DaySummary({ data, activeDate, profileName, waterGoal, voice }: {
  data: HabitData; activeDate: string; profileName: string; waterGoal: number; voice?: ReactNode;
}) {
  const { core, custom, done, total } = completion(data, activeDate, waterGoal);
  return (
    <section className="fresh-panel overflow-hidden rounded-2xl border border-teal/20 p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{greeting(profileName)}</h1>
          <p className="mt-1.5 text-sm text-foreground/70">{progressSubtitle(data, activeDate, waterGoal)}</p>
        </div>
        <ProgressRing
          value={total ? done / total : 0}
          size={84}
          stroke={8}
          label={`${done} of ${total} habits done`}
          className="shrink-0 rounded-full bg-white/60 shadow-sm"
        >
          <p className="text-xl font-semibold tracking-tight tabular-nums">
            {done}<span className="text-sm text-muted-foreground">/{total}</span>
          </p>
        </ProgressRing>
      </div>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {core.map(({ key, done }) => (
          <HabitChip key={key} icon={CORE_META[key].icon} label={CORE_META[key].label} done={done} onClick={() => scrollToCard(`habit-${key}`)} />
        ))}
        {custom.map(({ habit, done }) => (
          <HabitChip key={habit.id} icon={CUSTOM_ICONS[habit.icon] ?? Sparkles} label={habit.name} done={done} onClick={() => scrollToCard("habit-custom")} />
        ))}
      </div>
      {voice && <div className="mt-4">{voice}</div>}
    </section>
  );
}

/**
 * The mobile app's Habits page: the same habit cards as the web, stacked in
 * one column under a date bar that stays pinned while they scroll.
 */
export default function HabitsScreen({
  data, onChange: saveData, biometrics, medications, userId, profileName, goals, trackMacros, onOpenCommunity,
}: Props) {
  const [activeDate, setActiveDate] = useState(todayKey);
  const memberActed = useRef(false);
  const onChange = (next: HabitData) => { memberActed.current = true; saveData(next); };
  const cardProps = { data, onChange, activeDate, biometrics, medications, userId, profileName, goals, trackMacros };
  const foodLog = useFoodLog(userId, activeDate, data, onChange);
  const celebrating = useDayCompleteCelebration(data, goals.water, userId, memberActed);

  const changeDate = (date: string) => {
    setActiveDate(date);
    // A new day starts from its top, just under the date bar.
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      <StickyDateBar
        activeDate={activeDate}
        onChange={changeDate}
        progress={(date) => {
          const { done, total } = completion(data, date, goals.water);
          return total ? done / total : 0;
        }}
      />

      <div className="space-y-8 pt-5">
        <DaySummary
          data={data}
          activeDate={activeDate}
          profileName={profileName}
          waterGoal={goals.water}
          voice={userId && (
            <VoiceCheckIn
              key={activeDate}
              data={data}
              date={activeDate}
              isToday={activeDate === todayKey()}
              medications={medications.medications}
              onSave={(next, foods) => (foods.length ? void foodLog.addEntries(foods, next) : onChange(next))}
            />
          )}
        />

        <section className="space-y-3">
          <SectionLabel>Nutrition & movement</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><FoodCard {...cardProps} foodLog={foodLog} /></div>
            <ExerciseCard {...cardProps} />
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel>Daily check-in</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <WaterCard {...cardProps} />
            <MoodCard {...cardProps} />
            <div className="sm:col-span-2"><MedicationCard {...cardProps} /></div>
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel>Rest</SectionLabel>
          <SleepCard {...cardProps} />
        </section>

        <CustomHabitsSection {...cardProps} />

        {userId && onOpenCommunity && <CommunityPreview userId={userId} onOpen={onOpenCommunity} />}
      </div>

      {celebrating.show && <Celebration onDone={celebrating.dismiss} />}
    </div>
  );
}
