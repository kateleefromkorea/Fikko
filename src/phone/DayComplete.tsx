import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Leaf, Sprout } from "lucide-react";
import FikkoPlant from "@/components/fikko/FikkoPlant";
import type { ProfileRow } from "@/hooks/useProfile";
import { completion } from "@/lib/completion";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { computeGrowth, MAX_RAIN_CLOUDS, RAIN_CLOUD_EVERY, seedById, stageFor, STAGES } from "@/lib/fikko";
import { cn } from "@/lib/utils";
import type { HabitData } from "@/types";
import { haptics } from "@/phone/haptics";
import { RainCloud } from "@/phone/PlantHero";

/** Streak lengths that get their own line instead of the usual one. */
const MILESTONES: Record<number, string> = {
  1: "Day one. Come back tomorrow to make it two.",
  3: "Three in a row. This is taking root.",
  7: "A full week, every habit, every day.",
  14: "Two weeks in a row. Look at you go.",
  30: "A whole month. That's a real habit now.",
  50: "Fifty days. Your plant knows your name.",
  100: "One hundred days in a row.",
  365: "A full year of days. Thank you for growing with us.",
};

/** How long each part of the sequence takes, in ms. */
const SEGMENT_MS = 170;
const RING_START = 450;

type DayState = "done" | "today" | "missed" | "future" | "before";

/** Monday to Sunday of the current week, each with how that day went. */
function weekOf(data: HabitData, today: string, plantedOn: string, waterGoal: number) {
  const dow = (new Date(today + "T12:00:00").getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateKey(today, i - dow);
    const letter = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
    let state: DayState;
    if (date === today) state = "today";
    else if (date > today) state = "future";
    else if (date < plantedOn) state = "before";
    else {
      const { done, total } = completion(data, date, waterGoal);
      state = total > 0 && done === total ? "done" : "missed";
    }
    return { date, letter, state };
  });
}

