import { useMounted } from "../HabitCard";

/**
 * Progress to the daily minutes goal: what the member logged, then what a
 * wearable counted in a lighter shade. Turns Fikko green once the goal is met.
 */
export default function ActivityProgress({ logged, device, goal }: { logged: number; device: number; goal: number }) {
  const mounted = useMounted();
  const total = logged + device;
  const done = total >= goal;
  const pct = (v: number) => (mounted ? Math.min(100, (v / goal) * 100) : 0);
  const loggedPct = pct(logged);
  const devicePct = Math.min(100 - loggedPct, pct(device));
  return (
    <div className="space-y-1.5">
      <div
        role="meter"
        aria-label={`${total} of ${goal} active minutes${device ? `, ${device} from your wearable` : ""}`}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={total}
        className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.06]"
      >
        <div className="h-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${loggedPct}%`, background: done ? "var(--primary)" : "var(--exercise)" }} />
        <div className="h-full opacity-45 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${devicePct}%`, background: done ? "var(--primary)" : "var(--exercise)" }} />
      </div>
      {device > 0 && (
        <p className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{logged} min logged · {device} min from your wearable</span>
          <span>Goal {goal} min</span>
        </p>
      )}
    </div>
  );
}
