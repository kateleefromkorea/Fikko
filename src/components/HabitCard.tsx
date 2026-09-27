import type { ReactNode } from "react";
import {
  Bath, BookOpen, Brain, Dumbbell, Footprints, Leaf, Music, Palette, PawPrint, PenLine, Sparkles, Star, Target,
  type LucideIcon,
} from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One hue per habit, shared with the marketing site (see index.css). */
export type HabitHue = "water" | "meds" | "food" | "exercise" | "sleep" | "mood" | "custom";

/** A lucide icon in a soft square tinted with the habit's hue. */
export function HabitIcon({ icon: Icon, hue, className }: { icon: LucideIcon; hue: HabitHue; className?: string }) {
  return (
    <span
      className={cn("grid size-10 shrink-0 place-items-center rounded-lg", className)}
      style={{ background: `color-mix(in srgb, var(--${hue}) 12%, white)` }}
      aria-hidden="true"
    >
      <Icon className="size-5" style={{ color: `var(--${hue})` }} />
    </span>
  );
}

/**
 * The frame every habit on the Habits page shares: icon, title and a short
 * line under it, an optional headline figure on the right, then the body.
 */
export function HabitCard({
  icon, hue, title, description, action, children, className,
}: {
  icon: LucideIcon;
  hue: HabitHue;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("h-full gap-6 [--card-spacing:--spacing(6)]", className)}>
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-4 has-data-[slot=card-action]:grid-cols-[auto_1fr_auto]">
        <HabitIcon icon={icon} hue={hue} className="row-span-2" />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription className="col-start-2">{description}</CardDescription>}
        {action && <CardAction className="col-start-3 row-span-2 self-center">{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

/** Big number with a small unit, used as a card's headline figure. */
export function Figure({ value, unit, className }: { value: ReactNode; unit?: string; className?: string }) {
  return (
    <p className={cn("text-right text-2xl font-semibold tabular-nums", className)}>
      {value}
      {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
    </p>
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
  const Icon = CUSTOM_ICONS[icon];
  return (
    <span
      className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-lg", className)}
      style={{ background: "color-mix(in srgb, var(--custom) 12%, white)" }}
      aria-hidden="true"
    >
      {Icon ? <Icon className="size-5" style={{ color: "var(--custom)" }} /> : icon}
    </span>
  );
}
