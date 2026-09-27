import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMounted } from "./HabitCard";

interface Segment {
  /** Share of the full ring, 0–1. */
  value: number;
  color: string;
}

/**
 * A circular progress gauge. Pass `value` (0–1) for a single arc drawn in the
 * Fikko green-to-teal gradient, or `segments` to split the arc into coloured
 * parts. Arcs grow in from zero on first render.
 */
export default function ProgressRing({
  value, segments, size = 128, stroke = 10, children, className, label,
}: {
  value?: number;
  segments?: Segment[];
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
  label: string;
}) {
  const mounted = useMounted();
  const gradientId = useId();
  const r = (size - stroke) / 2;
  const c = size / 2;

  const parts: Segment[] = segments ?? [{ value: value ?? 0, color: `url(#${gradientId})` }];
  let offset = 0;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--teal)" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-foreground/[0.06]" />
        {parts.map((p, i) => {
          const len = Math.max(0, Math.min(p.value, 1 - offset)) * 100;
          const start = offset * 100;
          offset += p.value;
          if (len <= 0) return null;
          return (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeLinecap={parts.length === 1 ? "round" : "butt"}
              pathLength={100}
              strokeDasharray={`${mounted ? len : 0} 100`}
              strokeDashoffset={-start}
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          );
        })}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