/** One arc of the habit ring, from `a0` to `a1` degrees (0 is the top). */
function arcPath(r: number, a0: number, a1: number) {
  const pt = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${150 + r * Math.cos(rad)} ${150 + r * Math.sin(rad)}`;
  };
  return `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

/**
 * The phone's "day complete" moment, shown once when the member finishes
 * their last habit for today. In order: the day's habit segments (the bar
 * under the plant on Today) close into a ring around the plant one by one, the
 * sun comes out and seeds drift up, the streak rolls over to its new number,
 * and today's leaf sprouts on the week strip. A rain cloud flies in when one
 * is earned, and the plant grows into its next stage when this day takes it
 * there. A tap skips to the end; people who ask for reduced motion see the
 * end straight away.
 */
export default function DayComplete({ data, profile, onDone }: { data: HabitData; profile: ProfileRow; onDone: () => void }) {
  const today = todayKey();
  const plantedOn = profile.fikko_planted_on ?? today;
  const seed = seedById(profile.fikko_seed);
  const growth = useMemo(
    () => computeGrowth(data, plantedOn, profile.water_goal),
    [data, plantedOn, profile.water_goal],
  );
  // Normally today is already complete. Opened for testing (?celebrate) before
  // it is, show the day as if it had just been finished.
  const counted = growth.sunny ? 0 : 1;
  const streak = Math.max(growth.streak + counted, 1);
  const completeDays = growth.completeDays + counted;
  const stage = stageFor(completeDays);
  const stageBefore = stageFor(completeDays - 1);
  const grew = !!seed && stage > stageBefore;
  // Every RAIN_CLOUD_EVERY days in a row earns a cloud, unless they already hold the most they can.
  const cloudEarned = streak % RAIN_CLOUD_EVERY === 0;
  const cloudsBefore = useMemo(
    () => computeGrowth(data, plantedOn, profile.water_goal, shiftDateKey(today, -1)).rainClouds,
    [data, plantedOn, profile.water_goal, today],
  );
  const cloudsFull = cloudEarned && cloudsBefore >= MAX_RAIN_CLOUDS;
  const segments = Math.max(completion(data, today, profile.water_goal).total, 1);
  const week = useMemo(() => weekOf(data, today, plantedOn, profile.water_goal), [data, today, plantedOn, profile.water_goal]);
  const seedName = seed?.name.toLowerCase() ?? "plant";
  const line = MILESTONES[streak] ?? `Every habit done. Your ${seedName} is soaking up the sun.`;

  // The sequence, as beats on a timeline. `filled` counts ring segments drawn so far.
  const burstAt = RING_START + segments * SEGMENT_MS + 150;
  const streakAt = burstAt + 650;
  const leafAt = streakAt + 650;
  const extrasAt = leafAt + 550;
  const readyAt = extrasAt + (grew || cloudEarned ? 450 : 0);

  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [filled, setFilled] = useState(reduced ? segments : 0);
  const [beat, setBeat] = useState(reduced ? 5 : 0); // 1 burst, 2 streak, 3 leaf, 4 extras, 5 ready
  const timers = useRef<number[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reduced) { haptics.success(); return; }
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    for (let i = 0; i < segments; i++) at(RING_START + i * SEGMENT_MS, () => { setFilled(i + 1); haptics.tap(); });
    at(burstAt, () => { setBeat(1); haptics.success(); });
    at(streakAt, () => { setBeat(2); haptics.logged(); });
    at(leafAt, () => { setBeat(3); haptics.tap(); });
    at(extrasAt, () => { setBeat(4); if (grew || cloudEarned) haptics.logged(); });
    at(readyAt, () => setBeat(5));
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, [reduced, segments, burstAt, streakAt, leafAt, extrasAt, readyAt, grew, cloudEarned]);

  useEffect(() => { if (beat === 5) buttonRef.current?.focus({ preventScroll: true }); }, [beat]);

  // Nothing behind scrolls while it's up; Escape closes it.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); };
  }, [onDone]);

  /** A tap before the end skips to it. */
  const skip = () => {
    if (beat === 5) return;
    timers.current.forEach(clearTimeout);
    setFilled(segments);
    setBeat(5);
  };

  const gap = segments > 1 ? 7 : 0;
  const span = (360 - gap * segments) / segments;
  const sunny = beat >= 1;
  const plantStage = seed ? (grew && beat < 1 ? stageBefore : stage) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-complete-title"
      aria-describedby="day-complete-line"
      onClick={skip}
      className={cn("daily-overview day-complete fixed inset-0 z-[70] flex flex-col overflow-hidden", reduced && "dc-still")}
    >
      {!reduced && beat >= 1 && <RisingSeeds />}

      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <p className={cn("dc-eyebrow text-sm font-semibold tracking-wide text-primary-ink uppercase", beat >= 1 && "dc-on")}>
          Day complete
        </p>

        {/* The plant inside the ring of today's habits, with the sun behind it. */}
        <div className="relative mt-2 size-[17.5rem] shrink-0">
          <SunRays on={sunny} />
          <svg viewBox="0 0 300 300" className="absolute inset-0 size-full" aria-hidden="true">
            {Array.from({ length: segments }, (_, i) => {
              const a0 = i * (span + gap) + gap / 2;
              const d = arcPath(136, a0, a0 + span);
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="currentColor" className="text-ink/10" strokeWidth="10" strokeLinecap="round" />
                  <path
                    d={d}
                    fill="none"
                    stroke="url(#dc-ring)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    strokeDashoffset={i < filled ? 0 : 1}
                    className="dc-arc"
                  />
                </g>
              );
            })}
            <defs>
              <linearGradient id="dc-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2DC4B2" />
                <stop offset="1" stopColor="#157954" />
              </linearGradient>
            </defs>
          </svg>
          {cloudEarned && !cloudsFull && (
            <RainCloud className={cn("dc-cloud absolute top-2 right-0 w-20", beat >= 4 && "dc-on")} />
          )}
          <div className="absolute inset-[2.6rem]">
            <div key={plantStage} className={cn("size-full", beat === 0 ? "dc-plant-in" : grew && "dc-plant-grow")}>
              <FikkoPlant
                seedId={profile.fikko_seed ?? "sprout"}
                stage={plantStage}
                potId={profile.fikko_pot}
                companionId={profile.fikko_companion}
                sceneId="plain"
                animate
                className="size-full"
              />
            </div>
          </div>
        </div>

        {/* The streak, rolling over from yesterday's number. */}
        <div className={cn("dc-streak mt-4 flex items-center gap-2", beat >= 2 && "dc-on")}>
          <Flame className="dc-flame size-11 text-[#E0782F]" fill="#F5B640" strokeWidth={1.75} aria-hidden="true" />
          <span className="dc-odometer text-[4rem] leading-none font-bold tracking-tight tabular-nums" aria-hidden="true">
            <span className="dc-odometer-track">
              <span>{streak - 1}</span>
              <span>{streak}</span>
            </span>
          </span>
        </div>
        <h2 id="day-complete-title" className="mt-1 text-xl font-semibold">
          {streak} {streak === 1 ? "day" : "days"} in a row
        </h2>
        <p id="day-complete-line" className="mt-1.5 max-w-[19rem] text-center text-[15px] text-foreground/75">{line}</p>

        {/* This week, with today's leaf sprouting. */}
        <ol aria-label="This week" className={cn("dc-week mt-5 flex gap-2 rounded-2xl bg-white/80 px-3 py-2.5 shadow-sm", beat >= 2 && "dc-on")}>
          {week.map((d) => (
            <li key={d.date} className="flex w-8 flex-col items-center gap-1">
              <span className={cn("text-xs font-semibold", d.state === "today" ? "text-primary-ink" : "text-muted-foreground")}>{d.letter}</span>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  d.state === "done" && "bg-primary/12 text-primary-ink",
                  d.state === "today" && "bg-primary text-white",
                  d.state === "missed" && "bg-ink/6",
                  (d.state === "future" || d.state === "before") && "border border-dashed border-ink/15",
                )}
                aria-label={d.state === "done" || d.state === "today" ? "Every habit done" : d.state === "missed" ? "Not complete" : undefined}
              >
                {(d.state === "done" || (d.state === "today" && beat >= 3)) && (
                  <Leaf className={cn("size-4", d.state === "today" && "dc-sprout")} strokeWidth={2.25} aria-hidden="true" />
                )}
              </span>
            </li>
          ))}
        </ol>

        {(grew || cloudEarned) && (
          <div className={cn("dc-extras mt-4 flex flex-wrap justify-center gap-2", beat >= 4 && "dc-on")}>
            {grew && (
              <span className="flex h-9 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-primary-ink shadow-sm">
                <Sprout className="size-4" aria-hidden="true" />
                Grew into a {STAGES[stage].name.toLowerCase()}
              </span>
            )}
            {cloudEarned && (
              <span className="flex h-9 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-[#1F73C2] shadow-sm">
                {cloudsFull ? `Rain clouds full (${MAX_RAIN_CLOUDS} of ${MAX_RAIN_CLOUDS})` : "+1 rain cloud"}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <button
          ref={buttonRef}
          onClick={(e) => { e.stopPropagation(); haptics.tap(); onDone(); }}
          tabIndex={beat === 5 ? 0 : -1}
          aria-hidden={beat !== 5}
          className={cn("dc-continue press h-14 w-full rounded-2xl bg-primary text-[17px] font-semibold text-white shadow-lg", beat === 5 && "dc-on")}
        >
          Keep growing
        </button>
      </div>
    </div>
  );
}

/** Soft light behind the plant, turning slowly once the sun is out. */
function SunRays({ on }: { on: boolean }) {
  return (
    <div className={cn("dc-sun pointer-events-none absolute inset-[-2rem]", on && "dc-on")} aria-hidden="true">
      <div className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle,#FFF6DA_0%,rgb(255_246_218/0.55)_45%,transparent_72%)]" />
      <svg viewBox="-100 -100 200 200" className="dc-rays absolute inset-0 size-full">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d="M -5 -42 L 0 -98 L 5 -42 Z" fill="#FFFFFF" fillOpacity={i % 2 ? 0.35 : 0.6} transform={`rotate(${(i * 360) / 14})`} />
        ))}
      </svg>
    </div>
  );
}

