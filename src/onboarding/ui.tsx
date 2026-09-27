// Shared presentational pieces for the onboarding wizard. Kept in one place so
// every step looks identical without repeating the Tailwind strings.

import type { ReactNode } from "react";
import {
  Activity, Armchair, Bike, Dumbbell, Flame, Footprints, HeartPulse, Salad, Scale, Sprout, TrendingDown, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const inputCls = "h-9";

export const selectCls =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Lucide stand-ins for the emoji the metabolics tables carry. */
export const GOAL_ICONS: Record<string, LucideIcon> = {
  weight_loss: TrendingDown,
  muscle_building: TrendingUp,
  maintenance: Scale,
  nutrition: Salad,
  chronic: HeartPulse,
  longevity: Sprout,
};

export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  "Sedentary": Armchair,
  "Lightly active": Footprints,
  "Moderately active": Bike,
  "Very active": Dumbbell,
  "Extra active": Flame,
};

export const FALLBACK_ICON = Activity;

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Single-select card with an icon, title and supporting line. */
export function SelectCard({
  selected, onClick, icon: Icon, label, description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/60",
        selected && "border-primary bg-primary/5 hover:bg-primary/5",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
          selected && "bg-primary/10 text-primary",
        )}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>}
      </span>
      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

/** Multi-select (or compact single-select) tap target. */
export function Chip({
  selected, onClick, label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-9 rounded-full border bg-card px-4 text-sm transition-colors hover:bg-muted/60",
        selected && "border-primary bg-primary/5 font-medium text-primary hover:bg-primary/5",
      )}
    >
      {label}
    </button>
  );
}

/** Two-or-more-way toggle, used for the cm/ft and kg/lb unit switches. */
export function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "h-full rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === o.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-destructive">{children}</p>;
}
