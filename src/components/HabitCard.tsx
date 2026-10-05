import { useEffect, useState, type ReactNode } from "react";
import {
  Bath, BookOpen, Brain, Check, Dumbbell, Footprints, Leaf, Music, Palette, PawPrint, PenLine, Sparkles, Star, Target,
  type LucideIcon,
} from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** One hue per habit, shared with the marketing site (see index.css). */
export type HabitHue = "water" | "meds" | "food" | "exercise" | "sleep" | "mood" | "custom";

/**
 * False on the first render, true from the next frame. Lets bars and rings
 * render at zero and then transition to their value, so they grow in on load.
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/**
 * A white lucide icon on a solid square of the habit's hue. The badge and the
 * progress bar are where a habit's colour lives; the card itself stays white.
 */
export function HabitIcon({ icon: Icon, hue, className }: { icon: LucideIcon; hue: HabitHue; className?: string }) {
  return (
    <span
      // The habit's palette pair: tile colour with its matching icon colour. A light
      // tile (cream) gets a hairline so it doesn't melt into the white card.
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl shadow-sm ring-1 ring-inset ring-ink/8", className)}
      style={{ background: `var(--${hue})`, color: `var(--${hue}-fg)` }}
      aria-hidden="true"
    >
      <Icon className="size-5" strokeWidth={2.25} />
    </span>
  );
}

/** Small green "Done" pill that pops in when a habit is completed. */
export function DoneBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "tick-pop inline-flex h-5 items-center gap-1 rounded-full bg-[#DDF5F1] px-2 text-xs font-medium text-[#0A6E63]",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      Done
    </span>
  );
}

/**
 * Card surface for the Habits page: white, no outline, lifted by a soft
 * shadow off the grey page. Completed habits get a green outline.
 */
export const softCardCls = "ring-0 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]";

/** Shared habit card surface: soft card that lifts on hover. Done is shown by the badge, not an outline. */
export function habitCardCls(done?: boolean) {
  return cn(
    "relative h-full transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.04),0_16px_32px_-8px_rgba(16,24,40,0.14)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    softCardCls,
  );
}

/** A flat inner panel inside a card: light grey, no outline. */
export const panelCls = "rounded-xl bg-foreground/[0.035]";

/**
 * The frame every habit on the Habits page shares: icon, title and a short
 * line under it, an optional headline figure on the right, then the body.
 */
export function HabitCard({
  id, icon, hue, title, description, action, done, comment, children, className,
}: {
  id?: string;
  icon: LucideIcon;
  hue: HabitHue;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  done?: boolean;
  /** A short line reacting to what's been logged, shown in a bubble under the header. */
  comment?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      id={id}
      className={cn(habitCardCls(done), "scroll-mt-24 gap-6 [--card-spacing:--spacing(6)]", className)}
      // The habit's tones, for selected options and charts inside the card.
      style={{ "--hue": `var(--${hue})`, "--hue-fg": `var(--${hue}-fg)`, "--hue-strong": `var(--${hue}-strong)` } as React.CSSProperties}
    >
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-4 has-data-[slot=card-action]:grid-cols-[auto_1fr_auto]">
        <HabitIcon icon={icon} hue={hue} className="row-span-2" />
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {title}
          {done && <DoneBadge />}
        </CardTitle>
        {description && <CardDescription className="col-start-2">{description}</CardDescription>}
        {action && <CardAction className="col-start-3 row-span-2 self-center">{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {comment && <CommentBubble text={comment} />}
        {children}
      </CardContent>
    </Card>
  );
}

/** The card's commentary: a quick read on how the day is going for that habit. */
export function CommentBubble({ text }: { text: string }) {
  return (
    <p aria-live="polite" className="mb-5 flex items-start gap-2 rounded-xl bg-foreground/[0.04] px-3.5 py-2.5 text-sm text-foreground/80">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/** Big number with a small unit, used as a card's headline figure. */
export function Figure({ value, unit, className }: { value: ReactNode; unit?: string; className?: string }) {
  return (
    <p className={cn("text-right text-4xl font-semibold tracking-tight tabular-nums", className)}>
      {value}
      {unit && <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{unit}</span>}
    </p>
  );
}

/**
 * Progress bar in the habit's own hue, deepening to its darker shade once the
 * target is met. Grows in from zero on first render.
 */
export function HabitBar({ value, max, hue, className }: { value: number; max: number; hue: HabitHue; className?: string }) {
  const mounted = useMounted();
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = value >= max && max > 0 ? `var(--${hue}-fg)` : `var(--${hue}-strong)`;
  return (
    <Progress
      value={mounted ? pct : 0}
      className={cn(
        "h-2 [&>div]:bg-(--bar) [&>div]:duration-700 [&>div]:ease-out motion-reduce:[&>div]:transition-none",
        className,
      )}
      style={{ "--bar": color } as React.CSSProperties}
    />
  );
}

/** A one-line read on how today is going for a habit. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Small uppercase label that heads a group inside a card. */
export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", className)}>{children}</p>;
}

/** Section heading with a faint green hairline, heading a group of cards on the page. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[15px] font-semibold text-[#3F4A45]">{children}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/25 to-transparent" aria-hidden="true" />
      {aside}
    </div>
  );
}

/** A large faded icon in a soft circle, a line of text, and an optional action. */
export function EmptyState({
  icon: Icon, title, body, children, className,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center rounded-xl bg-foreground/[0.03] px-6 py-8 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-full bg-white shadow-sm" aria-hidden="true">
        <Icon className="size-7 text-muted-foreground/60" strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

// Custom habits store their icon as a string. New habits save one of these
// keys; habits created before the redesign hold an emoji, which still renders.
export const CUSTOM_ICONS: Record<string, LucideIcon> = {
  star: Star,
  book: BookOpen,
  mind: Brain,
  target: Target,
  strength: Dumbbell,
  art: Palette,
  nature: Leaf,
  pet: PawPrint,
  music: Music,
  writing: PenLine,
  focus: Sparkles,
  walk: Footprints,
  bath: Bath,
};

export function CustomHabitIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = CUSTOM_ICONS[icon] as LucideIcon | undefined;
  return (
    <span
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-lg", Icon && "shadow-sm", className)}
      // Older habits store an emoji, which reads better on a pale square than on solid colour.
      style={{ background: Icon ? "var(--custom)" : "color-mix(in srgb, var(--custom) 12%, white)" }}
      aria-hidden="true"
    >
      {Icon ? <Icon className="size-5 text-white" strokeWidth={2.25} /> : icon}
    </span>
  );
}