interface Seedling {
  x: number; y: number; vy: number; drift: number; phase: number;
  size: number; color: string; spin: number; angle: number; delay: number; tuft: boolean;
}

const SEED_COLORS = ["#2DC4B2", "#5BA9F0", "#157954", "#FFFFFF", "#A9CBEB", "#FFFFFF", "#F5B640"];
const SEEDS_MS = 4200;

/** Seeds and light drifting up the screen, the opposite of falling confetti. */
function RisingSeeds() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Most start around the plant and rise past it; a few from the bottom edge.
    const seeds: Seedling[] = Array.from({ length: 46 }, (_, i) => {
      const fromPlant = i % 3 !== 0;
      return {
        x: fromPlant ? w / 2 + (Math.random() - 0.5) * 220 : Math.random() * w,
        y: fromPlant ? h * 0.38 + Math.random() * 80 : h + 10,
        vy: -(0.7 + Math.random() * 1.6),
        drift: 0.4 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        size: 3 + Math.random() * 4,
        color: SEED_COLORS[i % SEED_COLORS.length],
        spin: (Math.random() - 0.5) * 0.04,
        angle: Math.random() * Math.PI,
        delay: Math.random() * 900,
        tuft: Math.random() < 0.35,
      };
    });

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const s of seeds) {
        const age = t - s.delay;
        if (age < 0) continue;
        s.y += s.vy;
        s.vy *= 0.997;
        s.angle += s.spin;
        const x = s.x + Math.sin(age / 420 + s.phase) * 14 * s.drift;
        // Fade in quickly, out over the last second.
        ctx.globalAlpha = Math.min(1, age / 250) * Math.max(0, Math.min(1, (SEEDS_MS - t) / 1000)) * 0.9;
        ctx.save();
        ctx.translate(x, s.y);
        ctx.rotate(s.angle);
        ctx.fillStyle = s.color;
        if (s.tuft) {
          // A dandelion seed: a small body under a puff of fine lines.
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = -2; k <= 2; k++) {
            ctx.moveTo(0, 0);
            ctx.lineTo(k * s.size * 0.6, -s.size * 1.6);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, s.size * 0.4, s.size * 0.25, s.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, s.size * 0.55, s.size, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (t < SEEDS_MS) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}
