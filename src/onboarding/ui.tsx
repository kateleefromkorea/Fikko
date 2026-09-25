// Shared presentational pieces for the onboarding wizard. Kept in one place so
// every step looks identical without repeating the Tailwind strings.

import type { ReactNode } from "react";

export const inputCls =
  "rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all";

export const selectCls = `${inputCls} appearance-none cursor-pointer`;

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Single-select card with an icon, title and supporting line. */
export function SelectCard({
  selected, onClick, icon, label, description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="w-full text-left rounded-2xl border-2 p-4 flex items-center gap-3.5 transition-all hover:opacity-90"
      style={selected
        ? { borderColor: "var(--primary)", background: "var(--muted)" }
        : { borderColor: "var(--border)", background: "var(--card)" }}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: selected ? "rgba(30,64,175,0.12)" : "var(--secondary)" }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
      </span>
      {selected && <span className="text-primary text-lg flex-shrink-0">✓</span>}
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
      className="px-4 py-2 rounded-full text-sm font-bold border-2 transition-all hover:opacity-90"
      style={selected
        ? { borderColor: "var(--primary)", background: "var(--primary)", color: "var(--primary-foreground)" }
        : { borderColor: "var(--border)", background: "var(--card)", color: "var(--secondary-foreground)" }}
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
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-xl bg-secondary p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={value === o.value
            ? { background: "var(--primary)", color: "var(--primary-foreground)" }
            : { color: "var(--secondary-foreground)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold" style={{ color: "var(--coral)" }}>{children}</p>;
}
