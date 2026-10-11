import { useRef, type TouchEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDateKey, todayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** How far a finger has to travel sideways across the week before it counts as a swipe. */
const SWIPE_PX = 48;

/** The Monday on or before a day key. */
function weekStart(key: string) {
  const day = new Date(key + "T12:00:00").getDay(); // 0 = Sunday
  return shiftDateKey(key, -((day + 6) % 7));
}

function dayTitle(key: string, today: string) {
  if (key === today) return "Today";
  if (key === shiftDateKey(today, -1)) return "Yesterday";
  return new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

/** A day's completion as a thin ring around its date. */
function DayRing({ value, selected }: { value: number; selected: boolean }) {
  const r = 17;
  return (
    <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className={selected ? "stroke-white/30" : "stroke-border"} />
      {value > 0 && (
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${Math.min(value, 1) * 100} 100`}
          className={cn("transition-[stroke-dasharray] duration-500", selected ? "stroke-white" : "stroke-primary")}
        />
      )}
    </svg>
  );
}

/**
 * The Habits page's date bar. It stays pinned under the app's top bar while
 * the cards scroll beneath it: the day being viewed with a calendar picker,
 * jumps back to today, and the week as a strip of days, each ringed by how
 * much of it was done. Arrows or a sideways swipe move a week at a time.
 */
export default function StickyDateBar({ activeDate, onChange, progress }: {
  activeDate: string;
  onChange: (date: string) => void;
  /** 0–1: how much of a day's habits were done. */
  progress: (date: string) => number;
}) {
  const today = todayKey();
  const isToday = activeDate === today;
  const start = weekStart(activeDate);
  const days = WEEKDAYS.map((_, i) => shiftDateKey(start, i));
  const canGoForward = shiftDateKey(start, 7) <= today;
  const pickerRef = useRef<HTMLInputElement>(null);
  const touchX = useRef<number | null>(null);

  const go = (date: string) => { if (date <= today) onChange(date); };
  // A week on keeps the same weekday, or stops at today.
  const shiftWeek = (weeks: number) => {
    const next = shiftDateKey(activeDate, weeks * 7);
    onChange(next > today ? today : next);
  };

  const onTouchStart = (e: TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > SWIPE_PX) shiftWeek(-1);
    else if (dx < -SWIPE_PX && canGoForward) shiftWeek(1);
  };

  const fullDate = new Date(activeDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="sticky top-(--mobile-header-h) z-30 -mx-4 h-(--mobile-datebar-h) border-b bg-white/95 px-4 backdrop-blur supports-backdrop-filter:bg-white/85">
      <div className="flex h-12 items-center gap-1">
        <div className="relative min-w-0">
          <button
            onClick={() => pickerRef.current?.showPicker?.()}
            className="-ml-2 flex items-baseline gap-2 rounded-lg px-2 py-1 text-left active:bg-muted"
            aria-label={`${dayTitle(activeDate, today)}, ${fullDate}. Choose a date`}
          >
            <span className="text-lg font-semibold tracking-tight">{dayTitle(activeDate, today)}</span>
            <span className="truncate text-sm text-muted-foreground">{fullDate}</span>
            <ChevronDown className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
          </button>
          <input
            ref={pickerRef}
            type="date"
            max={today}
            value={activeDate}
            onChange={(e) => e.target.value && go(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center">
          {!isToday && (
            <button
              onClick={() => onChange(today)}
              className="mr-1 h-8 rounded-full bg-primary/10 px-3 text-sm font-medium text-primary-ink active:bg-primary/20"
            >
              Today
            </button>
          )}
          <button
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
            className="grid size-9 place-items-center rounded-full text-muted-foreground active:bg-muted"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => shiftWeek(1)}
            disabled={!canGoForward}
            aria-label="Next week"
            className="grid size-9 place-items-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <ol className="grid touch-pan-y grid-cols-7" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-label="This week">
        {days.map((date, i) => {
          const future = date > today;
          const selected = date === activeDate;
          const value = future ? 0 : progress(date);
          const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          return (
            <li key={date} className="flex justify-center">
              <button
                onClick={() => go(date)}
                disabled={future}
                aria-current={selected ? "date" : undefined}
                aria-label={`${label}${future ? "" : `, ${Math.round(value * 100)}% done`}`}
                className="flex flex-col items-center gap-1 rounded-xl px-1 pb-1 disabled:opacity-35"
              >
                <span className={cn("text-[11px] font-medium", date === today ? "text-primary-ink" : "text-muted-foreground")}>
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={cn(
                    "relative grid size-10 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                    selected ? "bg-primary text-primary-foreground shadow-sm" : date === today ? "text-primary-ink" : "text-foreground",
                  )}
                >
                  {!future && <DayRing value={value} selected={selected} />}
                  {Number(date.slice(8))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
