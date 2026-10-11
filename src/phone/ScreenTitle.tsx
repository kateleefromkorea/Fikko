import type { ReactNode } from "react";

/** An iOS-style large title at the top of a tab. */
export default function ScreenTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-3 pb-3">
      <h1 className="text-[1.75rem] leading-none font-bold tracking-tight">{children}</h1>
      {aside}
    </div>
  );
}

/** A segmented control, for two or three views inside one tab. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex rounded-xl bg-ink/[0.06] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className="h-9 flex-1 rounded-[0.6rem] text-[15px] font-semibold text-muted-foreground transition-colors aria-selected:bg-white aria-selected:text-foreground aria-selected:shadow-sm"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
