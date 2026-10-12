import { useMemo, useState, type CSSProperties } from "react";
import { Flame } from "lucide-react";
import FikkoPlant from "@/components/fikko/FikkoPlant";
import type { ProfileRow } from "@/hooks/useProfile";
import { completion } from "@/lib/completion";
import { todayKey } from "@/lib/dates";
import { computeGrowth, seedById, STAGES } from "@/lib/fikko";
import { cn } from "@/lib/utils";
import type { HabitData } from "@/types";
import StreakSheet from "@/phone/StreakSheet";

function timeGreeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** What the plant "says" about the day so far. */
function dayLine(done: number, total: number, isToday: boolean, seedName: string) {
  if (!total) return "Add a habit to start growing.";
  const left = total - done;
  if (!isToday) return left === 0 ? "Every habit done that day." : `${done} of ${total} habits done that day.`;
  if (done === 0) return `Your ${seedName} is waiting for today's first log.`;
  if (left === 0) return `All done. Your ${seedName} is soaking up the sun.`;
  if (left === 1) return "One more and today counts towards growing.";
  if (done / total >= 0.5) return `Over halfway. ${left} to go.`;
  return `A good start. ${left} to go.`;
}

/** Where each saved rain cloud floats: either side of the plant, then above it. */
const CLOUD_SPOTS: CSSProperties[] = [
  { left: "6%", top: 14 },
  { right: "6%", top: 4 },
  { left: "50%", top: -4, marginLeft: "-2rem" },
];

/** A small drawn rain cloud in the garden's sky tones. */
export function RainCloud({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 56 40" className={className} style={style} aria-hidden="true">
      <path
        d="M16 27a9 9 0 0 1 .4-18 12.5 12.5 0 0 1 23.6 3.6A7.2 7.2 0 0 1 41 27Z"
        fill="#FFFFFF"
        stroke="#5BA9F0"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <path d="M20 31.5v3M28 32v4M36 31.5v3" stroke="#5BA9F0" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Today's hero: the member's own Fikko plant on the locked teal and sky wash,
 * with a greeting, the day as a row of segments (one per habit), the streak,
 * and any saved rain clouds drawn above the plant. Both open a short explainer.
 * `hop` changes whenever a log finishes a habit, so the plant gives a little hop.
 */
export default function PlantHero({ data, profile, activeDate, hop, onOpenGarden }: {
  data: HabitData;
  profile: ProfileRow;
  activeDate: string;
  hop: number;
  onOpenGarden: () => void;
}) {
  const today = todayKey();
  const isToday = activeDate === today;
  const { done, total } = completion(data, activeDate, profile.water_goal);
  const seed = seedById(profile.fikko_seed);
  const growth = useMemo(
    () => computeGrowth(data, profile.fikko_planted_on ?? today, profile.water_goal),
    [data, profile.fikko_planted_on, profile.water_goal, today],
  );
  const [info, setInfo] = useState(false);
  const firstName = profile.name?.trim().split(/\s+/)[0];
  const heading = isToday
    ? `${timeGreeting()}${firstName ? `, ${firstName}` : ""}`
    : new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

  return (
    <section aria-label="Your day" className="daily-overview relative overflow-hidden rounded-[1.75rem] border border-teal/20 px-5 pt-5 pb-4 shadow-sm">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{heading}</h1>

      <div className="relative">
        {/* Rain clouds saved float above the plant, part of the scene; tapping one explains them. */}
        {growth.rainClouds > 0 && (
          <button
            onClick={() => setInfo(true)}
            aria-label={`${growth.rainClouds} rain ${growth.rainClouds === 1 ? "cloud" : "clouds"} saved. What are rain clouds?`}
            className="press absolute inset-x-0 top-0 z-10 h-16"
          >
            {CLOUD_SPOTS.slice(0, growth.rainClouds).map((spot, i) => (
              <RainCloud key={i} className="cloud-bob absolute w-16" style={{ ...spot, animationDelay: `${i * -1.3}s` }} />
            ))}
          </button>
        )}
        <button
          onClick={onOpenGarden}
          aria-label={seed ? `Your ${seed.name}, ${STAGES[growth.stage].name} stage. Open your garden` : "Choose a seed for your garden"}
          className="press mx-auto block"
        >
          <div key={hop} className={cn("h-48 w-48", hop > 0 && "plant-hop")}>
            <FikkoPlant
              seedId={profile.fikko_seed ?? "sprout"}
              stage={seed ? growth.stage : 0}
              health={seed ? growth.health : "growing"}
              potId={profile.fikko_pot}
              companionId={profile.fikko_companion}
              sceneId="plain"
              sunny={isToday && growth.sunny}
              animate
              className={cn("size-full", growth.health !== "growing" && "saturate-75")}
            />
          </div>
        </button>
      </div>

      <button
        onClick={() => setInfo(true)}
        className="press mx-auto mb-2 flex h-9 items-center gap-1.5 rounded-full bg-white/85 px-3.5 text-sm font-semibold shadow-sm"
      >
        <Flame className={cn("size-4", growth.streak > 0 ? "text-[#E0782F]" : "text-muted-foreground")} aria-hidden="true" />
        {growth.streak > 0 ? `${growth.streak} ${growth.streak === 1 ? "day" : "days"} in a row` : "Start a streak today"}
      </button>

      <p className="text-center text-[15px] text-foreground/75" aria-live="polite">
        {seed ? dayLine(done, total, isToday, seed.name) : "Pick a seed and it grows every day you finish your habits."}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <ol className="flex flex-1 gap-1.5" aria-label={`${done} of ${total} habits done`}>
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={cn("h-2 flex-1 rounded-full transition-colors duration-500", i < done ? "bg-primary" : "bg-ink/10")}
            />
          ))}
        </ol>
        <span className="text-sm font-semibold tabular-nums" aria-hidden="true">{done}/{total}</span>
      </div>
      <StreakSheet open={info} onClose={() => setInfo(false)} growth={growth} />
    </section>
  );
}
