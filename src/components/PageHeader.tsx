import type { ReactNode } from "react";

interface Props {
  /** Small green label above the headline: the page's name, plus context like a period. */
  eyebrow?: string;
  /** A sentence about the member, not the page's name. */
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
}

export default function PageHeader({ eyebrow, title, subtitle, badge, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="mb-3 text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-medium sm:text-4xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
